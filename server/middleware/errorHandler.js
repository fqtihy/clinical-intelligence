// Uygulama genelinde kullanılan hata tipleri ve merkezi hata yakalayıcı.
// Kullanıcıya hiçbir zaman stack trace gösterilmez; 5xx hatalar kullanıcı dostu
// genel bir mesaja dönüşür, detaylar geliştirici loguna yazılır.
const logger = require('../logger');

class ApiError extends Error {
  /**
   * @param {number} status  HTTP durum kodu
   * @param {string} code    Makinece okunabilir hata kodu (ör. VALIDATION_FAILED)
   * @param {string} message Kullanıcıya gösterilecek mesaj
   * @param {object} [details] Ek doğrulama detayları (yalnızca 4xx hatalarda döner)
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'İstenen kaynak bulunamadı.' },
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // express.json ayrıştırma hatası: kullanıcıya ham ayrıştırıcı mesajı gösterilmez.
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    const code = err.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON';
    const message = err.type === 'entity.too.large'
      ? 'Gönderilen istek çok büyük. Klinik öyküyü kısaltıp tekrar deneyin.'
      : 'İstek gövdesi geçersiz JSON içeriyor.';
    return res.status(400).json({ ok: false, error: { code, message } });
  }

  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = status >= 500 ? 'Analiz şu anda gerçekleştirilemedi. Lütfen tekrar deneyin.' : err.message;

  if (status >= 500) {
    logger.error('api', 'hata yakalandı', {
      code,
      originalMessage: err.message,
      details: err.details,
      stack: err.stack,
      method: req.method,
      path: req.originalUrl,
    });
  }

  const body = { ok: false, error: { code, message } };
  if (status < 500 && err.details) body.error.details = err.details;
  res.status(status).json(body);
}

module.exports = { ApiError, notFoundHandler, errorHandler };
