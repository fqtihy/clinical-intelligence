const { buildEvidenceContext } = require('../knowledge/evidenceService');

function retrieveKnowledge(structuredCase) {
  return buildEvidenceContext(structuredCase);
}

module.exports = { retrieveKnowledge };
