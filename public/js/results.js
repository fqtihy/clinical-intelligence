import { getAnalysis, getCaseVersions, getAnalysisFeedback, saveAnalysisFeedback } from './store.js';
import { whatIfAnalysis } from './api.js';
import { esc, formatDateTime, sexLabel } from './utils.js';

function caseIdLabel(caseNumber) {
  return `Case #${String(caseNumber || 0).padStart(3, '0')}`;
}

function computeDdxDelta(currentDx, previousDx) {
  const prevMap = new Map((previousDx || []).map((d) => [normalizeDxNameForDelta(d.name), d]));
  const currMap = new Map((currentDx || []).map((d) => [normalizeDxNameForDelta(d.name), d]));
  const changed = [];
  for (const d of currentDx || []) {
    const prev = prevMap.get(normalizeDxNameForDelta(d.name));
    if (prev && prev.relevance !== d.relevance) {
      changed.push({ name: d.name, before: prev.relevance, after: d.relevance });
    }
  }
  const added = (currentDx || []).filter((d) => !prevMap.has(normalizeDxNameForDelta(d.name)));
  const removed = (previousDx || [])
    .filter((d) => !currMap.has(normalizeDxNameForDelta(d.name)))
    .map((d) => ({ name: d.name, before: d.relevance }));
  return { changed, added, removed };
}

function normalizeDxNameForDelta(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function deltaArrow(before, after) {
  const order = { high: 3, moderate: 2, low: 1 };
  if ((order[after] || 0) > (order[before] || 0)) return '↗';
  if ((order[after] || 0) < (order[before] || 0)) return '↘';
  return '→';
}


function truncText(s, n = 90) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function computePayloadDelta(prevPayload, currPayload) {
  const prev = prevPayload || {};
  const curr = currPayload || {};
  const items = [];

  const keyOf = (s) => String(s.key || s.label || '').toLowerCase();
  const prevSym = new Set((prev.symptoms || []).map(keyOf));
  const currSym = new Set((curr.symptoms || []).map(keyOf));
  for (const s of curr.symptoms || []) {
    if (!prevSym.has(keyOf(s))) items.push({ kind: 'add', text: s.label || s.key });
  }
  for (const s of prev.symptoms || []) {
    if (!currSym.has(keyOf(s))) items.push({ kind: 'remove', text: s.label || s.key });
  }

  const labKey = (l) => [l.name, l.value, l.unit].map((x) => String(x || '').toLowerCase().trim()).join('|');
  const prevLabs = new Set((prev.laboratoryResults || []).filter((l) => l.name).map(labKey));
  const STATUS_TR = { high: 'yüksek', low: 'düşük', abnormal: 'anormal' };
  for (const l of curr.laboratoryResults || []) {
    if (!l.name || prevLabs.has(labKey(l))) continue;
    const val = [l.value, l.unit].filter(Boolean).join(' ');
    const st = STATUS_TR[l.status] ? ` (${STATUS_TR[l.status]})` : '';
    items.push({ kind: 'add', text: `${l.name}${val ? `: ${val}` : ''}${st}` });
  }

  const pOther = String(prev.otherSymptoms || '').trim();
  const cOther = String(curr.otherSymptoms || '').trim();
  if (cOther && cOther !== pOther) items.push({ kind: 'add', text: `Diğer semptomlar: ${truncText(cOther)}` });

  const pNote = String(prev.clinicalNote || '').trim();
  const cNote = String(curr.clinicalNote || '').trim();
  if (cNote && cNote !== pNote) {
    if (pNote && cNote.startsWith(pNote)) {
      items.push({ kind: 'add', text: `Klinik öyküye eklendi: ${truncText(cNote.slice(pNote.length))}` });
    } else if (!pNote) {
      items.push({ kind: 'add', text: `Klinik öykü eklendi: ${truncText(cNote)}` });
    } else {
      items.push({ kind: 'update', text: 'Klinik öykü güncellendi' });
    }
  }

  if (JSON.stringify(prev.symptomTiming || {}) !== JSON.stringify(curr.symptomTiming || {})) {
    items.push({ kind: 'update', text: 'Atak düzeni / zamanlama bilgisi güncellendi' });
  }

  const FIELD_GROUPS = [
    ['medicalHistory', {
      previousIllnesses: 'Önceki hastalıklar',
      medications: 'Kullanılan ilaçlar',
      familyHistory: 'Aile öyküsü',
      previousDiagnoses: 'Önceden konulan tanılar',
      previousTreatments: 'Önceki tedaviler',
      treatmentResponse: 'Tedaviye yanıt',
    }],
    ['geographicHistory', {
      country: 'Yaşadığı ülke/bölge',
      travel: 'Seyahat geçmişi',
      migration: 'Göç geçmişi',
      endemicExposure: 'Endemik bölge maruziyeti',
      animalContact: 'Hayvan teması',
      occupationalExposure: 'İş/meslek maruziyeti',
    }],
  ];
  for (const [group, fields] of FIELD_GROUPS) {
    const pg = prev[group] || {};
    const cg = curr[group] || {};
    for (const [field, label] of Object.entries(fields)) {
      const pv = String(pg[field] || '').trim();
      const cv = String(cg[field] || '').trim();
      if (cv && cv !== pv) items.push({ kind: 'add', text: `${label}: ${truncText(cv)}` });
    }
  }

  const pPrel = String(prev.preliminaryAssessment || '').trim();
  const cPrel = String(curr.preliminaryAssessment || '').trim();
  if (cPrel && cPrel !== pPrel) items.push({ kind: 'update', text: 'Doktorun ön değerlendirmesi güncellendi' });

  return items;
}

function whatsChangedNewInfoHtml(changeNote, deltaItems) {
  const chips = deltaItems.map((it) => {
    if (it.kind === 'remove') return `<span class="wc-chip wc-remove">− ${esc(it.text)}</span>`;
    if (it.kind === 'update') return `<span class="wc-chip wc-update">↻ ${esc(it.text)}</span>`;
    return `<span class="wc-chip wc-add">+ ${esc(it.text)}</span>`;
  }).join('');
  const empty = '<p class="wc-empty">Form verisinde yapılandırılmış yeni alan tespit edilmedi; değişiklik doktor notundan okunabilir.</p>';
  return `
    <div class="wc-section">
      <h3 class="wc-title">YENİ BİLGİ</h3>
      ${changeNote ? `<blockquote class="change-note">“${esc(changeNote)}”</blockquote>` : ''}
      ${chips ? `<div class="wc-chips">${chips}</div>` : empty}
    </div>`;
}

function whatsChangedEffectHtml(delta) {
  const chips = [
    ...delta.changed.map((c) => {
      const up = deltaArrow(c.before, c.after) === '↗';
      return `<span class="wc-effect ${up ? 'wc-up' : 'wc-down'}">${esc(c.name)} ${up ? '↑' : '↓'}</span>`;
    }),
    ...delta.added.map((d) => `<span class="wc-effect wc-new">${esc(d.name)} <em>yeni</em></span>`),
    ...delta.removed.map((r) => `<span class="wc-effect wc-gone">${esc(r.name)} <em>çıkarıldı</em></span>`),
  ].join('');
  const body = chips || '<p class="wc-empty">Eklenen bilgi mevcut olasılıkların sıralamasını belirgin biçimde değiştirmedi.</p>';
  return `
    <div class="wc-section">
      <h3 class="wc-title">ETKİSİ</h3>
      <div class="wc-effects">${body}</div>
    </div>`;
}

function versionDiffBlock(current, prevVersion) {
  const delta = computeDdxDelta(
    current.result && current.result.differential_diagnoses,
    prevVersion.result && prevVersion.result.differential_diagnoses,
  );
  const note = current.changeNote || '';
  const deltaItems = computePayloadDelta(prevVersion.payload, current.payload);

  const rows = [];
  for (const c of delta.changed) {
    rows.push(`
      <tr class="delta-row delta-changed">
        <td>${esc(c.name)}</td>
        <td><span class="rel-chip rel-${esc(c.before)}">${esc(RELEVANCE_SHORT[c.before] || c.before)}</span> ${deltaArrow(c.before, c.after)}</td>
        <td><span class="rel-chip rel-${esc(c.after)}">${esc(RELEVANCE_SHORT[c.after] || c.after)}</span></td>
      </tr>`);
  }
  for (const d of delta.added) {
    rows.push(`
      <tr class="delta-row delta-added">
        <td>${esc(d.name)} <span class="delta-new">yeni</span></td>
        <td>—</td>
        <td><span class="rel-chip rel-${esc(d.relevance)}">${esc(RELEVANCE_SHORT[d.relevance] || d.relevance)}</span></td>
      </tr>`);
  }
  for (const r of delta.removed) {
    rows.push(`
      <tr class="delta-row delta-removed">
        <td>${esc(r.name)} <span class="delta-gone">çıkarıldı</span></td>
        <td><span class="rel-chip rel-${esc(r.before)}">${esc(RELEVANCE_SHORT[r.before] || r.before)}</span></td>
        <td>listede değil</td>
      </tr>`);
  }

  const noChange = rows.length === 0;
  return `
    <div class="card result-block version-diff-card">
      <div class="card-pad">
        <h2 class="card-title">Neler değişti? <span class="wc-range">v${esc(prevVersion.version)} → v${esc(current.version)}</span></h2>
        ${whatsChangedNewInfoHtml(note, deltaItems)}
        ${whatsChangedEffectHtml(delta)}
        ${noChange
          ? '<p class="plain-text" style="color:var(--text-muted);">Eklenen bilgiyle birlikte olasılık sıralamasında değişiklik olmadı.</p>'
          : `<table class="compare-table delta-table">
              <thead><tr><th>Olasılık</th><th>v${prevVersion.version} (önce)</th><th>v${current.version} (sonra)</th></tr></thead>
              <tbody>${rows.join('')}</tbody>
            </table>`}
      </div>
    </div>`;
}


const WHATIF_ENUM_TR = { yes: 'Evet', no: 'Hayır', unknown: 'Bilinmiyor' };

const WHATIF_FIELDS = [
  { section: 'symptomTiming', field: 'resolution', label: 'Ataklar arasında tamamen düzelme', kind: 'enum' },
  { section: 'symptomTiming', field: 'episodic', label: 'Ataklar halinde mi?', kind: 'enum' },
  { section: 'symptomTiming', field: 'recurrent', label: 'Tekrarlıyor mu?', kind: 'enum' },
  { section: 'symptomTiming', field: 'onset', label: 'Başlangıç zamanı', kind: 'text', placeholder: 'ör. 2 yıl önce' },
  { section: 'symptomTiming', field: 'duration', label: 'Süre', kind: 'text', placeholder: 'ör. 2 yıl' },
  { section: 'symptomTiming', field: 'episodeDuration', label: 'Atakların yaklaşık süresi', kind: 'text', placeholder: 'ör. 3-5 gün' },
  { section: 'otherSymptoms', field: 'value', label: 'Diğer semptomlar', kind: 'text', placeholder: 'ör. döküntü, ağız ülseri' },
  { section: 'medicalHistory', field: 'familyHistory', label: 'Aile öyküsü', kind: 'text', placeholder: 'ör. ailede ailesel Akdeniz ateşi' },
  { section: 'medicalHistory', field: 'treatmentResponse', label: 'Tedaviye yanıt', kind: 'text', placeholder: 'ör. kolşisine tam yanıt' },
  { section: 'medicalHistory', field: 'previousDiagnoses', label: 'Önceden konulan tanılar', kind: 'text', placeholder: '' },
  { section: 'medicalHistory', field: 'previousTreatments', label: 'Önceki tedaviler', kind: 'text', placeholder: '' },
  { section: 'medicalHistory', field: 'previousIllnesses', label: 'Önceki hastalıklar', kind: 'text', placeholder: '' },
  { section: 'medicalHistory', field: 'medications', label: 'Kullanılan ilaçlar', kind: 'text', placeholder: '' },
  { section: 'geographicHistory', field: 'travel', label: 'Seyahat geçmişi', kind: 'text', placeholder: '' },
  { section: 'geographicHistory', field: 'endemicExposure', label: 'Endemik bölge maruziyeti', kind: 'text', placeholder: '' },
  { section: 'geographicHistory', field: 'animalContact', label: 'Hayvan teması', kind: 'text', placeholder: '' },
  { section: 'geographicHistory', field: 'country', label: 'Yaşadığı ülke / bölge', kind: 'text', placeholder: '' },
];

function whatIfCurrentValue(analysis, f) {
  const p = analysis.payload || {};
  const v = f.section === 'otherSymptoms' ? p.otherSymptoms : (p[f.section] || {})[f.field];
  return String(v || '').trim();
}

function whatIfDisplayValue(f, v) {
  const s = String(v || '').trim();
  if (f.kind === 'enum') return WHATIF_ENUM_TR[s] || 'Bilinmiyor';
  return s || '(boş / bilinmiyor)';
}

const WHATIF_REL_WEIGHT = { high: 3, moderate: 2, low: 1 };

function whatIfRankedList(dxList) {
  return (dxList || [])
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (WHATIF_REL_WEIGHT[b.d.relevance] || 0) - (WHATIF_REL_WEIGHT[a.d.relevance] || 0) || a.i - b.i)
    .map((x, idx) => ({
      norm: normalizeDxNameForDelta(x.d.name),
      name: x.d.name,
      relevance: x.d.relevance,
      rank: idx + 1,
    }));
}

