// KATMAN 1: Vaka işlemci (case processor).
// Frontend'den gelen ham vaka verisini doğrular ve yapılandırılmış JSON'a çevirir.
// Uygulama caseNormalizer'a delege eder; katmanın amacı pipeline'daki adımın
// tek bir yerden değiştirilebilir olmasıdır (ör. ileride ek doğrulama/zenginleştirme).
const { normalizeAndValidate } = require('../validation/caseNormalizer');

/**
 * @param {object} rawCase - Frontend'den gelen ham vaka verisi
 * @returns {object} Yapılandırılmış vaka (caseNormalizer sözleşmesi)
 */
function processCase(rawCase) {
  return normalizeAndValidate(rawCase);
}

module.exports = { processCase };
