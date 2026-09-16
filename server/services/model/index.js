// Model soyutlama katmanı: üst katmanlar yalnızca createChatCompletion sözleşmesini
// kullanır. Provider değiştirmek için .env'de MODEL_PROVIDER değerini değiştirmek
// yeterlidir; pipeline, validation veya knowledge katmanı dokunulmaz.
//
// METRİK KATMANI: her chat completion çağrısı, teknik kaydıyla (latency, token
// usage, hata kodu) observability/metrics'e yazılır. İstek kimliği ve prompt
// sürümü, pipeline'ın çağrı içinde verdiği opts.requestId/opts.promptVersion'dan gelir.
const config = require('../../config');
const logger = require('../../logger');
const { ApiError } = require('../../middleware/errorHandler');
const metrics = require('../../observability/metrics');

// Provider kayıt tablosu: yeni model = buraya tek satır eklemek.
// Lazy require ile provider modülleri yalnızca kullanıldığında yüklenir;
// bu sayede testler provider modülünün exports özelliğini stub edebilir.
const PROVIDERS = {
  deepseek: () => require('./providers/deepseekProvider'),
  openai: () => require('./providers/openaiProvider'),
  mock: () => require('./providers/mockProvider'),
};

function resolveProvider() {
  const name = String(config.model.provider || 'deepseek').toLowerCase();
  const loader = PROVIDERS[name];
  if (!loader) {
    logger.error('model', 'bilinmeyen model sağlayıcısı', { provider: config.model.provider });
    throw new ApiError(503, 'MODEL_PROVIDER_UNKNOWN', 'Analiz hizmeti yanlış yapılandırılmış. Lütfen sunucu yöneticinize başvurun.');
  }
  return loader();
}

/**
 * Aktif provider üzerinden chat completion çağırır; çağrının teknik metriklerini kaydeder.
 * @param {{messages: Array<{role: string, content: string}>, temperature?: number,
 *          requestId?: string, attempt?: number, promptVersion?: string, schemaVersion?: string}} opts
 * @returns {Promise<{content: string, finishReason: string}>}
 */
async function createChatCompletion(opts) {
  const provider = resolveProvider();
  const startedAt = Date.now();
  try {
    const result = await provider.createChatCompletion(opts);
    metrics.recordAiCall({
      request_id: opts.requestId,
      attempt: opts.attempt || 1,
      model: provider.model || '',
      provider: provider.providerName || String(config.model.provider),
      prompt_version: opts.promptVersion,
      schema_version: opts.schemaVersion,
      latency_ms: Date.now() - startedAt,
      status: 'success',
      finish_reason: result.finishReason,
      prompt_tokens: result.usage ? result.usage.prompt_tokens : undefined,
      completion_tokens: result.usage ? result.usage.completion_tokens : undefined,
    });
    return result;
  } catch (err) {
    metrics.recordAiCall({
      request_id: opts.requestId,
      attempt: opts.attempt || 1,
      model: provider.model || '',
      provider: provider.providerName || String(config.model.provider),
      prompt_version: opts.promptVersion,
      schema_version: opts.schemaVersion,
      latency_ms: Date.now() - startedAt,
      status: 'error',
      error_code: err.code || 'UNKNOWN',
      error_message: err.message,
    });
    throw err;
  }
}

function getProviderName() {
  return resolveProvider().providerName || String(config.model.provider);
}

function isModelConfigured() {
  const provider = resolveProvider();
  return typeof provider.isConfigured === 'function' ? provider.isConfigured() : true;
}

function getModelInfo() {
  const provider = resolveProvider();
  return { provider: getProviderName(), model: provider.model || '' };
}

module.exports = {
  createChatCompletion,
  getProviderName,
  getModelInfo,
  isModelConfigured,
};
