// KATMAN 3.5: İddia denetçisi (claim auditor).
// Modelin ürettiği klinik iddiaları, hastanın GERÇEK verisiyle (yapılandırılmış vaka)
// ve kanıt katmanının deterministik çıktısıyla karşılaştırır; uydurma/desteklenmeyen
// iddiaları KULLANICIYA İŞARETLER, sonucu sessizce silmez.
//
// Tasarım ilkesi: tıbbi karar desteğinde bilgi silmek yerine işaretlemek güvenlidir.
// Bu nedenle denetçi yalnızca audit_flags üretir; tanı kartlarını değiştirmez.
// Denetçi MODELDEN BAĞIMSIZDIR: yalnızca vaka + kanıt bağlamı + normalize edilmiş
// model çıktısı arasındaki tutarlılığa bakar.
const logger = require('../logger');
const { matchesAnyCandidate } = require('./responseValidator');

// Denetim eşikleri: yanlış pozitifleri sınırlamak için muhafazakâr seçildi.
const MIN_CLAIM_TOKENS = 3;       // Daha kısa iddialar üzerinde hüküm kurulamaz
const UNSUPPORTED_RATIO = 0.25;   // İçerik tokenlarının %25'inden azı vakada geçiyorsa uydurma şüphesi
const CONTRADICT_TOKENS = 2;      // Zayıflatıcı kanıt metniyle en az 2 ortak token = çelişkili kullanım

// Türkçe + İngilizce yaygın dolgu kelimeleri: token karşılaştırmasından çıkarılır.
const STOPWORDS = new Set([
  've', 'ile', 'için', 'icin', 'olarak', 'olan', 'olabilir', 'gibi', 'daha', 'çok', 'cok',
  'az', 'var', 'yok', 'değil', 'degil', 'ancak', 'fakat', 'kadar', 'sonra', 'önce', 'once',
  'göre', 'gore', 'ilgili', 'nedeniyle', 'uygun', 'bir', 'bu', 'şu', 'su', 'hem', 'ise',
  'the', 'and', 'of', 'in', 'is', 'are', 'with', 'for', 'not', 'on', 'to', 'may', 'can',
]);

