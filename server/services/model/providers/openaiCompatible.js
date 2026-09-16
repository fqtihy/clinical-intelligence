const logger = require('../../../logger');
const { ApiError } = require('../../../middleware/errorHandler');

function createOpenAICompatibleClient({ name, baseUrl, model, apiKey, timeoutMs, maxTokens, temperature }) {
  async function createChatCompletion({ messages, temperature: tempOverride } = {}) {
    if (!apiKey) {
      logger.error(name, 'API anahtarı bulunamadı (sağlayıcı anahtarı boş)');
      throw new ApiError(503, 'AI_API_KEY_MISSING', 'Analiz hizmeti yapılandırılmadı. Lütfen sunucu yöneticinize başvurun.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      logger.info(name, 'istek gönderiliyor', {
        model,
        messageCount: messages.length,
        timeoutMs,
      });

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: temperatureOverride(tempOverride, temperature),
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const rawBody = await response.text().catch(() => '');
        logger.error(name, 'API hata döndü', {
          status: response.status,
          statusText: response.statusText,
          body: rawBody.slice(0, 500),
        });

        if (response.status === 401) {
          throw new ApiError(503, 'AI_UNAUTHORIZED', 'Analiz hizmeti kimlik doğrulaması başarısız. Lütfen tekrar deneyin.');
        }
        if (response.status === 429) {
          throw new ApiError(503, 'AI_RATE_LIMITED', 'Analiz servisi şu anda yoğun. Lütfen kısa süre sonra tekrar deneyin.');
        }
        throw new ApiError(502, 'AI_UPSTREAM_ERROR', 'Analiz şu anda gerçekleştirilemedi. Lütfen tekrar deneyin.');
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        logger.error(name, 'beklenmeyen API cevabı: içerik bulunamadı', { data });
        throw new ApiError(502, 'AI_UNEXPECTED_RESPONSE', 'Analiz şu anda gerçekleştirilemedi. Lütfen tekrar deneyin.');
      }

      logger.info(name, 'yanıt alındı', {
        model: data.model,
        finishReason: data.choices?.[0]?.finish_reason,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      });

      return {
        content: content.trim(),
        finishReason: data.choices?.[0]?.finish_reason || 'stop',
        usage: {
          prompt_tokens: data.usage?.prompt_tokens,
          completion_tokens: data.usage?.completion_tokens,
        },
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        logger.error(name, 'istek zaman aşımına uğradı', { timeoutMs });
        throw new ApiError(504, 'AI_TIMEOUT', 'Analiz isteği zaman aşımına uğradı. Lütfen tekrar deneyin.');
      }
      if (err instanceof ApiError) throw err;
      logger.error(name, 'ağ hatası', { message: err.message });
      throw new ApiError(502, 'AI_NETWORK_ERROR', 'Analiz şu anda gerçekleştirilemedi. Lütfen tekrar deneyin.');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    providerName: name,
    model,
    createChatCompletion,
    isConfigured: () => Boolean(apiKey),
  };
}

function temperatureOverride(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

module.exports = { createOpenAICompatibleClient, temperatureOverride };
