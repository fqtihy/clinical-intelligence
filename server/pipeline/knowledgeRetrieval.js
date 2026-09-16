// KATMAN 2: Bilgi erişim (knowledge retrieval).
// Yapılandırılmış vakayı kürasyonlu kaynak tabanında tarar; aday hastalıklar,
// kanıt çıkarımı ve çelişki tespiti bu katmanda deterministik olarak yapılır.
const { buildEvidenceContext } = require('../knowledge/evidenceService');

/**
 * @param {object} structuredCase - caseProcessor çıktısı
 * @returns {{ candidates: Array, sources: Array, context: object, trail: Array }}
 */
function retrieveKnowledge(structuredCase) {
  return buildEvidenceContext(structuredCase);
}

module.exports = { retrieveKnowledge };
