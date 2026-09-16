
const fs = require('fs');
const path = require('path');

const PROJECT = path.join(__dirname, '..');
const CASES_DIR = path.join(PROJECT, 'cases');
const REGRESSION_DIR = path.join(PROJECT, 'regression');
const BASELINE_PATH = path.join(REGRESSION_DIR, 'baseline.json');
const REPORTS_DIR = path.join(REGRESSION_DIR, 'reports');

const args = process.argv.slice(2);
const wantsMock = args.includes('--mock');
const wantsUpdate = args.includes('--update-baseline');
const caseIdx = args.indexOf('--case');
const onlyCase = caseIdx !== -1 ? args[caseIdx + 1] : null;

if (wantsMock) {
  process.env.MODEL_PROVIDER = 'mock';
}

const { analyzeCase } = require(path.join(PROJECT, 'server/pipeline/analyzePipeline'));
const { ANALYSIS_SCHEMA, SCHEMA_VERSION } = require(path.join(PROJECT, 'server/schemas/analysisSchema'));
const KB = require(path.join(PROJECT, 'server/knowledge/knowledgeBase'));
const costTracker = require(path.join(PROJECT, 'server/observability/costTracker'));


function norm(value) {
  return String(value || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
}

function loadCases() {
  const files = fs.readdirSync(CASES_DIR)
    .filter((f) => /^case_\d+\.json$/.test(f))
    .sort();
  if (files.length === 0) {
    throw new Error(`cases/ klasöründe vaka bulunamadı: ${CASES_DIR}`);
  }
  const cases = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(CASES_DIR, file), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.input) throw new Error(`${file}: 'input' alanı zorunludur.`);
    if (!parsed.id) parsed.id = file.replace(/\.json$/, '');
    cases.push(parsed);
  }
  if (onlyCase) {
    const filtered = cases.filter((c) => c.id === onlyCase || path.basename(c.id) === onlyCase);
    if (filtered.length === 0) throw new Error(`--case ${onlyCase}: eşleşen vaka yok.`);
    return filtered;
  }
  return cases;
}

function kbEntryFor(name) {
  const target = norm(name);
  if (!target) return null;
  for (const entry of KB) {
    const names = [entry.name, ...(entry.aliases || [])].map(norm).filter(Boolean);
    if (names.some((alias) => alias === target || target.includes(alias) || alias.includes(target))) {
      return entry;
    }
  }
  return null;
}

function findWithKeywords(diagnoses, keywords) {
  const names = diagnoses.map((d) => norm(d.name));
  for (const kw of keywords || []) {
    const n = norm(kw);
    const idx = names.findIndex((name) => name.includes(n));
    if (idx !== -1) return { index: idx, name: diagnoses[idx].name };
  }
  return null;
}

