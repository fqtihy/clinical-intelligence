
function schemaErrorSection(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return '';
  return `SCHEMA VALIDATION ERRORS from your previous answer (fix exactly these and nothing else):
${errors.map((e) => `- ${e}`).join('\n')}`;
}

function buildRetryInstruction(validationErrors = []) {
  const schemaErrors = schemaErrorSection(validationErrors);
  return `Your previous answer was invalid or was cut off because it exceeded the token limit.

Output the complete JSON object again, exactly matching the schema described in the system message.
This time be MORE concise:
* maximum 5 differential diagnoses
* maximum 3-4 short items per list field
* case_summary, clinical_pattern and uncertainty in 1 sentence each
* short phrases only

findings_against, distinguishing_features ve comparison_with_other_candidates alanlarını koru ancak çok kısa tut;
comparison_with_other_candidates için en fazla 3-4 karşılaştırma yap; uygulanmıyorsa boş dizi kullan.
missing_information_impact için en fazla 4-5 öğe kullan; etki yönlerini tek kısa cümleyle yaz.
doctor_divergence_analysis alanını koru; doktor listesi boşsa boş dizi/string kullan; rank alanları sayı veya null olmalı.
contradiction_assessment alanını koru; severity yalnızca "none" | "minor" | "significant" olabilir; verdict tek kısa cümle.
evidence_tree alanını koru; yalnızca girdideki gerçek bulguları kullan, en fazla 8 bulgu ve 6 bağlantı; conclusion ve root_label tek kısa cümle.
second_opinion alanını koru; hypothesis_review yalnızca doktor listesindeki tanılar için (en fazla 3); unconsidered_alternatives en fazla 3 ve yalnızca doktor listesinde olmayan tanılar; summary, recommendation ve key_question tek kısa cümle.
EVIDENCE GROUNDING kurallarını koru: yalnızca EVIDENCE CONTEXT'teki adayları listele; supporting_findings/findings_against yalnızca eşleşen kanıtlara dayansın; evidence_notes içinde [S#] atıflarını sürdür; kaynak uydurma.

${schemaErrors}

Return ONLY valid JSON. No markdown code fences, no explanations, no text outside the JSON object.`;
}

module.exports = { buildRetryInstruction };
