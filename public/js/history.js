// "Geçmiş Vakalar" görünümü: vaka geçmişi (Case #001, v1..vN), bağımsız
// eski analizler ve kaydedilmiş taslaklar.
// Tüm veriler yalnızca tarayıcı yerel deposundan okunur; sunucuya hiçbir şey gönderilmez.
import {
  getAnalyses, deleteAnalysis,
  getDrafts, deleteDraft,
  getCases, getCaseVersions, deleteCase,
} from './store.js';
import { esc, formatDateTime, sexLabel } from './utils.js';

/** Case #1 -> "Case #001" */
function caseIdLabel(caseNumber) {
  return `Case #${String(caseNumber || 0).padStart(3, '0')}`;
}

function relevanceChip(dx) {
  const map = { high: 'Yüksek', moderate: 'Orta', low: 'Düşük' };
  const rel = dx?.relevance || 'moderate';
  return `<span class="rel-chip rel-${esc(rel)}">${esc(map[rel] || rel)}</span>`;
}

// Bir vakanın en güncel DDx listesini tek satırlık özet olarak döndürür.
function ddxSummary(analysis, max = 3) {
  const dxs = analysis.result?.differential_diagnoses || [];
  return dxs.slice(0, max)
    .map((d) => `${esc(d.name)} ${relevanceChip(d)}`)
    .join('<span class="ddx-sep">·</span>');
}

function versionRow(a, isLatest) {
  const p = a.case?.patient || {};
  const note = a.changeNote || '';
  const noteHtml = note
    ? `<div class="version-note">“${esc(note.length > 110 ? `${note.slice(0, 110)}…` : note)}”</div>`
    : '';
  return `
    <div class="version-row" data-id="${esc(a.id)}">
      <div class="version-col">
        <span class="version-pill${isLatest ? ' version-pill-latest' : ''}">v${esc(a.version)}</span>
      </div>
      <div class="item-main">
        <div class="item-title">${esc(p.age ?? '?')} yaş · ${esc(sexLabel(p.sex))} · ${(a.result?.differential_diagnoses || []).length} olasılık</div>
        <div class="item-meta">${esc(formatDateTime(a.analyzedAt))} · model: ${esc(a.model || '-')}</div>
        <div class="version-ddx">${ddxSummary(a)}</div>
        ${noteHtml}
      </div>
      <div class="item-actions">
        <a class="btn btn-secondary" href="#/results/${encodeURIComponent(a.id)}">İncele</a>
        ${isLatest ? `<button type="button" class="btn btn-primary-ghost" data-action="add-info" data-id="${esc(a.id)}" title="Yeni bilgi ekleyip yeniden analiz et (v${Number(a.version) + 1})">＋ Yeni Bilgi (v${Number(a.version) + 1})</button>` : ''}
      </div>
    </div>`;
}

function caseCard(c) {
  const versions = getCaseVersions(c.id);
  if (!versions.length) return '';
  const latest = versions[versions.length - 1];
  const rows = [...versions].reverse().map((v) => versionRow(v, v.id === latest.id)).join('');
  return `
    <div class="card case-card" data-case="${esc(c.id)}">
      <div class="card-pad">
        <div class="case-card-head">
          <h2 class="card-title case-title">${caseIdLabel(c.caseNumber)} <span class="case-version-count">${versions.length} sürüm</span></h2>
          <div class="case-card-actions">
            <span class="item-meta">Son güncelleme: ${esc(formatDateTime(latest.analyzedAt))}</span>
            <button type="button" class="btn btn-danger-ghost" data-action="delete-case" data-id="${esc(c.id)}">Vakayı Sil</button>
          </div>
        </div>
        <div class="version-list">${rows}</div>
      </div>
    </div>`;
}

// Eski (vaka sisteminden önce) bağımsız analizler: caseId yok.
function analysisRow(a) {
  const p = a.case?.patient || {};
  const symptomCount = (a.case?.symptoms || []).length;
  const diagnosisCount = (a.result?.differential_diagnoses || []).length;
  const summary = a.result?.case_summary || '';
  const preview = summary.length > 140 ? `${summary.slice(0, 140)}…` : summary;
  return `
    <div class="item-row" data-type="analysis" data-id="${esc(a.id)}">
      <div class="item-main">
        <div class="item-title">${esc(p.age ?? '?')} yaş · ${esc(sexLabel(p.sex))} · ${symptomCount} semptom · ${diagnosisCount} olasılık</div>
        <div class="item-meta">${esc(formatDateTime(a.analyzedAt))} · model: ${esc(a.model || '-')}</div>
        ${preview ? `<div class="item-preview">${esc(preview)}</div>` : ''}
      </div>
      <div class="item-actions">
        <a class="btn btn-secondary" href="#/results/${encodeURIComponent(a.id)}">İncele</a>
        <button type="button" class="btn btn-danger-ghost" data-action="delete-analysis" title="Analizi sil">Sil</button>
      </div>
    </div>`;
}

