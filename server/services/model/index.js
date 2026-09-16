const config = require('../../config');
const logger = require('../../logger');
const { ApiError } = require('../../middleware/errorHandler');
const metrics = require('../../observability/metrics');

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
