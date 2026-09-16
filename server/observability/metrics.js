const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');
const METRICS_FILE = path.join(LOGS_DIR, 'ai-metrics.jsonl');

const agg = {
  calls: 0,                    // toplam AI çağrısı
  successes: 0,                // HTTP-level başarılı çağrı (içerik döndü)
  failures: 0,                 // API/ağ/timeout hatası
  parse_success: 0,            // yanıt JSON olarak parse edilip şemadan geçti
  parse_fail: 0,               // AI_INVALID_JSON / zorunlu alan eksik
  parse_skipped: 0,            // çağrı hata nedeniyle bitirdi; parse yapılmadı
  retry_used: 0,               // ilk deneme geçersizdi, onarım denemesi yapıldı
  truncated: 0,                // finish_reason=length (token sınırında kesildi)
  latency_total_ms: 0,
  prompt_tokens_total: 0,
  completion_tokens_total: 0,
  by_model: {},                // model -> { calls, successes, failures, latency_total_ms, ... }
  by_prompt_version: {},       // prompt_version -> { calls, parse_success, parse_fail }
  by_error: {},                // hata kodu -> sayı
};

const MAX_LATENCY_SAMPLES = 500; // p95 hesabı için son N gecikme örneği tutulur
const latencySamples = [];

const PII_TOKENS = new Set([
  'patient', 'name', 'age', 'sex', 'tc', 'tckn', 'kimlik', 'identity',
  'dob', 'birth', 'address', 'phone', 'email', 'ad', 'soyad', 'yas',
]);

function isPiiKey(key) {
  return key
    .split(/[^a-zA-Z]+/)
    .filter(Boolean)
    .some((token) => PII_TOKENS.has(token.toLowerCase()));
}

function sanitize(meta) {
  if (meta === undefined || meta === null) return {};
  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    if (isPiiKey(key)) continue; // kimlik taşıyabilecek anahtarlar hiç yazılmaz
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      out[key] = value;
    } else if (typeof value === 'object') {
      const nested = sanitize(value); // usage/error gibi teknik iç nesneler korunur
      if (Object.keys(nested).length > 0) out[key] = nested;
    }
  }
  return out;
}

