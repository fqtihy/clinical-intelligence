import { getStats, getAnalyses } from './store.js';
import { esc, formatDateTime, sexLabel } from './utils.js';
import { getMetrics } from './api.js';

export async function renderDashboard(appEl) {
  const stats = getStats();
  const analyses = getAnalyses().slice(0, 5);

  let costHtml = '';
  try {
    const metrics = await getMetrics();
    const cost = metrics.cost_summary && metrics.cost_summary.totals;
    if (cost && cost.analyses > 0) {
      costHtml = `
      <section class="stats-grid">
        <div class="card stat-card">
          <div class="stat-value">${esc(cost.estimated_cost_usd.toFixed(4))}</div>
          <div class="stat-label">Tahmini API Maliyeti (USD)</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${esc(cost.analyses)}</div>
          <div class="stat-label">Toplam Analiz (AI çağrısı)</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${esc(cost.avg_cost_per_case_usd.toFixed(4))}</div>
          <div class="stat-label">Ortalama Vaka Maliyeti</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${esc((cost.avg_input_tokens_per_case + cost.avg_output_tokens_per_case).toLocaleString('tr-TR'))}</div>
          <div class="stat-label">Ortalama Token / Vaka</div>
        </div>
      </section>`;
    }
  } catch { /* maliyet bilgisi opsiyoneldir */ }

  const recentRows = analyses.length
    ? analyses.map((a) => {
        const p = a.case?.patient || {};
        const symptomCount = (a.case?.symptoms || []).length;
        return `
        <div class="item-row">
          <div class="item-main">
            <div class="item-title">${esc(p.age ?? '?')} yaş · ${esc(sexLabel(p.sex))} · ${symptomCount} semptom</div>
            <div class="item-meta">${esc(formatDateTime(a.analyzedAt))} · model: ${esc(a.model || '-')}</div>
          </div>
          <div class="item-actions">
            <a class="btn btn-secondary" href="#/results/${encodeURIComponent(a.id)}">İncele</a>
          </div>
        </div>`;
      }).join('')
    : '';

  appEl.innerHTML = `
    <section class="hero">
      <h1>AI İkinci Görüş Motoru</h1>
      <p>
        Bu sistem hastalığı sizin yerinize bulmaya çalışan bir AI değildir; doktorun düşünmediği
        ihtimalleri arayan ve mevcut düşüncenizi kanıtlarla sorgulayan bir ikinci görüştür.
        Hipotezlerinizi destekleyen ve sorgulatan bulguları birlikte gösterir, düşünülmemiş
        alternatifleri gündeme getirir ve bir sonraki en değerli soruyu önerir.
        Sistem tanı koymaz; nihai klinik karar doktorun yetkisindedir.
      </p>
      <a class="btn btn-primary btn-lg" href="#/new-case">Yeni Vaka Oluştur</a>
    </section>

    <section class="stats-grid">
      <div class="card stat-card">
        <div class="stat-value">${stats.caseCount}</div>
        <div class="stat-label">Vaka (Case History)</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value">${stats.totalAnalyses}</div>
        <div class="stat-label">Toplam Analiz</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value">${stats.draftCount}</div>
        <div class="stat-label">Taslak Vaka</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value">${stats.lastAnalysis ? esc(formatDateTime(stats.lastAnalysis.analyzedAt)) : '—'}</div>
        <div class="stat-label">Son Analiz</div>
      </div>
    </section>

    ${costHtml}

    <section class="card">
      <div class="card-pad">
        <h2 class="card-title">Son Analizler</h2>
        ${analyses.length
          ? `<div class="item-list">${recentRows}</div>`
          : `<div class="empty-state">
               <div class="empty-icon">🗂️</div>
               Henüz analiz yok. İlk vakayı oluşturmak için <a href="#/new-case">Yeni Vaka</a> sayfasını kullanın.
             </div>`}
      </div>
    </section>`;
  appEl.querySelector('.hero')?.insertAdjacentHTML('beforeend', '<p style="margin-top:14px;"><a class="btn btn-secondary" href="#/synthetic-report">Geliştirici: Sentetik kalite raporu</a></p>');
}
