import { syntheticCaseCatalog } from './syntheticCases.mjs';
import { esc } from './utils.js';

const catalog = syntheticCaseCatalog();
const byId = (id) => catalog.find((item) => item.id === id) || catalog[0];
const text = (item) => [item.clinicalNote, item.otherSymptoms, ...item.symptoms.map((s) => s.label)].filter(Boolean).join(' · ');
const labs = (item) => (item.laboratoryResults || []).filter((lab) => lab.name && lab.name !== 'Yok').map((lab) => `${lab.name}: ${lab.value || '—'} ${lab.unit || ''}`.trim()).join(' · ') || 'Belirtilmemiş';
const missing = (item) => Object.entries(item.symptomTiming || {}).filter(([, value]) => !value).map(([key]) => key).join(', ') || 'Yok';

export function renderSyntheticCompare(appEl, params = {}) {
  const left = byId(params.left);
  const right = byId(params.right) === left ? catalog.find((item) => item.id !== left.id) || catalog[1] : byId(params.right);
  const renderColumn = (item) => `
    <div class="card"><div class="card-pad">
      <h2 class="card-title">${esc(item.typeLabel)}</h2>
      <p class="section-desc">${esc(item.patient.age)} yaş · ${esc(item.patient.sex === 'female' ? 'Kadın' : 'Erkek')}</p>
      <p class="plain-text">${esc(text(item))}</p>
      <h3>Laboratuvar / test</h3><p class="plain-text">${esc(labs(item))}</p>
      <h3>Eksik bilgi</h3><p class="plain-text">${esc(missing(item))}</p>
      <h3>Güvenlik ve kapsam</h3><p class="plain-text">${item.expected.safety ? 'Kırmızı bayrak incelemesi beklenir.' : 'Belirgin kırmızı bayrak metadata işareti yok.'} ${item.expected.outOfScope ? 'Bilgi tabanı kapsamı dışı senaryo.' : 'Bilgi tabanı içinde.'}</p>
    </div></div>`;
  appEl.innerHTML = `
    <div class="page-header"><h1 class="page-title">Sentetik Vaka Karşılaştırma</h1><p class="page-subtitle">Tanı önceden ifşa edilmez; görünen farklar yalnızca bulgu, test/eksik bilgi, güvenlik ve kapsam boyutundadır.</p></div>
    <div class="form-grid" style="margin-bottom:22px;">
      <label class="field">Sol vaka<select id="compare-left">${catalog.map((item) => `<option value="${esc(item.id)}" ${item.id === left.id ? 'selected' : ''}>${esc(item.typeLabel)} — ${esc(item.id)}</option>`).join('')}</select></label>
      <label class="field">Sağ vaka<select id="compare-right">${catalog.map((item) => `<option value="${esc(item.id)}" ${item.id === right.id ? 'selected' : ''}>${esc(item.typeLabel)} — ${esc(item.id)}</option>`).join('')}</select></label>
    </div>
    <div class="form-grid">${renderColumn(left)}${renderColumn(right)}</div>`;
  const update = () => { window.location.hash = `#/synthetic-compare?left=${encodeURIComponent(appEl.querySelector('#compare-left').value)}&right=${encodeURIComponent(appEl.querySelector('#compare-right').value)}`; };
  appEl.querySelector('#compare-left').addEventListener('change', update);
  appEl.querySelector('#compare-right').addEventListener('change', update);
}
