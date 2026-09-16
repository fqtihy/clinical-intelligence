// KATMAN 4: Sonuç biçimlendirici (result formatter).
// Doğrulanmış model çıktısını frontend sözleşmesine çeviren son zarf üreticisi.
// İleride yanıt şekli değişirse (ör. yeni alanlar, sürümleme) yalnızca burası değişir.
//
// AI ENGINEERING METADATASI: her analiz sonucu hangi prompt sürümü ve hangi modelle
// üretildiğini taşır (prompt_version, prompt.content_hash, model, provider). Aylar
// sonra "v1.0 ile v2.0 arasında cevap kalitesi nasıl değişti?" sorusu, sonuçları
// prompt_version'a göre gruplayarak cevaplanabilir.

/**
 * @param {object} structuredCase - caseProcessor çıktısı
 * @param {object} validated - responseValidator çıktısı
 * @param {{provider: string, model: string}} modelInfo - Aktif provider bilgisi
 * @param {object} [promptInfo] - prompts.getPromptInfo() çıktısı
 *   ({ version, status, sections, content_hash, char_count })
 */
function formatAnalysisResult(structuredCase, validated, modelInfo, promptInfo) {
  const prompt = promptInfo || {};
  return {
    case: structuredCase,
    result: validated,
    // Sürüm etiketleri: promptun ve modelin kimliği (A/B analizleri için)
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
