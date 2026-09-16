const path = require('path');
const express = require('express');
const config = require('./config');
const logger = require('./logger');
const apiRouter = require('./routes/api');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const model = require('./services/model');

const app = express();

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.json({ limit: '256kb' }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
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
