// Merkezi yapılandırma modülü.
// Tüm ortam değişkenleri burada okunur, doğrulanır ve uygulamaya dağıtılır.
// API anahtarları yalnızca buradan (`.env`) okunur; frontend'e asla açılmaz.
//
// Katman kuralları:
//   - config.model.*          -> provider-bağımsız ortak ayarlar (her katman okuyabilir)
//   - config.deepseek / config.openai -> yalnızca ilgili provider modülü okur;
//     uygulamanın geri kalanı bu bölümlerin varlığından haberdar değildir.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = {
  port: parseInt(process.env.PORT || '3000', 10),

  // Aktif model sağlayıcısı: 'deepseek' | 'openai' | 'mock'.
  // Değiştirmek için yalnızca bu değer + ilgili provider'ın anahtarı yeterlidir;
  // pipeline ve doğrulama katmanları sağlayıcıdan bağımsızdır.
  model: {
    provider: (process.env.MODEL_PROVIDER || 'deepseek').trim().toLowerCase(),

    // Provider-bağımsız ortak parametreler. Geriye dönük uyumluluk için eski
    // provider'a özel env değişkenleri (DEEPSEEK_TIMEOUT_MS vb.) fallback olarak
    // kabul edilir; yeni kurulumlarda MODEL_* değişkenleri tercih edilir.
    timeoutMs: parseInt(process.env.MODEL_TIMEOUT_MS || process.env.DEEPSEEK_TIMEOUT_MS || '120000', 10),
    maxTokens: parseInt(process.env.MODEL_MAX_TOKENS || process.env.DEEPSEEK_MAX_TOKENS || '8192', 10),
    temperature: parseFloat(process.env.MODEL_TEMPERATURE || process.env.DEEPSEEK_TEMPERATURE || '0.3'),
  },

  // Prompt sürümü: server/prompts/versions.js kayıt defterindeki bir sürüm kimliği
  // ('1.0' | '1.1' | '2.0'...). Bilinmeyen sürüm verilirse modül güvenli biçimde
  // varsayılana düşer. Analiz sonuçları bu sürümü prompt_version olarak taşır;
  // böylece sürümler arası cevap kalitesi karşılaştırılabilir.
  prompt: {
    version: (process.env.PROMPT_VERSION || '').trim() || undefined,
  },

  // Provider'a özel yapılandırmalar: yalnızca ilgili provider modülü okur.
  deepseek: {
    apiKey: (process.env.DEEPSEEK_API_KEY || '').trim(),
    baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },

  // OpenAI-uyumlu alternatif provider (örnek): MODEL_PROVIDER=openai ile etkinleşir.
  // openaiCompatible fabrikası sayesinde OpenAI, Azure OpenAI, vLLM, Ollama vb. uçlar
  // yalnızca env değerleriyle bağlanabilir.
  openai: {
    apiKey: (process.env.OPENAI_API_KEY || '').trim(),
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
};

module.exports = config;
