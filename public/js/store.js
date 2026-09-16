
const ANALYSES_KEY = 'ci.analyses';
const DRAFTS_KEY = 'ci.drafts';
const CASES_KEY = 'ci.cases';
const FEEDBACK_KEY = 'ci.feedback';
const MAX_ANALYSES = 100;
const RETENTION_DAYS = 30;
const APP_KEYS = [ANALYSES_KEY, DRAFTS_KEY, CASES_KEY, FEEDBACK_KEY];

function isExpired(item, dateKey) {
  const timestamp = Date.parse(item?.[dateKey] || '');
  return Number.isFinite(timestamp) && timestamp < Date.now() - RETENTION_DAYS * 86400000;
}

function purgeExpired() {
  const configs = [
    [ANALYSES_KEY, 'analyzedAt'],
    [DRAFTS_KEY, 'updatedAt'],
    [CASES_KEY, 'updatedAt'],
    [FEEDBACK_KEY, 'createdAt'],
  ];
  configs.forEach(([key, dateKey]) => {
    const list = readList(key);
    const fresh = list.filter((item) => !isExpired(item, dateKey));
    if (fresh.length !== list.length) writeList(key, fresh);
  });
}

function readList(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
  }
}


export function getAnalyses() {
  purgeExpired();
  return readList(ANALYSES_KEY).sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt));
}

export function getAnalysis(id) {
  purgeExpired();
  return readList(ANALYSES_KEY).find((a) => a.id === id) || null;
}

export function saveAnalysis(analysis) {
  const list = readList(ANALYSES_KEY);
  list.push(analysis);
  list.sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt));
  writeList(ANALYSES_KEY, list.slice(0, MAX_ANALYSES));
  return analysis;
}

export function deleteAnalysis(id) {
  writeList(ANALYSES_KEY, readList(ANALYSES_KEY).filter((a) => a.id !== id));
}


function readCases() {
  try {
    const raw = localStorage.getItem(CASES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCases(cases) {
  try {
    localStorage.setItem(CASES_KEY, JSON.stringify(cases));
  } catch {
  }
}

export function getCases() {
  purgeExpired();
  return readCases().sort((a, b) => b.caseNumber - a.caseNumber);
}

export function getCase(id) {
  purgeExpired();
  return readCases().find((c) => c.id === id) || null;
}

function nextCaseNumber() {
  const max = readCases().reduce((m, c) => Math.max(m, c.caseNumber || 0), 0);
  return max + 1;
}

export function createCase() {
  const c = {
    id: `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
    caseNumber: nextCaseNumber(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeCases([...readCases(), c]);
  return c;
}

export function touchCase(id) {
  const cases = readCases();
  const c = cases.find((x) => x.id === id);
  if (c) {
    c.updatedAt = new Date().toISOString();
    writeCases(cases);
  }
}

export function getCaseVersions(caseId) {
  return readList(ANALYSES_KEY)
    .filter((a) => a.caseId === caseId)
    .sort((a, b) => (a.version || 0) - (b.version || 0));
}

export function deleteCase(id) {
  writeCases(readCases().filter((c) => c.id !== id));
  writeList(ANALYSES_KEY, readList(ANALYSES_KEY).filter((a) => a.caseId !== id));
}


export function getDrafts() {
  purgeExpired();
  return readList(DRAFTS_KEY).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getDraft(id) {
  purgeExpired();
  return readList(DRAFTS_KEY).find((d) => d.id === id) || null;
}

export function saveDraft(draft) {
  const list = readList(DRAFTS_KEY);
  const index = list.findIndex((d) => d.id === draft.id);
  if (index >= 0) list[index] = draft;
  else list.push(draft);
  writeList(DRAFTS_KEY, list);
  return draft;
}

export function deleteDraft(id) {
  writeList(DRAFTS_KEY, readList(DRAFTS_KEY).filter((d) => d.id !== id));
}


export function getStats() {
  purgeExpired();
  const analyses = getAnalyses();
  const drafts = getDrafts();
  return {
    totalAnalyses: analyses.length,
    caseCount: readCases().length,
    draftCount: drafts.length,
    lastAnalysis: analyses[0] || null,
  };
}

export function clearAllLocalData() {
  APP_KEYS.forEach((key) => localStorage.removeItem(key));
  sessionStorage.removeItem('ci.formData');
  sessionStorage.removeItem('ci.reanalyzeFrom');
}

export function getRetentionDays() {
  return RETENTION_DAYS;
}


export function getAnalysisFeedback(analysisId) {
  purgeExpired();
  return readList(FEEDBACK_KEY).filter((item) => item.analysisId === analysisId);
}

export function saveAnalysisFeedback(feedback) {
  const list = readList(FEEDBACK_KEY).filter(
    (item) => !(item.analysisId === feedback.analysisId && item.category === feedback.category),
  );
  list.push({
    analysisId: feedback.analysisId,
    category: feedback.category,
    value: feedback.value,
    note: feedback.note || '',
    createdAt: new Date().toISOString(),
  });
  writeList(FEEDBACK_KEY, list.slice(-500));
}
