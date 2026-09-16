// Basit yapılandırılabilir JSON logger.
// Geliştirici tarafında detaylı log tutmak için tasarlandı; ileride dosyaya veya
// merkezi log sistemine yönlendirmek kolaydır (LOG_LEVEL ortam değişkeni ile ayarlanır).
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const configuredLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();

function levelEnabled(level) {
  const current = LEVELS[configuredLevel] ?? LEVELS.info;
  return LEVELS[level] >= current;
}

function write(level, component, message, meta) {
  if (!levelEnabled(level)) return;
  const entry = {
    time: new Date().toISOString(),
    level,
    component,
    message,
  };
  if (meta !== undefined) entry.meta = meta;
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

module.exports = {
  debug: (component, message, meta) => write('debug', component, message, meta),
  info: (component, message, meta) => write('info', component, message, meta),
  warn: (component, message, meta) => write('warn', component, message, meta),
  error: (component, message, meta) => write('error', component, message, meta),
};
