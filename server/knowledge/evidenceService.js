// Kanıta dayalı çıkarım motoru.
// Pipeline: yapılandırılmış vaka -> aday hastalıklar (kaynak tabanı taraması) ->
//           kanıt çıkarımı (destekleyici/zayıflatıcı) -> çelişki tespiti -> AI sentezi.
//
// Bu modül yalnızca server/knowledge/knowledgeBase.js içindeki kürasyonlu kaynakları kullanır;
// dış ağ çağrısı yoktur, tamamen deterministiktir (çevrimdışı test edilebilir).
const KB = require('./knowledgeBase');

const MIN_SCORE = 1;          // Bir adayın listeye girebilmesi için gereken minimum puan
const MAX_CANDIDATES = 8;     // AI'a iletilecek en fazla aday sayısı
const MAX_SUPPORTING = 6;     // Aday başına AI'a iletilecek en fazla destekleyici kanıt
const MAX_AGAINST = 3;        // Aday başına en fazla zayıflatıcı kanıt
const MAX_KEY_TESTS = 4;      // Aday başına en fazla anahtar test

const SEVERITY_THRESHOLD = 4; // Zayıflatıcı kanıt ağırlık toplamı bu değeri aşarsa çelişki 'significant'

function norm(value) {
  return String(value || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
}

/**
 * Yapılandırılmış vakayı kanıt eşlemesi için aranabilir korpusa çevirir.
 * @param {object} c - caseNormalizer çıktısı
 */
function buildCorpus(c) {
  const patient = c.patient || {};
  const symptoms = Array.isArray(c.symptoms) ? c.symptoms : [];
  const labs = Array.isArray(c.laboratory_results) ? c.laboratory_results : [];

  const symptomTexts = symptoms.map((s) => s.name).filter(Boolean);
  const otherText = symptoms
    .filter((s) => typeof s.name === 'string' && s.name.startsWith('other'))
    .map((s) => s.name)
    .join(' ');

  const labsCorpus = labs
    .filter((l) => l && l.name)
    .map((l) => ({ name: norm(l.name), status: norm(l.status) }));

  const texts = [
    c.clinical_note || '',
    otherText,
  ].filter(Boolean);

  const timingValues = Object.values(c.symptom_timing || {}).filter(Boolean);
  const historyValues = Object.values(c.medical_history || {}).filter(Boolean);
  const geographyValues = Object.values(c.geographic_and_lifestyle_history || {}).filter(Boolean);

  const age = typeof patient.age === 'number' ? patient.age : null;
  const sex = norm(patient.sex);

  return { symptomTexts, labsCorpus, texts, timingValues, historyValues, geographyValues, age, sex };
}

function textIncludes(list, term) {
  const t = norm(term);
  if (!t) return null;
  for (const value of list) {
    const n = norm(value);
    if (n && n.includes(t)) return value;
  }
  return null;
}

// Bir listede verilen terimlerden HERHANGİ birini arar (pattern'lerdeki tüm eş anlamlılar denenir).
function matchAnyTerm(list, terms) {
  for (const term of terms || []) {
    const hit = textIncludes(list, term);
    if (hit) return { term, context: hit };
  }
  return null;
}

/**
 * Tek bir kalıbı vaka korpusuna karşı eşleştirir.
 * @returns {{term: string, context: string}|null} Eşleşen terim ve bağlam (kısaltılmış)
 */
function matchPattern(pattern, corpus) {
  switch (pattern.type) {
    case 'symptom': {
      const hit = matchAnyTerm(corpus.symptomTexts, pattern.terms);
      if (hit) return hit;
      return null;
    }
    case 'text': {
      const hit = matchAnyTerm(corpus.texts, pattern.terms);
      if (hit) return hit;
      return null;
    }
    case 'lab': {
      const target = norm(pattern.name);
      for (const lab of corpus.labsCorpus) {
        if (lab.name.includes(target) || target.includes(lab.name)) {
          if (pattern.status && lab.status !== norm(pattern.status)) continue;
          return { term: pattern.name, context: `${lab.name} (${lab.status || 'normal'})` };
        }
      }
      return null;
    }
    case 'timing': {
      const hit = matchAnyTerm(corpus.timingValues, pattern.terms);
      if (hit) return hit;
      return null;
    }
    case 'history': {
      const hit = matchAnyTerm(corpus.historyValues, pattern.terms);
      if (hit) return hit;
      return null;
    }
    case 'geography': {
      const hit = matchAnyTerm(corpus.geographyValues, pattern.terms);
      if (hit) return hit;
      return null;
    }
    case 'demographic': {
      if (pattern.sex && corpus.sex !== pattern.sex) return null;
      if (corpus.age === null) return null;
      if (pattern.ageMin !== undefined && corpus.age < pattern.ageMin) return null;
      if (pattern.ageMax !== undefined && corpus.age > pattern.ageMax) return null;
      return { term: `yaş ${corpus.age} / ${corpus.sex}`, context: `yaş=${corpus.age}, cinsiyet=${corpus.sex}` };
    }
    default:
      return null;
  }
}

function evidenceItem(pattern, match) {
  return {
    finding: pattern.note,
    matched: match.term,
    context_snippet: String(match.context || '').slice(0, 60),
    strength: pattern.strength || 'low',
    source_id: pattern.source_id,
    weight: pattern.weight,
  };
}

/**
 * Tek durum için puanı ve eşleşen kanıtları hesaplar.
 */
function scoreCondition(condition, corpus) {
  const supporting = [];
  const against = [];
  let score = 0;

  for (const pattern of condition.supporting_patterns || []) {
    const match = matchPattern(pattern, corpus);
    if (match) {
      supporting.push(evidenceItem(pattern, match));
      score += pattern.weight;
    }
  }
  for (const pattern of condition.excluding_patterns || []) {
    const match = matchPattern(pattern, corpus);
    if (match) {
      against.push(evidenceItem(pattern, match));
      // Zayıflatıcı kanıt skoru DEĞİŞTİRMEZ; çelişki şiddetini (contradiction) belirler.
      // Aday sıralaması destekleyici kanıt gücüne dayanır, karşıt kanıt ayrı raporlanır.
    }
  }

  return { condition, score, supporting, against };
}

/**
 * Yapılandırılmış vakadan kanıt bağlamı üretir.
 * @param {object} structuredCase - caseNormalizer çıktısı
 * @returns {{ candidates: Array, sources: Array, context: object, trail: Array }}
 */
function buildEvidenceContext(structuredCase) {
  const corpus = buildCorpus(structuredCase);

  const scored = KB
    .map((condition) => scoreCondition(condition, corpus))
    .filter((entry) => entry.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, MAX_CANDIDATES);

  // Çelişki tespiti: zayıflatıcı kanıt ağırlıklarının toplamına göre şiddet.
  const candidates = top.map((entry) => {
    // KB'de zayıflatıcı kanıt ağırlıkları negatiftir; şiddet için büyüklük kullanılır.
    const againstWeight = Math.abs(entry.against.reduce((sum, item) => sum + item.weight, 0));
    const severity = againstWeight === 0 ? 'none' : (againstWeight >= SEVERITY_THRESHOLD ? 'significant' : 'minor');
    return {
      id: entry.condition.id,
      name: entry.condition.name,
      aliases: entry.condition.aliases,
      category: entry.condition.category,
      score: entry.score,
      epidemiology_note: entry.condition.epidemiology_note || '',
      criteria_note: entry.condition.criteria_note || '',
      matched_supporting: entry.supporting,
      matched_against: entry.against,
      key_tests: (entry.condition.key_tests || []).slice(0, MAX_KEY_TESTS),
      contradiction: {
        severity,
        against_weight: againstWeight,
      },
      sources: entry.condition.sources.map((s) => s.id),
    };
  });

  // Kaynaklar: adayların kullandığı kaynakların birleşimi (sıra korunur).
  const seen = new Set();
  const sources = [];
  for (const candidate of candidates) {
    for (const source of KB.find((k) => k.id === candidate.id).sources) {
      if (!seen.has(source.id)) {
        seen.add(source.id);
        sources.push(source);
      }
    }
  }

  // AI'a gidecek sıkılaştırılmış bağlam.
  const context = {
    retrieval_note: 'Aşağıdaki kanıtlar sunucu tarafında güvenilir tıbbi kaynaklardan (sınıflama kriterleri ve kılavuzlar) çıkarılmıştır. Model tıbbi bilgiyi kendi belleğinden EKLEMEZ; yalnızca bu bağlamdaki kanıtlar üzerinden akıl yürütür.',
    candidates: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      score: c.score,
      criteria_note: c.criteria_note,
      matched_supporting: c.matched_supporting.slice(0, MAX_SUPPORTING),
      matched_against: c.matched_against.slice(0, MAX_AGAINST),
      key_tests: c.key_tests,
    })),
    sources,
  };

  return { candidates, sources, context, trail: scored };
}

module.exports = { buildEvidenceContext, buildCorpus, MIN_SCORE, MAX_CANDIDATES };
