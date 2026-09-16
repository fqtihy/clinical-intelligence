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
