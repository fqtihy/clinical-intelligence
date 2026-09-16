// KATMAN 3: Yanıt doğrulayıcı (response validator).
// Modelden dönen ham içeriği parse eder, şemaya göre doğrular, kanıt aday filtresini
// uygular ve güvenli/normalleştirilmiş sonuç nesnesi üretir.
// Bu katman MODELDEN BAĞIMSIZDIR: DeepSeek, OpenAI veya mock fark etmez;
// sözleşme "ham metin -> şemaya uygun sonuç nesnesi"dir.
//
// STRUCTURED OUTPUT hattı:
//   1) Ham metin -> JSON çıkarımı (onarımlı: markdown çiti, akıllı tırnak, artık virgül,
//      kesik çıktı -> kapatılmamış parantezler)
//   2) Ham şema denetimi  (gözlemlenebilirlik: ihlaller loglanır)
//   3) Lenient normalizasyon (bozuk ama onarılabilir alanlar güvenli değerlere çekilir)
//   4) KESİN şema denetimi (normalize sonrası hâlâ şema dışıysa yanıt REDDEDİLİR)
// Şema: server/schemas/analysisSchema.js (tek doğruluk kaynağı; prompt da buradan üretilir).
const logger = require('../logger');
const { ApiError } = require('../middleware/errorHandler');
const { ANALYSIS_SCHEMA, SCHEMA_VERSION } = require('../schemas/analysisSchema');
const { validateAgainstSchema, summarizeSchemaErrors } = require('../validation/schemaValidator');

const RELEVANCE_VALUES = new Set(['high', 'moderate', 'low']);
const CONTRADICTION_SEVERITIES = new Set(['none', 'minor', 'significant']);

// Kanıt ağacı sabitleri: yalnızca açıklanabilir ilişkiler kabul edilir.
const EVIDENCE_TREE_TYPES = new Set(['symptom', 'laboratory', 'history', 'pattern']);
const EVIDENCE_LINK_TYPES = new Set(['supports', 'weakens']);

// İkinci görüş motoru: doktor hipotezlerinin kanıta göre durumu.
const HYPOTHESIS_STATUSES = new Set(['supported', 'challenged', 'reconsider']);

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim());
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Tanı adlarını birebir karşılaştırma için normalize eder (doktor listesi eşleşmesi).
 */
function normalizeName(value) {
  return asString(value).toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
}

/**
 * Modelin ürettiği tanı adını kanıt katmanı adaylarıyla eşleştirir (canonical ad + alias).
 */
function matchesAnyCandidate(name, candidates) {
  const target = normalizeName(name);
  if (!target || !Array.isArray(candidates) || candidates.length === 0) return false;
  return candidates.some((c) => {
    const names = [c.name, ...(Array.isArray(c.aliases) ? c.aliases : [])]
      .map(normalizeName)
      .filter(Boolean);
    return names.some((alias) => alias === target || target.includes(alias) || alias.includes(target));
  });
}

// "AI neden bunu yaptı?" motoru: yapılandırılmış gerekçe özeti (gizli düşünce
// zinciri DEĞİL). Üç liste: destekleyen (✓), zayıflatan (⚠), ayırt edici (★).
// Lenient: model alanı hiç üretmezse boş yapı döner; frontend boş bloğu gizler.
function normalizeReasoning(value) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const discriminative = Array.isArray(src.discriminative_findings)
    ? src.discriminative_findings
        .filter((d) => d && typeof d === 'object')
        .map((d) => ({ finding: asString(d.finding), rationale: asString(d.rationale) }))
        .filter((d) => d.finding)
        .slice(0, 5)
    : [];
  return {
    supporting_findings: asStringArray(src.supporting_findings).slice(0, 5),
    contradicting_findings: asStringArray(src.contradicting_findings).slice(0, 5),
    discriminative_findings: discriminative,
  };
}

/**
 * Kesik/bozuk JSON'da dizgeye duyarlı tarama ile dengesiz kapatıcıları ekler.
 * Token sınırına takılan (finishReason=length) çıktıların büyük kısmını kurtarır.
 */