function normText(value) {
  return String(value || '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9çğıöşü\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentTokens(text) {
  return normText(text)
    .split(' ')
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

function overlapRatio(claimTokens, corpusTokenSet) {
  if (claimTokens.length === 0) return 1;
  let hits = 0;
  for (const t of claimTokens) {
    if (corpusTokenSet.has(t)) hits += 1;
    // Kısmi kök eşleşmesi (Türkçe ekler): token korpusdaki bir tokeni içeriyorsa sayılır.
    else if ([...corpusTokenSet].some((c) => c.length >= 4 && (t.includes(c) || c.includes(t)))) hits += 1;
  }
  return hits / claimTokens.length;
}

/**
 * Vakadaki tüm gerçek veriyi tek bir token kümesine toplar.
 * @param {object} structuredCase - caseNormalizer çıktısı
 * @param {object} evidenceContext - evidenceService çıktısı (candidates + context)
 */
function buildCorpusTokens(structuredCase, evidenceContext) {
  const patientSet = buildPatientCorpusTokens(structuredCase);
  const texts = [];
  const c = structuredCase || {};

  for (const s of c.symptoms || []) texts.push(s.name);
  for (const l of c.laboratory_results || []) texts.push(l.name, l.value, l.unit);
  texts.push(c.clinical_note || '');
  for (const v of Object.values(c.symptom_timing || {})) texts.push(v);
  for (const v of Object.values(c.medical_history || {})) texts.push(v);
  for (const v of Object.values(c.geographic_and_lifestyle_history || {})) texts.push(v);

  // Kanıt katmanının eşleştirdiği kanıtlar + aday kriter notları da gerçek bağlam sayılır;
  // model bunları paraphrase edebilir, uydurma sayılmamalıdır.
  for (const cand of (evidenceContext && evidenceContext.candidates) || []) {
    for (const e of cand.matched_supporting || []) texts.push(e.finding, e.matched, e.context_snippet);
    for (const e of cand.matched_against || []) texts.push(e.finding, e.matched, e.context_snippet);
    texts.push(cand.criteria_note || '');
  }

  const set = new Set();
  for (const text of texts) for (const t of contentTokens(text)) set.add(t);
  return set;
}

// Hasta korpusu yalnızca gerçekten girilmiş hasta verilerinden oluşur.
// Bilgi tabanı notları bu kümeye eklenmez; aksi halde "ANA giriş kriteridir"
// gibi kaynak bilgileri yanlışlıkla "ANA pozitif" hasta bulgusu gibi geçebilir.
function buildPatientCorpusTokens(structuredCase) {
  const texts = [];
  const c = structuredCase || {};
  if (c.patient) texts.push(String(c.patient.age || ''), c.patient.sex || '');
  for (const s of c.symptoms || []) texts.push(s.name, s.duration, s.pattern);
  for (const l of c.laboratory_results || []) texts.push(l.name, l.value, l.unit, l.status);
  texts.push(c.clinical_note || '');
  for (const v of Object.values(c.symptom_timing || {})) texts.push(v);
  for (const v of Object.values(c.medical_history || {})) texts.push(v);
  for (const v of Object.values(c.geographic_and_lifestyle_history || {})) texts.push(v);
  const set = new Set();
  for (const text of texts) for (const t of contentTokens(text)) set.add(t);
  return set;
}

/**
 * Vakada hiç ölçülmemiş laboratuvar/test adlarının token kümeleri.
 * Kaynak: kanıt katmanının adaylarına önerdiği key_tests listesi.
 */
function buildTestNameTokens(evidenceContext) {
  const tests = [];
  for (const cand of (evidenceContext && evidenceContext.candidates) || []) {
    for (const t of cand.key_tests || []) {
      // key_tests öğeleri KB sözleşmesinde { test, rationale, source_id } objeleridir.
      tests.push(t && typeof t === 'object' ? t.test : t);
    }
  }
  return tests.map((t) => contentTokens(t)).filter((tokens) => tokens.length > 0);
}

function patientLabTokens(structuredCase) {
  const set = new Set();
  for (const l of (structuredCase && structuredCase.laboratory_results) || []) {
    for (const t of contentTokens(l.name || '')) set.add(t);
  }
  return set;
}

/**
 * Bir tanının iddialarını gerçek vaka verisiyle denetler ve işaret listesi döndürür.
 * @param {object} diagnosis - normalize edilmiş tanı kartı
 * @param {object|null} candidate - eşleşen kanıt adayı (yoksa null)
 */
function auditDiagnosis(diagnosis, candidate, corpus) {
  const flags = [];
  const { corpusTokenSet, patientTokenSet, testNameTokenSets, labTokenSet } = corpus;

  const claimFields = [
    ['supporting_findings', 'supporting_findings'],
    ['key_findings_used', 'key_findings_used'],
    ['findings_against', 'findings_against'],
  ];

  for (const [field, claimType] of claimFields) {
    for (const claim of diagnosis[field] || []) {
      const tokens = contentTokens(claim);
      if (tokens.length < MIN_CLAIM_TOKENS) continue;

      const patientRatio = overlapRatio(tokens, patientTokenSet);
      const evidenceRatio = overlapRatio(tokens, corpusTokenSet);
      if (Number.isNaN(patientRatio) || Number.isNaN(evidenceRatio)) continue;
      if (patientRatio < UNSUPPORTED_RATIO) {
        flags.push({
          type: 'unsupported_finding',
          diagnosis: diagnosis.name,
          field,
          claim: String(claim).slice(0, 200),
          detail: `Bu iddiadaki içerik ifadelerinin hastanın girilmiş verilerinde doğrulanabilir karşılığı bulunamadı (%${Math.round(patientRatio * 100)} eşleşme). Model bu bulguyu uydurmuş olabilir.`,
          severity: 'warning',
        });
      }

      // Kanıt tabanında hiç karşılığı olmayan bir ifade için aşağıdaki
      // test/çelişki kontrolleri anlamlı değildir.
      if (evidenceRatio < UNSUPPORTED_RATIO) continue;

      // Uygulanmamış test referansı: iddia, vakadaki laboratuvar sonuçlarında
      // olmayan bir anahtar teste atıf yapıyorsa işaretle.
      for (const testTokens of testNameTokenSets) {
        if (testTokens.every((t) => tokens.some((c) => c.includes(t) || t.includes(c)))) {
          const performed = testTokens.some((t) => labTokenSet.has(t));
          if (!performed) {
            flags.push({
              type: 'unperformed_test_reference',
              diagnosis: diagnosis.name,
              field,
              claim: String(claim).slice(0, 200),
              detail: 'Bu iddia hastada henüz ölçülmemiş bir laboratuvar/test sonucuna dayanıyor gibi görünüyor.',
              severity: 'warning',
            });
          }
          break;
        }
      }

      // Çelişkili kanıt kullanımı: iddia, kanıt katmanının bu tanı için ZAYIFLATICI
      // olarak eşleştirdiği bir bulguyu destekleyici gibi sunuyorsa işaretle.
      if (claimType !== 'findings_against' && candidate) {
        for (const against of candidate.matched_against || []) {
          const againstTokens = contentTokens(against.finding);
          const shared = tokens.filter((t) => againstTokens.some((a) => a.includes(t) || t.includes(a)));
          if (shared.length >= CONTRADICT_TOKENS) {
            flags.push({
              type: 'evidence_contradiction',
              diagnosis: diagnosis.name,
              field,
              claim: String(claim).slice(0, 200),
              detail: `Kanıt katmanı "${against.finding}" bulgusunu bu tanı için zayıflatıcı işaretledi; model aynı bulguyu destekleyici sunmuş.`,
              severity: 'warning',
            });
            break;
          }
        }
      }

      // Yapılandırılmış gerekçe alanları da hasta verisine dayanmalıdır.
      // discriminative_findings içindeki "ANA pozitifliği" gibi ifadeler,
      // yalnızca bilgi tabanında geçse bile hasta bulgusu kabul edilmez.
      const reasoning = diagnosis.reasoning && typeof diagnosis.reasoning === 'object'
        ? diagnosis.reasoning
        : {};
      const reasoningClaims = [
        ...(diagnosis.why_considered || []).map((claim) => ['why_considered', claim]),
        ...(reasoning.supporting_findings || []).map((claim) => ['reasoning.supporting_findings', claim]),
        ...(reasoning.contradicting_findings || []).map((claim) => ['reasoning.contradicting_findings', claim]),
        ...(reasoning.discriminative_findings || []).flatMap((item) => [
          ['reasoning.discriminative_findings', item && item.finding],
        ]),
      ];
      for (const [field, claim] of reasoningClaims) {
        const tokens = contentTokens(claim);
        if (tokens.length < MIN_CLAIM_TOKENS) continue;
        const ratio = overlapRatio(tokens, patientTokenSet);
        if (ratio < UNSUPPORTED_RATIO) {
          flags.push({
            type: 'unsupported_reasoning_finding',
            diagnosis: diagnosis.name,
            field,
            claim: String(claim).slice(0, 200),
            detail: `Bu gerekçe hastanın girilmiş verilerinde doğrulanamadı (%${Math.round(ratio * 100)} eşleşme). Kaynak bilgisi hasta bulgusu gibi kullanılmış olabilir.`,
            severity: 'warning',
          });
        }
      }

      // evidence_notes kaynak açıklamasıdır; hasta bulgusu denetimine dahil edilmez.
      // Ancak test adı referansı gibi riskli içerikler yine mevcut test kümeleriyle kontrol edilir.
      for (const claim of diagnosis.evidence_notes || []) {
        const tokens = contentTokens(claim);
        if (tokens.length < MIN_CLAIM_TOKENS) continue;
        for (const testTokens of testNameTokenSets) {
          if (testTokens.every((t) => tokens.some((c) => c.includes(t) || t.includes(c)))) {
            const performed = testTokens.some((t) => labTokenSet.has(t));
            if (!performed) {
              flags.push({
                type: 'unperformed_test_reference',
                diagnosis: diagnosis.name,
                field: 'evidence_notes',
                claim: String(claim).slice(0, 200),
                detail: 'Bu kaynak notu hastada henüz ölçülmemiş bir laboratuvar/test sonucuna atıf içeriyor olabilir.',
                severity: 'info',
              });
            }
            break;
          }
        }
      }
    }
  }

  // Çelişki şiddeti uyuşmazlığı: model "çelişki yok" derken kanıt katmanı
  // anlamlı çelişki tespit etmişse (veya tersi) işaretle.
  if (candidate) {
    const modelSeverity = diagnosis.contradiction_assessment && diagnosis.contradiction_assessment.severity;
    const evidenceSeverity = candidate.contradiction && candidate.contradiction.severity;
    if (modelSeverity !== evidenceSeverity) {
      flags.push({
        type: 'contradiction_mismatch',
        diagnosis: diagnosis.name,
        field: 'contradiction_assessment',
        claim: `model: ${modelSeverity}`,
        detail: `Kanıt katmanı bu tanı için çelişki şiddetini "${evidenceSeverity}" hesapladı; model "${modelSeverity}" bildirdi.`,
        severity: modelSeverity === 'none' && evidenceSeverity === 'significant' ? 'warning' : 'info',
      });
    }
  }

  return flags;
}

/**
 * Normalize edilmiş model çıktısını gerçek vaka + kanıt bağlamına karşı denetler.
 * @param {object} validated - responseValidator çıktısı
 * @param {object} structuredCase - caseNormalizer çıktısı
 * @param {object} evidenceContext - evidenceService çıktısı
 * @returns {Array<{type: string, diagnosis: string, field: string, claim: string, detail: string, severity: string}>}
 */
function auditClaims(validated, structuredCase, evidenceContext) {
  const corpus = {
    corpusTokenSet: buildCorpusTokens(structuredCase, evidenceContext),
    patientTokenSet: buildPatientCorpusTokens(structuredCase),
    testNameTokenSets: buildTestNameTokens(evidenceContext),
    labTokenSet: patientLabTokens(structuredCase),
  };

  const flags = [];
  for (const diagnosis of (validated && validated.differential_diagnoses) || []) {
    const candidate = matchesAnyCandidate(diagnosis.name, (evidenceContext && evidenceContext.candidates) || [])
      ? ((evidenceContext.candidates || []).find((c) => matchesAnyCandidate(diagnosis.name, [c])) || null)
      : null;
    flags.push(...auditDiagnosis(diagnosis, candidate, corpus));
  }

  if (flags.length > 0) {
    logger.warn('auditor', 'model çıktısında denetim işaretleri üretildi', {
      flagCount: flags.length,
      types: [...new Set(flags.map((f) => f.type))],
    });
  } else {
    logger.info('auditor', 'model çıktısı denetimden geçti', { flagCount: 0 });
  }

  return flags;
}

module.exports = { auditClaims };
