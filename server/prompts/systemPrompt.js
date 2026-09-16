const prompts = require('./index');
const { schemaToPromptText } = require('../schemas/analysisSchema');

module.exports = {
  buildSystemPrompt: prompts.buildSystemPrompt,
  buildUserMessage: prompts.buildUserMessage,
  buildRetryInstruction: prompts.buildRetryInstruction,
  OUTPUT_SCHEMA: schemaToPromptText(),
};
