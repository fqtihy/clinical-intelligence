// Uyumluluk sarmalayıcı (compatibility shim).
// Pipeline katmanlarına bölündükten sonra eski içe aktarma yollarının çalışmaya
// devam etmesi için korundu. Tek doğruluk kaynağı:
//   orkestratör:         server/pipeline/analyzePipeline.js
//   case processor:      server/pipeline/caseProcessor.js
//   knowledge retrieval: server/pipeline/knowledgeRetrieval.js
//   model soyutlaması:   server/services/model/index.js
//   response validator:  server/pipeline/responseValidator.js
//   result formatter:    server/pipeline/resultFormatter.js
const pipeline = require('../../pipeline/analyzePipeline');
const validator = require('../../pipeline/responseValidator');

module.exports = {
  analyzeCase: pipeline.analyzeCase,
  parseAndValidateAiOutput: validator.parseAndValidateAiOutput,
  extractJson: validator.extractJson,
};