function closeUnbalanced(text) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}' || ch === ']') {
      stack.pop();
    }
  }
  if (stack.length === 0 && !inString) return { text, closed: false };

  let out = text;
  if (inString) out += '"';
  // Dizge kapatıldıktan sonra sonda asılı kalan virgülü temizle
  out = out.replace(/,(\s*)$/, '$1');
  while (stack.length > 0) {
    const open = stack.pop();
    out += open === '{' ? '}' : ']';
  }
  return { text: out, closed: true };
}

/**
 * Model yanıtından JSON nesnesini sağlam biçimde çıkarır ve uygulanan onarımları bildirir.
 * "Tabii, işte analiziniz: { ... }" gibi JSON dışı öncü/arka metinler, markdown kod blokları,
 * akıllı tırnaklar, artık virgüller ve token sınırında kesilmiş nesneler tolere edilir.
 * @param {string} content
 * @returns {{ value: any|null, repairs: string[] }}
 */
function extractJsonDetailed(content) {
  const repairs = [];
  if (typeof content !== 'string') return { value: null, repairs };

  // 1) Markdown kod bloğu sarmalayıcılarını temizle
  let text = content.trim().replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  // 2) Akıllı tırnakları düzelt (bazı modeller \u201C \u201D üretir)
  const deQuoted = text.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  if (deQuoted !== text) {
    repairs.push('smart-quotes');
    text = deQuoted;
  }

  // 3) JSON dışı açıklamaları at: ilk '{' ile son '}' arası (yoksa ilk '{'tan sona kadar)
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return { value: null, repairs };
  const lastBrace = text.lastIndexOf('}');
  const candidate = lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1) : text.slice(firstBrace);

  try {
    return { value: JSON.parse(candidate), repairs };
  } catch {
    // onarma aşamasına geç
  }

  // 4a) Sondaki virgüller ("a": 1,} gibi)
  const noTrailing = candidate.replace(/,(\s*[}\]])/g, '$1');
  if (noTrailing !== candidate) {
    repairs.push('trailing-comma');
    try {
      return { value: JSON.parse(noTrailing), repairs };
    } catch {
      // sonraki onarıma geç
    }
  }

  // 4b) Kesik çıktı onarımı: kapatılmamış dizge/parantezleri tamamla
  const closed = closeUnbalanced(candidate);
  if (closed.closed) {
    repairs.push('unclosed-brackets');
    try {
      return { value: JSON.parse(closed.text), repairs };
    } catch {
      // kurtarılamadı
    }
  }

  return { value: null, repairs };
}

/**
 * Model yanıtından JSON nesnesini sağlam biçimde çıkarır.
 * Markdown kod blokları (```json ... ```) ve JSON dışı açıklamalar tolere edilir.
 * @param {string} content
 * @returns {any|null} Ayrıştırılan değer; ayrıştırılamazsa null
 */
function extractJson(content) {
  return extractJsonDetailed(content).value;
}

