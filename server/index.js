// Uygulama giriş noktası.
// Express sunucusu: statik frontend'i ve REST API'yi aynı portta sunar.
const path = require('path');
const express = require('express');
const config = require('./config');
const logger = require('./logger');
const apiRouter = require('./routes/api');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const model = require('./services/model');

const app = express();

// Güvenlik başlıkları ve sunucu bilgisi gizleme
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// JSON gövde limiti: aşırı büyük istekler reddedilir
app.use(express.json({ limit: '256kb' }));

// Statik frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// API
app.use('/api', apiRouter);

// 404 ve merkezi hata yakalayıcı
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  // Startup logları model katmanı üzerinden provider-bağımsız alınır.
  // Yapılandırma hatalıysa (bilinmeyen provider) sunucu ayağa kalmaya devam eder;
  // analyze istekleri model katmanının hata sözleşmesiyle reddedilir.
  let modelInfo = { provider: config.model.provider, model: '' };
  let aiConfigured = false;
  try {
    modelInfo = model.getModelInfo();
    aiConfigured = model.isModelConfigured();
  } catch (err) {
    logger.error('server', 'model sağlayıcısı çözümlenemedi', { message: err.message });
  }

  logger.info('server', 'Clinical Intelligence sunucusu başladı', {
    port: config.port,
    url: `http://localhost:${config.port}`,
    provider: modelInfo.provider,
    model: modelInfo.model,
    aiConfigured,
  });
  if (!aiConfigured) {
    logger.warn('server', `Aktif model sağlayıcısı (${modelInfo.provider}) yapılandırılmadı; .env dosyasındaki provider anahtarını kontrol edin.`);
  }
});
