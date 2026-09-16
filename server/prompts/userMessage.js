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
