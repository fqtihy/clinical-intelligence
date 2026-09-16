// OpenAI provider kaydı: DeepSeek yerine OpenAI-uyumlu herhangi bir modele geçiş
// örneği. MODEL_PROVIDER=openai ile etkinleşir; kod değişikliği gerektirmez.
const config = require('../../../config');
const { createOpenAICompatibleClient } = require('./openaiCompatible');

module.exports = createOpenAICompatibleClient({
  name: 'openai',
  baseUrl: config.openai.baseUrl,
  model: config.openai.model,
  apiKey: config.openai.apiKey,
  timeoutMs: config.model.timeoutMs,
  maxTokens: config.model.maxTokens,
  temperature: config.model.temperature,
});
