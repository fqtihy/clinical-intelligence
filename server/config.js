const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = {
  port: parseInt(process.env.PORT || '3000', 10),

  model: {
    provider: (process.env.MODEL_PROVIDER || 'deepseek').trim().toLowerCase(),

    timeoutMs: parseInt(process.env.MODEL_TIMEOUT_MS || process.env.DEEPSEEK_TIMEOUT_MS || '120000', 10),
    maxTokens: parseInt(process.env.MODEL_MAX_TOKENS || process.env.DEEPSEEK_MAX_TOKENS || '8192', 10),
    temperature: parseFloat(process.env.MODEL_TEMPERATURE || process.env.DEEPSEEK_TEMPERATURE || '0.3'),
  },

  prompt: {
    version: (process.env.PROMPT_VERSION || '').trim() || undefined,
  },

  deepseek: {
    apiKey: (process.env.DEEPSEEK_API_KEY || '').trim(),
    baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },

  openai: {
    apiKey: (process.env.OPENAI_API_KEY || '').trim(),
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
};

module.exports = config;
