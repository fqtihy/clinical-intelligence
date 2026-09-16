// Backend REST API istemcisi.
// Tüm sunucu iletişimi burada toplanır; hatalar kullanıcı dostu mesaja dönüştürülür.
// Teknik detay (stack trace vb.) asla gösterilmez.

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
    /* geçersiz JSON gövdesi: aşağıda güvenli mesaja dönüşür */
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

/** GET /api/health — sunucu durumu ve AI yapılandırması. */
export function getHealth() {
  return request('/api/health');
}

/** POST /api/analyze — vaka verisini gönderir, analiz sonucunu döndürür. */
export function analyzeCase(casePayload) {
  return request('/api/analyze', {
    method: 'POST',
    body: JSON.stringify(casePayload),
  });
}

/** POST /api/what-if — tek alan değiştirilmiş vakanın karşı-olgusal analizi. */
export function whatIfAnalysis(casePayload, edit) {
  return request('/api/what-if', {
    method: 'POST',
    body: JSON.stringify({ case: casePayload, edit }),
  });
}

/** GET /api/metrics — teknik metrikler + tahmini API maliyeti. */
export function getMetrics() {
  return request('/api/metrics');
}