function bump(obj, key, field, amount = 1) {
  if (!obj[key]) obj[key] = { calls: 0, successes: 0, failures: 0, parse_success: 0, parse_fail: 0, latency_total_ms: 0 };
  obj[key][field] = (obj[key][field] || 0) + amount;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function writeJsonl(entry) {
  try {
    if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.appendFileSync(METRICS_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
  }
}

function recordAiCall(evt) {
  const entry = {
    type: 'ai_call',
    timestamp: new Date().toISOString(),
    request_id: evt.request_id,
    attempt: evt.attempt || 1,
    model: evt.model,
    provider: evt.provider,
    prompt_version: evt.prompt_version || null,
    input_schema_version: evt.schema_version || null,
    response_status: evt.status,
    latency_ms: evt.latency_ms,
    finish_reason: evt.finish_reason || null,
    usage: {
      prompt_tokens: evt.prompt_tokens ?? null,
      completion_tokens: evt.completion_tokens ?? null,
      total_tokens: (evt.prompt_tokens ?? null) !== null && (evt.completion_tokens ?? null) !== null
        ? evt.prompt_tokens + evt.completion_tokens
        : null,
    },
    error: evt.error_code
      ? { code: evt.error_code, message: String(evt.error_message || '').slice(0, 200) }
      : null,
  };

  agg.calls++;
  agg.latency_total_ms += evt.latency_ms || 0;
  if (latencySamples.length >= MAX_LATENCY_SAMPLES) latencySamples.shift();
  latencySamples.push(evt.latency_ms || 0);
  if (evt.attempt > 1) agg.retry_used++;

  const modelKey = `${evt.provider}/${evt.model}`;
  if (evt.status === 'success') {
    agg.successes++;
    bump(agg.by_model, modelKey, 'successes');
    if (evt.finish_reason === 'length') agg.truncated++;
    if (evt.prompt_tokens) agg.prompt_tokens_total += evt.prompt_tokens;
    if (evt.completion_tokens) agg.completion_tokens_total += evt.completion_tokens;
  } else {
    agg.failures++;
    const code = evt.error_code || 'UNKNOWN';
    agg.by_error[code] = (agg.by_error[code] || 0) + 1;
  }
  bump(agg.by_model, modelKey, 'calls');
  agg.by_model[modelKey].latency_total_ms += evt.latency_ms || 0;
  bump(agg.by_prompt_version, evt.prompt_version || 'unknown', 'calls');

  writeJsonl(sanitize(entry));
}

function recordParseResult(evt) {
  const entry = {
    type: 'parse_result',
    timestamp: new Date().toISOString(),
    request_id: evt.request_id,
    attempts: evt.attempts,
    outcome: evt.outcome,
    parse_success: evt.outcome === 'success',
    raw_schema_issues: evt.raw_schema_issues ?? null,
    prompt_version: evt.prompt_version || null,
    model: evt.model || null,
    provider: evt.provider || null,
    error: evt.error_code
      ? { code: evt.error_code }
      : null,
  };

  if (evt.outcome === 'success') {
    agg.parse_success++;
    bump(agg.by_model, `${evt.provider || '?'}/${evt.model || '?'}`, 'parse_success');
    bump(agg.by_prompt_version, evt.prompt_version || 'unknown', 'parse_success');
  } else if (evt.outcome === 'invalid_json') {
    agg.parse_fail++;
    bump(agg.by_model, `${evt.provider || '?'}/${evt.model || '?'}`, 'parse_fail');
    bump(agg.by_prompt_version, evt.prompt_version || 'unknown', 'parse_fail');
    const code = evt.error_code || 'AI_INVALID_JSON';
    agg.by_error[code] = (agg.by_error[code] || 0) + 1;
  } else {
    agg.parse_skipped++;
  }

  writeJsonl(sanitize(entry));
}

function getSummary() {
  const parsed = agg.parse_success + agg.parse_fail;
  const latencies = [...latencySamples].sort((a, b) => a - b);

  const modelSummary = Object.fromEntries(
    Object.entries(agg.by_model).map(([key, m]) => {
      const avg = m.calls > 0 ? Math.round(m.latency_total_ms / m.calls) : 0;
      const sr = m.parse_success + m.parse_fail;
      return [key, {
        calls: m.calls,
        successes: m.successes,
        failures: m.failures,
        avg_latency_ms: avg,
        parse_success: m.parse_success,
        parse_fail: m.parse_fail,
        structured_output_rate: sr > 0 ? Number(((m.parse_success / sr) * 100).toFixed(1)) : null,
      }];
    }),
  );

  const promptSummary = Object.fromEntries(
    Object.entries(agg.by_prompt_version).map(([key, p]) => {
      const total = p.parse_success + p.parse_fail;
      return [key, {
        calls: p.calls,
        parse_success: p.parse_success,
        parse_fail: p.parse_fail,
        structured_output_rate: total > 0 ? Number(((p.parse_success / total) * 100).toFixed(1)) : null,
      }];
    }),
  );

  return {
    window: 'süreç ömrü (restart ile sıfırlanır)',
    calls: agg.calls,
    successes: agg.successes,
    failures: agg.failures,
    retries_used: agg.retry_used,
    truncated_responses: agg.truncated,
    parse: {
      success: agg.parse_success,
      fail: agg.parse_fail,
      skipped: agg.parse_skipped,
      success_rate: parsed > 0 ? Number(((agg.parse_success / parsed) * 100).toFixed(1)) : null,
    },
    latency: {
      avg_ms: agg.calls > 0 ? Math.round(agg.latency_total_ms / agg.calls) : 0,
      p50_ms: percentile(latencies, 50),
      p95_ms: percentile(latencies, 95),
    },
    tokens: {
      prompt_total: agg.prompt_tokens_total,
      completion_total: agg.completion_tokens_total,
      total: agg.prompt_tokens_total + agg.completion_tokens_total,
    },
    by_model: modelSummary,
    by_prompt_version: promptSummary,
    errors: agg.by_error,
  };
}

function getFileSummary(opts = {}) {
  const limit = opts.limit || 5000;
  let lines = [];
  try {
    const raw = fs.readFileSync(METRICS_FILE, 'utf8');
    lines = raw.trim().split('\n').slice(-limit);
  } catch {
    return { file: path.relative(path.join(__dirname, '..', '..'), METRICS_FILE), events: 0 };
  }

  const calls = [];
  const parseResults = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.type === 'ai_call') calls.push(e);
      else if (e.type === 'parse_result') parseResults.push(e);
    } catch { /* bozuk satır atlanır */ }
  }

  if (calls.length === 0) {
    return { file: path.relative(path.join(__dirname, '..', '..'), METRICS_FILE), events: 0 };
  }

  const successCalls = calls.filter((c) => c.response_status === 'success');
  const errs = {};
  for (const c of calls) {
    if (c.error && c.error.code) errs[c.error.code] = (errs[c.error.code] || 0) + 1;
  }
  const byModel = {};
  for (const c of calls) {
    const key = `${c.provider}/${c.model}`;
    if (!byModel[key]) byModel[key] = { calls: 0, avg_latency_ms: 0, latency_total_ms: 0 };
    byModel[key].calls++;
    byModel[key].latency_total_ms += c.latency_ms || 0;
  }
  for (const m of Object.values(byModel)) {
    m.avg_latency_ms = m.calls > 0 ? Math.round(m.latency_total_ms / m.calls) : 0;
    delete m.latency_total_ms;
  }

  for (const p of parseResults) {
    const key = `${p.provider || '?'}/${p.model || '?'}`;
    if (!byModel[key]) byModel[key] = { calls: 0, avg_latency_ms: 0 };
    if (p.outcome === 'success') byModel[key].parse_success = (byModel[key].parse_success || 0) + 1;
    else if (p.outcome === 'invalid_json') byModel[key].parse_fail = (byModel[key].parse_fail || 0) + 1;
  }
  for (const m of Object.values(byModel)) {
    const sr = (m.parse_success || 0) + (m.parse_fail || 0);
    m.structured_output_rate = sr > 0 ? Number((((m.parse_success || 0) / sr) * 100).toFixed(1)) : null;
  }
  const modelsWithParse = byModel;

  const latencySorted = successCalls.map((c) => c.latency_ms || 0).sort((a, b) => a - b);

  return {
    file: path.relative(path.join(__dirname, '..', '..'), METRICS_FILE),
    events: calls.length,
    first_timestamp: calls[0].timestamp,
    last_timestamp: calls[calls.length - 1].timestamp,
    success_rate: Number(((successCalls.length / calls.length) * 100).toFixed(1)),
    avg_latency_ms: latencySorted.length
      ? Math.round(latencySorted.reduce((s, v) => s + v, 0) / latencySorted.length)
      : null,
    p95_latency_ms: percentile(latencySorted, 95),
    avg_prompt_tokens: successCalls.length
      ? Math.round(successCalls.reduce((s, c) => s + ((c.usage && c.usage.prompt_tokens) || 0), 0) / successCalls.length)
      : null,
    avg_completion_tokens: successCalls.length
      ? Math.round(successCalls.reduce((s, c) => s + ((c.usage && c.usage.completion_tokens) || 0), 0) / successCalls.length)
      : null,
    by_model: modelsWithParse,
    errors: errs,
  };
}

module.exports = {
  recordAiCall,
  recordParseResult,
  getSummary,
  getFileSummary,
  METRICS_FILE,
};
