// DeepSeek provider kaydı.
// Generic OpenAI-uyumlu istemci fabrikası (../model/providers/openaiCompatible.js)
// DeepSeek yapılandırmasıyla somutlaştırılır. API anahtarı yalnızca sunucu tarafındadır.
// Testler bu modülün createChatCompletion özelliğini stub edebilir (require cache
// üzerinden aynı nesne paylaşıldığı için stub tüm hataya yayılır).
const config = require('../../config');
const { createOpenAICompatibleClient } = require('../model/providers/openaiCompatible');

module.exports = createOpenAICompatibleClient({
  name: 'deepseek',
  baseUrl: config.deepseek.baseUrl,
  model: config.deepseek.model,
  apiKey: config.deepseek.apiKey,
  timeoutMs: config.model.timeoutMs,
  maxTokens: config.model.maxTokens,
  temperature: config.model.temperature,
});
