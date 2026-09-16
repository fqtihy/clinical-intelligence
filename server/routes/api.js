const express = require('express');
const logger = require('../logger');
const { analyzeCase, whatIfAnalysis } = require('../pipeline/analyzePipeline');
const { getModelInfo, isModelConfigured } = require('../services/model');
const { ANALYSIS_SCHEMA, SCHEMA_VERSION } = require('../schemas/analysisSchema');
const prompts = require('../prompts');
const metrics = require('../observability/metrics');
const costTracker = require('../observability/costTracker');

const router = express.Router();

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

router.get('/schema', (req, res) => {
  res.json({ ok: true, schema_version: SCHEMA_VERSION, schema: ANALYSIS_SCHEMA });
});

router.get('/prompt-versions', (req, res) => {
  const active = prompts.getPromptInfo();
  res.json({
    ok: true,
    active_version: active.version,
    versions: prompts.listPromptVersions(),
  });
});

router.get('/prompt/:version', (req, res, next) => {
  try {
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

router.get('/metrics', (req, res) => {
  res.json({
    ok: true,
    process_summary: metrics.getSummary(),
    file_summary: metrics.getFileSummary(),
    cost_summary: costTracker.getCostReport(),
  });
});

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
