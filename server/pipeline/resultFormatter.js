
function formatAnalysisResult(structuredCase, validated, modelInfo, promptInfo) {
  const prompt = promptInfo || {};
  return {
    case: structuredCase,
    result: validated,
    prompt_version: prompt.version || null,
    prompt: {
      version: prompt.version || null,
      status: prompt.status || null,
      sections: prompt.sections || [],
      content_hash: prompt.content_hash || null,
      char_count: prompt.char_count || null,
    },
    model: modelInfo.model,
    provider: modelInfo.provider,
    analyzedAt: new Date().toISOString(),
  };
}

module.exports = { formatAnalysisResult };
