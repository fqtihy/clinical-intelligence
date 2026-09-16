// KATMAN 5: Klinik akıl yürütme pipeline'ı (orkestratör).
// Akış: case processor -> knowledge retrieval -> prompt kurulumu -> model soyutlaması ->
//        yanıt doğrulayıcı -> result formatter.
// Model çağrısı services/model soyutlaması üzerinden yapılır; hangi sağlayıcının
// (DeepSeek, OpenAI, mock...) kullanıldığı pipeline için önemsizdir.
// Model yanıtı token sınırına takılıp kesilirse veya geçersiz JSON dönerse,
// model bir kez daha (kısa çıktı yönergesiyle) çağrılarak kendini düzeltmesi sağlanır.
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

// En fazla kaç deneme yapılacağı (ilk istek + 1 kendini düzeltme hakkı)
const MAX_ATTEMPTS = 2;

/**
 * Bir vakanın tam analiz akışını çalıştırır.
 * İlk yanıt geçersizse veya kesildiyse, kısa çıktı yönergesiyle bir kez daha dener.
 * @param {object} rawCase - Frontend'den gelen ham vaka verisi
 */
async function analyzeCase(rawCase) {
  // 1) Vaka yapılandırma
  const structuredCase = processCase(rawCase);

  // Kanıt katmanı: aday üretimi + kanıt çıkarımı + çelişki tespiti.
  // Deterministik ve çevrimdışı çalışır; model yalnızca bu demet üzerinde akıl yürütür.
  const evidenceContext = retrieveKnowledge(structuredCase);
  logger.info('analysis', 'kanıt katmanı adayları', {
    candidates: evidenceContext.candidates.map((c) => ({
      id: c.id,
      score: c.score,
      contradiction: c.contradiction.severity,
    })),
    sourceCount: evidenceContext.sources.length,
  });

  // Prompt sürümü bilgisi: sunucu başlangıcında bir kez çözümlenir, sonucu sarar.
  const promptInfo = prompts.getPromptInfo();

  // Metrik korelasyon kimliği: bir isteğe ait tüm AI çağrıları (ilk deneme + onarım)
  // bu kimlikle loglanır. Vaka içeriğiyle ilgisizdir (PII-free).
  const requestId = crypto.randomUUID();
  const schemaInfo = { schema_version: require('../schemas/analysisSchema').SCHEMA_VERSION };

  const baseMessages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserMessage(structuredCase, evidenceContext) },
  ];

  let lastError = null;
  // Önceki denemenin şema doğrulama hataları: yeniden denemede modele
  // "neyi düzelteceği" açıkça bildirilir (kör retry yerine hedefli onarım).
  let lastValidationErrors = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const messages = attempt === 1
      ? baseMessages
      : [...baseMessages, { role: 'user', content: buildRetryInstruction(lastValidationErrors) }];

    let completion;
    try {
      // Yeniden denemede daha belirleyici çıktı için sıcaklık düşürülür.
      // Metrik bağlamı (request_id, deneme no, prompt/şema sürümü) her çağrıyla taşınır.
      completion = await modelClient.createChatCompletion({
        messages,
        temperature: attempt === 1 ? undefined : 0.1,
        requestId,
        attempt,
        promptVersion: promptInfo.version,
        schemaVersion: schemaInfo.schema_version,
      });
    } catch (err) {
      // API/ağ hatası: yeniden denemek yerine doğrudan kullanıcıya güvenli hata döndür.
      throw err;
    }

    try {
      const result = parseAndValidateAiOutput(
        completion.content,
        structuredCase.doctor_preliminary_assessment,
        evidenceContext.candidates,
        evidenceContext.sources,
      );

      // JSON geçerli ama model token sınırına takılıp kesilmişse sonuç güvenilmezdir.
      // (Sağlam JSON çıkarımı yalnızca ilk '{'...son '}' bölgesini aldığı için
      //  yarıda kesilmiş bir nesne genellikle zaten ayrıştırılamaz; yine de kontrol edilir.)
      if (completion.finishReason === 'length') {
        logger.warn('pipeline', 'yanıt token sınırında kesildi, yeniden deneniyor', { requestId, attempt });
        lastError = new ApiError(502, 'AI_INVALID_JSON', 'Analiz şu anda gerçekleştirilemedi. Lütfen tekrar deneyin.');
        continue;
      }

      // KATMAN 3.5: İddia denetimi. Model çıktısı şemaya uysa bile iddiaları
      // gerçek vaka verisi ve kanıt katmanına karşı denetlenir; şüpheli iddialar
      // kullanıcıya audit_flags ile bildirilir (sonuç silinmez, işaretlenir).
      result.audit_flags = auditClaims(result, structuredCase, evidenceContext);
      result.uncertainty_assessment = buildUncertaintyAssessment(
        result,
        structuredCase,
        evidenceContext,
        result.audit_flags,
      );
      result.clinical_safety = buildClinicalSafetyAssessment(structuredCase, result.audit_flags);

      // Metrik: istek, ilk denemede mi onaylandı, onarım denemesiyle mi?
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

  // Tüm denemeler tükendi: istek parse edilemedi. Metrik kaydı + hatayı yukarı fırlat.
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

/* ------------------------------------------------------------------ */
// WHAT-IF (KARŞI-OLGUSAL) ANALİZ
// "Bu bulgu farklı olsaydı sonuç nasıl değişirdi?" sorusunun motoru.
// Kullanıcının mevcut vaka verisi üzerinden TEK bir form alanı bilinçli
// olarak değiştirilir ve aynı pipeline (processCase -> knowledge -> model ->
// validation -> formatter) baştan sona yeniden çalıştırılır. Modelin yeni
// bilgiye göre hipotezlerini güncelleyip güncellemediği böylece gözlemlenebilir.
// Sonuç geçmişe kaydedilmez; yalnızca karşılaştırma amacıyla döner.

// Karşı-olgusal düzenlemeye izin verilen bölümler ve alanlar (beyaz liste).
// Beyaz liste dışındaki her şey 422 ile reddedilir; model prompt'u asla
// serbest metinle değiştirilemez.
const WHATIF_EDITABLE = {
  symptomTiming: new Set(['onset', 'duration', 'recurrent', 'episodic', 'episodeDuration', 'resolution']),
  medicalHistory: new Set(['previousIllnesses', 'medications', 'familyHistory', 'previousDiagnoses', 'previousTreatments', 'treatmentResponse']),
  geographicHistory: new Set(['country', 'travel', 'migration', 'endemicExposure', 'animalContact', 'occupationalExposure']),
  otherSymptoms: new Set(['value']),
};

// Formda select ile girilen alanların izinli değerleri (frontend select'leriyle aynı).
const WHATIF_ENUMS = {
  'symptomTiming.recurrent': ['yes', 'no', 'unknown'],
  'symptomTiming.episodic': ['yes', 'no', 'unknown'],
  'symptomTiming.resolution': ['yes', 'no', 'unknown'],
};

const WHATIF_MAX_VALUE_LENGTH = 300;

/**
 * Gelen düzenleme isteğini doğrular ve normalize eder.
 * @param {object} edit - { section, field, value }
 * @returns {{ section: string, field: string, value: string }}
 */
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

/** Düzenlemeyi vakanın sığ kopyasına uygular; orijinal nesne değişmez. */
function applyWhatIfEdit(rawCase, edit) {
  const clone = { ...rawCase };
  if (edit.section === 'otherSymptoms') {
    clone.otherSymptoms = edit.value;
  } else {
    clone[edit.section] = { ...(rawCase[edit.section] || {}), [edit.field]: edit.value };
  }
  return clone;
}

/**
 * Karşı-olgusal analiz: düzenlenmiş vakanın tam analizini çalıştırır.
 * @param {object} rawCase - Frontend'de saklanmış ham vaka verisi (analysis.payload)
 * @param {object} edit - { section, field, value }
 * @returns {Promise<{ edit: object, after: object }>} after = formatAnalysisResult zarfı
 */
async function whatIfAnalysis(rawCase, edit) {
  const normalizedEdit = normalizeWhatIfEdit(edit);
  const baseCase = rawCase && typeof rawCase === 'object' && !Array.isArray(rawCase) ? rawCase : {};
  const editedCase = applyWhatIfEdit(baseCase, normalizedEdit);
  const after = await analyzeCase(editedCase);
  return { edit: normalizedEdit, after };
}

module.exports = { analyzeCase, whatIfAnalysis, normalizeWhatIfEdit };
