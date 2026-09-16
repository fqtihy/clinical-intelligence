// UYUMLULUK SARMALAYICI (compatibility shim).
// Prompt modülerleştirildikten sonra eski içe aktarma yollarının çalışmaya devam
// etmesi için korundu. Tek doğruluk kaynağı: server/prompts/index.js
//   bölümler:  server/prompts/sections/
//   sürümler:  server/prompts/versions.js
const prompts = require('./index');
const { schemaToPromptText } = require('../schemas/analysisSchema');

module.exports = {
  buildSystemPrompt: prompts.buildSystemPrompt,
  buildUserMessage: prompts.buildUserMessage,
  buildRetryInstruction: prompts.buildRetryInstruction,
  // OUTPUT_SCHEMA artık bölümler içinde şema modülünden üretilir; eski içe aktarımlar
  // için burada da sunulur.
  OUTPUT_SCHEMA: schemaToPromptText(),
};
