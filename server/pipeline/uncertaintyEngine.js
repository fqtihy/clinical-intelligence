// Belirsizlik motoru: modelin "uncertainty" metnine güvenmek yerine,
// vaka verisi + deterministik kanıt katmanı + audit sonuçlarından karar güvenini
// bağımsız ve açıklanabilir biçimde hesaplar.

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function hasUnknown(value) {
  return !value || String(value).trim().toLocaleLowerCase('tr') === 'bilinmiyor';
}

function normalized(value) {
  return String(value || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
}

function buildUncertaintyAssessment(result, structuredCase, evidenceContext, auditFlags) {
  const c = structuredCase || {};
  const candidates = (evidenceContext && evidenceContext.candidates) || [];
  const diagnoses = (result && result.differential_diagnoses) || [];
  const flags = Array.isArray(auditFlags) ? auditFlags : [];
  const reasons = [];
  const details = [];
  const labs = Array.isArray(c.laboratory_results) ? c.laboratory_results : [];
  const symptoms = Array.isArray(c.symptoms) ? c.symptoms : [];
  const timing = c.symptom_timing || {};
  const history = c.medical_history || {};

  const missingFields = [
    ...Object.values(timing),
    ...Object.values(history),
  ].filter(hasUnknown).length;

  if (missingFields >= 2 || (symptoms.length === 0 && labs.length === 0)) {
    reasons.push('missing_data');
    details.push('Önemli öykü veya semptom zamanlaması alanları eksik olduğu için karar güveni sınırlı.');
  }

  if (labs.length === 0) {
    reasons.push('missing_data');
    details.push('Laboratuvar sonucu bulunmadığı için laboratuvarla ayrılan adaylar güvenilir biçimde karşılaştırılamıyor.');
  }

  const labNames = labs.map((lab) => normalized(lab.name)).filter(Boolean);
  const candidateTests = candidates
    .flatMap((candidate) => Array.isArray(candidate.key_tests) ? candidate.key_tests : [])
    .map((test) => normalized(test && typeof test === 'object' ? test.test : test))
    .filter(Boolean);
  const missingCandidateTests = candidateTests.length > 0
    && candidateTests.some((test) => !labNames.some((lab) => lab.includes(test) || test.includes(lab)));
  if (missingCandidateTests) {
    reasons.push('test_needed');
    details.push('Aday tanıları birbirinden ayırabilecek önerilen test sonuçları mevcut değil.');
  }

  const significantContradictions = candidates.filter(
    (candidate) => candidate.contradiction && candidate.contradiction.severity === 'significant',
  );
  const anyContradictions = candidates.filter(
    (candidate) => candidate.contradiction && candidate.contradiction.severity !== 'none',
  );
  if (significantContradictions.length > 0 || anyContradictions.length >= 2) {
    reasons.push('contradictory_findings');
    details.push('Bazı bulgular aday tanıları zayıflatıyor; destekleyici ve karşıt kanıtlar birlikte değerlendirilmelidir.');
  }

  const ranked = [...candidates].sort((a, b) => (b.score || 0) - (a.score || 0));
  if (ranked.length >= 2) {
    const topScore = ranked[0].score || 0;
    const secondScore = ranked[1].score || 0;
    if (topScore - secondScore <= 1 || topScore <= 2) {
      reasons.push('multiple_compatible_diagnoses');
      details.push(`${ranked[0].name} ile ${ranked[1].name} mevcut kanıtlarla birbirine yakın görünüyor; ayrım için ek bilgi gerekli.`);
    }
  }

  if (candidates.length === 0 || (candidates.length > 0 && diagnoses.length === 0)) {
    reasons.push('insufficient_coverage');
    details.push('Bilgi tabanı bu vaka için yeterli aday kapsamı sağlayamadı; sonuç genellenmemelidir.');
  } else if (candidates.every((candidate) => (candidate.score || 0) <= 1)) {
    reasons.push('insufficient_coverage');
    details.push('Bilgi tabanındaki eşleşmeler zayıf olduğu için vaka kapsamı sınırlı.');
  }

  const contradictionMismatches = flags.filter((flag) => flag.type === 'contradiction_mismatch');
  const modelEvidenceMismatches = flags.filter((flag) => (
    flag.type === 'evidence_contradiction'
    || flag.type === 'unsupported_finding'
    || flag.type === 'unsupported_reasoning_finding'
    || flag.type === 'unperformed_test_reference'
  ));
  if (contradictionMismatches.length > 0 || modelEvidenceMismatches.length > 0) {
    reasons.push('model_evidence_mismatch');
    details.push('Model yanıtının bazı bölümleri kanıt katmanıyla tam örtüşmediği için güven azaltıldı.');
  }

  const uniqueReasons = unique(reasons);
  const uniqueDetails = unique(details);
  let level = 'high';
  if (uniqueReasons.length >= 3 || uniqueReasons.includes('model_evidence_mismatch')) level = 'low';
  else if (uniqueReasons.length >= 1) level = 'moderate';

  const labels = {
    high: 'Yüksek',
    moderate: 'Orta',
    low: 'Düşük',
  };

  return {
    level,
    label: labels[level],
    reasons: uniqueReasons,
    details: uniqueDetails.slice(0, 5),
    source: 'deterministic_uncertainty_engine',
  };
}

module.exports = { buildUncertaintyAssessment };
