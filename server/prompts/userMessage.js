// PROMPT MODÜLÜ: kullanıcı mesajı üretici.
// Doktorun verileri düz metin yerine yapılandırılmış JSON olarak iletilir;
// kanıt demeti ayrı mesaj DEĞİL, aynı mesajın içine EVIDENCE CONTEXT olarak gömülür
// (retry testi messages.length === 2 bekler: system + user).
/**
 * @param {object} structuredCase - caseNormalizer tarafından üretilen yapılandırılmış vaka
 * @param {object} [evidenceContext] - evidenceService.buildEvidenceContext çıktısı ({ context: {...} })
 */
function buildUserMessage(structuredCase, evidenceContext) {
  const parts = [
    'Analyze the following structured clinical case supplied by a physician.',
    'Identify plausible differential diagnoses, supporting findings, missing information,',
    'alternative explanations, and areas that may deserve further clinical evaluation.',
    'Return ONLY valid JSON matching the schema described in the system message.',
    '',
    'STRUCTURED CASE:',
    JSON.stringify(structuredCase, null, 2),
  ];
  if (evidenceContext && evidenceContext.context) {
    parts.push('', 'EVIDENCE CONTEXT:', JSON.stringify(evidenceContext.context, null, 2));
  }
  return parts.join('\n');
}

module.exports = { buildUserMessage };
