
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.');
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
  }

  if (!response.ok) {
    const message = body?.error?.message || 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.';
    const err = new Error(message);
    err.code = body?.error?.code || 'UNKNOWN';
    err.details = body?.error?.details;
    throw err;
  }
  return body;
}

export function getHealth() {
  return request('/api/health');
}

export function analyzeCase(casePayload) {
  return request('/api/analyze', {
    method: 'POST',
    body: JSON.stringify(casePayload),
  });
}

export function whatIfAnalysis(casePayload, edit) {
  return request('/api/what-if', {
    method: 'POST',
    body: JSON.stringify({ case: casePayload, edit }),
  });
}

export function getMetrics() {
  return request('/api/metrics');
}