function normalizeEvidenceTree(raw) {
  const tree = raw && typeof raw === 'object' ? raw : {};
  const findings = Array.isArray(tree.findings) ? tree.findings : [];
  const dxNodes = Array.isArray(tree.diagnosis_nodes) ? tree.diagnosis_nodes : [];
  const links = Array.isArray(tree.links) ? tree.links : [];

  // Bulgular: id + label zorunlu; tür whitelist dışıysa "other"a düşer (veri kaybı olmaz).
  const normalizedFindings = findings
    .filter((f) => f && typeof f === 'object' && asString(f.id) && asString(f.label))
    .map((f) => {
      const type = asString(f.type).toLowerCase();
      return {
        id: asString(f.id),
        label: asString(f.label),
        type: EVIDENCE_TREE_TYPES.has(type) ? type : 'other',
        detail: asString(f.detail),
      };
    });
  const findingIds = new Set(normalizedFindings.map((f) => f.id));

  // Tanı düğümleri: id + label zorunlu; doğrulayıcı ipuçları en fazla 4 öğe.
  const normalizedDxNodes = dxNodes
    .filter((n) => n && typeof n === 'object' && asString(n.id) && asString(n.label))
    .map((n) => ({
      id: asString(n.id),
      label: asString(n.label),
      conclusion: asString(n.conclusion),
      confirmatory_clues: asStringArray(n.confirmatory_clues).slice(0, 4),
    }));
  const dxIds = new Set(normalizedDxNodes.map((n) => n.id));

  // Bağlantılar: yalnızca gerçek düğümlere işaret edenler korunur; geçersiz tür supports'a düşer.
  const normalizedLinks = links
    .filter((l) => l && typeof l === 'object' && findingIds.has(asString(l.from)) && dxIds.has(asString(l.to)))
    .map((l) => {
      const type = asString(l.type).toLowerCase();
      return {
        from: asString(l.from),
        to: asString(l.to),
        type: EVIDENCE_LINK_TYPES.has(type) ? type : 'supports',
      };
    });

  return {
    root_label: asString(tree.root_label),
    findings: normalizedFindings,
    diagnosis_nodes: normalizedDxNodes,
    links: normalizedLinks,
  };
}

/**
 * İkinci görüş motoru çıktısını normalize eder.
 * Bütünlük kuralı: hypothesis_review YALNIZCA doktor listesindeki tanılar için,
 * unconsidered_alternatives YALNIZCA doktor listesinde OLMAYAN tanılar için üretilir.
 * Doktor listesi boşsa alan tamamen boş döner (ürünün ana değeri doktor düşüncesini
 * test etmek olduğu için doktor listesi olmadan bu bölüm anlamsızdır).
 * @param {any} raw - Modelin döndürdüğü ham second_opinion alanı
 * @param {string[]} doctorList - Doktorun ön değerlendirme listesi
 */
function normalizeSecondOpinion(raw, doctorList) {
  if (!Array.isArray(doctorList) || doctorList.length === 0) {
    return { summary: '', hypothesis_review: [], unconsidered_alternatives: [], key_question: '' };
  }

  const so = raw && typeof raw === 'object' ? raw : {};
  const doctorNames = new Set(doctorList.map(normalizeName).filter(Boolean));

  // Hipotez incelemesi: yalnızca doktorun listesindeki tanılar kabul edilir.
  // Geçersiz status "challenged"a düşer (hipotez henüz desteklenmemiştir, elenmez).
  const hypothesisReview = Array.isArray(so.hypothesis_review)
    ? so.hypothesis_review
        .filter((h) => h && typeof h === 'object' && doctorNames.has(normalizeName(h.diagnosis)))
        .map((h) => {
          const status = asString(h.status).toLowerCase();
          return {
            diagnosis: asString(h.diagnosis),
            status: HYPOTHESIS_STATUSES.has(status) ? status : 'challenged',
            supporting_findings: asStringArray(h.supporting_findings),
            challenging_findings: asStringArray(h.challenging_findings),
            recommendation: asString(h.recommendation),
          };
        })
        .filter((h) => h.diagnosis)
    : [];

  // Düşünülmeyen alternatifler: doktor listesinde OLMAYAN tanılar; en fazla 3.
  const unconsideredAlternatives = Array.isArray(so.unconsidered_alternatives)
    ? so.unconsidered_alternatives
        .filter((a) => a && typeof a === 'object' && !doctorNames.has(normalizeName(a.diagnosis)))
        .map((a) => ({
          diagnosis: asString(a.diagnosis),
          why_should_be_considered: asString(a.why_should_be_considered),
          key_evidence_to_gather: asString(a.key_evidence_to_gather),
        }))
        .filter((a) => a.diagnosis)
        .slice(0, 3)
    : [];

  return {
    summary: asString(so.summary),
    hypothesis_review: hypothesisReview,
    unconsidered_alternatives: unconsideredAlternatives,
    key_question: asString(so.key_question),
  };
}

