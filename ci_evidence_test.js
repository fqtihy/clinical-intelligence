// ci_evidence_test.js — Kanıt katmanı (knowledgeBase + evidenceService) çevrimdışı testleri.
// Dış ağ çağrısı yoktur; deterministik modüller üzerinde doğrulama yapar:
//   1) KB bütünlüğü (benzersiz id, kaynak referansları, pattern ağırlıkları)
//   2) Demo vaka (Türkiye, 2-3 gün ataklar, kendiliğinden düzelme) -> FMF tepede,
//      TRAPS significant çelişkiyle zayıflar, SLE/AOSD/viral adayları üretilir
//   3) Determinizm: aynı girdi -> birebir aynı çıktı
//   4) buildUserMessage: EVIDENCE CONTEXT ayrı mesaj DEĞİL, user mesajına gömülür
//      (retry testi messages.length === 2 bekler)
//   5) analyzeCase: sources kanıt katmanından doldurulur; aday filtresi
//      aday-dışı tanıyı eler, hepsi elenirse lenient fallback orijinali korur
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

const KB = require(path.join(PROJECT, 'server/knowledge/knowledgeBase.js'));
const { buildEvidenceContext } = require(path.join(PROJECT, 'server/knowledge/evidenceService.js'));
const { buildUserMessage, buildSystemPrompt } = require(path.join(PROJECT, 'server/prompts/systemPrompt.js'));
const { normalizeAndValidate } = require(path.join(PROJECT, 'server/validation/caseNormalizer.js'));

// ---- Ortak vaka: Türkiye'de yaşayan genç kadın; 2-3 gün süren, kendiliğinden
// düzelen, 3-4 haftada bir tekrarlayan ateş atakları (FMF profili).
const DEMO_PAYLOAD = {
  patient: { age: 21, sex: 'female' },
  symptoms: [
    { key: 'recurrent_fever', label: 'Tekrarlayan ateş', duration: '2-3 gün', pattern: 'atak' },
    { key: 'abdominal_pain', label: 'Karın ağrısı', duration: '2-3 gün', pattern: 'atak' },
    { key: 'joint_pain', label: 'Eklem ağrısı', duration: '2-3 gün', pattern: 'atak' },
  ],
  laboratoryResults: [
    { name: 'CRP', value: '85 mg/L', status: 'high' },
    { name: 'WBC', value: '12400', status: 'high' },
  ],
  clinicalNote: 'Son 6 aydır her 3-4 haftada bir ateş atakları; ataklar 2-3 gün sürüyor, kendiliğinden düzeliyor. Ataklar arasında hasta tamamen iyi.',
  symptomTiming: { attackDuration: '2-3 gün', frequency: '3-4 haftada bir', spontaneousResolution: 'Kendiliğinden düzeliyor' },
  medicalHistory: { familyHistory: 'Ailede benzer ateş atakları öyküsü yok' },
  geographicHistory: { residence: 'Türkiye' },
  preliminaryAssessment: 'Enfeksiyon\nFMF\nAOSD',
};

const structured = normalizeAndValidate(DEMO_PAYLOAD);
const evidence = buildEvidenceContext(structured);

