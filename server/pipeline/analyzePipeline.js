const crypto = require('crypto');
const logger = require('../logger');
const config = require('../config');
const { ApiError } = require('../middleware/errorHandler');
const prompts = require('../prompts');
const metrics = require('../observability/metrics');
const { buildSystemPrompt, buildUserMessage, buildRetryInstruction } = prompts;
const { processCase } = require('./caseProcessor');
const { retrieveKnowledge } = require('./knowledgeRetrieval');
const { parseAndValidateAiOutput } = require('./responseValidator');
const { auditClaims } = require('./claimAuditor');
const { buildUncertaintyAssessment } = require('./uncertaintyEngine');
const { buildClinicalSafetyAssessment } = require('./clinicalSafetyEngine');
const { formatAnalysisResult } = require('./resultFormatter');
const modelClient = require('../services/model');

const MAX_ATTEMPTS = 2;

async function analyzeCase(rawCase) {
  const structuredCase = processCase(rawCase);

  const evidenceContext = retrieveKnowledge(structuredCase);
  logger.info('analysis', 'kanıt katmanı adayları', {
    candidates: evidenceContext.candidates.map((c) => ({
      id: c.id,
      score: c.score,
      contradiction: c.contradiction.severity,
    })),
    sourceCount: evidenceContext.sources.length,
  });

  const promptInfo = prompts.getPromptInfo();

  const requestId = crypto.randomUUID();
  const schemaInfo = { schema_version: require('../schemas/analysisSchema').SCHEMA_VERSION };

  const baseMessages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserMessage(structuredCase, evidenceContext) },
  ];

  let lastError = null;
  let lastValidationErrors = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const messages = attempt === 1
      ? baseMessages
      : [...baseMessages, { role: 'user', content: buildRetryInstruction(lastValidationErrors) }];

    let completion;
    try {
      completion = await modelClient.createChatCompletion({
        messages,
        temperature: attempt === 1 ? undefined : 0.1,
        requestId,
        attempt,
        promptVersion: promptInfo.version,
        schemaVersion: schemaInfo.schema_version,
      });
    } catch (err) {
      throw err;
    }

    try {
      const result = parseAndValidateAiOutput(
        completion.content,
        structuredCase.doctor_preliminary_assessment,
        evidenceContext.candidates,
        evidenceContext.sources,
      );

      if (completion.finishReason === 'length') {
        logger.warn('pipeline', 'yanıt token sınırında kesildi, yeniden deneniyor', { requestId, attempt });
        lastError = new ApiError(502, 'AI_INVALID_JSON', 'Analiz şu anda gerçekleştirilemedi. Lütfen tekrar deneyin.');
        continue;
      }

      result.audit_flags = auditClaims(result, structuredCase, evidenceContext);
      result.uncertainty_assessment = buildUncertaintyAssessment(
        result,
        structuredCase,
        evidenceContext,
        result.audit_flags,
      );
      result.clinical_safety = buildClinicalSafetyAssessment(structuredCase, result.audit_flags);

      metrics.recordParseResult({
        request_id: requestId,
        attempts: attempt,
        outcome: 'success',
        raw_schema_issues: result.structured_output ? result.structured_output.raw_schema_issues : undefined,
        prompt_version: promptInfo.version,
        model: modelClient.getModelInfo().model,
        provider: modelClient.getProviderName(),
      });

      logger.info('pipeline', 'analiz tamamlandı', {
        requestId,
        attempt,
        diagnosisCount: result.differential_diagnoses.length,
        auditFlagCount: result.audit_flags.length,
        promptVersion: promptInfo.version,
        provider: modelClient.getProviderName(),
        model: modelClient.getModelInfo().model,
      });

      return formatAnalysisResult(structuredCase, result, modelClient.getModelInfo(), promptInfo);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'AI_INVALID_JSON') {
        lastValidationErrors = (err.details && err.details.validationErrors) || [];
        logger.warn('pipeline', 'model geçersiz JSON döndürdü, yeniden deneniyor', {
          requestId,
          attempt,
          schemaErrors: lastValidationErrors,
        });
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  metrics.recordParseResult({
    request_id: requestId,
    attempts: MAX_ATTEMPTS,
    outcome: 'invalid_json',
    prompt_version: promptInfo.version,
    model: modelClient.getModelInfo().model,
    provider: modelClient.getProviderName(),
    error_code: lastError && lastError.code ? lastError.code : 'AI_INVALID_JSON',
  });

  throw lastError;
}


const WHATIF_EDITABLE = {
  symptomTiming: new Set(['onset', 'duration', 'recurrent', 'episodic', 'episodeDuration', 'resolution']),
  medicalHistory: new Set(['previousIllnesses', 'medications', 'familyHistory', 'previousDiagnoses', 'previousTreatments', 'treatmentResponse']),
  geographicHistory: new Set(['country', 'travel', 'migration', 'endemicExposure', 'animalContact', 'occupationalExposure']),
  otherSymptoms: new Set(['value']),
};

const WHATIF_ENUMS = {
  'symptomTiming.recurrent': ['yes', 'no', 'unknown'],
  'symptomTiming.episodic': ['yes', 'no', 'unknown'],
  'symptomTiming.resolution': ['yes', 'no', 'unknown'],
};

const WHATIF_MAX_VALUE_LENGTH = 300;

function normalizeWhatIfEdit(edit) {
  if (!edit || typeof edit !== 'object' || Array.isArray(edit)) {
    throw new ApiError(422, 'INVALID_WHATIF_EDIT', 'Karşı-olgusal düzenleme (edit) eksik veya geçersiz.');
  }
  const section = String(edit.section || '');
  const field = String(edit.field || '');
  const allowed = WHATIF_EDITABLE[section];
  if (!allowed || !allowed.has(field)) {
    throw new ApiError(422, 'INVALID_WHATIF_EDIT', `Bu alan karşı-olgusal analiz için düzenlenemez: ${section}.${field}`);
  }
  const value = typeof edit.value === 'string' ? edit.value.trim() : '';
  if (!value || value.length > WHATIF_MAX_VALUE_LENGTH) {
    throw new ApiError(422, 'INVALID_WHATIF_EDIT', `Yeni değer 1-${WHATIF_MAX_VALUE_LENGTH} karakter olmalıdır.`);
  }
  const enumKey = `${section}.${field}`;
  if (WHATIF_ENUMS[enumKey] && !WHATIF_ENUMS[enumKey].includes(value)) {
    throw new ApiError(422, 'INVALID_WHATIF_EDIT', 'Bu alan için izinli değerler: yes | no | unknown');
  }
  return { section, field, value };
}

function applyWhatIfEdit(rawCase, edit) {
  const clone = { ...rawCase };
  if (edit.section === 'otherSymptoms') {
    clone.otherSymptoms = edit.value;
  } else {
    clone[edit.section] = { ...(rawCase[edit.section] || {}), [edit.field]: edit.value };
  }
  return clone;
}

async function whatIfAnalysis(rawCase, edit) {
  const normalizedEdit = normalizeWhatIfEdit(edit);
  const baseCase = rawCase && typeof rawCase === 'object' && !Array.isArray(rawCase) ? rawCase : {};
  const editedCase = applyWhatIfEdit(baseCase, normalizedEdit);
  const after = await analyzeCase(editedCase);
  return { edit: normalizedEdit, after };
}

module.exports = { analyzeCase, whatIfAnalysis, normalizeWhatIfEdit };