function checkExpectations(caseData, result) {
  const checks = [];
  const diagnoses = (result.result && result.result.differential_diagnoses) || [];
  const top1 = diagnoses.length > 0 ? diagnoses[0] : null;
  const exp = caseData.expected || {};

  const add = (name, pass, detail) => checks.push({ check: name, pass, detail });

  add('zarf_yapisi', !!(result && result.result && result.case), 'analyzeCase sonuç zarfı eksiksiz mi');
  add('sema_dogrulandi', !!(result.result && result.result.structured_output && result.result.structured_output.validated === true), `schema_version=${result.result && result.result.structured_output ? result.result.structured_output.schema_version : '?'}`);
  add('tani_karti_1_5', diagnoses.length >= 1 && diagnoses.length <= 5, `tanı sayısı: ${diagnoses.length}`);

  const nameless = diagnoses.filter((d) => !d || typeof d.name !== 'string' || d.name.trim().length === 0).length;
  add('her_hastalik_sonucu_mevcut', nameless === 0, nameless === 0 ? `${diagnoses.length} tanı kartının tümü adlandırılmış` : `${nameless} kartta isim yok`);

  const noSuppField = diagnoses.filter((d) => !Array.isArray(d.supporting_findings)).length;
  const emptySupp = diagnoses.filter((d) => Array.isArray(d.supporting_findings) && d.supporting_findings.length === 0).map((d) => d.name || '?');
  add('supporting_findings_alani', noSuppField === 0, noSuppField === 0 ? 'tüm kartlarda supporting_findings alanı var' : `${noSuppField} kartta supporting_findings alanı yok`);

  const noContraField = diagnoses.filter((d) => !Array.isArray(d.findings_against)).length;
  add('contradicting_findings_alani', noContraField === 0, noContraField === 0 ? 'tüm kartlarda findings_against alanı var' : `${noContraField} kartta findings_against alanı yok`);

  const noMissingField = diagnoses.filter((d) => !Array.isArray(d.missing_or_uncertain_information)).length;
  const topMissing = (result.result && Array.isArray(result.result.important_missing_information)) ? result.result.important_missing_information : null;
  add('missing_information_alani', noMissingField === 0 && topMissing !== null, noMissingField === 0 && topMissing !== null ? 'kart bazında ve sonuç genelinde missing information alanları var' : `eksik alan: kart=${noMissingField}, genel=${topMissing === null ? 'yok' : 'var'}`);

  if (wantsMock) return checks;

  add('supporting_findings_mevcut', emptySupp.length === 0, emptySupp.length === 0 ? 'tüm tanı kartlarında en az bir destekleyici bulgu var' : `boş: ${emptySupp.join(', ')}`);
  add('missing_information_mevcut', topMissing !== null && topMissing.length > 0, `important_missing_information: ${topMissing ? topMissing.length : 0} madde`);

  const minDx = exp.min_diagnoses;
  if (typeof minDx === 'number') {
    add('tani_sayisi_min', diagnoses.length >= minDx, `beklenen >= ${minDx}, bulunan ${diagnoses.length}`);
  }

  if (!top1) {
    add('top1_var', false, 'differential_diagnoses boş');
    return checks;
  }

  if (Array.isArray(exp.top1_contains) && exp.top1_contains.length > 0) {
    const hit = findWithKeywords([top1], exp.top1_contains);
    add('top1_eslesiyor', !!hit, hit ? `top1="${top1.name}"` : `top1="${top1.name}", beklenen: ${exp.top1_contains.join(' | ')}`);
  }

  if (Array.isArray(exp.top1_not) && exp.top1_not.length > 0) {
    const bad = findWithKeywords([top1], exp.top1_not);
    add('top1_ters_bulgu_iceriyor_degil', !bad, bad ? `top1="${top1.name}" istenmeyen bulguyu içeriyor (${exp.top1_not.join(' | ')})` : `top1="${top1.name}" temiz`);
  }

  if (Array.isArray(exp.must_include_any) && exp.must_include_any.length > 0) {
    const hit = findWithKeywords(diagnoses, exp.must_include_any);
    add('listedeki_tanilar', !!hit, hit ? `"${hit.name}" (sıra ${hit.index + 1}) listede` : `hiçbiri listede yok: ${exp.must_include_any.join(' | ')}`);
  }

  if (Array.isArray(exp.must_not_include) && exp.must_not_include.length > 0) {
    const bad = findWithKeywords(diagnoses, exp.must_not_include);
    add('istenmeyen_tanilar_yok', !bad, bad ? `"${bad.name}" (sıra ${bad.index + 1}) listeye girmiş` : 'istenmeyen tanı yok');
  }

  if (exp.top1_category) {
    const entry = kbEntryFor(top1.name);
    const actual = entry ? entry.category : null;
    add('top1_kategori', actual === exp.top1_category, `beklenen "${exp.top1_category}", bulunan "${actual || 'bilinmeyen tanı'}" (top1="${top1.name}")`);
  }

  return checks;
}


function snapshotOf(caseData, result) {
  const r = result.result || {};
  return {
    top1: r.differential_diagnoses && r.differential_diagnoses[0] ? r.differential_diagnoses[0].name : null,
    diagnosis_names: (r.differential_diagnoses || []).map((d) => d.name),
    relevance_order: (r.differential_diagnoses || []).map((d) => d.relevance),
    diagnosis_count: (r.differential_diagnoses || []).length,
    audit_flag_count: (r.audit_flags || []).length,
    missing_info_count: (r.important_missing_information || []).length,
    evidence_link_count: (r.evidence_tree && Array.isArray(r.evidence_tree.links)) ? r.evidence_tree.links.length : 0,
    hypothesis_count: (r.second_opinion && Array.isArray(r.second_opinion.hypothesis_review)) ? r.second_opinion.hypothesis_review.length : 0,
    unconsidered_count: (r.second_opinion && Array.isArray(r.second_opinion.unconsidered_alternatives)) ? r.second_opinion.unconsidered_alternatives.length : 0,
    prompt_version: result.prompt_version || null,
    schema_version: (r.structured_output && r.structured_output.schema_version) || SCHEMA_VERSION,
  };
}