/**
 * Modelden dönen ham içeriği parse eder ve şemayı doğrular.
 * Geçersiz JSON veya şema ihlali güvenli biçimde hataya dönüştürülür.
 * @param {string} content - Modelin ham içeriği (hangi model olursa olsun)
 * @param {string[]} [doctorList] - Doktorun ön değerlendirme listesi
 * @param {Array} [candidates] - Kanıt katmanı adayları; VERİLDİĞİNDE model çıktısı
 *   yalnızca bu adaylara indirgenir. Tüm tanılar elenirse orijinal liste korunur
 *   (lenient fallback): agresif eleme doktor için bilgi kaybına yol açmamalıdır.
 * @param {Array} [evidenceSources] - Kanıt katmanının kaynak listesi; sonuca yazılır.
 * @throws {ApiError} code=AI_INVALID_JSON
 */
// "Bir sonraki en değerli bilgi nedir?" motoru: modelin seçimini güvenli yapıya çeker.
// affected_diagnoses gerçek aday listesine indirgenir; bozuk girdi güvenli boş yapıya döner.
function normalizeNextBestInformation(value, diagnosisNames) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const allowedNames = new Set(diagnosisNames);
  const filterNames = (list) => (Array.isArray(list) ? list : [])
    .filter((n) => typeof n === 'string' && allowedNames.has(n))
    .slice(0, 4);

  const top = src.top && typeof src.top === 'object' && !Array.isArray(src.top)
    ? {
        information: asString(src.top.information),
        question: asString(src.top.question),
        why_most_valuable: asString(src.top.why_most_valuable),
        affected_diagnoses: filterNames(src.top.affected_diagnoses),
        expected_outcome: asString(src.top.expected_outcome),
        how_to_obtain: asString(src.top.how_to_obtain),
      }
    : { information: '', question: '', why_most_valuable: '', affected_diagnoses: [], expected_outcome: '', how_to_obtain: '' };

  const alternatives = (Array.isArray(src.alternatives) ? src.alternatives : [])
    .filter((a) => a && typeof a === 'object')
    .map((a) => ({
      information: asString(a.information),
      question: asString(a.question),
      affected_diagnoses: filterNames(a.affected_diagnoses),
      expected_outcome: asString(a.expected_outcome),
    }))
    .filter((a) => a.information)
    .slice(0, 2);

  return {
    current_uncertainty: asString(src.current_uncertainty),
    top,
    alternatives,
  };
}

