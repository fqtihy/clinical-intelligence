const { normalizeAndValidate } = require('../validation/caseNormalizer');

function processCase(rawCase) {
  return normalizeAndValidate(rawCase);
}

module.exports = { processCase };