function diffSnapshots(prev, next) {
  const diffs = [];
  if (prev.top1 !== next.top1) diffs.push(`top1 değişti: "${prev.top1}" -> "${next.top1}"`);
  const prevNames = (prev.diagnosis_names || []).map(norm).join(' || ');
  const nextNames = (next.diagnosis_names || []).map(norm).join(' || ');
  if (prevNames !== nextNames) diffs.push('tanı listesi değişti');
  else {
    for (const key of ['relevance_order', 'diagnosis_count', 'audit_flag_count', 'missing_info_count', 'evidence_link_count', 'hypothesis_count', 'unconsidered_count']) {
      const a = JSON.stringify(prev[key]);
      const b = JSON.stringify(next[key]);
      if (a !== b) diffs.push(`${key}: ${a} -> ${b}`);
    }
  }
  if (prev.prompt_version !== next.prompt_version) diffs.push(`prompt_version: ${prev.prompt_version} -> ${next.prompt_version}`);
  if (prev.schema_version !== next.schema_version) diffs.push(`schema_version: ${prev.schema_version} -> ${next.schema_version}`);
  return diffs;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { meta: null, cases: {} };
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return { meta: null, cases: {} };
  }
}

function costSummary(results) {
  const withCost = results.filter((r) => r.cost);
  if (withCost.length === 0) return null;
  const input_tokens = withCost.reduce((s, r) => s + r.cost.input_tokens, 0);
  const output_tokens = withCost.reduce((s, r) => s + r.cost.output_tokens, 0);
  const estimated_cost_usd = Number(withCost.reduce((s, r) => s + r.cost.estimated_cost_usd, 0).toFixed(6));
  return {
    cases_with_cost: withCost.length,
    input_tokens,
    output_tokens,
    estimated_cost_usd,
    avg_cost_per_case_usd: withCost.length ? Number((estimated_cost_usd / withCost.length).toFixed(6)) : 0,
  };
}


function printTable(rows) {
  const widths = {};
  for (const row of rows) {
    row.forEach((cell, i) => { widths[i] = Math.max(widths[i] || 0, cell.length); });
  }
  for (const row of rows) {
    console.log('  ' + row.map((cell, i) => String(cell).padEnd(widths[i])).join('  '));
  }
}