async function run() {
  console.log('-- 1) KB bütünlüğü --');
  check('KB dolu ve 8 durum içeriyor', () => {
    assert(KB.length === 8, `8 durum bekleniyor, ${KB.length} var`);
  });
  check('durum id ve name benzersiz', () => {
    const ids = KB.map((k) => k.id);
    const names = KB.map((k) => k.name);
    assert(new Set(ids).size === ids.length, 'yinelenen id');
    assert(new Set(names).size === names.length, 'yinelenen name');
  });
  check('her durumda zorunlu alanlar var', () => {
    for (const k of KB) {
      assert(k.id && k.name, `${k.id || '?'} id/name eksik`);
      assert(Array.isArray(k.aliases) && k.aliases.length > 0, `${k.id} aliases eksik`);
      assert(Array.isArray(k.sources) && k.sources.length > 0, `${k.id} sources eksik`);
      assert(Array.isArray(k.supporting_patterns) && k.supporting_patterns.length > 0, `${k.id} supporting_patterns eksik`);
      assert(Array.isArray(k.key_tests) && k.key_tests.length > 0, `${k.id} key_tests eksik`);
    }
  });
  check('kaynak referansları (source_id) geçerli ve kaynak alanları tam', () => {
    for (const k of KB) {
      const sourceIds = new Set(k.sources.map((s) => s.id));
      assert(sourceIds.size === k.sources.length, `${k.id} yinelenen kaynak id`);
      for (const s of k.sources) {
        assert(s.id && s.title && s.publisher && s.year && s.type && s.url, `${k.id} kaynak ${s.id} alanları eksik`);
        assert(/^https?:\/\//.test(s.url), `${k.id} kaynak ${s.id} geçersiz url`);
      }
      const refs = [
        ...k.supporting_patterns.map((p) => p.source_id),
        ...k.excluding_patterns.map((p) => p.source_id),
        ...k.key_tests.map((t) => t.source_id),
      ];
      for (const ref of refs) {
        assert(sourceIds.has(ref), `${k.id} kaynaksız referans: ${ref}`);
      }
    }
  });
  check('pattern ağırlıkları: destek pozitif, dışlama negatif; tipler geçerli', () => {
    const validTypes = new Set(['symptom', 'lab', 'text', 'timing', 'history', 'geography', 'demographic']);
    for (const k of KB) {
      for (const p of k.supporting_patterns) {
        assert(validTypes.has(p.type), `${k.id} geçersiz pattern tipi ${p.type}`);
        assert(p.weight > 0, `${k.id} destek pattern negatif ağırlık`);
        assert(p.note && p.source_id, `${k.id} pattern note/source_id eksik`);
      }
      for (const p of k.excluding_patterns) {
        assert(p.weight < 0, `${k.id} dışlama pattern pozitif ağırlık ${p.weight}`);
      }
    }
  });

  console.log('-- 2) Demo vaka: aday üretimi + çelişki tespiti --');
  check('demo vakada adaylar üretildi ve skorla sıralandı', () => {
    assert(evidence.candidates.length >= 4, `en az 4 aday bekleniyor, ${evidence.candidates.length} var`);
    const scores = evidence.candidates.map((c) => c.score);
    assert(scores.every((s, i) => i === 0 || scores[i - 1] >= s), 'skor azalan sırada değil');
  });
  check('FMF en üstte ve çelişkisiz (desteklenir)', () => {
    const fmf = evidence.candidates.find((c) => c.id === 'fmf');
    assert(fmf, 'FMF aday değil');
    assert(fmf.score === evidence.candidates[0].score, 'FMF en üst skorda değil');
    assert(fmf.contradiction.severity === 'none', `FMF çelişkisi ${fmf.contradiction.severity} olmamalı`);
    assert(fmf.matched_supporting.length >= 3, 'FMF destekleyici kanıtı zayıf');
  });
  check('TRAPS significant çelişkiyle zayıflıyor', () => {
    const traps = evidence.candidates.find((c) => c.id === 'traps');
    assert(traps, 'TRAPS aday değil');
    assert(traps.contradiction.severity === 'significant', `TRAPS çelişkisi ${traps.contradiction.severity} olmalı (kısa ataklar atipik)`);
    assert(traps.matched_against.length >= 2, 'TRAPS zayıflatıcı kanıtı beklenenden az');
  });
  check('SLE/AOSD/viral adayları var', () => {
    const ids = evidence.candidates.map((c) => c.id);
    for (const want of ['sle', 'aosd', 'acute_viral_infection']) {
      assert(ids.includes(want), `${want} aday listesinde yok: ${ids.join(',')}`);
    }
  });
  check('kaynaklar: benzersiz, dolu, sıralı id', () => {
    assert(evidence.sources.length >= 2, 'en az 2 kaynak bekleniyor');
    assert(new Set(evidence.sources.map((s) => s.id)).size === evidence.sources.length, 'yinelenen kaynak');
    assert(evidence.sources[0].id === 'S1', 'ilk kaynak S1 olmalı');
    assert(evidence.sources.every((s) => s.title && s.url), 'kaynak alanları eksik');
  });
  check('bağlam: aday başına kanıt ve anahtar testler sınırlı', () => {
    const ctxCandidates = evidence.context.candidates;
    assert(ctxCandidates.every((c) => c.matched_supporting.length <= 6), 'destekleyici kanıt >6');
    assert(ctxCandidates.every((c) => c.matched_against.length <= 3), 'zayıflatıcı kanıt >3');
    assert(ctxCandidates.every((c) => c.key_tests.length <= 4), 'anahtar test >4');
    assert(ctxCandidates.every((c) => c.matched_supporting.every((m) => m.source_id)), 'kanıt source_id eksik');
  });
  check('boş vaka -> aday üretilemez (MIN_SCORE eşiği)', () => {
    const empty = normalizeAndValidate({
      patient: { age: 50, sex: 'male' },
      clinicalNote: 'Kontrole geldi, yakınması yok.',
      symptomTiming: {},
      medicalHistory: {},
      geographicHistory: {},
    });
    const ec = buildEvidenceContext(empty);
    assert(ec.candidates.length === 0, `aday beklenmiyor, ${ec.candidates.length} var`);
    assert(ec.sources.length === 0, 'aday yokken kaynak olmamalı');
  });

  console.log('-- 3) Determinizm --');
  check('aynı girdi -> birebir aynı bağlam', () => {
    const again = buildEvidenceContext(structured);
    assert(JSON.stringify(again) === JSON.stringify(evidence), 'çıktılar farklı');
  });

  console.log('-- 4) buildUserMessage: kanıt bağlamı user mesajına gömülür --');
  check('EVIDENCE CONTEXT tek user mesajı içinde (mesaj sayısı artmaz)', () => {
    const msg = buildUserMessage(structured, evidence);
    assert(msg.includes('STRUCTURED CASE:'), 'yapılandırılmış vaka yok');
    assert(msg.includes('EVIDENCE CONTEXT:'), 'kanıt bağlamı gömülmedi');
    assert(msg.includes('retrieval_note'), 'bağlam yönergesi yok');
    assert(msg.includes('"score"'), 'aday skorları bağlamda yok');
    // model yalnızca eşleşen kanıtları görür; ham tüm durumları değil
    assert(!msg.includes('supporting_patterns'), 'ham pattern kuralları sızmamalı');
  });
  check('bağlam verilmezse mesaj eski davranışta kalır', () => {
    const msg = buildUserMessage(structured);
    assert(!msg.includes('EVIDENCE CONTEXT:'), 'bağlam gömülmemeli');
    assert(msg.includes('STRUCTURED CASE:'), 'vaka gömülmeli');
  });
  check('sistem promptu sentez motoru + kanıt tabanlı kuralları içeriyor', () => {
    const sp = buildSystemPrompt();
    assert(/evidence-grounded synthesis engine/i.test(sp), 'rol sentez motoru değil');
    assert(sp.includes('EVIDENCE GROUNDING'), 'kanıt tabanı kuralı yok');
    assert(sp.includes('Do NOT add medical knowledge from your own memory'), 'bellek yasağı yok');
    assert(/differential_diagnoses.{0,80}ONLY candidates/i.test(sp.replace(/\s+/g, ' ')), 'aday kısıtı yok');
    assert(/\[S1\], \[S2\]/.test(sp), 'atıf stili yok');
    assert(sp.includes('The "sources" field in your JSON output stays an empty array'), 'sources kuralı yok');
  });

  console.log('-- 5) analyzeCase: sources + aday filtresi (stub ile) --');
  const { analyzeCase, parseAndValidateAiOutput } = require(path.join(PROJECT, 'server/services/ai/analysisService.js'));
  let handler = null;
  const installHandler = (fn) => {
    handler = fn;
    const client = require(path.join(PROJECT, 'server/services/ai/deepseekClient.js'));
    client.createChatCompletion = async (opts) => handler(opts);
  };

  await checkAsync('messages.length===2 ve user mesajı EVIDENCE CONTEXT içeriyor; sources dolduruldu', async () => {
    installHandler(async ({ messages }) => {
      assert(messages.length === 2, '(a) ilk istek 2 mesaj (system+user)');
      assert(messages[1].role === 'user' && messages[1].content.includes('EVIDENCE CONTEXT:'), 'kanıt bağlamı user mesajında değil');
      return { content: JSON.stringify({
        case_summary: 'Özet',
        clinical_pattern: 'Örüntü',
        differential_diagnoses: [{ name: 'Ailevi Akdeniz Ateşi (FMF)', relevance: 'high', findings_against: [], contradiction_assessment: { severity: 'none', verdict: 'v' } }],
      }), finishReason: 'stop' };
    });
    const res = await analyzeCase(DEMO_PAYLOAD);
    assert(Array.isArray(res.result.sources) && res.result.sources.length >= 2, 'sources kanıttan doldurulmadı');
    assert(res.result.sources[0].id === 'S1' && res.result.sources[0].title, 'kaynak yapısı bozuk');
    assert(res.result.differential_diagnoses[0].name === 'Ailevi Akdeniz Ateşi (FMF)', 'FMF kartı korunmadı');
  });

  await checkAsync('aday filtresi: aday-dışı tanı elenir', async () => {
    installHandler(async () => ({
      content: JSON.stringify({
        case_summary: 'Özet',
        clinical_pattern: 'Örüntü',
        differential_diagnoses: [
          { name: 'Sistemik Lupus Eritematozus (SLE)', relevance: 'high', findings_against: [], contradiction_assessment: { severity: 'none', verdict: 'v' } },
          { name: 'Kronik Böbrek Hastalığı', relevance: 'high', findings_against: [], contradiction_assessment: { severity: 'none', verdict: 'v' } },
        ],
      }),
      finishReason: 'stop',
    }));
    const res = await analyzeCase(DEMO_PAYLOAD);
    assert(res.result.differential_diagnoses.length === 1, 'aday-dışı tanı elenmedi');
    assert(res.result.differential_diagnoses[0].name.includes('Lupus'), 'SLE korunmalıydı');
  });

  await checkAsync('lenient fallback: hepsi elenirse orijinal liste korunur', async () => {
    installHandler(async () => ({
      content: JSON.stringify({
        case_summary: 'Özet',
        clinical_pattern: 'Örüntü',
        differential_diagnoses: [{ name: 'Kronik Böbrek Hastalığı', relevance: 'high', findings_against: [], contradiction_assessment: { severity: 'none', verdict: 'v' } }],
      }),
      finishReason: 'stop',
    }));
    const res = await analyzeCase(DEMO_PAYLOAD);
    assert(res.result.differential_diagnoses.length === 1, 'fallback boş liste döndü');
    assert(res.result.differential_diagnoses[0].name === 'Kronik Böbrek Hastalığı', 'fallback orijinali korumadı');
  });

  check('parseAndValidateAiOutput: candidates verilmezse filtre uygulanmaz', () => {
    const out = parseAndValidateAiOutput(JSON.stringify({
      case_summary: 'x',
      differential_diagnoses: [
        { name: 'Sistemik Lupus Eritematozus (SLE)', relevance: 'high' },
        { name: 'Kronik Böbrek Hastalığı', relevance: 'high' },
      ],
    }), []);
    assert(out.differential_diagnoses.length === 2, 'filtre uygulanmamalıydı');
  });
  check('alias eşleşmesi: kısaltma kanonik ada bağlanır', () => {
    const out = parseAndValidateAiOutput(JSON.stringify({
      case_summary: 'x',
      differential_diagnoses: [
        { name: 'SLE', relevance: 'high' },
        { name: 'FMF', relevance: 'high' },
        { name: 'Tümör', relevance: 'high' },
      ],
    }), [], evidence.candidates);
    const names = out.differential_diagnoses.map((d) => d.name);
    assert(names.includes('SLE') && names.includes('FMF'), 'alias adayları elendi');
    assert(!names.includes('Tümör'), 'aday-dışı tanı korundu');
  });

  console.log(failures === 0 ? '\nSONUC: TUM TESTLER GECTI' : `\nSONUC: ${failures} TEST BASARISIZ`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => { console.error('Test sürüşü hatası:', err); process.exit(1); });
