const logger = require('../logger');
const { ApiError } = require('../middleware/errorHandler');
const { ANALYSIS_SCHEMA, SCHEMA_VERSION } = require('../schemas/analysisSchema');
const { validateAgainstSchema, summarizeSchemaErrors } = require('../validation/schemaValidator');

const RELEVANCE_VALUES = new Set(['high', 'moderate', 'low']);
const CONTRADICTION_SEVERITIES = new Set(['none', 'minor', 'significant']);

const EVIDENCE_TREE_TYPES = new Set(['symptom', 'laboratory', 'history', 'pattern']);
const EVIDENCE_LINK_TYPES = new Set(['supports', 'weakens']);

const HYPOTHESIS_STATUSES = new Set(['supported', 'challenged', 'reconsider']);

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim());
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeName(value) {
  return asString(value).toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
}

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
  out = out.replace(/,(\s*)$/, '$1');
  while (stack.length > 0) {
    const open = stack.pop();
    out += open === '{' ? '}' : ']';
  }
  return { text: out, closed: true };
}

function extractJsonDetailed(content) {
  const repairs = [];
  if (typeof content !== 'string') return { value: null, repairs };

  let text = content.trim().replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  const deQuoted = text.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  if (deQuoted !== text) {
    repairs.push('smart-quotes');
    text = deQuoted;
  }

  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return { value: null, repairs };
  const lastBrace = text.lastIndexOf('}');
  const candidate = lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1) : text.slice(firstBrace);

  try {
    return { value: JSON.parse(candidate), repairs };
  } catch {
  }

  const noTrailing = candidate.replace(/,(\s*[}\]])/g, '$1');
  if (noTrailing !== candidate) {
    repairs.push('trailing-comma');
    try {
      return { value: JSON.parse(noTrailing), repairs };
    } catch {
    }
  }

  const closed = closeUnbalanced(candidate);
  if (closed.closed) {
    repairs.push('unclosed-brackets');
    try {
      return { value: JSON.parse(closed.text), repairs };
    } catch {
    }
  }

  return { value: null, repairs };
}

function extractJson(content) {
  return extractJsonDetailed(content).value;
}

function normalizeEvidenceTree(raw) {
  const tree = raw && typeof raw === 'object' ? raw : {};
  const findings = Array.isArray(tree.findings) ? tree.findings : [];
  const dxNodes = Array.isArray(tree.diagnosis_nodes) ? tree.diagnosis_nodes : [];
  const links = Array.isArray(tree.links) ? tree.links : [];

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

  const normalizedDxNodes = dxNodes
    .filter((n) => n && typeof n === 'object' && asString(n.id) && asString(n.label))
    .map((n) => ({
      id: asString(n.id),
      label: asString(n.label),
      conclusion: asString(n.conclusion),
      confirmatory_clues: asStringArray(n.confirmatory_clues).slice(0, 4),
    }));
  const dxIds = new Set(normalizedDxNodes.map((n) => n.id));

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

function normalizeSecondOpinion(raw, doctorList) {
  if (!Array.isArray(doctorList) || doctorList.length === 0) {
    return { summary: '', hypothesis_review: [], unconsidered_alternatives: [], key_question: '' };
  }

  const so = raw && typeof raw === 'object' ? raw : {};
  const doctorNames = new Set(doctorList.map(normalizeName).filter(Boolean));

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

  const rawValidation = validateAgainstSchema(parsed, ANALYSIS_SCHEMA);
  if (!rawValidation.valid) {
    logger.warn('validator', 'ham model çıktısında şema ihlalleri bulundu (normalize edilecek)', {
      issueCount: rawValidation.errors.length,
      issues: summarizeSchemaErrors(rawValidation.errors),
    });
  }

  const caseSummary = asString(parsed.case_summary);
  const diagnoses = Array.isArray(parsed.differential_diagnoses) ? parsed.differential_diagnoses : [];
  const dda = parsed.doctor_divergence_analysis && typeof parsed.doctor_divergence_analysis === 'object'
    ? parsed.doctor_divergence_analysis
    : {};

  const evidenceTree = normalizeEvidenceTree(parsed.evidence_tree);

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

  const finalValidation = validateAgainstSchema(result, ANALYSIS_SCHEMA);
  if (!finalValidation.valid) {
    const issues = summarizeSchemaErrors(finalValidation.errors, 12);
    logger.error('validator', 'normalize edilmiş çıktı şema doğrulamasını geçemedi', { issues });
    throw new ApiError(502, 'AI_INVALID_JSON', 'Analiz şu anda gerçekleştirilemedi. Lütfen tekrar deneyin.', {
      validationErrors: issues,
    });
  }

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