async function main() {
  const cases = loadCases();
  const baseline = loadBaseline();
  const modelClient = require(path.join(PROJECT, 'server/services/model'));

  console.log(`\nREGRESSION ÇALIŞTIRMA — ${cases.length} vaka`);
  console.log(`  provider: ${modelClient.getProviderName()} | model: ${modelClient.getModelInfo().model}${wantsMock ? ' (mock modu: yalnızca yapısal testler)' : ''}\n`);

  const results = [];
  let expectationFailures = 0;
  let runFailures = 0;
  let diffCount = 0;
  const seenRequestsBefore = new Set(costTracker.getCostReport().per_case.map((r) => r.request_id));

  for (const caseData of cases) {
    const label = `${caseData.id} — ${caseData.title}`;
    console.log(`▶ ${label}`);
    const startedAt = Date.now();

    let result = null;
    let runError = null;
    try {
      result = await analyzeCase(caseData.input);
    } catch (err) {
      runError = err;
    }

    const durationMs = Date.now() - startedAt;

    if (runError) {
      runFailures++;
      console.error(`  RUN FAIL (${durationMs} ms): ${runError.code || ''} ${runError.message}\n`);
      results.push({
        id: caseData.id,
        title: caseData.title,
        ok: false,
        error: { code: runError.code || 'RUN_ERROR', message: runError.message },
        checks: [],
        diff: [],
      });
      continue;
    }

    const checks = checkExpectations(caseData, result);
    const failedChecks = checks.filter((c) => !c.pass);
    expectationFailures += failedChecks.length;

    let caseCost = null;
    try {
      const fresh = costTracker.getCostReport();
      const newRows = fresh.per_case.filter((r) => !seenRequestsBefore.has(r.request_id) && r.total_tokens > 0);
      if (newRows.length > 0) {
        for (const r of fresh.per_case) seenRequestsBefore.add(r.request_id);
        const input_tokens = newRows.reduce((s, r) => s + r.input_tokens, 0);
        const output_tokens = newRows.reduce((s, r) => s + r.output_tokens, 0);
        caseCost = {
          input_tokens,
          output_tokens,
          total_tokens: input_tokens + output_tokens,
          estimated_cost_usd: Number(newRows.reduce((s, r) => s + r.estimated_cost_usd, 0).toFixed(6)),
          ai_calls: newRows.reduce((s, r) => s + r.calls, 0),
        };
      }
    } catch { /* maliyet hesabı testi bozmamalı */ }
    if (caseCost) {
      console.log(`  COST in=${caseCost.input_tokens} tok, out=${caseCost.output_tokens} tok, ~${caseCost.estimated_cost_usd}`);
    }

    const snapshot = snapshotOf(caseData, result);
    const prevSnapshot = baseline.cases && baseline.cases[caseData.id];
    let diff = [];
    if (prevSnapshot && !wantsUpdate) {
      diff = diffSnapshots(prevSnapshot, snapshot);
      if (diff.length > 0) diffCount++;
    }

    for (const check of checks) {
      const mark = check.pass ? 'OK  ' : 'FAIL';
      console.log(`  ${mark} ${check.check}: ${check.detail}`);
    }
    for (const d of diff) {
      console.log(`  DIFF ${d}`);
    }
    console.log(`  (${durationMs} ms)\n`);

    results.push({
      id: caseData.id,
      title: caseData.title,
      target_category: caseData.target_category || null,
      ok: failedChecks.length === 0,
      checks,
      diff,
      snapshot,
      cost: caseCost,
    });
  }

  console.log('ÖZET');
  printTable([
    ['vaka', 'beklenti', 'diff', 'süre'],
    ...results.map((r) => [
      r.id,
      r.ok ? 'PASS' : (r.error ? 'RUN FAIL' : 'FAIL'),
      r.diff && r.diff.length > 0 ? `${r.diff.length} değişiklik` : '-',
      '-',
    ]),
  ]);

  const modelInfo = modelClient.getModelInfo();
  const report = {
    generatedAt: new Date().toISOString(),
    provider: modelInfo.provider,
    model: modelInfo.model,
    mockMode: wantsMock,
    promptVersion: results[0] && results[0].snapshot ? results[0].snapshot.prompt_version : null,
    summary: {
      cases: results.length,
      pass: results.filter((r) => r.ok).length,
      fail: results.filter((r) => !r.ok).length,
      diff: diffCount,
      expectationFailures,
      runFailures,
    },
    cost_summary: costSummary(results),
    results,
  };

  if (wantsUpdate) {
    const newBaseline = {
      meta: {
        note: 'Baseline regression snapshot. Beklentileri karşılayan son bilinen durum. Güncellemek için: npm run test:regression:update',
        schemaVersion: SCHEMA_VERSION,
        provider: modelInfo.provider,
        model: modelInfo.model,
        updatedAt: new Date().toISOString(),
      },
      cases: Object.fromEntries(results.filter((r) => r.snapshot).map((r) => [r.id, r.snapshot])),
    };
    fs.mkdirSync(REGRESSION_DIR, { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(newBaseline, null, 2) + '\n', 'utf8');
    console.log(`\nBaseline güncellendi: ${path.relative(PROJECT, BASELINE_PATH)}`);
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = path.join(REPORTS_DIR, `report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`Rapor yazıldı: ${path.relative(PROJECT, reportPath)}`);

  const blockingFailures = runFailures + (wantsMock ? 0 : expectationFailures);
  process.exitCode = blockingFailures > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('Beklenmeyen hata:', err);
  process.exitCode = 1;
});
