const path = require('path');
const assert = require('assert');

const PROJECT = __dirname;

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  OK  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}\n      ${err.message}`);
  }
}

const { ANALYSIS_SCHEMA, SCHEMA_VERSION, schemaToPromptText } = require(path.join(PROJECT, 'server/schemas/analysisSchema'));
const { validateAgainstSchema, summarizeSchemaErrors } = require(path.join(PROJECT, 'server/validation/schemaValidator'));
const { extractJson, extractJsonDetailed, parseAndValidateAiOutput } = require(path.join(PROJECT, 'server/pipeline/responseValidator'));
const { buildRetryInstruction, buildSystemPrompt } = require(path.join(PROJECT, 'server/prompts/systemPrompt'));

console.log('\n[1] Şema modülü ve prompt üretimi');
check('şema nesnesi objektir ve required alanları taşır', () => {
  assert.strictEqual(ANALYSIS_SCHEMA.type, 'object');
  assert.deepStrictEqual(ANALYSIS_SCHEMA.required, ['case_summary', 'clinical_pattern', 'differential_diagnoses', 'uncertainty']);
  assert.ok(ANALYSIS_SCHEMA.properties.differential_diagnoses);
  assert.ok(ANALYSIS_SCHEMA.properties.second_opinion);
  assert.ok(ANALYSIS_SCHEMA.properties.evidence_tree);
});
check('şema sürümü tanımlı', () => {
  assert.strictEqual(typeof SCHEMA_VERSION, 'string');
  assert.ok(/^\d+\.\d+\.\d+$/.test(SCHEMA_VERSION));
});
check('üretilen prompt bloğu geçerli JSON ayrıştırılıyor (açıklama metinleri tırnak içinde)', () => {
  const block = schemaToPromptText();
  assert.ok(block.startsWith('{'));
  for (const key of Object.keys(ANALYSIS_SCHEMA.properties)) {
    assert.ok(block.includes(`"${key}"`), `blokta ${key} yok`);
  }
});
check('sistem promptu şema bloğunu içeriyor', () => {
  const prompt = buildSystemPrompt();
  assert.ok(prompt.includes('"differential_diagnoses"'));
  assert.ok(prompt.includes('Return only JSON'));
});

console.log('\n[2] JSON çıkarımı ve onarım');
check('düz JSON', () => {
  const { value, repairs } = extractJsonDetailed('{"a": 1}');
  assert.deepStrictEqual(value, { a: 1 });
  assert.deepStrictEqual(repairs, []);
});
check('JSON dışı öncü metin: "Tabii, işte analiziniz: {...}"', () => {
  const raw = 'Tabii, işte analiziniz:\n\n{"case_summary": "x", "uncertainty": "y"}';
  const { value } = extractJsonDetailed(raw);
  assert.strictEqual(value.case_summary, 'x');
});
check('markdown kod bloğu', () => {
  const raw = '```json\n{"a": 1}\n```';
  assert.deepStrictEqual(extractJson(raw), { a: 1 });
});
check('akıllı tırnak onarımı', () => {
  const raw = '{"case_summary": “hasta ateşli”, "uncertainty": "belirsiz"}';
  const { value, repairs } = extractJsonDetailed(raw);
  assert.strictEqual(value.case_summary, 'hasta ateşli');
  assert.ok(repairs.includes('smart-quotes'));
});
check('artık virgül onarımı', () => {
  const raw = '{"a": [1, 2,], "b": "x",}';
  const { value, repairs } = extractJsonDetailed(raw);
  assert.deepStrictEqual(value, { a: [1, 2], b: 'x' });
  assert.ok(repairs.includes('trailing-comma'));
});
check('kesik (token sınırında kesilmiş) JSON onarımı', () => {
  const raw = '{"case_summary": "hasta", "important_missing_information": ["ateş süresi", "döküntü"';
  const { value, repairs } = extractJsonDetailed(raw);
  assert.ok(value);
  assert.deepStrictEqual(value.important_missing_information, ['ateş süresi', 'döküntü']);
  assert.ok(repairs.includes('unclosed-brackets'));
});
check('onarılamaz bozuk çıktı -> null -> AI_INVALID_JSON (retry devreye girer)', () => {
  const raw = '{"case_summary": "ateşli hasta, "clinical_pattern": "ataklı seyir"';
  assert.strictEqual(extractJson(raw), null);
  assert.throws(() => parseAndValidateAiOutput(raw), (err) => err.code === 'AI_INVALID_JSON');
});
check('JSON içermeyen metin -> null', () => {
  assert.strictEqual(extractJson('Üzgünüm, isteğinizi anlayamadım.'), null);
});

console.log('\n[3] İki katmanlı şema doğrulaması');
const VALID_OUTPUT = JSON.stringify({
  case_summary: '21 yaş kadın; tekrarlayan ateş, döküntü, eklem ağrısı',
  clinical_pattern: 'ataklı seyir + cilt ve eklem bulguları',
  differential_diagnoses: [
    { name: 'FMF', relevance: 'high', supporting_findings: ['tekrarlayan ateş'] },
    { name: 'SLE', relevance: 'moderate' },
  ],
  uncertainty: 'atak süresi bilgisi olmadan ayrım güç',
});

check('geçerli çıktı kabul edilir + structured_output metadatası eklenir', () => {
  const out = parseAndValidateAiOutput(VALID_OUTPUT);
  assert.strictEqual(out.case_summary.includes('21 yaş'), true);
  assert.strictEqual(out.differential_diagnoses.length, 2);
  assert.ok(out.structured_output);
  assert.strictEqual(out.structured_output.validated, true);
  assert.strictEqual(out.structured_output.schema_version, SCHEMA_VERSION);
});
check('JSON dışı çöp içeren yanıt onarılarak kabul edilir', () => {
  const raw = `Tabii, işte analiziniz:\n\n\`\`\`json\n${VALID_OUTPUT}\n\`\`\`\n\nBaşka sorunuz olursa yardımcı olabilirim.`;
  const out = parseAndValidateAiOutput(raw);
  assert.strictEqual(out.structured_output.validated, true);
});
check('zorunlu alan eksik (case_summary yok) -> AI_INVALID_JSON', () => {
  assert.throws(
    () => parseAndValidateAiOutput('{"clinical_pattern": "x", "differential_diagnoses": [{"name": "A"}], "uncertainty": "u"}'),
    (err) => err.code === 'AI_INVALID_JSON',
  );
});
check('tanı listesi boş -> AI_INVALID_JSON', () => {
  assert.throws(
    () => parseAndValidateAiOutput('{"case_summary": "x", "clinical_pattern": "p", "differential_diagnoses": [], "uncertainty": "u"}'),
    (err) => err.code === 'AI_INVALID_JSON',
  );
});
check('en fazla 5 tanı (fazlası kesilir, hata değil)', () => {
  const many = JSON.stringify({
    case_summary: 'x',
    clinical_pattern: 'p',
    differential_diagnoses: Array.from({ length: 8 }, (_, i) => ({ name: `H${i}`, relevance: 'low' })),
    uncertainty: 'u',
  });
  const out = parseAndValidateAiOutput(many);
  assert.strictEqual(out.differential_diagnoses.length, 5);
});
check('geçersiz relevance güvenli değere düşer', () => {
  const out = parseAndValidateAiOutput(JSON.stringify({
    case_summary: 'x',
    clinical_pattern: 'p',
    differential_diagnoses: [{ name: 'A', relevance: 'WOW' }],
    uncertainty: 'u',
  }));
  assert.strictEqual(out.differential_diagnoses[0].relevance, 'moderate');
});
check('doğrulayıcı (schemaValidator) enum ihlali yakalar', () => {
  const r = validateAgainstSchema({ relevance: 'WOW' }, ANALYSIS_SCHEMA.properties.differential_diagnoses.items);
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.code === 'ENUM_VIOLATION'));
});
check('doğrulayıcı minItems ihlali yakalar', () => {
  const r = validateAgainstSchema([], ANALYSIS_SCHEMA.properties.differential_diagnoses);
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.code === 'MIN_ITEMS'));
});
check('summarizeSchemaErrors okunabilir özet üretir', () => {
  const r = validateAgainstSchema({}, ANALYSIS_SCHEMA);
  const summary = summarizeSchemaErrors(r.errors);
  assert.ok(summary.length > 0);
  assert.ok(summary[0].includes('$.'));
});
check('normalize edilmiş çıktı tam şemadan geçer', () => {
  const out = parseAndValidateAiOutput(VALID_OUTPUT);
  const r = validateAgainstSchema(out, ANALYSIS_SCHEMA);
  assert.strictEqual(r.valid, true, JSON.stringify(summarizeSchemaErrors(r.errors)));
});
check('retry mesajı şema hatalarını içerir', () => {
  const msg = buildRetryInstruction(['$.case_summary: zorunlu alan eksik']);
  assert.ok(msg.includes('SCHEMA VALIDATION ERRORS'));
  assert.ok(msg.includes('$.case_summary'));
});
check('retry mesajı hata yoksa ekstra bölüm içermez', () => {
  assert.strictEqual(buildRetryInstruction().includes('SCHEMA VALIDATION ERRORS'), false);
});

