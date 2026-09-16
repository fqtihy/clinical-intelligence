// "Ayarlar" görünümü: sunucu/AI bağlantı durumu, yerel veri yönetimi ve uygulama bilgisi.
// Sağlayıcı adı SABİT KODLANMAZ: /api/health'den provider-bağımsız gelir
// (MODEL_PROVIDER .env ile değişebilir; frontend hangi model kullanıldığını bilmez).
import { getHealth } from './api.js';
import { getAnalyses, getDrafts, clearAllLocalData, getRetentionDays } from './store.js';
import { esc, formatDateTime } from './utils.js';

function healthCard(appEl, health, loading, error) {
  const statusDot = health ? 'background:#1e8e5a;' : 'background:var(--text-faint);';
  const list = `
    <ul class="kv-list">
      <li><span class="k">Sunucu durumu</span><span class="v" style="display:inline-flex;align-items:center;gap:8px;">
        <span style="width:10px;height:10px;border-radius:50%;${statusDot}"></span>${health ? 'Çevrimiçi' : (error ? 'Çevrimdışı' : 'Kontrol ediliyor…')}</span></li>
      <li><span class="k">AI yapılandırması</span><span class="v">${health ? (health.aiConfigured ? 'API anahtarı tanındı' : 'API anahtarı eksik') : '—'}</span></li>
      <li><span class="k">Sağlayıcı</span><span class="v">${health ? esc(health.provider || '-') : '—'}</span></li>
      <li><span class="k">Model</span><span class="v">${health ? esc(health.model || '-') : '—'}</span></li>
      <li><span class="k">Son kontrol</span><span class="v">${health ? esc(formatDateTime(health.time)) : (error ? esc(error) : '—')}</span></li>
    </ul>`;
  return `
    <section class="card" style="margin-bottom:22px;">
      <div class="card-pad">
        <h2 class="card-title">Sunucu ve AI Durumu</h2>
        ${list}
        <div style="display:flex;align-items:center;gap:12px;margin-top:14px;">
          <button type="button" class="btn btn-secondary" id="health-btn" ${loading ? 'disabled' : ''}>
            ${loading ? 'Kontrol ediliyor…' : 'Bağlantıyı Yeniden Test Et'}
          </button>
          <span class="hint" id="health-status"></span>
        </div>
      </div>
    </section>`;
}

function dataCard(appEl) {
  const analyses = getAnalyses();
  const drafts = getDrafts();
  return `
    <section class="card" style="margin-bottom:22px;">
      <div class="card-pad">
        <h2 class="card-title">Yerel Veri Yönetimi</h2>
        <ul class="kv-list">
          <li><span class="k">Kayıtlı analiz</span><span class="v">${analyses.length}</span></li>
          <li><span class="k">Kayıtlı taslak</span><span class="v">${drafts.length}</span></li>
          <li><span class="k">Otomatik silme</span><span class="v">${getRetentionDays()} gün</span></li>
        </ul>
        <p style="font-size:13px;color:var(--text-muted);margin:10px 0 14px;">
          Analizler, taslaklar ve geri bildirim yalnızca bu tarayıcının yerel deposunda tutulur; ${getRetentionDays()} gün boyunca açılmayan kayıtlar otomatik silinir.
          Temizleme işlemi geri alınamaz.
        </p>
        <button type="button" class="btn btn-danger-ghost" id="clear-data-btn">Tüm Yerel Verileri Temizle</button>
      </div>
    </section>`;
}

function aboutCard(health) {
  const providerLabel = health ? `${esc(health.provider || '-')}${health.model ? ` (${esc(health.model)})` : ''}` : 'Kontrol ediliyor…';
  return `
    <section class="card">
      <div class="card-pad">
        <h2 class="card-title">Uygulama Hakkında</h2>
        <ul class="kv-list">
          <li><span class="k">Sürüm</span><span class="v">0.1.0 (MVP)</span></li>
          <li><span class="k">AI sağlayıcı</span><span class="v">${providerLabel}</span></li>
          <li><span class="k">Veri gizliliği</span><span class="v">Sunucuda saklama yok</span></li>
        </ul>
        <p style="font-size:13px;color:var(--text-muted);margin-top:12px;">
          Analiz için girdiğiniz vaka verisi yalnızca işlenmek üzere sunucu tarafındaki AI servisine gönderilir;
          hiçbir hasta kimliği (ad, TC kimlik vb.) istenmez ve kaydedilmez.
          Nihai klinik karar her zaman sağlık profesyonelinin sorumluluğundadır.
        </p>
      </div>
    </section>`;
}

export function renderSettings(appEl) {
  appEl.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Ayarlar</h1>
      <p class="page-subtitle">Sunucu bağlantısı, AI yapılandırması ve yerel veri yönetimi.</p>
    </div>
    <div id="settings-root">
      ${healthCard(appEl, null, true, null)}
      ${dataCard(appEl)}
      ${aboutCard(null)}
      <section class="card" style="margin-top:22px;"><div class="card-pad"><h2 class="card-title">Sentetik vaka geliştirme araçları</h2><p class="section-desc">Model çağrısı yapmadan havuz dağılımını, beklenen safety/audit/kapsam işaretlerini ve anonim test export'unu inceleyin.</p><a class="btn btn-secondary" href="#/synthetic-report">Kalite raporunu aç</a></div></section>
    </div>`;

  const root = appEl.querySelector('#settings-root');

  // Bağlantı testi — ilk yüklemede otomatik, butonla yeniden.
  const runHealthCheck = async () => {
    let health = null;
    try {
      health = await getHealth();
    } catch (err) {
      root.querySelector('section').outerHTML = healthCard(appEl, null, false, err.message);
      return;
    }
    // Sağlayıcı adı health yanıtından alındığı için "Hakkında" kartı da tazelenir.
    root.querySelector('section').outerHTML = healthCard(appEl, health, false, null);
    root.querySelectorAll('section')[1].outerHTML = aboutCard(health);
  };

  // Buton innerHTML ile yeniden çizildiğinde dinleyici kopmasın diye delegasyon kullanılır.
  root.addEventListener('click', (ev) => {
    if (!ev.target.closest('#health-btn')) return;
    const btn = root.querySelector('#health-btn');
    btn.disabled = true;
    btn.textContent = 'Kontrol ediliyor…';
    runHealthCheck();
  });

  runHealthCheck();

  root.querySelector('#clear-data-btn').addEventListener('click', () => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="clear-modal-title">
        <div class="modal-pad">
          <h3 id="clear-modal-title">Tüm veriler temizlensin mi?</h3>
          <p style="font-size:14px;color:var(--text-muted);margin:0;">
            ${getAnalyses().length} analiz ve ${getDrafts().length} taslak kalıcı olarak silinecek. Bu işlem geri alınamaz.
          </p>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" data-action="cancel">Vazgeç</button>
            <button type="button" class="btn btn-danger-ghost" data-action="confirm">Evet, Temizle</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => overlay.remove());
    overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      clearAllLocalData();
      overlay.remove();
      renderSettings(appEl);
    });
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) overlay.remove();
    });
  });
}
