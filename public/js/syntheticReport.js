import { syntheticCaseCatalog } from './syntheticCases.mjs';
import { esc } from './utils.js';

function evaluateCatalog() {
  const cases = syntheticCaseCatalog();
  const counts = { total: cases.length, low: 0, medium: 0, high: 0, missing: 0, safety: 0, audit: 0, outOfScope: 0 };
  const byType = {};
  cases.forEach((item) => {
    const expected = item.expected || {};
    counts[expected.confidence] += 1;
    if (expected.missingInfo) counts.missing += 1;
    if (expected.safety) counts.safety += 1;
    if (expected.audit) counts.audit += 1;
    if (expected.outOfScope) counts.outOfScope += 1;
    byType[item.typeLabel] = (byType[item.typeLabel] || 0) + 1;
  });
  return { cases, counts, byType };
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function exportReport(format, evaluation) {
  const rows = evaluation.cases.map((item) => ({
    case_id: item.id,
    type: item.typeLabel,
    provider: 'mock/metadata',
    model: 'synthetic-evaluation',
    confidence: item.expected.confidence,
    missing_information: item.expected.missingInfo,
    clinical_safety: item.expected.safety,
    audit_warning_expected: item.expected.audit,
    out_of_scope: item.expected.outOfScope,
    expected_behavior: item.expected.outcome,
  }));
  const body = format === 'json'
    ? JSON.stringify({ generatedAt: new Date().toISOString(), source: 'synthetic metadata only', rows }, null, 2)
    : [Object.keys(rows[0]).join(','), ...rows.map((row) => Object.values(row).map(csvCell).join(','))].join('\n');
  const blob = new Blob([body], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `synthetic-evaluation.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function renderSyntheticReport(appEl) {
  const evaluation = evaluateCatalog();
  const cards = [
    ['total', 'Test edilen sentetik vaka'],
    ['low', 'Düşük güven beklenen'],
    ['medium', 'Orta güven beklenen'],
    ['high', 'Yüksek güven beklenen'],
    ['missing', 'Eksik bilgi'],
    ['safety', 'Klinik safety / kırmızı bayrak'],
    ['audit', 'Audit uyarısı beklenen'],
    ['outOfScope', 'Kapsam dışı'],
  ];
  appEl.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Sentetik Vaka Kalite Raporu</h1>
      <p class="page-subtitle">Geliştirici görünümü. Rapor yalnızca vaka metadata'sından üretilir; gerçek model çağrısı, hasta metni veya hassas log içermez.</p>
    </div>
    <div class="stats-grid">${cards.map(([key, label]) => `<div class="card stat-card"><div class="stat-value">${evaluation.counts[key]}</div><div class="stat-label">${esc(label)}</div></div>`).join('')}</div>
    <section class="card" style="margin:22px 0;"><div class="card-pad">
      <h2 class="card-title">Vaka türü dağılımı</h2>
      <ul class="kv-list">${Object.entries(evaluation.byType).map(([type, count]) => `<li><span class="k">${esc(type)}</span><span class="v">${count}</span></li>`).join('')}</ul>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
        <button class="btn btn-secondary" id="export-json">Anonim JSON indir</button>
        <button class="btn btn-secondary" id="export-csv">Anonim CSV indir</button>
        <a class="btn btn-primary" href="#/synthetic-compare">İki sentetik vakayı karşılaştır</a>
      </div>
    </div></section>
    <section class="card"><div class="card-pad">
      <h2 class="card-title">Beklenen davranış matrisi</h2>
      <div class="table-wrap"><table class="compare-table"><thead><tr><th>ID</th><th>Tür</th><th>Güven</th><th>Eksik bilgi</th><th>Safety</th><th>Audit</th><th>Kapsam</th></tr></thead>
      <tbody>${evaluation.cases.map((item) => `<tr><td>${esc(item.id)}</td><td>${esc(item.typeLabel)}</td><td>${esc(item.expected.confidence)}</td><td>${item.expected.missingInfo ? 'Evet' : 'Hayır'}</td><td>${item.expected.safety ? 'Evet' : 'Hayır'}</td><td>${item.expected.audit ? 'Evet' : 'Hayır'}</td><td>${item.expected.outOfScope ? 'Dışında' : 'İçinde'}</td></tr>`).join('')}</tbody></table></div>
    </div></section>`;
  appEl.querySelector('#export-json').addEventListener('click', () => exportReport('json', evaluation));
  appEl.querySelector('#export-csv').addEventListener('click', () => exportReport('csv', evaluation));
}
