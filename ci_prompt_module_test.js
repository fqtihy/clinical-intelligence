// Prompt engineering modülü testi:
// 1) Bölüm modülleri: id, başlık, boş olmayan metin
// 2) Sürüm kayıt defteri: v1.0 / v1.1 / v2.0 kompozisyonları
// 3) Birleştirme + içerik karması (aynı sürüm = aynı hash, farklı sürüm = farklı hash)
// 4) Result formatter: prompt_version / prompt / model / provider metadatası
// 5) API uç noktaları: /api/prompt-versions, /api/prompt/:version
const path = require('path');
const assert = require('assert');

const PROJECT = __dirname;

let passed = 0;
let failed = 0;
const pending = [];
function check(name, fn) {
  try {
    const out = fn();
    if (out && typeof out.then === 'function') {
      // Async testler: promise beklenir ve reddi sayılır; aksi halde hatalar yutulur.
      const tracked = out.then(
        () => { passed++; console.log(`  OK  ${name}`); },
        (err) => { failed++; console.error(`FAIL  ${name}\n      ${err.message}`); },
      );
      pending.push(tracked);
      return tracked;
    } else {
      passed++;
      console.log(`  OK  ${name}`);
    }
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}\n      ${err.message}`);
  }
}

const prompts = require(path.join(PROJECT, 'server/prompts'));
const { formatAnalysisResult } = require(path.join(PROJECT, 'server/pipeline/resultFormatter'));

// ------------------------------------------------------------------
console.log('\n[1] Bölüm modülleri');
const EXPECTED_SECTIONS = [
  'system',
  'evidence_grounding',
  'differential_diagnosis',
  'contradiction',
  'structured_reasoning',
  'physician_comparison',
  'second_opinion',
  'missing_information',
  'evidence_tree',
  'json_discipline',
  'output_constraints',
];
check('tüm bölümler kayıtlı', () => {
  assert.deepStrictEqual(prompts.SECTION_IDS.slice().sort(), EXPECTED_SECTIONS.slice().sort());
});
check('index.js bölüm listesi tutarlı ve içerik üretiyor', () => {
  assert.ok(prompts.SECTION_IDS.length === 11);
  const ids = new Set(prompts.SECTION_IDS);
  assert.strictEqual(ids.size, 11, 'bölüm id tekrarı');
  // aktif sürümün metni birleştirilebilir olmalı
  const activeText = prompts.buildSystemPrompt();
  assert.ok(activeText.length > 1000, 'aktif sürüm metni çok kısa');
  assert.ok(prompts.SECTION_IDS.includes('second_opinion'));
  assert.ok(prompts.SECTION_IDS.includes('json_discipline'));
  assert.ok(prompts.SECTION_IDS.includes('structured_reasoning'));
});
check('bölüm dosyaları tek tek yüklenebilir ve metin üretir', () => {
  const files = {
    system: 'systemPrompt.js',
    evidence_grounding: 'evidenceGroundingPrompt.js',
    differential_diagnosis: 'differentialDiagnosisPrompt.js',
    contradiction: 'contradictionPrompt.js',
    physician_comparison: 'physicianComparisonPrompt.js',
    second_opinion: 'secondOpinionPrompt.js',
    missing_information: 'missingInformationPrompt.js',
    evidence_tree: 'evidenceTreePrompt.js',
    json_discipline: 'jsonDisciplinePrompt.js',
    output_constraints: 'outputConstraintsPrompt.js',
    structured_reasoning: 'structuredReasoningPrompt.js',
  };
  const seen = new Set();
  for (const [expectedId, file] of Object.entries(files)) {
    const section = require(path.join(PROJECT, 'server/prompts/sections', file));
    assert.strictEqual(section.id, expectedId, `dosya ${file} id=${section.id} beklenen=${expectedId}`);
    assert.ok(typeof section.title === 'string' && section.title.length > 0);
    const text = section.build();
    assert.ok(typeof text === 'string' && text.trim().length > 50, `bölüm ${expectedId} metni çok kısa`);
    assert.ok(!seen.has(section.id), 'id tekrarı');
    seen.add(section.id);
  }
});
check('kullanıcı mesajı ve retry mesajı üretimi çalışıyor', () => {
  const msg = prompts.buildUserMessage({ patient: 'x' }, { context: { sources: [] } });
  assert.ok(msg.includes('STRUCTURED CASE'));
  assert.ok(msg.includes('EVIDENCE CONTEXT'));
  const retry = prompts.buildRetryInstruction(['$.a: hata']);
  assert.ok(retry.includes('SCHEMA VALIDATION ERRORS'));
});

// ------------------------------------------------------------------
console.log('\n[2] Sürüm kayıt defteri');
check('v1.0, v1.1, v2.0, v3.0 kayıtlı; varsayılan en güncül stable', () => {
  const list = prompts.listPromptVersions();
  const versions = list.map((v) => v.version);
  assert.ok(versions.includes('1.0') && versions.includes('1.1') && versions.includes('2.0') && versions.includes('3.0'));
  assert.strictEqual(prompts.DEFAULT_VERSION, '3.0');
  const v3 = list.find((v) => v.version === '3.0');
  assert.strictEqual(v3.status, 'stable');
});
check('v1.1 = v1.0 + json_discipline yaması', () => {
  const v1 = prompts.listPromptVersions().find((v) => v.version === '1.0');
  const v11 = prompts.listPromptVersions().find((v) => v.version === '1.1');
  assert.ok(!v1.sections.includes('json_discipline'));
  assert.ok(v11.sections.includes('json_discipline'));
  const withoutPatch = v11.sections.filter((s) => s !== 'json_discipline');
  assert.deepStrictEqual(withoutPatch, v1.sections);
});
check('v2.0 ikinci görüş motorunu ayrı bölüme alır', () => {
  const v2 = prompts.listPromptVersions().find((v) => v.version === '2.0');
  assert.ok(v2.sections.includes('second_opinion'));
  const idxPhys = v2.sections.indexOf('physician_comparison');
  const idxSecond = v2.sections.indexOf('second_opinion');
  assert.ok(idxSecond === idxPhys + 1, 'second_opinion physician_comparison sonrası gelmeli');
});
check('v3.0 structured_reasoning bölümünü contradiction sonrası alır', () => {
  const v3 = prompts.listPromptVersions().find((v) => v.version === '3.0');
  assert.ok(v3.sections.includes('structured_reasoning'));
  const idxContra = v3.sections.indexOf('contradiction');
  const idxReasoning = v3.sections.indexOf('structured_reasoning');
  assert.ok(idxContra >= 0, 'contradiction bölümü v3.0da olmalı');
  assert.strictEqual(idxReasoning, idxContra + 1, 'structured_reasoning contradiction sonrası gelmeli');
});

// ------------------------------------------------------------------
console.log('\n[3] Birleştirme ve içerik karması');
check('her sürüm birleştirilebilir; farklı sürümler farklı metinler', () => {
  const texts = {
    '1.0': prompts.buildSystemPrompt('1.0'),
    '1.1': prompts.buildSystemPrompt('1.1'),
    '2.0': prompts.buildSystemPrompt('2.0'),
    '3.0': prompts.buildSystemPrompt('3.0'),
  };
  assert.notStrictEqual(texts['1.0'], texts['1.1']);
  assert.notStrictEqual(texts['1.1'], texts['2.0']);
  assert.notStrictEqual(texts['2.0'], texts['3.0']);
  // v3.0 yapılandırılmış gerekçe özeti bölümünü içerir
  assert.ok(texts['3.0'].includes('YAPILANDIRILMIŞ GEREKÇE ÖZETİ'));
  assert.ok(texts['3.0'].includes('reasoning.supporting_findings'));
  assert.ok(texts['3.0'].includes('reasoning.discriminative_findings'));
  assert.ok(!texts['2.0'].includes('YAPILANDIRILMIŞ GEREKÇE ÖZETİ'));
  // v1.1 = v1.0 + json_discipline
  assert.ok(texts['1.1'].includes('JSON OUTPUT DISCIPLINE'));
  assert.ok(!texts['1.0'].includes('JSON OUTPUT DISCIPLINE'));
  // v2.0 hem disiplini hem ayrı ikinci görüş bölümünü içerir
  assert.ok(texts['2.0'].includes('JSON OUTPUT DISCIPLINE'));
  assert.ok(texts['2.0'].includes('İKİNCİ GÖRÜŞ MOTORU'));
  assert.ok(texts['2.0'].includes('Your answer must be valid JSON matching exactly this schema'));
});
check('bilinmeyen sürüm buildSystemPrompt\'ta hata fırlatır', () => {
  assert.throws(() => prompts.buildSystemPrompt('9.9'));
});
check('aynı sürümün karması kararlı; sürümler arası farklı', () => {
  const h1a = prompts.contentHash(prompts.buildSystemPrompt('1.0'));
  const h1b = prompts.contentHash(prompts.buildSystemPrompt('1.0'));
  const h2 = prompts.contentHash(prompts.buildSystemPrompt('2.0'));
  assert.strictEqual(h1a, h1b);
  assert.notStrictEqual(h1a, h2);
  assert.ok(/^[0-9a-f]{12}$/.test(h1a));
});
check('aktif sürüm bilgisi tutarlı (getPromptInfo)', () => {
  const info = prompts.getPromptInfo();
  assert.strictEqual(info.version, prompts.DEFAULT_VERSION);
  assert.strictEqual(info.status, 'stable');
  assert.strictEqual(info.char_count, prompts.buildSystemPrompt().length);
  assert.strictEqual(info.content_hash, prompts.contentHash(prompts.buildSystemPrompt()));
  const activeDef = prompts.listPromptVersions().find((v) => v.version === info.version);
  assert.ok(activeDef);
  assert.ok(info.sections.length === activeDef.sectionCount);
});
check('aktif buildSystemPrompt() = sürümlü çağrıyla aynı metin', () => {
  assert.strictEqual(prompts.buildSystemPrompt(), prompts.buildSystemPrompt(prompts.DEFAULT_VERSION));
});

// ------------------------------------------------------------------
console.log('\n[4] Result formatter metadatası');
check('prompt_version + prompt + model/provider sonuç zarfına eklenir', () => {
  const out = formatAnalysisResult(
    { case_id: 'c1' },
    { case_summary: 'x', differential_diagnoses: [{ name: 'A', relevance: 'high' }] },
    { provider: 'deepseek', model: 'deepseek-chat' },
    prompts.getPromptInfo(),
  );
  assert.strictEqual(out.prompt_version, prompts.DEFAULT_VERSION);
  assert.strictEqual(out.model, 'deepseek-chat');
  assert.strictEqual(out.provider, 'deepseek');
  assert.ok(out.prompt);
  assert.strictEqual(out.prompt.version, prompts.DEFAULT_VERSION);
  assert.ok(out.prompt.content_hash);
  assert.ok(out.prompt.sections.length === prompts.getPromptInfo().sections.length);
  assert.ok(out.analyzedAt);
});
check('promptInfo verilmezse zarf yine de üretilir (null alanlar)', () => {
  const out = formatAnalysisResult({}, {}, { provider: 'mock', model: 'm' });
  assert.strictEqual(out.prompt_version, null);
  assert.strictEqual(out.prompt.version, null);
  assert.strictEqual(out.model, 'm');
});

// ------------------------------------------------------------------
console.log('\n[5] API uç noktaları (canlı express)');
async function httpTest() {
  const express = require(path.join(PROJECT, 'node_modules/express'));
  const router = require(path.join(PROJECT, 'server/routes/api'));
  const app = express();
  app.use('/api', router);
  const server = app.listen(0);
  await new Promise((r) => server.on('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  await check('GET /api/prompt-versions: aktif sürüm + liste', async () => {
    const res = await fetch(`${base}/prompt-versions`);
    const body = await res.json();
    assert.ok(body.ok);
    assert.strictEqual(body.active_version, prompts.DEFAULT_VERSION);
    assert.ok(Array.isArray(body.versions) && body.versions.length >= 4);
    assert.ok(body.versions.every((v) => v.sections && v.notes));
  });

  await check('GET /api/prompt/2.0: birleştirilmiş metin + hash', async () => {
    const res = await fetch(`${base}/prompt/2.0`);
    const body = await res.json();
    assert.ok(body.ok);
    assert.strictEqual(body.version, '2.0');
    assert.ok(body.char_count > 1000);
    assert.ok(/^[0-9a-f]{12}$/.test(body.content_hash));
    assert.ok(body.system_prompt.includes('İKİNCİ GÖRÜŞ MOTORU'));
  });

  await check('GET /api/prompt/9.9: 404 PROMPT_VERSION_NOT_FOUND', async () => {
    const res = await fetch(`${base}/prompt/9.9`);
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'PROMPT_VERSION_NOT_FOUND');
  });

  await new Promise((r) => server.close(r));
}

(async () => {
  await httpTest();
  await Promise.all(pending);
  console.log(`\nSonuç: ${passed} başarılı, ${failed} başarısız`);
  process.exit(failed > 0 ? 1 : 0);
})();
