const crypto = require('crypto');
const logger = require('../logger');
const config = require('../config');
const versions = require('./versions');
const { buildUserMessage } = require('./userMessage');
const { buildRetryInstruction } = require('./retryInstruction');

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

function assemblePrompt(sectionIds) {
  const parts = [];
  for (const id of sectionIds) {
    const section = SECTION_REGISTRY[id];
    if (!section) {
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

function contentHash(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

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

function buildSystemPrompt(version) {
  if (!version || version === ACTIVE.version) return ACTIVE_TEXT;
  const requested = versions.getVersion(version);
  if (!requested) {
    throw new Error(`Bilinmeyen prompt sürümü: ${version}`);
  }
  return assemblePrompt(requested.sections);
}

function getPromptInfo() {
  return { ...ACTIVE_INFO };
}

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
