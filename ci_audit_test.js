// ci_audit_test.js — İddia denetçisi (claimAuditor) çevrimdışı testleri.
// Dış ağ çağrısı yoktur; deterministik modüller üzerinde doğrulama yapar:
//   1) Uydurma bulgu: vakada hiç geçmeyen iddia -> unsupported_finding işareti
//   2) Gerçek bulgu: vakadaki veriyi paraphrase eden iddia -> işaret ÜRETİLMEZ
//   3) Zayıflatıcı bulgunun destekleyici sunulması -> evidence_contradiction işareti
//   4) Ölçülmemiş teste dayalı iddia -> unperformed_test_reference işareti
//   5) Çelişki şiddeti uyuşmazlığı -> contradiction_mismatch işareti
//   6) analyzeCase uçtan uca: audit_flags sonuç zarfında döner (stub ile)
const path = require('path');
const assert = require('assert');

const PROJECT = __dirname;
let failures = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  OK ${label}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${label}: ${err.message}`);
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    console.log(`  OK ${label}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${label}: ${err.message}`);
  }
}

const { normalizeAndValidate } = require(path.join(PROJECT, 'server/validation/caseNormalizer.js'));
const { buildEvidenceContext } = require(path.join(PROJECT, 'server/knowledge/evidenceService.js'));
const { parseAndValidateAiOutput } = require(path.join(PROJECT, 'server/pipeline/responseValidator.js'));
const { auditClaims } = require(path.join(PROJECT, 'server/pipeline/claimAuditor.js'));

// FMF profili taşıyan demo vaka (ci_evidence_test ile uyumlu).
const PAYLOAD = {
  patient: { age: 21, sex: 'female' },
  symptoms: [
    { key: 'recurrent_fever', label: 'Tekrarlayan ateş', duration: '2-3 gün', pattern: 'atak' },
    { key: 'abdominal_pain', label: 'Karın ağrısı', duration: '2-3 gün', pattern: 'atak' },
  ],
  laboratoryResults: [{ name: 'CRP', value: '85 mg/L', status: 'high' }],
  clinicalNote: 'Son 6 aydır her 3-4 haftada bir ateş atakları; ataklar 2-3 gün sürüyor, kendiliğinden düzeliyor.',
  symptomTiming: { attackDuration: '2-3 gün', frequency: '3-4 haftada bir', spontaneousResolution: 'Kendiliğinden düzeliyor' },
  medicalHistory: {},
  geographicHistory: { residence: 'Türkiye' },
  preliminaryAssessment: '',
};

const structuredCase = normalizeAndValidate(PAYLOAD);
const evidenceContext = buildEvidenceContext(structuredCase);

function makeModelOutput(diagnosisOverrides) {
  return {
    case_summary: 'Vakada tekrarlayan ateş ve karın ağrısı var.',
    clinical_pattern: 'Tekrarlayan ateş sendromu örüntüsü.',
    differential_diagnoses: [
      {
        name: 'Ailevi Akdeniz Ateşi (FMF)',
        relevance: 'high',
        why_considered: [],
        supporting_findings: [],
        missing_or_uncertain_information: [],
        alternative_explanations: [],
        findings_against: [],
        contradiction_assessment: { severity: 'none', verdict: '' },
        distinguishing_features: [],
        comparison_with_other_candidates: [],
        questions_to_consider: [],
        evidence_notes: [],
        key_findings_used: [],
        ...diagnosisOverrides,
      },
    ],
    important_missing_information: [],
    missing_information_priority: '',
    missing_information_impact: [],
    doctor_divergence_analysis: { agreements: [], disagreements: [], summary: '' },
    evidence_tree: { root_label: '', findings: [], diagnosis_nodes: [], links: [] },
    second_opinion: { summary: '', hypothesis_review: [], unconsidered_alternatives: [], key_question: '' },
    clinical_attention_points: [],
    uncertainty: '',
    disclaimer: '',
  };
}

async function run() {
  console.log('-- 1) Uydurma bulgu tespiti --');
  check('vakada hiç geçmeyen iddia -> unsupported_finding', () => {
    const modelOutput = makeModelOutput({
      supporting_findings: ['Hastada Çin kentine yaptığı seyahat sırasında canlı kuş pazarından temas öyküsü saptandı'],
    });
    const validated = parseAndValidateAiOutput(JSON.stringify(modelOutput), [], evidenceContext.candidates, evidenceContext.sources);
    const flags = auditClaims(validated, structuredCase, evidenceContext);
    assert(flags.some((f) => f.type === 'unsupported_finding'), 'unsupported_finding üretilmedi');
  });

  console.log('-- 2) Gerçek bulgular işaretlenmez --');
  check('vakadaki veriyi paraphrase eden iddia -> işaret yok', () => {
    const modelOutput = makeModelOutput({
      supporting_findings: ['Hastada 3-4 haftada bir tekrarlayan ateş atakları görülüyor ve ataklar kendiliğinden düzeliyor'],
    });
    const validated = parseAndValidateAiOutput(JSON.stringify(modelOutput), [], evidenceContext.candidates, evidenceContext.sources);
    const flags = auditClaims(validated, structuredCase, evidenceContext);
    assert(!flags.some((f) => f.type === 'unsupported_finding'), `yanlış pozitif: ${JSON.stringify(flags)}`);
  });

  console.log('-- 3) Zayıflatıcı bulgunun destekleyici sunulması --');
  check('kanıt katmanının zayıflatıcı işaretlediği bulgu -> evidence_contradiction', () => {
    const against = evidenceContext.candidates.find((c) => c.matched_against && c.matched_against.length > 0);
    assert(against, 'zayıflatıcı kanıtlı aday yok (test verisi uyumsuz)');
    const againstFinding = against.matched_against[0].finding;
    const modelOutput = makeModelOutput({
      name: against.name,
      supporting_findings: [againstFinding],
    });
    const validated = parseAndValidateAiOutput(JSON.stringify(modelOutput), [], evidenceContext.candidates, evidenceContext.sources);
    const flags = auditClaims(validated, structuredCase, evidenceContext);
    assert(flags.some((f) => f.type === 'evidence_contradiction'), 'evidence_contradiction üretilmedi');
  });

  console.log('-- 4) Ölçülmemiş test referansı --');
  check('hastada ölçülmemiş anahtar teste dayalı iddia -> unperformed_test_reference', () => {
    const fmf = evidenceContext.candidates.find((c) => c.key_tests && c.key_tests.length > 0);
    assert(fmf, 'key_tests içeren aday yok');
    const keyTest = typeof fmf.key_tests[0] === 'object' ? fmf.key_tests[0].test : fmf.key_tests[0];
    const modelOutput = makeModelOutput({
      // Karışık iddia: vakadaki gerçek veri + ölçülmemiş teste dayanan sonuç.
      supporting_findings: [`Hastada 3-4 haftada bir tekrarlayan ateş atakları görülüyor ve ${keyTest} sonucu pozitif olarak saptandı`],
    });
    const validated = parseAndValidateAiOutput(JSON.stringify(modelOutput), [], evidenceContext.candidates, evidenceContext.sources);
    const flags = auditClaims(validated, structuredCase, evidenceContext);
    assert(flags.some((f) => f.type === 'unperformed_test_reference'), `unperformed_test_reference üretilmedi (key_test: ${keyTest})`);
  });

  console.log('-- 5) Çelişki şiddeti uyuşmazlığı --');
  check('model none derken kanıt katmanı significant hesapladıysa -> contradiction_mismatch', () => {
    const significant = evidenceContext.candidates.find((c) => c.contradiction.severity === 'significant');
    assert(significant, 'significant çelişkili aday yok (test verisi uyumsuz)');
    const modelOutput = makeModelOutput({
      name: significant.name,
      contradiction_assessment: { severity: 'none', verdict: '' },
    });
    const validated = parseAndValidateAiOutput(JSON.stringify(modelOutput), [], evidenceContext.candidates, evidenceContext.sources);
    const flags = auditClaims(validated, structuredCase, evidenceContext);
    assert(flags.some((f) => f.type === 'contradiction_mismatch' && f.severity === 'warning'), 'contradiction_mismatch üretilmedi');
  });

  console.log('-- 6) analyzeCase uçtan uca: audit_flags sonuç zarfında --');
  let handler = null;
  const installHandler = (fn) => {
    handler = fn;
    const client = require(path.join(PROJECT, 'server/services/ai/deepseekClient.js'));
    client.createChatCompletion = async (opts) => handler(opts);
  };

  await checkAsync('audit_flags alanı sonucun içinde döner', async () => {
    installHandler(async () => ({ content: JSON.stringify(makeModelOutput({})), finishReason: 'stop' }));
    const { analyzeCase } = require(path.join(PROJECT, 'server/pipeline/analyzePipeline.js'));
    const envelope = await analyzeCase(PAYLOAD);
    assert(Array.isArray(envelope.result.audit_flags), 'audit_flags dizi değil');
  });

  console.log(failures === 0 ? '\nSONUC: TUM TESTLER GECTI' : `\nSONUC: ${failures} TEST BASARISIZ`);
  process.exitCode = failures === 0 ? 0 : 1;
}

run();
