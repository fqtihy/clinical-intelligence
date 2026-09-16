// Hash tabanlı mini router: görünümleri yükler, aktif menüyü işaretler,
// sonuç ekranı -> yeniden analiz ve taslak -> form akışlarını besler.
import { renderDashboard } from './dashboard.js';
import { renderNewCase } from './newCase.js';
import { renderHistory } from './history.js';
import { renderSettings } from './settings.js';
import { renderResults } from './results.js';
import { getDraft } from './store.js';
import { renderSyntheticReport } from './syntheticReport.js';
import { renderSyntheticCompare } from './syntheticCompare.js';

const appEl = document.getElementById('app');

/** "#/results/abc?prev=xyz" gibi hash'i {name, params} olarak ayrıştırır. */
function parseHash(hash) {
  const raw = (hash || '').replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const name = segments[0] || 'dashboard';
  const params = {};

  if (name === 'results' && segments[1]) params.id = decodeURIComponent(segments[1]);
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      const [k, v] = pair.split('=');
      if (k && v !== undefined) params[k] = decodeURIComponent(v);
    }
  }
  return { name, params };
}

function setActiveNav(name) {
  document.querySelectorAll('.main-nav a[data-route]').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === name);
  });
}

function newCaseOptions(params) {
  // Öncelik: ?draft=kimlik -> taslak; yoksa yeniden analiz akışı -> form verisi;
  // yoksa boş form. Yeniden analiz verisi tek seferliktir; okunduktan sonra temizlenir.
  if (params.draft) {
    const draft = getDraft(params.draft);
    if (draft) return { data: draft.data || {}, draftId: draft.id };
  }

  let formData = null;
  let reanalyzeFromId = null;
  try {
    const raw = sessionStorage.getItem('ci.formData');
    if (raw) formData = JSON.parse(raw);
    reanalyzeFromId = sessionStorage.getItem('ci.reanalyzeFrom');
  } catch {
    formData = null;
  }
  if (formData) {
    sessionStorage.removeItem('ci.formData');
    sessionStorage.removeItem('ci.reanalyzeFrom');
    return { data: formData, reanalyzeFromId };
  }
  return {};
}

function renderRoute() {
  const { name, params } = parseHash(window.location.hash);

  if (name === 'results' && params.id) {
    setActiveNav('');
    renderResults(appEl, { id: params.id, prevId: params.prev || null });
  } else if (name === 'new-case') {
    setActiveNav('new-case');
    renderNewCase(appEl, newCaseOptions(params));
  } else if (name === 'history') {
    setActiveNav('history');
    renderHistory(appEl);
  } else if (name === 'settings') {
    setActiveNav('settings');
    renderSettings(appEl);
  } else if (name === 'synthetic-report') {
    setActiveNav('');
    renderSyntheticReport(appEl);
  } else if (name === 'synthetic-compare') {
    setActiveNav('');
    renderSyntheticCompare(appEl, params);
  } else {
    setActiveNav('dashboard');
    renderDashboard(appEl);
  }

  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', renderRoute);

// İlk yükleme: boş hash'i dashboard'a yönlendir.
if (!window.location.hash || window.location.hash === '#') {
  window.location.replace('#/dashboard');
} else {
  renderRoute();
}
