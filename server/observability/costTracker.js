
const fs = require('fs');

const PRICE_TABLE = {
  'deepseek/deepseek-chat': { input: 0.27, output: 1.1 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  'openai/gpt-4o': { input: 2.5, output: 10.0 },
};

const FALLBACK_PRICE = { input: 0.27, output: 1.1 }; // bilinmeyen model için

function priceFor(provider, model) {
  const key = `${provider}/${model}`;
  return PRICE_TABLE[key] || { ...FALLBACK_PRICE, estimated: true, key };
}

function costOf(usage, provider, model) {
  if (!usage) return null;
  const price = priceFor(provider, model);
  const inTok = usage.prompt_tokens || 0;
  const outTok = usage.completion_tokens || 0;
  return (inTok / 1e6) * price.input + (outTok / 1e6) * price.output;
}

function aggregateFromLines(lines) {
  const calls = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.type === 'ai_call') calls.push(e);
    } catch { /* bozuk satır atlanır */ }
  }

  const byRequest = new Map();
  const byModel = {};
  let totals = { input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0 };

  for (const c of calls) {
    const u = c.usage || {};
    const cost = costOf(u, c.provider, c.model) || 0;
    const inTok = u.prompt_tokens || 0;
    const outTok = u.completion_tokens || 0;

    totals.input_tokens += inTok;
    totals.output_tokens += outTok;
    totals.total_tokens += inTok + outTok;
    totals.cost_usd += cost;

    const mKey = `${c.provider || '?'}/${c.model || '?'}`;
    if (!byModel[mKey]) byModel[mKey] = { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, price_per_1m: priceFor(c.provider, c.model) };
    byModel[mKey].calls++;
    byModel[mKey].input_tokens += inTok;
    byModel[mKey].output_tokens += outTok;
    byModel[mKey].cost_usd += cost;

    if (c.request_id) {
      if (!byRequest.has(c.request_id)) {
        byRequest.set(c.request_id, { request_id: c.request_id, timestamp: c.timestamp, provider: c.provider, model: c.model, input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, calls: 0 });
      }
      const r = byRequest.get(c.request_id);
      r.input_tokens += inTok;
      r.output_tokens += outTok;
      r.total_tokens += inTok + outTok;
      r.estimated_cost_usd += cost;
      r.calls++;
    }
  }

  const perCase = [...byRequest.values()].map((r) => ({
    ...r,
    estimated_cost_usd: round6(r.estimated_cost_usd),
  }));

  for (const m of Object.values(byModel)) m.cost_usd = round6(m.cost_usd);
  totals.cost_usd = round6(totals.cost_usd);

  return { totals, byModel, perCase };
}

function round6(n) { return Number(n.toFixed(6)); }

function getCostReport(opts = {}) {
  const limit = opts.limit || 20000;
  let lines = [];
  let file = null;
  try {
    file = METRICS_FILE;
    lines = fs.readFileSync(METRICS_FILE, 'utf8').trim().split('\n').slice(-limit);
  } catch {
    return { available: false, file: null, totals: zeroTotals() };
  }

  const { totals, byModel, perCase } = aggregateFromLines(lines);
  const analyses = perCase.length;

  return {
    available: analyses > 0,
    file: METRICS_FILE,
    currency: 'USD',
    note: 'Maliyetler PRICE_TABLEdaki liste fiyatlarla tahmin edilir; gerçek fatura farklı olabilir.',
    totals: {
      analyses, // vaka (request) sayısı — toplam analiz
      ai_calls: totals.ai_calls !== undefined ? totals.ai_calls : perCase.reduce((s, r) => s + r.calls, 0),
      input_tokens: totals.input_tokens,
      output_tokens: totals.output_tokens,
      total_tokens: totals.total_tokens,
      estimated_cost_usd: totals.cost_usd,
      avg_input_tokens_per_case: analyses ? Math.round(totals.input_tokens / analyses) : 0,
      avg_output_tokens_per_case: analyses ? Math.round(totals.output_tokens / analyses) : 0,
      avg_cost_per_case_usd: analyses ? round6(totals.cost_usd / analyses) : 0,
    },
    by_model: byModel,
    per_case: perCase,
  };
}

function zeroTotals() {
  return {
    analyses: 0, ai_calls: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0,
    estimated_cost_usd: 0, avg_input_tokens_per_case: 0, avg_output_tokens_per_case: 0, avg_cost_per_case_usd: 0,
  };
}

const path = require('path');
const METRICS_FILE = path.join(__dirname, '..', '..', 'logs', 'ai-metrics.jsonl');

function perCaseRows(opts = {}) {
  return getCostReport(opts).per_case;
}

module.exports = {
  getCostReport,
  perCaseRows,
  priceFor,
  costOf,
  PRICE_TABLE,
  METRICS_FILE,
};
