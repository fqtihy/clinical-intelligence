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