function draftRow(d) {
  const data = d.data || {};
  const symptoms = (data.symptoms || []).map((s) => s.label).join(', ');
  const note = data.clinicalNote || '';
  const preview = [symptoms, note].filter(Boolean).join(' · ');
  const clipped = preview.length > 140 ? `${preview.slice(0, 140)}…` : preview;
  return `
    <div class="item-row" data-type="draft" data-id="${esc(d.id)}">
      <div class="item-main">
        <div class="item-title">Taslak ${esc(formatDateTime(d.updatedAt))}</div>
        <div class="item-meta">Son güncelleme: ${esc(formatDateTime(d.updatedAt))}</div>
        ${clipped ? `<div class="item-preview">${esc(clipped)}</div>` : ''}
      </div>
      <div class="item-actions">
        <a class="btn btn-secondary" href="#/new-case?draft=${encodeURIComponent(d.id)}">Devam Et</a>
        <button type="button" class="btn btn-danger-ghost" data-action="delete-draft" title="Taslağı sil">Sil</button>
      </div>
    </div>`;
}

export function renderHistory(appEl) {
  const cases = getCases();
  const legacyAnalyses = getAnalyses().filter((a) => !a.caseId);
  const drafts = getDrafts();

  const caseList = cases.length
    ? cases.map(caseCard).join('')
    : `<div class="empty-state">
         <div class="empty-icon">🗂️</div>
         Henüz vaka yok. <a href="#/new-case">Yeni vaka</a> oluşturduğunuzda Case #001 olarak kaydedilir;
         sonraki analizler aynı vakaya v2, v3… olarak eklenir.
       </div>`;

  const legacyList = legacyAnalyses.length
    ? `<div class="item-list">${legacyAnalyses.map(analysisRow).join('')}</div>`
    : '';

  const draftList = drafts.length
    ? `<div class="item-list">${drafts.map(draftRow).join('')}</div>`
    : `<div class="empty-state">
         <div class="empty-icon">📝</div>
         Kayıtlı taslak yok. Formda <strong>Taslağı Kaydet</strong> butonunu kullanarak yarıda kalan vakaları saklayabilirsiniz.
       </div>`;

  appEl.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Geçmiş Vakalar</h1>
      <p class="page-subtitle">Her vaka zaman içinde sürümlerle ilerler: yeni bilgi eklendikçe v2, v3… olarak yeniden analiz edilir. Veriler yalnızca bu tarayıcıda saklanır.</p>
    </div>

    <section class="case-history-section" style="margin-bottom:22px;">
      ${caseList}
    </section>

    ${legacyAnalyses.length ? `
    <section class="card" style="margin-bottom:22px;">
      <div class="card-pad">
        <h2 class="card-title">Bağımsız analizler (${legacyAnalyses.length})</h2>
        <p class="section-desc">Vaka sistemi öncesinde kaydedilen analizler.</p>
        ${legacyList}
      </div>
    </section>` : ''}

    <section class="card">
      <div class="card-pad">
        <h2 class="card-title">Taslaklar (${drafts.length})</h2>
        ${draftList}
      </div>
    </section>`;

  // "＋ Yeni Bilgi": son sürümün form verisini saklayıp vN+1 formunu açar.
  appEl.querySelectorAll('[data-action="add-info"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const analysis = getAnalyses().find((a) => a.id === id);
      if (!analysis) return;
      try {
        sessionStorage.setItem('ci.formData', JSON.stringify(analysis.payload || {}));
        sessionStorage.setItem('ci.reanalyzeFrom', analysis.id);
      } catch {
        /* depolama dolu olabilir; yine de forma gidilir */
      }
      window.location.hash = '#/new-case';
    });
  });

  // Vakayı sil: vaka kaydı + tüm sürümleri.
  appEl.querySelectorAll('[data-action="delete-case"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-case]');
      if (!card) return;
      const ok = window.confirm('Bu vaka ve tüm sürümleri (analizleri) silinecek. Emin misiniz?');
      if (!ok) return;
      deleteCase(card.dataset.case);
      renderHistory(appEl);
    });
  });

  appEl.querySelectorAll('[data-action="delete-analysis"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('[data-type="analysis"]');
      const id = row.dataset.id;
      deleteAnalysis(id);
      renderHistory(appEl);
    });
  });

  appEl.querySelectorAll('[data-action="delete-draft"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('[data-type="draft"]');
      deleteDraft(row.dataset.id);
      renderHistory(appEl);
    });
  });
}
