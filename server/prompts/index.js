// PROMPT MODÜLÜ — TEK GİRİŞ NOKTASI (public API).
// Prompt engineering bu projede kendi başına bir katmandır:
//   sections/    -> bölümler (system, differential_diagnosis, contradiction, ...)
//   versions.js  -> sürüm kayıt defteri (v1.0, v1.1, v2.0)
//   index.js     -> birleştirme, sürüm çözümleme, içerik karması, kullanıcı/retry mesajları
// Pipeline yalnızca bu dosyayla konuşur; bölüm/sürüm yapısı değişse bile
// buildSystemPrompt/buildUserMessage/buildRetryInstruction sözleşmesi sabittir.
const crypto = require('crypto');
const logger = require('../logger');
const config = require('../config');
const versions = require('./versions');
const { buildUserMessage } = require('./userMessage');
const { buildRetryInstruction } = require('./retryInstruction');

// Bölüm kayıtları: id -> bölüm modülü
const SECTION_REGISTRY = {
  system: require('./sections/systemPrompt'),
  evidence_grounding: require('./sections/evidenceGroundingPrompt'),
  differential_diagnosis: require('./sections/differentialDiagnosisPrompt'),
  contradiction: require('./sections/contradictionPrompt'),
  physician_comparison: require('./sections/physicianComparisonPrompt'),
  second_opinion: require('./sections/secondOpinionPrompt'),
  structured_reasoning: require('./sections/structuredReasoningPrompt'),
  next_best_information: require('./sections/nextBestInformationPrompt'),
  missing_information: require('./sections/missingInformationPrompt'),
  evidence_tree: require('./sections/evidenceTreePrompt'),
  json_discipline: require('./sections/jsonDisciplinePrompt'),
  output_constraints: require('./sections/outputConstraintsPrompt'),
};

/**
 * Aktif prompt sürümünü config'den çözümler. Bilinmeyen sürüm yapılandırılmışsa
 * uygulama çökmez: varsayılana düşer ve uyarır (fail-open, güvenli davranış).
 * @returns {{ version: string, status: string, notes: string, sections: string[], resolvedFromEnv: boolean }}
 */
function resolveActiveVersion() {
  const requested = (config.prompt && config.prompt.version) || versions.DEFAULT_VERSION;
  const found = versions.getVersion(requested);
  if (found) {
    return { ...found, resolvedFromEnv: requested !== versions.DEFAULT_VERSION };
  }
  logger.warn('prompts', 'yapılandırılan prompt sürümü kayıtlı değil, varsayılana dönülüyor', {
    requested,
    fallback: versions.DEFAULT_VERSION,
  });
  return { ...versions.getVersion(versions.DEFAULT_VERSION), resolvedFromEnv: false };
}

/**
 * Bölüm listesini sistem promptu metnine birleştirir.
 * @param {string[]} sectionIds - Sürümün tanımladığı sıralı bölüm kimlikleri
 * @returns {string} Birleştirilmiş sistem promptu
 */
function assemblePrompt(sectionIds) {
  const parts = [];
  for (const id of sectionIds) {
    const section = SECTION_REGISTRY[id];
    if (!section) {
      // Kayıt defteri ve bölüm modülleri arasındaki tutarsızlık geliştirici hatasıdır;
      // sessizce atlanırsa sürümler birbirinden kopar. Bu yüzden sert hata.
      throw new Error(`Prompt bölümü kayıtlı değil: ${id}`);
    }
    const text = section.build();
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error(`Prompt bölümü boş metin üretti: ${id}`);
    }
    parts.push(text.trim());
  }
  return parts.join('\n\n');
}

/**
 * Prompt metninin içeriği karması: aynı sürümün metni asla sessizce değişmemiş
 * olsun (değişirse hash değişir, audit'te fark edilir).
 * @param {string} text
 * @returns {string} sha256 karmasının ilk 12 hex karakteri
 */
function contentHash(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

// Aktif sürüm modül yüklenirken bir kez çözümlenir ve metni bir kez birleştirilir;
// her istekte yeniden üretim yerine önbellek (sunucu çalıştığı sürece prompt sabittir).
const ACTIVE = resolveActiveVersion();
const ACTIVE_TEXT = assemblePrompt(ACTIVE.sections);
const ACTIVE_INFO = {
  version: ACTIVE.version,
  status: ACTIVE.status,
  sections: ACTIVE.sections,
  resolvedFromEnv: ACTIVE.resolvedFromEnv,
  char_count: ACTIVE_TEXT.length,
  content_hash: contentHash(ACTIVE_TEXT),
};

/**
 * Aktif sistem promptunu döndürür. (Geriye dönük uyumluluk: eski imza
 * buildSystemPrompt() aynen çalışmaya devam eder.)
 * @param {string} [version] - Belirli bir sürümün metni istenirse (audit/test için)
 * @returns {string}
 */
function buildSystemPrompt(version) {
  if (!version || version === ACTIVE.version) return ACTIVE_TEXT;
  const requested = versions.getVersion(version);
  if (!requested) {
    throw new Error(`Bilinmeyen prompt sürümü: ${version}`);
  }
  return assemblePrompt(requested.sections);
}

/**
 * Aktif sürümün metadatası: analiz sonuçlarına ve loglara yazılır.
 */
function getPromptInfo() {
  return { ...ACTIVE_INFO };
}

/**
 * Tüm sürümlerin listesi (API'de dışa açılır): sürümler arası kalite
 * karşılaştırmasının temeli.
 */
function listPromptVersions() {
  return versions.listVersions();
}

module.exports = {
  buildSystemPrompt,
  buildUserMessage,
  buildRetryInstruction,
  getPromptInfo,
  listPromptVersions,
  contentHash,
  assemblePrompt,
  SECTION_IDS: Object.keys(SECTION_REGISTRY),
  DEFAULT_VERSION: versions.DEFAULT_VERSION,
};