console.log('\n[3b] Yapılandırılmış gerekçe özeti (reasoning)');
const REASONING_OUTPUT = JSON.stringify({
  case_summary: '6 yaş erkek; tekrarlayan ateş atakları, karın ağrısı',
  clinical_pattern: 'tekrarlayan ataklı ateş + karın ağrısı',
  differential_diagnoses: [
    {
      name: 'FMF',
      relevance: 'high',
      reasoning: {
        supporting_findings: ['Tekrarlayan ateş', 'Karın ağrısı', 'Kısa ataklar', 'x'.repeat(200), 'y'.repeat(200)],
        contradicting_findings: ['Döküntü mevcut', 'Atak paterni tam tipik değil'],
        discriminative_findings: [
          { finding: 'Atakların süresi', rationale: 'FMF atakları genellikle 1-3 gün sürer' },
          { finding: 'Ataklar arasında düzelme' },
          { finding: '   ', rationale: 'boş finding elenmeli' },
          'düz string öğe elenmeli',
          null,
        ],
      },
    },
    { name: 'SLE', relevance: 'moderate', reasoning: 'bozuk tip: string olmalıydı' },
  ],
  uncertainty: 'atak süresi bilgisi olmadan ayrım güç',
});

check('reasoning üç liste olarak normalize edilir', () => {
  const out = parseAndValidateAiOutput(REASONING_OUTPUT);
  const fmf = out.differential_diagnoses.find((d) => d.name === 'FMF');
  assert.ok(fmf.reasoning);
  assert.ok(Array.isArray(fmf.reasoning.supporting_findings));
  assert.ok(fmf.reasoning.supporting_findings.includes('Tekrarlayan ateş'));
  assert.ok(fmf.reasoning.contradicting_findings.includes('Döküntü mevcut'));
  const disc = fmf.reasoning.discriminative_findings;
  assert.ok(Array.isArray(disc));
  assert.strictEqual(disc.length, 2, 'yalnızca geçerli finding nesneleri korunmalı');
  assert.strictEqual(disc[0].finding, 'Atakların süresi');
  assert.strictEqual(disc[0].rationale, 'FMF atakları genellikle 1-3 gün sürer');
  assert.strictEqual(disc[1].rationale, '');
});
check('reasoning listeleri en fazla 5 öğeye kesilir', () => {
  const out = parseAndValidateAiOutput(REASONING_OUTPUT);
  const fmf = out.differential_diagnoses.find((d) => d.name === 'FMF');
  assert.strictEqual(fmf.reasoning.supporting_findings.length, 5);
  assert.strictEqual(fmf.reasoning.contradicting_findings.length, 2);
});
check('reasoning eksikse güvenli boş yapı döner (hata değil)', () => {
  const out = parseAndValidateAiOutput(VALID_OUTPUT);
  for (const dx of out.differential_diagnoses) {
    assert.deepStrictEqual(dx.reasoning, { supporting_findings: [], contradicting_findings: [], discriminative_findings: [] });
  }
});
check('bozuk reasoning tipi güvenli boş yapıya düşer ve şemayı geçer', () => {
  const out = parseAndValidateAiOutput(REASONING_OUTPUT);
  const sle = out.differential_diagnoses.find((d) => d.name === 'SLE');
  assert.deepStrictEqual(sle.reasoning.discriminative_findings, []);
  const r = validateAgainstSchema(out, ANALYSIS_SCHEMA);
  assert.strictEqual(r.valid, true, JSON.stringify(summarizeSchemaErrors(r.errors)));
});
check('reasoning dolu çıktı tam şemadan geçer', () => {
  const out = parseAndValidateAiOutput(REASONING_OUTPUT);
  const r = validateAgainstSchema(out, ANALYSIS_SCHEMA);
  assert.strictEqual(r.valid, true, JSON.stringify(summarizeSchemaErrors(r.errors)));
});

console.log('\n[4] /api/schema uç noktası');
check('rota modülü yükleniyor', () => {
  const router = require(path.join(PROJECT, 'server/routes/api'));
  assert.ok(router && typeof router === 'function');
});

console.log(`\nSonuç: ${passed} başarılı, ${failed} başarısız`);
process.exit(failed > 0 ? 1 : 0);