function whatIfRankListHtml(ranked) {
  if (!ranked || !ranked.length) return '<p class="wi-absent">Liste boş.</p>';
  return `<ol class="wi-ranked">${ranked.map((r) => `
    <li><span class="wi-rank-no">#${r.rank}</span> ${esc(r.name)}
      <span class="rel-chip rel-${esc(r.relevance)}">${esc(RELEVANCE_SHORT[r.relevance] || r.relevance)}</span></li>`).join('')}</ol>`;
}

function whatIfValueControlHtml(f, analysis) {
  if (f.kind === 'enum') {
    const cur = whatIfCurrentValue(analysis, f);
    const opts = ['yes', 'no', 'unknown'];
    const def = opts.find((o) => o !== cur) || 'unknown';
    return `<select id="wi-value">${opts.map((o) => `<option value="${o}" ${o === def ? 'selected' : ''}>${WHATIF_ENUM_TR[o]}</option>`).join('')}</select>`;
  }
  return `<input type="text" id="wi-value" maxlength="300" placeholder="${esc(f.placeholder || 'yeni değer')}">`;
}

function whatIfResultHtml(analysis, f, newValue, envelope) {
  const afterResult = (envelope && envelope.after && envelope.after.result) || {};
  const beforeRanked = whatIfRankedList((analysis.result && analysis.result.differential_diagnoses) || []);
  const afterRanked = whatIfRankedList(afterResult.differential_diagnoses || []);
  const beforeByNorm = new Map(beforeRanked.map((r) => [r.norm, r]));
  const afterByNorm = new Map(afterRanked.map((r) => [r.norm, r]));

  const oldDisp = whatIfDisplayValue(f, whatIfCurrentValue(analysis, f));
  const newDisp = f.kind === 'enum' ? (WHATIF_ENUM_TR[newValue] || newValue) : newValue;
  const afterUncertainty = afterResult.uncertainty_assessment || {};
  const afterSafety = afterResult.clinical_safety || {};

  const effectChips = [];
  const overtakes = [];
  for (const b of beforeRanked) {
    const a = afterByNorm.get(b.norm);
    if (!a) {
      effectChips.push(`<span class="wc-chip wc-remove">− ${esc(b.name)} <em>listeden çıktı</em></span>`);
      continue;
    }
    if (a.rank !== b.rank) {
      effectChips.push(`<span class="wc-chip wc-update">⇅ ${esc(b.name)}: ${b.rank}. sıra → ${a.rank}. sıra</span>`);
    }
    if (b.relevance !== a.relevance) {
      const up = (WHATIF_REL_WEIGHT[a.relevance] || 0) > (WHATIF_REL_WEIGHT[b.relevance] || 0);
      effectChips.push(`<span class="wc-effect ${up ? 'wc-up' : 'wc-down'}">${esc(b.name)} ${up ? '↑' : '↓'} (${esc(RELEVANCE_SHORT[b.relevance] || b.relevance)} → ${esc(RELEVANCE_SHORT[a.relevance] || a.relevance)})</span>`);
    }
  }
  for (const a of afterRanked) {
    if (!beforeByNorm.has(a.norm)) {
      effectChips.push(`<span class="wc-chip wc-add">+ ${esc(a.name)} <em>yeni gündeme geldi (${esc(RELEVANCE_SHORT[a.relevance] || a.relevance)})</em></span>`);
    }
  }
  for (const b1 of beforeRanked) {
    for (const b2 of beforeRanked) {
      if (b1.norm === b2.norm) continue;
      const a1 = afterByNorm.get(b1.norm);
      const a2 = afterByNorm.get(b2.norm);
      if (a1 && a2 && b1.rank < b2.rank && a1.rank > a2.rank) {
        overtakes.push(`${a1.name}, ${a2.name} adayının önüne geçti`);
      }
    }
  }

  const rankingChanged = effectChips.length > 0 || overtakes.length > 0;
  const editChip = `<span class="wc-chip wc-update">↻ ${esc(f.label)}: ${esc(oldDisp)} → ${esc(newDisp)}</span>`;
  const banner = `
    <div class="wi-banner${rankingChanged ? ' wi-banner-hot' : ''}">
      <h3 class="wi-banner-title">SIRALAMAYI DEĞİŞTİREN YENİ BİLGİ</h3>
      <div class="wc-chips">${editChip}${effectChips.join('')}</div>
      ${overtakes.length ? `<ul class="wi-overtakes">${overtakes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
      ${rankingChanged ? '' : '<p class="wi-nochange">Bu değişiklik olasılık sıralamasını değiştirmedi; model hipotezlerini korudu.</p>'}
    </div>`;
  const scenarioSummary = `
    <div class="wi-scenario-summary">
      <div><strong>Senaryo güveni:</strong> ${esc(afterUncertainty.label || 'Belirlenemedi')}</div>
      ${afterUncertainty.details && afterUncertainty.details.length
        ? `<ul>${afterUncertainty.details.slice(0, 3).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
      ${afterSafety.status === 'urgent_review'
        ? `<div class="wi-safety-warning"><strong>Güvenlik uyarısı:</strong> ${esc(afterSafety.label || 'Acil klinik değerlendirme önceliği')}</div>` : ''}
    </div>`;

  const unionNorms = [];
  for (const r of beforeRanked) if (!unionNorms.includes(r.norm)) unionNorms.push(r.norm);
  for (const r of afterRanked) if (!unionNorms.includes(r.norm)) unionNorms.push(r.norm);

  const rows = unionNorms.map((norm) => {
    const b = beforeByNorm.get(norm);
    const a = afterByNorm.get(norm);
    const name = (a && a.name) || (b && b.name) || norm;
    const beforeCell = b
      ? `<span class="rel-chip rel-${esc(b.relevance)}">${esc(RELEVANCE_SHORT[b.relevance] || b.relevance)}</span> <span class="wi-rank-no">#${b.rank}</span>`
      : '<span class="wi-absent">listede yok</span>';
    const afterCell = a
      ? `<span class="rel-chip rel-${esc(a.relevance)}">${esc(RELEVANCE_SHORT[a.relevance] || a.relevance)}</span> <span class="wi-rank-no">#${a.rank}</span>`
      : '<span class="wi-absent">listeden çıktı</span>';
    let arrow = '→';
    let rowClass = '';
    if (b && a) {
      arrow = deltaArrow(b.relevance, a.relevance);
      rowClass = b.relevance !== a.relevance ? 'delta-changed' : '';
    } else if (!b && a) {
      arrow = '+';
      rowClass = 'delta-added';
    } else if (b && !a) {
      arrow = '−';
      rowClass = 'delta-removed';
    }
    return `<tr class="delta-row ${rowClass}">
      <td>${esc(name)}</td><td>${beforeCell}</td><td>${esc(arrow)}</td><td>${afterCell}</td></tr>`;
  }).join('');

  return `
    <div class="wi-result-block">
      ${banner}
      ${scenarioSummary}
      <div class="wi-cols">
        <div class="wi-col">
          <h4 class="wi-col-title">ÖNCE — mevcut analiz</h4>
          ${whatIfRankListHtml(beforeRanked)}
        </div>
        <div class="wi-col wi-col-after">
          <h4 class="wi-col-title">SONRA — “${esc(newDisp)}” senaryosu</h4>
          ${whatIfRankListHtml(afterRanked)}
        </div>
      </div>
      <table class="compare-table wi-table">
        <thead><tr><th>Olasılık</th><th>ÖNCE</th><th></th><th>SONRA</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="hint" style="margin-top:10px;">SONRA analizi "${esc(newDisp)}" senaryosu için yeniden üretildi; geçmişe kaydedilmedi.</p>
    </div>`;
}

function whatIfPanelHtml(analysis) {
  const options = WHATIF_FIELDS.map((f, i) => {
    const cur = whatIfDisplayValue(f, whatIfCurrentValue(analysis, f));
    return `<option value="${i}">${esc(f.label)} — şu an: ${esc(cur)}</option>`;
  }).join('');
  return `
    <div class="tab-panel" id="tab-whatif" role="tabpanel" aria-label="What-if Analizi">
      <div class="card result-block whatif-card">
        <div class="card-pad">
          <h2 class="card-title">“Ya bu bulgu farklı olsaydı?”</h2>
          <p class="plain-text">Formdan <strong>tek bir bilgiyi</strong> değiştirin; vaka yeni bilgiyle yeniden analiz edilir.
          Modelin hipotezlerini yeni bilgiye göre nasıl güncellediğini ÖNCE/SONRA olarak görün.
          Bu deneme geçmişe <strong>kaydedilmez</strong>.</p>
          <div class="whatif-form">
            <div class="field">
              <label for="wi-field">Değiştirilecek bulgu</label>
              <select id="wi-field">${options}</select>
            </div>
            <div class="field">
              <label for="wi-value">Yeni değer</label>
              <div id="wi-value-host"></div>
            </div>
            <div class="whatif-actions">
              <button type="button" class="btn btn-primary" id="wi-run">HİPOTEZLERİ TEST ET</button>
              <span class="hint" id="wi-status"></span>
            </div>
          </div>
          <div id="wi-result"></div>
        </div>
      </div>
    </div>`;
}

function setupWhatIf(appEl, analysis) {
  const host = appEl.querySelector('#wi-value-host');
  const fieldSel = appEl.querySelector('#wi-field');
  const statusEl = appEl.querySelector('#wi-status');
  const resultEl = appEl.querySelector('#wi-result');
  const runBtn = appEl.querySelector('#wi-run');
  if (!fieldSel || !host || !resultEl || !runBtn) return;

  const selectedField = () => WHATIF_FIELDS[Number(fieldSel.value)] || WHATIF_FIELDS[0];
  const renderValueControl = () => {
    host.innerHTML = whatIfValueControlHtml(selectedField(), analysis);
  };
  renderValueControl();
  fieldSel.addEventListener('change', () => {
    renderValueControl();
    resultEl.innerHTML = '';
    statusEl.textContent = '';
  });

  let running = false;
  runBtn.addEventListener('click', async () => {
    if (running) return;
    const f = selectedField();
    const valueInput = appEl.querySelector('#wi-value');
    const value = valueInput ? String(valueInput.value || '').trim() : '';
    if (!value) {
      resultEl.innerHTML = '<div class="alert alert-error">Yeni bir değer girin.</div>';
      return;
    }
    if (value === whatIfCurrentValue(analysis, f)) {
      resultEl.innerHTML = `<div class="alert alert-info">Girilen değer mevcut değerle aynı (“${esc(whatIfDisplayValue(f, value))}”). Farklı bir değer girin.</div>`;
      return;
    }

    running = true;
    runBtn.disabled = true;
    statusEl.textContent = 'Karşı-olgusal analiz çalışıyor… (gerçek model çağrısı; 10-60 sn sürebilir)';
    resultEl.innerHTML = '';
    try {
      const response = await whatIfAnalysis(analysis.payload, { section: f.section, field: f.field, value });
      statusEl.textContent = '';
      resultEl.innerHTML = whatIfResultHtml(analysis, f, value, response.data);
    } catch (err) {
      statusEl.textContent = '';
      resultEl.innerHTML = `<div class="alert alert-error">${esc(err.message || 'Karşı-olgusal analiz başarısız oldu.')}</div>`;
    } finally {
      running = false;
      runBtn.disabled = false;
    }
  });
}

function versionTimelineBlock(analysis, versions) {
  if (!analysis.caseId || versions.length < 2) return '';
  const chips = versions.map((v) => {
    const active = v.id === analysis.id;
    return `<a class="tl-chip${active ? ' tl-active' : ''}" href="#/results/${encodeURIComponent(v.id)}" title="${esc(formatDateTime(v.analyzedAt))}">v${v.version}</a>`;
  }).join('<span class="tl-arrow">→</span>');
  return `
    <div class="version-timeline">
      <span class="tl-label">${caseIdLabel(analysis.caseNumber)} sürüm geçmişi:</span>
      ${chips}
    </div>`;
}

const RELEVANCE_LABELS = {
  high: 'Yüksek öncelikli değerlendirme',
  moderate: 'Orta düzeyde uyum',
  low: 'Düşük düzeyde uyum',
};

const RELEVANCE_SHORT = { high: 'Yüksek', moderate: 'Orta', low: 'Düşük' };

function listBlock(title, items) {
  if (!items || items.length === 0) return '';
  const lis = items.map((item) => `<li>${esc(item)}</li>`).join('');
  return `
    <div class="ddx-section">
      <h3>${title}</h3>
      <ul>${lis}</ul>
    </div>`;
}

function evidenceNotesBlock(notes) {
  if (!notes || notes.length === 0) return '';
  const lis = notes.map((note) => {
    const html = esc(note).replace(/\[S(\d+)\]/gi, (m, num) => `<span class="source-ref">S${num}</span>`);
    return `<li>${html}</li>`;
  }).join('');
  return `
    <div class="ddx-section">
      <h3>Kanıt / açıklama notları</h3>
      <ul>${lis}</ul>
    </div>`;
}

function contradictionBlock(dx) {
  const against = dx.findings_against || [];
  const ca = dx.contradiction_assessment || {};
  const sev = ca.severity === 'significant' || ca.severity === 'minor' ? ca.severity : '';
  const verdict = ca.verdict || '';
  if (!against.length && !verdict) return '';
  const badge = sev
    ? `<span class="contradiction-sev ${sev === 'significant' ? 'sev-significant' : 'sev-minor'}">${sev === 'significant' ? 'Önemli ölçüde zayıflatıyor' : 'Kısmen zayıflatıyor'}</span>`
    : '';
  const lis = against.map((a) => `<li>${esc(a)}</li>`).join('');
  return `
    <div class="ddx-section contradiction-box">
      <h3 class="contradiction-title">⚠️ ${esc(dx.name)} değerlendirmesini zayıflatan bulgular${badge}</h3>
      <ul class="contradiction-list">${lis}</ul>
      ${verdict ? `<p class="contradiction-verdict"><strong>Sonuç:</strong> ${esc(verdict)}</p>` : ''}
    </div>`;
}

function comparisonBlock(items) {
  if (!items || items.length === 0) return '';
  const lis = items.map((c) => {
    const name = esc(c.candidate || '');
    const point = esc(c.distinguishing_point || '');
    return `<li><strong>${name}:</strong> ${point}</li>`;
  }).join('');
  return `
    <div class="ddx-section">
      <h3>Diğer adaylardan neden ayrılıyor?</h3>
      <ul>${lis}</ul>
    </div>`;
}

function reasoningPanel(dx) {
  const r = dx.reasoning || {};
  const supporting = Array.isArray(r.supporting_findings) ? r.supporting_findings : [];
  const contradicting = Array.isArray(r.contradicting_findings) ? r.contradicting_findings : [];
  const discriminative = Array.isArray(r.discriminative_findings) ? r.discriminative_findings : [];
  if (!supporting.length && !contradicting.length && !discriminative.length) return '';

  const supportingLis = supporting.map((s) => `<li class="rs-item rs-support"><span class="rs-ico">✓</span><span>${esc(s)}</span></li>`).join('');
  const contradictingLis = contradicting.map((s) => `<li class="rs-item rs-contradict"><span class="rs-ico">⚠</span><span>${esc(s)}</span></li>`).join('');
  const discriminativeLis = discriminative.map((d) =>
    `<li class="rs-item rs-discriminative"><span class="rs-ico">★</span><span><strong>${esc(d.finding)}</strong>${d.rationale ? ` <span class="rs-rationale">— ${esc(d.rationale)}</span>` : ''}</span></li>`
  ).join('');

  const group = (items, emptyHint) =>
    items
      ? `<ul class="rs-list">${items}</ul>`
      : `<p class="rs-empty">${esc(emptyHint)}</p>`;

  return `
    <div class="reasoning-panel">
      <div class="reasoning-head">
        <span class="reasoning-title">AI neden bunu yaptı?</span>
        <span class="reasoning-note">gizli düşünce zinciri değil; yapılandırılmış gerekçe özeti</span>
      </div>
      <div class="reasoning-grid">
        <div class="rs-col rs-col-support">
          <h4>DESTEKLEYEN</h4>
          ${group(supportingLis, 'Bu vakada destekleyici bulgu bulunamadı.')}
        </div>
        <div class="rs-col rs-col-contradict">
          <h4>ALEYHİNE</h4>
          ${group(contradictingLis, 'Çelişkili bulgu yok')}
        </div>
        <div class="rs-col rs-col-discriminative">
          <h4>AYIRT EDİCİ</h4>
          ${group(discriminativeLis, 'Net ayırt edici bulgu belirtilmedi')}
        </div>
      </div>
    </div>`;
}


const RANK_DRIVERS_LIMIT_UP = 3;
const RANK_DRIVERS_LIMIT_DOWN = 3;

function rankDriverFindings(dx) {
  const r = dx.reasoning || {};
  const up = [];
  const seen = new Set();
  const push = (finding, rationale, star) => {
    const f = String(finding || '').trim();
    if (!f) return;
    const key = f.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return;
    seen.add(key);
    up.push({ finding: f, rationale: String(rationale || '').trim(), star });
  };

  const disc = Array.isArray(r.discriminative_findings) ? r.discriminative_findings : [];
  for (const d of disc) push(d.finding, d.rationale, true);
  const sup = Array.isArray(r.supporting_findings) ? r.supporting_findings : [];
  for (const s of sup) push(s, '', false);
  if (up.length < RANK_DRIVERS_LIMIT_UP) {
    for (const d of dx.distinguishing_features || []) push(d, '', true);
  }
  if (up.length < RANK_DRIVERS_LIMIT_UP) {
    for (const s of dx.supporting_findings || []) push(s, '', false);
  }

  let down = (Array.isArray(r.contradicting_findings) ? r.contradicting_findings : [])
    .map((s) => String(s || '').trim()).filter(Boolean);
  if (down.length === 0) {
    down = (dx.findings_against || []).map((s) => String(s || '').trim()).filter(Boolean);
  }
  return {
    up: up.slice(0, RANK_DRIVERS_LIMIT_UP),
    down: down.slice(0, RANK_DRIVERS_LIMIT_DOWN),
  };
}

function rankDriversBlock(dx) {
  const { up, down } = rankDriverFindings(dx);
  if (!up.length && !down.length) return '';

  const upLis = up.map((d) => `
    <li class="rd-item rd-up">
      <span class="rd-ico">${d.star ? '★' : '✓'}</span>
      <span><strong>${esc(d.finding)}</strong>${d.rationale ? ` <span class="rd-rationale">— ${esc(d.rationale)}</span>` : ''}</span>
    </li>`).join('');
  const downLis = down.map((s) => `
    <li class="rd-item rd-down"><span class="rd-ico">↓</span><span>${esc(s)}</span></li>`).join('');

  return `
    <div class="rank-drivers">
      <h4 class="rd-title">Bu sıralamayı en çok etkileyen bulgular</h4>
      ${up.length ? `<ul class="rd-list">${upLis}</ul>` : '<p class="rd-empty">Sıralamayı yukarı çeken belirgin bulgu bildirilmedi.</p>'}
      ${down.length ? `
        <h4 class="rd-subtitle">Aşağı çeken:</h4>
        <ul class="rd-list">${downLis}</ul>` : ''}
    </div>`;
}

function decisionRationaleView(result, diagnoses) {
  const uncertainty = String(result.uncertainty || '').trim();
  const assessment = result.uncertainty_assessment || {};
  const assessmentLabel = assessment.label || 'Belirlenemedi';
  const assessmentDetails = Array.isArray(assessment.details) ? assessment.details.filter(Boolean).slice(0, 5) : [];
  const reasonLabels = {
    missing_data: 'Veri eksikliği',
    contradictory_findings: 'Çelişkili bulgular',
    test_needed: 'Test sonucu gerekli',
    multiple_compatible_diagnoses: 'Birden fazla aday uyumlu',
    insufficient_coverage: 'Bilgi tabanı kapsamı sınırlı',
    model_evidence_mismatch: 'Model ve kanıt uyuşmazlığı',
  };
  const reasonChips = (Array.isArray(assessment.reasons) ? assessment.reasons : [])
    .map((reason) => reasonLabels[reason])
    .filter(Boolean)
    .map((label) => `<span class="uncertainty-reason-chip">${esc(label)}</span>`)
    .join('');
  const confidenceClass = assessment.level === 'high' ? 'uncertainty-high'
    : (assessment.level === 'low' ? 'uncertainty-low' : 'uncertainty-moderate');
  const assessmentHtml = `
    <div class="uncertainty-assessment ${confidenceClass}">
      <div class="uncertainty-assessment-head">
        <span class="uncertainty-assessment-title">Karar güveni</span>
        <strong>${esc(assessmentLabel)}</strong>
      </div>
      ${reasonChips ? `<div class="uncertainty-reason-chips">${reasonChips}</div>` : ''}
      ${assessmentDetails.length
        ? `<ul class="uncertainty-detail-list">${assessmentDetails.map((detail) => `<li>${esc(detail)}</li>`).join('')}</ul>`
        : '<p class="uncertainty-detail-empty">Bu değerlendirmeyi düşüren belirgin bir belirsizlik sinyali tespit edilmedi.</p>'}
    </div>`;
  const cards = (diagnoses || []).slice(0, 3).map((dx, index) => {
    const drivers = rankDriverFindings(dx);
    const support = drivers.up.slice(0, 2);
    const against = drivers.down.slice(0, 2);
    const why = Array.isArray(dx.why_considered) ? dx.why_considered.filter(Boolean).slice(0, 2) : [];
    const rationale = support.length ? support : why;
    const supportHtml = rationale.length
      ? `<ul class="decision-rationale-list">${rationale.map((item) => `<li><span class="decision-rationale-icon">✓</span>${esc(item.finding || item)}</li>`).join('')}</ul>`
      : '<p class="decision-rationale-empty">Bu aday için doğrulanabilir destekleyici bulgu üretilmedi.</p>';
    const againstHtml = against.length
      ? `<div class="decision-rationale-against"><strong>Zayıflatan:</strong> ${against.map((item) => esc(item)).join(' · ')}</div>`
      : '';
    const relevance = RELEVANCE_SHORT[dx.relevance] || 'Belirtilmedi';
    return `
      <article class="decision-rationale-card">
        <div class="decision-rationale-card-head">
          <span class="decision-rationale-rank">#${index + 1}</span>
          <strong>${esc(dx.name || 'Adı belirtilmemiş aday')}</strong>
          <span class="relevance-badge relevance-${esc(dx.relevance || 'moderate')}">${esc(relevance)}</span>
        </div>
        <div class="decision-rationale-label">Bu aday neden öne çıktı?</div>
        ${supportHtml}
        ${againstHtml}
      </article>`;
  }).join('');

  return `
    <section class="decision-rationale-hero card" aria-label="Karar gerekçesi">
      <div class="decision-rationale-inner">
        <div class="decision-rationale-eyebrow">Karar gerekçesi</div>
        <h2 class="decision-rationale-title">Tanı sonucu değil, kanıtların nasıl tartıldığı</h2>
        <p class="decision-rationale-intro">
          Bu ekran kesin tanı vermez. Adayların neden öne çıktığını, hangi bulguların onları zayıflattığını ve kararın nerede belirsiz kaldığını gösterir.
        </p>
        ${assessmentHtml}
        ${uncertainty ? `<div class="decision-rationale-uncertainty"><strong>Belirsizlik:</strong> ${esc(uncertainty)}</div>` : ''}
        ${cards
          ? `<div class="decision-rationale-grid">${cards}</div>`
          : '<p class="decision-rationale-empty">Bu analizde karar gerekçesi gösterecek aday bulunamadı.</p>'}
        <p class="decision-rationale-footnote">Gerekçe özeti modelin gizli düşünce zinciri değildir; vaka girdisi, kanıt katmanı ve doğrulanmış yapılandırılmış çıktıya dayanır.</p>
      </div>
    </section>`;
}

function ddxCard(dx) {
  const short = RELEVANCE_SHORT[dx.relevance] || 'Orta';
  const detail = [
    rankDriversBlock(dx),
    listBlock('Neden değerlendiriliyor?', dx.why_considered),
    listBlock('Destekleyen bulgular', dx.supporting_findings),
    contradictionBlock(dx),
    listBlock('Ayırt edici özellikler', dx.distinguishing_features),
    listBlock('Eksik bilgiler', dx.missing_or_uncertain_information),
    listBlock('Ayırıcı tanıda yardımcı olabilecek sorular', dx.questions_to_consider),
    comparisonBlock(dx.comparison_with_other_candidates),
    listBlock('Kullanılan temel bulgular', dx.key_findings_used),
  ].filter(Boolean).join('');
  return `
    <article class="card ddx-card">
      <button type="button" class="ddx-toggle" aria-expanded="false">
        <span class="ddx-name">${esc(dx.name)}</span>
        <span class="relevance-badge relevance-${esc(dx.relevance)}">${esc(short)}</span>
        <span class="ddx-chevron" aria-hidden="true">▾</span>
      </button>
      <div class="ddx-detail">${detail}</div>
    </article>`;
}

function labsSummary(labs) {
  if (!labs || labs.length === 0) return '';
  const rows = labs.map((lab) => {
    const statusMap = { normal: 'Normal', high: 'Yüksek', low: 'Düşük' };
    const parts = [esc(lab.name), esc(lab.value || '')].filter(Boolean).join(': ');
    return `<li>${parts} <span class="lab-status-text lab-status-${esc(lab.status)}">${esc(statusMap[lab.status] || lab.status || '')}</span></li>`;
  }).join('');
  return `<ul>${rows}</ul>`;
}

function kvLine(label, value) {
  return value ? `<div class="kv-line"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>` : '';
}

function enteredCaseBlock(c) {
  const p = c.patient || {};
  const symptoms = (c.symptoms || []).map((s) => s.name).join(', ');
  const timing = Object.entries(c.symptom_timing || {})
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ');
  const mh = Object.entries(c.medical_history || {})
    .map(([k, v]) => `<div class="kv-line"><span class="k">${esc(k.replace(/_/g, ' '))}</span><span class="v">${esc(v)}</span></div>`).join('');
  const geo = Object.entries(c.geographic_and_lifestyle_history || {})
    .map(([k, v]) => `<div class="kv-line"><span class="k">${esc(k.replace(/_/g, ' '))}</span><span class="v">${esc(v)}</span></div>`).join('');

  return `
    <details class="card result-block case-details">
      <summary>Girilen vaka bilgileri</summary>
      <div class="card-pad">
        <div class="kv-line"><span class="k">Yaş / Cinsiyet</span><span class="v">${esc(p.age ?? '-')} / ${esc(sexLabel(p.sex))}</span></div>
        ${kvLine('Semptomlar', symptoms)}
        ${kvLine('Semptom zamanlaması', timing)}
        ${c.laboratory_results && c.laboratory_results.length ? `<div class="kv-line"><span class="k">Laboratuvar</span></div>${labsSummary(c.laboratory_results)}` : ''}
        ${kvLine('Klinik öykü', c.clinical_note)}
        ${mh}
        ${geo}
      </div>
    </details>`;
}

function compareTable(current, previous) {
  const map = new Map(previous.result.differential_diagnoses.map((d) => [d.name.toLowerCase(), d.relevance]));
  const rows = current.result.differential_diagnoses.map((d) => {
    const oldRel = map.get(d.name.toLowerCase());
    const arrow = oldRel ? (oldRel === d.relevance ? '→' : (oldRel === 'high' && d.relevance !== 'high' ? '↘' : '↗')) : '＋';
    return `
      <tr>
        <td>${esc(d.name)}</td>
        <td class="arrow-cell">${oldRel ? esc(RELEVANCE_SHORT[oldRel]) + ' ' + arrow : '—'}</td>
        <td>${esc(RELEVANCE_SHORT[d.relevance])}</td>
      </tr>`;
  }).join('');
  return `
    <div class="card result-block" style="margin-bottom:18px;">
      <div class="card-pad">
        <h2 class="card-title">Önceki analizle karşılaştırma</h2>
        <p style="margin:0 0 12px;font-size:13px;color:var(--text-muted);">
          Önceki analiz (${esc(formatDateTime(previous.analyzedAt))}) ile bu analiz arasındaki olasılık düzeyi değişimi.
          <span class="arrow-cell">＋</span> yeni eklenen olasılık.
        </p>
        <table class="compare-table">
          <thead><tr><th>Olasılık</th><th>Önceki</th><th>Şimdi</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function normalizeDxName(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const ET_TYPE_LABELS = { symptom: 'Semptom', laboratory: 'Laboratuvar', history: 'Öykü', pattern: 'Seyir', other: 'Bulgu' };
const ET_REL_LABELS = { high: 'Yüksek', moderate: 'Orta', low: 'Düşük' };
const ET_TYPE_COLORS = {
  symptom: { bg: '#e6f2f8', fg: '#0a5a7c' },
  laboratory: { bg: '#eceef7', fg: '#3a3f6e' },
  history: { bg: '#fdf3e0', fg: '#a16207' },
  pattern: { bg: '#e8f4ec', fg: '#1e7a46' },
  other: { bg: '#f2f6fa', fg: '#5b6b7a' },
};
const ET_REL_COLORS = {
  high: { bg: '#e8f4ec', fg: '#1e7a46' },
  moderate: { bg: '#fdf3e0', fg: '#a16207' },
  low: { bg: '#f2f6fa', fg: '#5b6b7a' },
};

function wrapText(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function svgTextLines(x, y, lines, cls, lineH = 15, anchor = 'middle') {
  return lines.map((l, i) =>
    `<text x="${x}" y="${(y + i * lineH).toFixed(1)}" text-anchor="${anchor}" class="${cls}">${esc(l)}</text>`
  ).join('');
}

function svgBadge(x, y, text, colors) {
  const w = Math.max(34, text.length * 6.1 + 12);
  return `<rect x="${x}" y="${y}" width="${w}" height="16" rx="4" fill="${colors.bg}" />`
    + `<text x="${x + w / 2}" y="${y + 11.5}" text-anchor="middle" font-size="10" font-weight="600" fill="${colors.fg}">${esc(text)}</text>`;
}

function evidenceTreeView(result, diagnoses) {
  const tree = result.evidence_tree;
  if (!tree || typeof tree !== 'object') return '';
  const findings = Array.isArray(tree.findings) ? tree.findings : [];
  const dxNodes = Array.isArray(tree.diagnosis_nodes) ? tree.diagnosis_nodes : [];
  const links = Array.isArray(tree.links) ? tree.links : [];
  if (!findings.length || !dxNodes.length || !links.length) return '';

  const relMap = new Map(diagnoses.map((d) => [normalizeDxName(d.name), d.relevance]));

  const pad = 24;
  const rootW = 200;
  const fW = 226;
  const dxW = 404;
  const gap1 = 46;
  const gap2 = 60;
  const fX = pad + rootW + gap1;
  const dxX = fX + fW + gap2;
  const W = dxX + dxW + pad;

  const fH = findings.map((f) => {
    const ll = wrapText(f.label, 30).length;
    const dl = f.detail ? wrapText(f.detail, 34).length : 0;
    return 8 + 16 + 5 + ll * 16 + (dl ? 4 + dl * 14 : 0) + 8;
  });
  const fY = [];
  let acc = 0;
  findings.forEach((f, i) => { fY.push(acc); acc += fH[i] + 16; });
  const findingsH = acc - 16;

  const dxConc = dxNodes.map((n) => wrapText(n.conclusion || '', 46));
  const dxH = dxNodes.map((n, i) => {
    const clueCount = Array.isArray(n.confirmatory_clues) ? n.confirmatory_clues.length : 0;
    return 10 + 22 + dxConc[i].length * 15 + 6 + clueCount * 16 + 12;
  });
  const dxY = [];
  acc = 0;
  dxNodes.forEach((n, i) => { dxY.push(acc); acc += dxH[i] + 18; });
  const dxTotal = acc - 18;

  const H = Math.max(rootW > 0 ? 120 : 0, findingsH, dxTotal) + 2 * pad;
  const midY = H / 2;
  const rootY = midY - 30;
  const findingsTop = midY - findingsH / 2;
  const dxTop = midY - dxTotal / 2;

  let paths = '';
  const fCy = findings.map((f, i) => findingsTop + fY[i] + fH[i] / 2);
  findings.forEach((f, i) => {
    const y1 = rootY + 30;
    const y2 = fCy[i];
    paths += `<path d="M ${pad + rootW} ${y1} C ${pad + rootW + gap1 / 2} ${y1}, ${fX - gap1 / 2} ${y2}, ${fX} ${y2}" class="et-link et-link-root" />`;
  });
  links.forEach((l) => {
    const fi = findings.findIndex((f) => f.id === l.from);
    const di = dxNodes.findIndex((n) => n.id === l.to);
    if (fi === -1 || di === -1) return;
    const x1 = fX + fW;
    const y1 = fCy[fi];
    const x2 = dxX;
    const y2 = dxTop + dxY[di] + 22;
    const kind = l.type === 'weakens' ? 'weakens' : 'supports';
    paths += `<path d="M ${x1} ${y1} C ${x1 + gap2 / 2} ${y1}, ${x2 - gap2 / 2} ${y2}, ${x2} ${y2}" class="et-link et-link-${kind}" marker-end="url(#et-arrow-${kind})" />`;
  });

  const rootLines = wrapText(tree.root_label || 'Vaka', 26).slice(0, 2);
  const rootTextY = rootY + (60 - rootLines.length * 15) / 2 + 13;
  let nodes = `<g><rect x="${pad}" y="${rootY}" width="${rootW}" height="60" rx="10" class="et-node-root" />`
    + svgTextLines(pad + rootW / 2, rootTextY, rootLines, 'et-label-root', 15, 'middle')
    + '</g>';

  findings.forEach((f, i) => {
    const x = fX;
    const y = findingsTop + fY[i];
    const h = fH[i];
    const t = ET_TYPE_COLORS[f.type] || ET_TYPE_COLORS.other;
    const labelLines = wrapText(f.label, 30);
    nodes += `<g><rect x="${x}" y="${y}" width="${fW}" height="${h}" rx="8" class="et-node-finding" />`
      + svgBadge(x + 8, y + 7, ET_TYPE_LABELS[f.type] || 'Bulgu', t)
      + svgTextLines(x + 10, y + 8 + 16 + 5 + 13, labelLines, 'et-label-finding', 16, 'start')
      + (f.detail ? svgTextLines(x + 10, y + 8 + 16 + 5 + labelLines.length * 16 + 4 + 11, wrapText(f.detail, 34), 'et-label-detail', 14, 'start') : '')
      + '</g>';
  });

  dxNodes.forEach((n, i) => {
    const x = dxX;
    const y = dxTop + dxY[i];
    const h = dxH[i];
    const rel = relMap.get(normalizeDxName(n.label));
    const relColors = ET_REL_COLORS[rel] || ET_REL_COLORS.moderate;
    const concLines = dxConc[i];
    const clues = Array.isArray(n.confirmatory_clues) ? n.confirmatory_clues : [];
    const labelW = n.label.length * 7.3 + 10;
    nodes += `<g><rect x="${x}" y="${y}" width="${dxW}" height="${h}" rx="8" class="et-node-dx" />`
      + `<text x="${x + 12}" y="${y + 22}" text-anchor="start" class="et-label-dx">${esc(n.label)}</text>`
      + svgBadge(x + 12 + labelW + 6, y + 11, ET_REL_LABELS[rel] || 'Orta', relColors)
      + svgTextLines(x + 12, y + 40, concLines, 'et-label-conclusion', 15, 'start')
      + clues.map((c, ci) =>
          `<text x="${x + 12}" y="${(y + 40 + concLines.length * 15 + 6 + ci * 16).toFixed(1)}" text-anchor="start" class="et-label-clue">+ ${esc(c)}</text>`
        ).join('')
      + '</g>';
  });

  const clueLegend = dxNodes.some((n) => Array.isArray(n.confirmatory_clues) && n.confirmatory_clues.length)
    ? '<li><span class="et-legend-swatch et-legend-clue">+</span> <strong>Doğrulanması gereken ipuçları:</strong> hastada henüz görülmemiş/bilinmeyen; tanıyı güçlendirebilecek ek bulgular.</li>'
    : '';

  return `
    <div class="card result-block">
      <div class="card-pad">
        <h2 class="card-title">Kanıt Ağacı — Bu sonuca nasıl geldik?</h2>
        <p class="plain-text" style="font-size:13px;color:var(--text-muted);margin-bottom:6px;">
          Aşağıdaki ağaç, modelin iç muhakemesini değil; yalnızca vakanızda sunulan kanıtların
          aday tanılarla açıklanabilir ilişkisini gösterir. Sağlık profesyoneli olarak bu ilişkileri
          bağımsız biçimde inceleyebilir ve kendi değerlendirmenizle karşılaştırabilirsiniz.
        </p>
        <div class="evidence-tree-scroll">
          <svg class="evidence-tree-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kanıt ağacı">
            <defs>
              <marker id="et-arrow-supports" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f9e63" />
              </marker>
              <marker id="et-arrow-weakens" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#c25450" />
              </marker>
            </defs>
            ${paths}
            ${nodes}
          </svg>
        </div>
        <ul class="et-legend">
          <li><span class="et-legend-swatch et-legend-supports"></span> Destekleyen kanıt</li>
          <li><span class="et-legend-swatch et-legend-weakens"></span> Zayıflatan kanıt</li>
          ${clueLegend}
        </ul>
      </div>
    </div>`;
}

function doctorVsAIView(result, analysisCase) {
  const doctorList = Array.isArray(analysisCase && analysisCase.doctor_preliminary_assessment)
    ? analysisCase.doctor_preliminary_assessment.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  if (!doctorList.length) return '';

  const aiList = Array.isArray(result.differential_diagnoses)
    ? result.differential_diagnoses.map((d) => String(d.name || '').trim()).filter(Boolean)
    : [];
  const maxRank = Math.max(doctorList.length, aiList.length);

  const normDoctor = new Map();
  doctorList.forEach((name, i) => {
    const k = normalizeDxName(name);
    if (k && !normDoctor.has(k)) normDoctor.set(k, i + 1);
  });
  const normAI = new Map();
  aiList.forEach((name, i) => {
    const k = normalizeDxName(name);
    if (k && !normAI.has(k)) normAI.set(k, i + 1);
  });

  const rows = [];
  let matchCount = 0;
  for (let r = 1; r <= maxRank; r++) {
    const dName = doctorList[r - 1] || '';
    const aName = aiList[r - 1] || '';
    const dk = dName ? normalizeDxName(dName) : '';
    const ak = aName ? normalizeDxName(aName) : '';
    let chip = '';
    if (dk && ak && dk === ak) {
      matchCount++;
      chip = '<span class="duel-chip chip-agree">Uyumlu</span>';
    } else if (dk && normAI.has(dk)) {
      chip = `<span class="duel-chip chip-rank">Sıra farkı: AI #${normAI.get(dk)}</span>`;
    } else if (dk && ak) {
      chip = '<span class="duel-chip chip-only">Farklı</span>';
    } else if (dk) {
      chip = '<span class="duel-chip chip-only">Yalnızca doktor</span>';
    } else if (ak) {
      chip = '<span class="duel-chip chip-only">Yalnızca AI</span>';
    }
    rows.push(`
      <tr>
        <td class="duel-rank-col"><span class="duel-rank">#${r}</span>${dName ? `<span class="duel-name">${esc(dName)}</span>` : '<span class="duel-empty">—</span>'}</td>
        <td class="duel-rank-col"><span class="duel-rank">#${r}</span>${aName ? `<span class="duel-name">${esc(aName)}</span>` : '<span class="duel-empty">—</span>'}</td>
        <td>${chip}</td>
      </tr>`);
  }

  const matchLine = matchCount > 0
    ? `<p class="duel-match-line">✓ ${matchCount}/${doctorList.length} tanıda aynı sırada birebir uyum var.</p>`
    : '<p class="duel-match-line">Bu vakada doktor ile AI sıralaması arasında birebir uyum yok.</p>';

  const dda = result.doctor_divergence_analysis || {};
  const agreements = Array.isArray(dda.agreements) ? dda.agreements : [];
  const disagreements = Array.isArray(dda.disagreements) ? dda.disagreements : [];
  const summary = String(dda.summary || '').trim();
  const agreeLis = agreements.length
    ? agreements.map((a) => `<li>${esc(a)}</li>`).join('')
    : '';
  const disCards = disagreements.length
    ? disagreements.map((g) => `
        <div class="duel-disagreement">
          <div class="duel-dis-head"><strong>${esc(g.diagnosis || '—')}</strong></div>
          <div class="duel-dis-ranks">
            ${g.doctor_rank ? `<span class="duel-rank">Doktor: #${g.doctor_rank}</span>` : ''}
            ${g.ai_rank ? `<span class="duel-rank">AI: #${g.ai_rank}</span>` : ''}
          </div>
          ${g.reason ? `<p class="duel-dis-reason">${esc(g.reason)}</p>` : ''}
        </div>`).join('')
    : '';

  const divergenceHtml = (agreeLis || disCards || summary) ? `
    <div class="duel-divergence">
      ${agreeLis ? `
        <div class="duel-h3">🤝 Üzerinde uzlaşılan değerlendirmeler</div>
        <ul class="duel-agree-list">${agreeLis}</ul>` : ''}
      ${disCards ? `
        <div class="duel-h3">⚖️ Neden farklı düşünüyorum?</div>
        ${disCards}` : ''}
      ${summary ? `<p class="duel-summary"><strong>Özet:</strong> ${esc(summary)}</p>` : ''}
    </div>` : '';

  return `
    <div class="card result-block">
      <div class="card-pad">
        <h2 class="card-title">Doktor vs AI — Öncelik Karşılaştırması</h2>
        <p class="plain-text" style="font-size:13px;color:var(--text-muted);">
          Doktorun analizden önce girdiği ön değerlendirme (${doctorList.length} tanı) ile AI'ın
          bağımsız sıralaması yan yana. AI, doktor listesini görmeden çalışır; sıra farklarını
          kendi gerekçeleriyle açıklar.
        </p>
        <table class="duel-table">
          <thead><tr><th>DOKTOR</th><th>AI</th><th>Karşılaştırma</th></tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
        ${matchLine}
        ${divergenceHtml}
      </div>
    </div>`;
}

const SO_STATUS_META = {
  supported: { label: 'Destekleniyor', cls: 'so-status-supported' },
  challenged: { label: 'Sorgulanıyor', cls: 'so-status-challenged' },
  reconsider: { label: 'Yeniden Değerlendirin', cls: 'so-status-reconsider' },
};

function secondOpinionView(result, analysisCase) {
  const doctorList = Array.isArray(analysisCase && analysisCase.doctor_preliminary_assessment)
    ? analysisCase.doctor_preliminary_assessment.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  const so = result.second_opinion || {};
  const reviews = Array.isArray(so.hypothesis_review) ? so.hypothesis_review : [];
  const alts = Array.isArray(so.unconsidered_alternatives) ? so.unconsidered_alternatives : [];
  const summary = String(so.summary || '').trim();
  const keyQuestion = String(so.key_question || '').trim();
  const hasSo = Boolean(summary || reviews.length || alts.length || keyQuestion);

  if (!hasSo) {
    const intro = doctorList.length
      ? 'Bu analiz, ikinci görüş motoru etkinleştirilmeden önce üretilmiş olabilir. Vakayı yeniden analiz ederek doktor hipotezlerinizin kanıtlarla test edilmesini sağlayabilirsiniz.'
      : 'Bu vaka için doktor ön değerlendirmesi girilmedi. Ön değerlendirmenizi (sıralı tanı listenizi) ekleyerek bu motorun hipotezlerinizi kanıtlarla test etmesini ve düşünmediğiniz ihtimalleri bulmasını sağlayabilirsiniz.';
    return `
    <div class="card result-block so-card">
      <div class="card-pad">
        <div class="so-eyebrow">İkinci Görüş Motoru</div>
        <h2 class="card-title">Doktorunuzun düşüncesi kanıtlarla test edilir</h2>
        <p class="plain-text" style="color:var(--text-muted);">${esc(intro)}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a class="btn btn-primary" href="#/new-case">Yeni Vaka Oluştur</a>
          <a class="btn btn-secondary" href="#/history">Geçmiş Vakalar</a>
        </div>
      </div>
    </div>`;
  }

  const reviewCards = reviews.map((h) => {
    const meta = SO_STATUS_META[h.status] || SO_STATUS_META.challenged;
    const supports = (h.supporting_findings || []).map((f) => `<li class="so-pos">${esc(f)}</li>`).join('');
    const challenges = (h.challenging_findings || []).map((f) => `<li class="so-neg">${esc(f)}</li>`).join('');
    const findings = (supports || challenges)
      ? `<ul class="so-findings">${supports}${challenges}</ul>`
      : '<p class="so-muted">Bu hipotez için ek bulgu listelenmedi.</p>';
    return `
      <div class="so-review-card">
        <div class="so-review-head">
          <strong>${esc(h.diagnosis)}</strong>
          <span class="so-badge ${meta.cls}">${meta.label}</span>
        </div>
        ${findings}
        ${h.recommendation ? `<p class="so-recommendation"><strong>Öneri:</strong> ${esc(h.recommendation)}</p>` : ''}
      </div>`;
  }).join('');

  const altCards = alts.map((a) => `
    <div class="so-alt-card">
      <strong>${esc(a.diagnosis)}</strong>
      ${a.why_should_be_considered ? `<p>${esc(a.why_should_be_considered)}</p>` : ''}
      ${a.key_evidence_to_gather ? `<p class="so-alt-evidence"><strong>Toplanacak kanıt:</strong> ${esc(a.key_evidence_to_gather)}</p>` : ''}
    </div>`).join('');

  return `
    <div class="card result-block so-card">
      <div class="card-pad">
        <div class="so-eyebrow">İkinci Görüş Motoru</div>
        <h2 class="card-title">Doktorunuzun düşüncesi kanıtlarla test edildi</h2>
        ${summary ? `<p class="so-summary">${esc(summary)}</p>` : ''}
        ${reviews.length ? `
          <div class="so-section-title">Hipotez incelemesi</div>
          <div class="so-review-grid">${reviewCards}</div>` : ''}
        ${alts.length ? `
          <div class="so-section-title">Düşünülmemiş olabilecek ihtimaller</div>
          <div class="so-alt-grid">${altCards}</div>` : ''}
        ${keyQuestion ? `<div class="so-key-question"><strong>Bir sonraki en değerli soru:</strong> ${esc(keyQuestion)}</div>` : ''}
      </div>
    </div>`;
}

function missingView(result) {
  const items = result.important_missing_information || [];
  const lis = items.length
    ? items.map((i) => `<li>${esc(i)}</li>`).join('')
    : '<li>Model bu analizde ek bilgi gereksinimi belirtmedi.</li>';
  return `
    <div class="card result-block">
      <div class="card-pad">
        <h2 class="card-title">Eksik bilgiler</h2>
        <ul class="plain-list">${lis}</ul>
        ${result.uncertainty ? `<p class="plain-text" style="margin-top:14px;color:var(--text-muted);font-size:13.5px;"><strong>Belirsizlik:</strong> ${esc(result.uncertainty)}</p>` : ''}
      </div>
    </div>`;
}

function missingImpactView(result) {
  const items = result.missing_information_impact || [];
  const priority = result.missing_information_priority || '';
  if (!items.length && !priority) return '';
  const rows = items.map((m) => {
    const info = esc(m.missing_information || '');
    const affects = (m.affected_diagnoses || []).map((a) => `<span class="chip-dx">${esc(a)}</span>`).join(' ') || '—';
    const dir = esc(m.impact_direction || '—');
    return `
      <tr>
        <td><strong>${info}</strong></td>
        <td>${affects}</td>
        <td>${dir}</td>
      </tr>`;
  }).join('');
  return `
    <div class="card result-block">
      <div class="card-pad">
        <h2 class="card-title">Kritik eksik bilgiler — bir sonraki en değerli sorular</h2>
        ${priority ? `<p class="plain-text">${esc(priority)}</p>` : ''}
        ${rows ? `
          <table class="impact-table">
            <thead><tr><th>Eksik bilgi</th><th>Etkilediği olasılıklar</th><th>Etki yönü</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>` : ''}
      </div>
    </div>`;
}

function attentionView(result) {
  const items = result.clinical_attention_points || [];
  const lis = items.length
    ? items.map((i) => `<li>${esc(i)}</li>`).join('')
    : '<li>Model özel bir dikkat noktası belirtmedi.</li>';
  return `
    <div class="card result-block">
      <div class="card-pad">
        <h2 class="card-title">Dikkat noktaları</h2>
        <ul class="plain-list">${lis}</ul>
      </div>
    </div>`;
}

const SOURCE_TYPE_LABELS = {
  guideline: 'Kılavuz',
  criteria: 'Sınıflama kriterleri',
  review: 'Derleme',
  study: 'Çalışma',
  textbook: 'Kitap',
};

function sourceItemHtml(s, index) {
  if (typeof s === 'string') {
    return `<li class="source-item"><span class="source-text">${esc(s)}</span></li>`;
  }
  const typeLabel = SOURCE_TYPE_LABELS[s.type] || s.type || '';
  const meta = [s.publisher, s.year].filter(Boolean).map((m) => esc(String(m))).join(' · ');
  const url = s.url
    ? `<a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Kaynağa git ↗</a>`
    : '';
  return `
    <li class="source-item">
      <div class="source-head">
        <span class="source-ref">S${index + 1}</span>
        <span class="source-title">${esc(s.title || '')}</span>
        ${typeLabel ? `<span class="source-type">${esc(typeLabel)}</span>` : ''}
      </div>
      ${meta ? `<div class="source-meta">${meta}</div>` : ''}
      ${s.note ? `<div class="source-note">${esc(s.note)}</div>` : ''}
      ${url}
    </li>`;
}

function sourcesView(result) {
  const hasSources = Array.isArray(result.sources) && result.sources.length > 0;
  return `
    <div class="card result-block">
      <div class="card-pad">
        <h2 class="card-title">Kaynaklar</h2>
        ${hasSources
          ? `<p class="source-intro">Aday hastalıklar ve kanıt çıkarımı için sunucu tarafında taranan kılavuz ve sınıflama kriterleri. Tanı kartlarındaki <span class="source-ref">S1</span> gibi atıflar bu listeye işaret eder.</p>
             <ul class="source-list">${result.sources.map(sourceItemHtml).join('')}</ul>`
          : `<p class="plain-text" style="color:var(--text-muted);font-size:13.5px;">
               Bu sürümde otomatik kaynak gösterimi yoktur; model kaynak uydurmaz.
               Kaynaklı yanıtlar (RAG tabanlı tıbbi literatür taraması) ilerleyen fazda eklenecektir.
             </p>`}
      </div>
    </div>`;
}

function evidencePerDxView(result) {
  const dxs = Array.isArray(result.differential_diagnoses) ? result.differential_diagnoses : [];
  const blocks = dxs.map((dx) => {
    const panel = reasoningPanel(dx);
    const notes = evidenceNotesBlock(dx.evidence_notes);
    if (!panel && !notes) return '';
    return `
      <div class="card result-block ev-dx-card">
        <div class="card-pad">
          <h3 class="ev-dx-name">${esc(dx.name)}<span class="relevance-badge relevance-${esc(dx.relevance)}">${esc(RELEVANCE_SHORT[dx.relevance] || '')}</span></h3>
          ${panel}
          ${notes}
        </div>
      </div>`;
  }).filter(Boolean).join('');
  if (!blocks) return '';
  return `
    <div class="ev-intro">
      <h2 class="card-title">Tanı bazlı kanıt analizi</h2>
      <p class="plain-text" style="color:var(--text-muted);font-size:13.5px;">Her aday tanı için destekleyen, aleyhine ve ayırt edici bulgular ile kaynak atıfları.</p>
    </div>
    ${blocks}`;
}

function nextBestInfoView(result) {
  const nbi = result.next_best_information;
  const top = nbi && nbi.top;
  if (!top || !top.information) return '';

  const dxChips = (list) => (list || [])
    .filter(Boolean)
    .map((d) => `<span class="nbi-dx-chip">${esc(d)}</span>`)
    .join('');

  const alternatives = (nbi.alternatives || [])
    .filter((a) => a.information)
    .map((a, i) => `
      <div class="nbi-alt">
        <span class="nbi-alt-rank">${i + 2}</span>
        <div class="nbi-alt-body">
          <div class="nbi-alt-info">${esc(a.information)}</div>
          ${a.question ? `<div class="nbi-alt-q">${esc(a.question)}</div>` : ''}
          ${a.expected_outcome ? `<div class="nbi-alt-outcome">${esc(a.expected_outcome)}</div>` : ''}
          ${(a.affected_diagnoses || []).length ? `<div class="nbi-dx-row">${dxChips(a.affected_diagnoses)}</div>` : ''}
        </div>
      </div>`)
    .join('');

  return `
    <section class="nbi-hero card" aria-label="Bir sonraki en değerli bilgi">
      <div class="nbi-hero-inner">
        <div class="nbi-eyebrow">Karar için bir sonraki en değerli bilgi</div>
        ${nbi.current_uncertainty ? `<p class="nbi-uncertainty">${esc(nbi.current_uncertainty)}</p>` : ''}
        <div class="nbi-top">
          <div class="nbi-info-name">${esc(top.information)}</div>
          ${top.question ? `<div class="nbi-question">${esc(top.question)}</div>` : ''}
          ${top.why_most_valuable ? `<p class="nbi-why">${esc(top.why_most_valuable)}</p>` : ''}
          ${(top.affected_diagnoses || []).length ? `<div class="nbi-dx-row"><span class="nbi-dx-label">Ayrımı etkilenen adaylar:</span>${dxChips(top.affected_diagnoses)}</div>` : ''}
          ${top.expected_outcome ? `<div class="nbi-outcome"><span class="nbi-kv-k">Beklenen etki</span><span class="nbi-kv-v">${esc(top.expected_outcome)}</span></div>` : ''}
          ${top.how_to_obtain ? `<div class="nbi-outcome"><span class="nbi-kv-k">Nasıl toplanır</span><span class="nbi-kv-v">${esc(top.how_to_obtain)}</span></div>` : ''}
        </div>
        ${alternatives ? `<div class="nbi-alternatives"><div class="nbi-alt-title">Sonraki adaylar</div>${alternatives}</div>` : ''}
        <p class="nbi-note">Bu seçim, aday tanılar arasındaki belirsizliği en fazla azaltması beklenen bilgiye göre yapılmıştır; test veya soru önerisi kesin tanı beyanı değildir.</p>
      </div>
    </section>`;
}

function clinicalSafetyView(result) {
  const safety = result.clinical_safety || {};
  if (!safety.status) return '';
  const urgent = safety.status === 'urgent_review';
  const review = safety.status === 'review_required';
  const flags = Array.isArray(safety.red_flags) ? safety.red_flags : [];
  const actions = Array.isArray(safety.actions) ? safety.actions : [];
  return `
    <section class="clinical-safety-card ${urgent ? 'clinical-safety-urgent' : ''} ${review ? 'clinical-safety-review' : ''}" aria-label="Klinik güvenlik">
      <div class="clinical-safety-head">
        <span class="clinical-safety-icon">${urgent ? '!' : 'i'}</span>
        <div>
          <div class="clinical-safety-eyebrow">Klinik güvenlik katmanı</div>
          <strong>${esc(safety.label || 'Güvenlik durumu')}</strong>
        </div>
      </div>
      ${flags.length ? `<ul class="clinical-safety-list">${flags.map((flag) => `<li>${esc(flag.label)}</li>`).join('')}</ul>` : ''}
      ${actions.length ? `<ul class="clinical-safety-actions">${actions.map((action) => `<li>${esc(action)}</li>`).join('')}</ul>` : ''}
      <p class="clinical-safety-note">Bu uyarı tanı koymaz ve klinik değerlendirme yerine geçmez. Acil belirtiler varsa analiz sonucu beklenmemelidir.</p>
    </section>`;
}

function preflightView(result) {
  const assessment = result.uncertainty_assessment || {};
  const safety = result.clinical_safety || {};
  const auditCount = Array.isArray(result.audit_flags) ? result.audit_flags.length : 0;
  const checks = [
    {
      label: 'Bu çıktı kesin tanı olarak değil, karar desteği olarak kullanılmalı.',
      required: true,
    },
    {
      label: assessment.level === 'low'
        ? 'Karar güveni düşük: eksik veya çelişkili bilgiler tamamlanmadan sonuç benimsenmemeli.'
        : 'Karar güveni, mevcut verinin kapsamı ile sınırlıdır.',
      required: assessment.level === 'low',
    },
    {
      label: safety.status === 'urgent_review'
        ? 'Acil güvenlik uyarısı var: analiz sonucu beklenmemeli.'
        : 'Kırmızı bayrak taraması klinik muayenenin yerine geçmez.',
      required: safety.status === 'urgent_review',
    },
    {
      label: auditCount > 0
        ? `${auditCount} gerekçe denetim uyarısı var; desteklenmeyen iddialar ayrıca kontrol edilmeli.`
        : 'Model gerekçeleri vaka girdileri ve kanıt katmanı ile karşılaştırıldı.',
      required: auditCount > 0,
    },
  ];
  return `
    <section class="preflight-card card" aria-label="Sonucu kullanmadan önce">
      <div class="preflight-head">
        <div>
          <div class="preflight-eyebrow">Güvenli kullanım kontrolü</div>
          <h2 class="preflight-title">Sonucu kullanmadan önce</h2>
        </div>
        <span class="preflight-badge">${checks.filter((check) => check.required).length} dikkat noktası</span>
      </div>
      <ul class="preflight-list">
        ${checks.map((check) => `
          <li class="${check.required ? 'preflight-required' : ''}">
            <span aria-hidden="true">${check.required ? '!' : '✓'}</span>
            <span>${esc(check.label)}</span>
          </li>`).join('')}
      </ul>
    </section>`;
}

function auditFindingsView(result) {
  const flags = Array.isArray(result.audit_flags) ? result.audit_flags : [];
  if (!flags.length) return '';
  const labels = {
    unsupported_finding: 'Desteklenmeyen bulgu',
    unsupported_reasoning_finding: 'Desteklenmeyen gerekçe',
    evidence_contradiction: 'Kanıtla çelişen gerekçe',
    unperformed_test_reference: 'Yapılmamış test referansı',
    contradiction_mismatch: 'Çelişki değerlendirmesi uyuşmazlığı',
  };
  const items = flags.slice(0, 8).map((flag) => `
    <li>
      <div class="audit-flag-head">
        <strong>${esc(labels[flag.type] || 'Denetim uyarısı')}</strong>
        ${flag.diagnosis ? `<span>${esc(flag.diagnosis)}</span>` : ''}
      </div>
      ${flag.claim ? `<div class="audit-flag-claim">“${esc(flag.claim)}”</div>` : ''}
      <div class="audit-flag-detail">${esc(flag.detail || 'Bu ifade vaka verisi ve kanıt katmanıyla ayrıca kontrol edilmelidir.')}</div>
    </li>`).join('');
  return `
    <section class="audit-findings-card" aria-label="Model gerekçe denetimi">
      <div class="audit-findings-eyebrow">Model gerekçe denetimi</div>
      <h2 class="audit-findings-title">Kontrol edilmesi gereken iddialar</h2>
      <p class="audit-findings-intro">Aşağıdaki ifadeler model çıktısında bulundu; ancak hastanın girilmiş verileri veya kanıt katmanıyla tam doğrulanamadı. Bunlar hasta bulgusu olarak kabul edilmemelidir.</p>
      <ul class="audit-findings-list">${items}</ul>
      ${flags.length > 8 ? `<p class="audit-findings-more">${flags.length - 8} ek uyarı daha var.</p>` : ''}
    </section>`;
}

function scopeBoundaryView(result) {
  const assessment = result.uncertainty_assessment || {};
  const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
  const limited = reasons.includes('insufficient_coverage');
  if (!limited) return '';
  return `
    <section class="scope-boundary-card" aria-label="Sistem kapsam sınırı">
      <strong>Bu vaka mevcut bilgi tabanı kapsamında sınırlı değerlendirildi.</strong>
      <p>Yeterli kanıt eşleşmesi bulunmadığı için aday listesi genel tıbbi kapsama işareti değildir. Yeni bilgi ekleyin veya sonucu uygun klinik kapsam içinde değerlendirin.</p>
    </section>`;
}

function learningModeView(result) {
  const nbi = result.next_best_information || {};
  const top = nbi.top || {};
  if (!top.information) return '';
  const dxs = Array.isArray(result.differential_diagnoses) ? result.differential_diagnoses : [];
  const alternatives = Array.isArray(nbi.alternatives) ? nbi.alternatives : [];
  const options = [
    top.information,
    ...alternatives.map((item) => item.information),
    ...dxs.slice(0, 2).map((dx) => `${dx.name} tanısını doğrudan kabul etmek`),
  ].filter(Boolean).slice(0, 4);
  return `
    <section class="learning-card card" aria-label="Öğrenme modu">
      <div class="learning-head">
        <div>
          <div class="learning-eyebrow">Öğrenme modu</div>
          <h2 class="learning-title">Bu vakada belirsizliği en çok ne azaltır?</h2>
        </div>
        <span class="learning-badge">Kısa vaka egzersizi</span>
      </div>
      <p class="learning-question">Aşağıdakilerden hangisi mevcut aday tanıları ayırmak için en değerli sonraki bilgidir?</p>
      <div class="learning-options">
        ${options.map((option, index) => `<button type="button" class="learning-option" data-learning-option="${index}">${esc(option)}</button>`).join('')}
      </div>
      <div class="learning-feedback" id="learning-feedback" hidden>
        <strong>Doğru yaklaşım: ${esc(top.information)}</strong>
        <p>${esc(top.why_most_valuable || top.expected_outcome || 'Bu bilgi aday tanılar arasındaki belirsizliği azaltmaya yardımcı olur.')}</p>
      </div>
    </section>`;
}

function shareSummaryText(analysis, result, diagnoses) {
  const top = (result.next_best_information && result.next_best_information.top) || {};
  const confidence = (result.uncertainty_assessment && result.uncertainty_assessment.label) || 'Belirtilmedi';
  return [
    'Clinical Intelligence — Karar Destek Özeti',
    `Model: ${analysis.model || 'bilinmiyor'}`,
    `Karar güveni: ${confidence}`,
    `Vaka özeti: ${result.case_summary || '—'}`,
    'Aday tanılar:',
    ...diagnoses.slice(0, 3).map((dx, index) => `${index + 1}. ${dx.name} (${RELEVANCE_SHORT[dx.relevance] || dx.relevance || 'belirsiz'})`),
    top.information ? `Sonraki en değerli bilgi: ${top.information} — ${top.question || ''}` : '',
    '',
    'Bu özet tanı değildir; klinik kararın yerine geçmez.',
  ].filter(Boolean).join('\n');
}

function feedbackView(analysis) {
  const existing = new Map(getAnalysisFeedback(analysis.id).map((item) => [item.category, item.value]));
  const options = [
    ['reasoning', 'Gerekçeler', 'Gerekçeler vaka verileriyle uyumlu muydu?'],
    ['missing_information', 'Eksik bilgi önerisi', 'Sonraki en değerli bilgi önerisi işe yarar mıydı?'],
    ['safety', 'Güvenlik uyarısı', 'Güvenlik ve belirsizlik uyarıları anlaşılır mıydı?'],
  ];
  return `
    <section class="feedback-card card" aria-label="Analiz geri bildirimi">
      <div class="feedback-eyebrow">Değerlendirme kaydı</div>
      <h2 class="feedback-title">Bu analizde ne işe yaradı, ne sorunluydu?</h2>
      <p class="feedback-intro">Bu geri bildirim modeli otomatik eğitmez. Yalnızca bu analizle ilişkilendirilmiş yerel kalite kaydı oluşturur.</p>
      <div class="feedback-grid">
        ${options.map(([category, title, question]) => `
          <div class="feedback-item">
            <strong>${esc(title)}</strong>
            <span>${esc(question)}</span>
            <div class="feedback-actions">
              <button type="button" class="feedback-btn ${existing.get(category) === 'helpful' ? 'selected' : ''}" data-feedback-category="${category}" data-feedback-value="helpful">Yararlı</button>
              <button type="button" class="feedback-btn ${existing.get(category) === 'problematic' ? 'selected' : ''}" data-feedback-category="${category}" data-feedback-value="problematic">Sorunlu</button>
            </div>
          </div>`).join('')}
      </div>
      <textarea id="feedback-note" class="feedback-note" maxlength="500" placeholder="İsterseniz kısa bir not ekleyin (hasta kimliği yazmayın)."></textarea>
      <p id="feedback-status" class="feedback-status" aria-live="polite"></p>
    </section>`;
}

function notFound(appEl) {
  appEl.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Analiz bulunamadı</h1>
      <p class="page-subtitle">Bu analiz yerel geçmişinizde yok. Tarayıcı verileri temizlenmiş olabilir.</p>
    </div>
    <div class="card"><div class="card-pad" style="display:flex;gap:10px;flex-wrap:wrap;">
      <a class="btn btn-primary" href="#/new-case">Yeni Vaka Oluştur</a>
      <a class="btn btn-secondary" href="#/history">Geçmiş Vakalar</a>
    </div></div>`;
}

export function renderResults(appEl, options = {}) {
  const { id, prevId } = options;
  const analysis = getAnalysis(id);
  if (!analysis) {
    notFound(appEl);
    return;
  }

  const previous = prevId ? getAnalysis(prevId) : null;
  const result = analysis.result || {};
  const diagnoses = Array.isArray(result.differential_diagnoses) ? result.differential_diagnoses : [];
  const p = (analysis.case && analysis.case.patient) || {};
  const symptomCount = (analysis.case && analysis.case.symptoms && analysis.case.symptoms.length) || 0;

  const versions = analysis.caseId ? getCaseVersions(analysis.caseId) : [];
  const prevVersion = (analysis.caseId && analysis.version > 1)
    ? versions.find((v) => v.version === analysis.version - 1 && v.id !== analysis.id) || null
    : null;
  const isCase = Boolean(analysis.caseId);
  const nextVersion = versions.length + 1;

  const overviewPanel = `
    <div class="tab-panel active" id="tab-overview" role="tabpanel" aria-label="Genel Bakış">
      ${prevVersion ? versionDiffBlock(analysis, prevVersion) : ''}
      ${(previous && (!prevVersion || previous.id !== prevVersion.id)) ? compareTable(analysis, previous) : ''}
      <div class="card result-block">
        <div class="card-pad">
          <h2 class="card-title">Vaka Özeti</h2>
          <p class="plain-text">${esc(result.case_summary || '—')}</p>
        </div>
      </div>
      <div class="card result-block">
        <div class="card-pad">
          <h2 class="card-title">Klinik Örüntü</h2>
          <p class="plain-text">${esc(result.clinical_pattern || '—')}</p>
        </div>
      </div>
      ${attentionView(result)}
      ${enteredCaseBlock(analysis.case)}
    </div>`;

  const ddxPanel = `
    <div class="tab-panel" id="tab-ddx" role="tabpanel" aria-label="Olasılıklar">
      ${diagnoses.length
        ? `<div class="ddx-grid">${diagnoses.map(ddxCard).join('')}</div>`
        : '<div class="card result-block"><div class="card-pad"><p class="plain-text" style="color:var(--text-muted);">Bu analizde değerlendirilebilecek olasılık listelenmedi.</p></div></div>'}
    </div>`;

  const treePanel = `
    <div class="tab-panel" id="tab-tree" role="tabpanel" aria-label="Vaka Ağacı">
      ${evidenceTreeView(result, diagnoses)
        || '<div class="card result-block"><div class="card-pad"><p class="plain-text" style="color:var(--text-muted);">Bu analiz için kanıt ağacı üretilmemiş.</p></div></div>'}
    </div>`;

  const duelPanel = `
    <div class="tab-panel" id="tab-duel" role="tabpanel" aria-label="Doktor vs AI">
      ${doctorVsAIView(result, analysis.case)}
      ${secondOpinionView(result, analysis.case)}
    </div>`;

  const missingPanel = `
    <div class="tab-panel" id="tab-missing" role="tabpanel" aria-label="Eksik Bilgiler">
      ${missingView(result)}
      ${missingImpactView(result)}
    </div>`;

  const evidencePanel = `
    <div class="tab-panel" id="tab-evidence" role="tabpanel" aria-label="Kanıtlar ve Kaynaklar">
      ${evidencePerDxView(result)}
      ${sourcesView(result)}
    </div>`;

  appEl.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;">
      <div>
        <h1 class="page-title">${isCase ? `${caseIdLabel(analysis.caseNumber)} — v${esc(analysis.version)}` : 'Analiz Sonucu'}</h1>
        <p class="page-subtitle">Bu sonuç yalnızca sentetik/anonim vaka girdisiyle üretilmiştir; gerçek hasta verisi kabul edilmez. Doktorunuzun hipotezini kanıtlarla test eder; nihai klinik karar sağlık profesyoneline aittir.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary" id="copy-summary-btn">ÖZETİ KOPYALA</button>
        <button type="button" class="btn btn-primary" id="reanalyze-btn">${isCase ? `YENİ BİLGİ EKLE (v${nextVersion})` : 'VAKAYI YENİDEN ANALİZ ET'}</button>
        <a class="btn btn-secondary" href="#/history">Geçmiş Vakalar</a>
      </div>
    </div>

    <div class="result-meta">
      ${isCase ? `<span class="meta-chip meta-case">${caseIdLabel(analysis.caseNumber)}</span>` : ''}
      ${isCase ? `<span class="meta-chip meta-version">v${esc(analysis.version)}</span>` : ''}
      <span class="meta-chip">Model: ${esc(analysis.model || 'unknown')}</span>
      <span class="meta-chip">Tarih: ${esc(formatDateTime(analysis.analyzedAt))}</span>
      <span class="meta-chip">Hasta: ${esc(p.age ?? '-')} yaş · ${esc(sexLabel(p.sex))}</span>
      <span class="meta-chip">${symptomCount} semptom</span>
      <span class="meta-chip">${diagnoses.length} olasılık değerlendirildi</span>
    </div>

    ${versionTimelineBlock(analysis, versions)}

    ${decisionRationaleView(result, diagnoses)}

    ${clinicalSafetyView(result)}

    ${preflightView(result)}

    ${auditFindingsView(result)}

    ${scopeBoundaryView(result)}

    ${nextBestInfoView(result)}

    <nav class="results-tabs" role="tablist" aria-label="Sonuç bölümleri">
      <button type="button" class="results-tab active" data-tab="overview" role="tab" aria-selected="true" aria-controls="tab-overview">Genel Bakış</button>
      <button type="button" class="results-tab" data-tab="ddx" role="tab" aria-selected="false" aria-controls="tab-ddx">Olasılıklar</button>
      <button type="button" class="results-tab" data-tab="tree" role="tab" aria-selected="false" aria-controls="tab-tree">Vaka Ağacı</button>
      <button type="button" class="results-tab" data-tab="duel" role="tab" aria-selected="false" aria-controls="tab-duel">Doktor vs AI</button>
      <button type="button" class="results-tab" data-tab="missing" role="tab" aria-selected="false" aria-controls="tab-missing">Eksik Bilgiler</button>
      <button type="button" class="results-tab" data-tab="whatif" role="tab" aria-selected="false" aria-controls="tab-whatif">“Ya … Olsaydı?”</button>
      <button type="button" class="results-tab" data-tab="evidence" role="tab" aria-selected="false" aria-controls="tab-evidence">Kanıtlar &amp; Kaynaklar</button>
    </nav>

    ${overviewPanel}
    ${ddxPanel}
    ${treePanel}
    ${duelPanel}
    ${missingPanel}
    ${whatIfPanelHtml(analysis)}
    ${evidencePanel}
    ${learningModeView(result)}

    ${feedbackView(analysis)}

    <div class="card" style="margin-top:20px;">
      <div class="card-pad">
        <p class="plain-text" style="font-size:12.5px;color:var(--text-muted);margin:0 0 14px;">
          ${esc(result.disclaimer || 'Bu prototip klinik karar desteği amacıyla tasarlanmıştır; kesin tanı koymaz.')}
        </p>
        <button type="button" class="btn btn-primary" id="reanalyze-bottom-btn">${isCase ? `YENİ BİLGİ EKLE (v${nextVersion})` : 'VAKAYI YENİDEN ANALİZ ET'}</button>
      </div>
    </div>`;

  const tabs = appEl.querySelectorAll('.results-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', String(on));
      });
      appEl.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `tab-${tab.dataset.tab}`);
      });
    });
  });

  appEl.querySelectorAll('.ddx-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.ddx-card');
      const open = card.classList.toggle('ddx-open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  const startReanalyze = () => {
    try {
      sessionStorage.setItem('ci.formData', JSON.stringify(analysis.payload || {}));
      sessionStorage.setItem('ci.reanalyzeFrom', analysis.id);
    } catch {
    }
    window.location.hash = '#/new-case';
  };

  const topBtn = appEl.querySelector('#reanalyze-btn');
  const bottomBtn = appEl.querySelector('#reanalyze-bottom-btn');
  const copyBtn = appEl.querySelector('#copy-summary-btn');
  if (topBtn) topBtn.addEventListener('click', startReanalyze);
  if (bottomBtn) bottomBtn.addEventListener('click', startReanalyze);
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const text = shareSummaryText(analysis, result, diagnoses);
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'ÖZET KOPYALANDI';
      } catch {
        copyBtn.textContent = 'KOPYALAMA BAŞARISIZ';
      }
      window.setTimeout(() => { copyBtn.textContent = 'ÖZETİ KOPYALA'; }, 2200);
    });
  }

  appEl.querySelectorAll('[data-feedback-category]').forEach((button) => {
    button.addEventListener('click', () => {
      saveAnalysisFeedback({
        analysisId: analysis.id,
        category: button.dataset.feedbackCategory,
        value: button.dataset.feedbackValue,
        note: appEl.querySelector('#feedback-note')?.value || '',
      });
      const category = button.dataset.feedbackCategory;
      appEl.querySelectorAll(`[data-feedback-category="${category}"]`).forEach((item) => {
        item.classList.toggle('selected', item === button);
      });
      const feedbackStatus = appEl.querySelector('#feedback-status');
      if (feedbackStatus) feedbackStatus.textContent = 'Geri bildiriminiz bu analiz için kaydedildi.';
    });
  });

  appEl.querySelectorAll('[data-learning-option]').forEach((button) => {
    button.addEventListener('click', () => {
      const feedback = appEl.querySelector('#learning-feedback');
      const top = result.next_best_information && result.next_best_information.top;
      const selected = Number(button.dataset.learningOption) === 0;
      appEl.querySelectorAll('[data-learning-option]').forEach((option) => {
        option.disabled = true;
        option.classList.toggle('learning-correct', option === button && selected);
        option.classList.toggle('learning-wrong', option === button && !selected);
      });

      if (feedback) {
        feedback.hidden = false;
        if (!selected && top) feedback.innerHTML = `<strong>En değerli bilgi: ${esc(top.information)}</strong><p>${esc(top.why_most_valuable || top.expected_outcome || '')}</p>`;
      }
    });
  });

  setupWhatIf(appEl, analysis);
}