function parseAndValidateAiOutput(content, doctorList = [], candidates = [], evidenceSources = []) {
  const { value: parsed, repairs: parseRepairs } = extractJsonDetailed(content);
  if (parsed === null) {
    logger.error('validator', 'model geçersiz JSON döndürdü (onarım başarısız)', {
      snippet: String(content).slice(0, 300),
      repairs: parseRepairs,
    });
    throw new ApiError(502, 'AI_INVALID_JSON', 'Analiz şu anda gerçekleştirilemedi. Lütfen tekrar deneyin.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    logger.error('validator', 'model JSON nesne döndürmedi', { snippet: String(content).slice(0, 300) });
    throw new ApiError(502, 'AI_INVALID_JSON', 'Analiz şu anda gerçekleştirilemedi. Lütfen tekrar deneyin.');
  }

  // HAM ŞEMA DENETİMİ: modelin gönderdiği haliyle şema ihlalleri tespit edilir.
  // Lenient normalize katmanı çoğunu onarır; ihlaller yalnızca gözlemlenebilirlik için loglanır.
  const rawValidation = validateAgainstSchema(parsed, ANALYSIS_SCHEMA);
  if (!rawValidation.valid) {
    logger.warn('validator', 'ham model çıktısında şema ihlalleri bulundu (normalize edilecek)', {
      issueCount: rawValidation.errors.length,
      issues: summarizeSchemaErrors(rawValidation.errors),
    });
  }

  const caseSummary = asString(parsed.case_summary);
  const diagnoses = Array.isArray(parsed.differential_diagnoses) ? parsed.differential_diagnoses : [];
  // Doktor vs AI karşılaştırma alanı: doktor listesi yoksa model boş nesne döndürebilir.
  const dda = parsed.doctor_divergence_analysis && typeof parsed.doctor_divergence_analysis === 'object'
    ? parsed.doctor_divergence_analysis
    : {};

  // Kanıt ağacı: modelin gizli muhakemesi değil; girdideki kanıtlar ile aday tanılar
  // arasındaki açıklanabilir ilişkiler. Eksikse güvenli boş yapı döner.
  const evidenceTree = normalizeEvidenceTree(parsed.evidence_tree);

  // İkinci görüş: doktor listesiyle bütünlük zorunludur (hipotezler yalnızca doktorun
  // listesinden, alternatifler yalnızca listede olmayanlardan). Eksikse güvenli boş yapı.
  const secondOpinion = normalizeSecondOpinion(parsed.second_opinion, doctorList);

  if (!caseSummary || diagnoses.length === 0) {
    logger.error('validator', 'model yanıtında zorunlu alanlar eksik', {
      hasSummary: !!caseSummary,
      diagnosisCount: diagnoses.length,
    });
    throw new ApiError(502, 'AI_INVALID_JSON', 'Analiz şu anda gerçekleştirilemedi. Lütfen tekrar deneyin.');
  }

  const normalizedDiagnoses = diagnoses
    .filter((d) => d && typeof d === 'object' && asString(d.name))
    .slice(0, 5) // şema sınırı: en fazla 5 tanı kartı
    .map((d) => {
      const relevance = asString(d.relevance).toLowerCase();
      const findingsAgainst = asStringArray(d.findings_against);
      const ca = d.contradiction_assessment && typeof d.contradiction_assessment === 'object' ? d.contradiction_assessment : {};
      const severity = asString(ca.severity).toLowerCase();
      return {
        name: asString(d.name),
        reasoning: normalizeReasoning(d.reasoning),
        relevance: RELEVANCE_VALUES.has(relevance) ? relevance : 'moderate',
        why_considered: asStringArray(d.why_considered),
        supporting_findings: asStringArray(d.supporting_findings),
        missing_or_uncertain_information: asStringArray(d.missing_or_uncertain_information),
        alternative_explanations: asStringArray(d.alternative_explanations),
        findings_against: findingsAgainst,
        contradiction_assessment: {
          severity: findingsAgainst.length > 0 && CONTRADICTION_SEVERITIES.has(severity) ? severity : 'none',
          verdict: asString(ca.verdict),
        },
        distinguishing_features: asStringArray(d.distinguishing_features),
        comparison_with_other_candidates: Array.isArray(d.comparison_with_other_candidates)
          ? d.comparison_with_other_candidates
              .filter((c) => c && typeof c === 'object')
              .map((c) => ({
                candidate: asString(c.candidate),
                distinguishing_point: asString(c.distinguishing_point),
              }))
              .filter((c) => c.candidate)
          : [],
        questions_to_consider: asStringArray(d.questions_to_consider),
        evidence_notes: asStringArray(d.evidence_notes),
        key_findings_used: asStringArray(d.key_findings_used),
      };
    });

  // Kanıt adayı filtresi: candidates verildiğinde model çıktısı yalnızca kanıt
  // katmanının adaylarına indirgenir (model bilgi deposu değildir; bağlam dışı
  // tanı üretirse sunucu onu eler). Tümü elenirse orijinal liste korunur.
  let filteredDiagnoses = normalizedDiagnoses;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const matched = normalizedDiagnoses.filter((d) => matchesAnyCandidate(d.name, candidates));
    if (matched.length > 0) {
      if (matched.length < normalizedDiagnoses.length) {
        const kept = new Set(matched.map((m) => m.name));
        logger.warn('validator', 'aday-dışı tanılar elendi', {
          dropped: normalizedDiagnoses.map((d) => d.name).filter((n) => !kept.has(n)),
          candidateCount: candidates.length,
        });
      }
      filteredDiagnoses = matched;
    } else {
      logger.warn('validator', 'aday filtresi tüm tanıları eledi; orijinal liste korundu (lenient fallback)', {
        candidateNames: candidates.map((c) => c.name),
        diagnosisNames: normalizedDiagnoses.map((d) => d.name),
      });
    }
  }

  if (filteredDiagnoses.length === 0) {
    logger.error('validator', 'model geçerli tanı kartı döndürmedi');
    throw new ApiError(502, 'AI_INVALID_JSON', 'Analiz şu anda gerçekleştirilemedi. Lütfen tekrar deneyin.');
  }

  // Gerçek aday listesi (aday filtresinden SONRA): next_best_information içindeki
  // tanı adları bu listeye sıkıştırılır; model bağlam dışı aday yazamaz.
  const validDiagnosisNames = filteredDiagnoses.map((d) => d.name);
  const nextBest = normalizeNextBestInformation(parsed.next_best_information, validDiagnosisNames);

  const result = {
    case_summary: caseSummary,
    clinical_pattern: asString(parsed.clinical_pattern),
    differential_diagnoses: filteredDiagnoses,
    important_missing_information: asStringArray(parsed.important_missing_information),
    missing_information_priority: asString(parsed.missing_information_priority),
    missing_information_impact: Array.isArray(parsed.missing_information_impact)
      ? parsed.missing_information_impact
          .filter((m) => m && typeof m === 'object')
          .map((m) => ({
            missing_information: asString(m.missing_information),
            affected_diagnoses: asStringArray(m.affected_diagnoses),
            impact_direction: asString(m.impact_direction),
          }))
          .filter((m) => m.missing_information)
      : [],
    doctor_divergence_analysis: {
      agreements: asStringArray(dda.agreements),
      disagreements: Array.isArray(dda.disagreements)
        ? dda.disagreements
            .filter((g) => g && typeof g === 'object')
            .map((g) => ({
              diagnosis: asString(g.diagnosis),
              doctor_rank: typeof g.doctor_rank === 'number' && Number.isFinite(g.doctor_rank) ? g.doctor_rank : null,
              ai_rank: typeof g.ai_rank === 'number' && Number.isFinite(g.ai_rank) ? g.ai_rank : null,
              reason: asString(g.reason),
            }))
            .filter((g) => g.diagnosis)
        : [],
      summary: asString(dda.summary),
    },
    evidence_tree: evidenceTree,
    second_opinion: secondOpinion,
    next_best_information: nextBest,
    clinical_attention_points: asStringArray(parsed.clinical_attention_points),
    uncertainty: asString(parsed.uncertainty),
    sources: Array.isArray(evidenceSources) ? evidenceSources : [],
    disclaimer: asString(parsed.disclaimer) || 'This is a clinical decision-support prototype and not a definitive diagnosis.',
  };

  // KESİN ŞEMA DENETİMİ: normalize edilmiş sonuç artık şemaya uymak ZORUNDADIR.
  // Hâlâ şema dışıysa çıktı onarılamaz kabul edilir ve reddedilir; böylece
  // bozuk/yarım model yanıtı asla frontend'e ulaşmaz.
  const finalValidation = validateAgainstSchema(result, ANALYSIS_SCHEMA);
  if (!finalValidation.valid) {
    const issues = summarizeSchemaErrors(finalValidation.errors, 12);
    logger.error('validator', 'normalize edilmiş çıktı şema doğrulamasını geçemedi', { issues });
    throw new ApiError(502, 'AI_INVALID_JSON', 'Analiz şu anda gerçekleştirilemedi. Lütfen tekrar deneyin.', {
      validationErrors: issues,
    });
  }

  // Şema sözleşmesi metadatası: frontend/testler doğrulamanın izini görebilir.
  result.structured_output = {
    schema_version: SCHEMA_VERSION,
    validated: true,
    parse_repairs: parseRepairs,
    raw_schema_issues: rawValidation.valid ? 0 : rawValidation.errors.length,
  };

  return result;
}

module.exports = {
  extractJson,
  extractJsonDetailed,
  parseAndValidateAiOutput,
  matchesAnyCandidate,
  normalizeEvidenceTree,
  normalizeSecondOpinion,
  normalizeNextBestInformation,
};
