// REST API rotaları.
// Frontend yalnızca bu uç noktalarla konuşur; model çağrıları tamamen sunucu tarafındadır.
const express = require('express');
const logger = require('../logger');
const { analyzeCase, whatIfAnalysis } = require('../pipeline/analyzePipeline');
const { getModelInfo, isModelConfigured } = require('../services/model');
const { ANALYSIS_SCHEMA, SCHEMA_VERSION } = require('../schemas/analysisSchema');
const prompts = require('../prompts');
const metrics = require('../observability/metrics');
const costTracker = require('../observability/costTracker');

const router = express.Router();

// Sağlık kontrolü: sunucu ayakta mı, aktif model sağlayıcısı yapılandırılmış mı?
router.get('/health', (req, res) => {
  const { provider, model } = getModelInfo();
  res.json({
    ok: true,
    status: 'up',
    provider,
    model,
    aiConfigured: isModelConfigured(),
    time: new Date().toISOString(),
  });
});

// Structured Output sözleşmesi: AI yanıtının uymak zorunda olduğu JSON şeması.
// Frontend ve testler beklenen alan/tip/enum tanımlarını buradan okuyabilir;
// her başarılı /analyze yanıtı ayrıca structured_output.schema_version taşır.
router.get('/schema', (req, res) => {
  res.json({ ok: true, schema_version: SCHEMA_VERSION, schema: ANALYSIS_SCHEMA });
});

// Prompt sürümlerinin listesi: sürümler arası kalite karşılaştırmasının temeli.
// Hangi sürümler var, hangi bölümlerden oluşuyorlar, hangisi aktif?
router.get('/prompt-versions', (req, res) => {
  const active = prompts.getPromptInfo();
  res.json({
    ok: true,
    active_version: active.version,
    versions: prompts.listPromptVersions(),
  });
});

// Belirli bir sürümün birleştirilmiş prompt metni + metadatası.
// Audit: geçmiş analizlerin hangi promptla üretildiğini birebir görmek için.
router.get('/prompt/:version', (req, res, next) => {
  try {
    // Sürüm kontrolü ÖNCE yapılır: buildSystemPrompt bilinmeyen sürümde hata
    // fırlatır; 404 dalının erişilebilir kalması için meta araması önce gelmeli.
    const meta = prompts.listPromptVersions().find((v) => v.version === req.params.version);
    if (!meta) {
      return res.status(404).json({
        ok: false,
        error: { code: 'PROMPT_VERSION_NOT_FOUND', message: `Bilinmeyen prompt sürümü: ${req.params.version}` },
      });
    }
    const text = prompts.buildSystemPrompt(req.params.version);
    return res.json({
      ok: true,
      version: req.params.version,
      status: meta.status,
      notes: meta.notes,
      sections: meta.sections,
      char_count: text.length,
      content_hash: prompts.contentHash(text),
      system_prompt: text,
    });
  } catch (err) {
    return next(err);
  }
});

// AI çağrı metrikleri: ortalama/p95 latency, parse başarı oranı, model ve prompt
// sürümü kırılımı. Süreç ömrü özeti + JSONL dosyasının dosya-bazlı özeti.
// Yalnızca teknik metrik döner; klinik içerik ve kimlik verisi içermez.
router.get('/metrics', (req, res) => {
  res.json({
    ok: true,
    process_summary: metrics.getSummary(),
    file_summary: metrics.getFileSummary(),
    cost_summary: costTracker.getCostReport(),
  });
});

// Karşı-olgusal (what-if) analiz: mevcut vaka verisi üzerinden TEK bir form alanı
// değiştirilerek aynı pipeline yeniden çalıştırılır. Sonuç geçmişe KAYDEDİLMEZ;
// yalnızca "önce/sonra" karşılaştırması için döner (data.edit + data.after).
router.post('/what-if', async (req, res, next) => {
  try {
    const startedAt = Date.now();
    const body = req.body || {};
    if (!body.case || typeof body.case !== 'object' || Array.isArray(body.case)) {
      return res.status(422).json({
        ok: false,
        error: { code: 'INVALID_PAYLOAD', message: 'Karşı-olgusal analiz için vaka verisi (case) gereklidir.' },
      });
    }
    const data = await whatIfAnalysis(body.case, body.edit);
    logger.info('api', 'POST /what-if başarılı', {
      durationMs: Date.now() - startedAt,
      section: data.edit.section,
      field: data.edit.field,
    });
    return res.json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
});

// Vaka analizi: yapılandırılmış vaka verisini alır, pipeline'dan geçirir, sonucu döner.
router.post('/analyze', async (req, res, next) => {
  try {
    const startedAt = Date.now();
    const data = await analyzeCase(req.body);
    logger.info('api', 'POST /analyze başarılı', { durationMs: Date.now() - startedAt });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
