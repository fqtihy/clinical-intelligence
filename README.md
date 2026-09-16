# Clinical Intelligence

> **Synthetic-first clinical decision-support prototype**  
> Structured reasoning · evidence grounding · uncertainty · safety · PII protection

[![Runtime](https://img.shields.io/badge/runtime-Node.js%2018%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Default provider](https://img.shields.io/badge/default%20provider-mock-6f42c1)](#model-and-runtime-provider)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Clinical Intelligence is a portfolio project exploring how a clinical second-opinion workflow can remain structured, auditable, privacy-aware, and explicit about uncertainty. **It is not a diagnostic system or a medical device.**

## The problem

Unstructured clinical narratives make it difficult to separate observed findings from assumptions, identify missing information, compare competing hypotheses, and notice safety signals. A model response can also sound confident while containing unsupported claims.

## The approach

This prototype turns an explicitly synthetic case into a structured analysis:

1. The browser collects only anonymous/synthetic fields.
2. The API rejects oversized payloads and PII patterns before model invocation.
3. The server normalizes the case and retrieves matching knowledge-base evidence.
4. A provider-independent pipeline produces and validates structured output.
5. Claim auditing, uncertainty assessment, and clinical-safety checks annotate the result.
6. The browser stores local history with retention and an explicit clear-data flow.

```text
Synthetic form
    -> PII guard + payload limits
    -> case normalization
    -> knowledge retrieval
    -> model provider
    -> schema validation + retry
    -> claim audit + uncertainty + safety
    -> local result / feedback
```

## Security and privacy highlights

- **Backend PII boundary:** e-mail, phone, and Turkish national-ID-like patterns are rejected before any model call. Frontend validation is not treated as security.
- **Synthetic-only mode:** real patient data is not accepted by the API.
- **Safe publication defaults:** runtime defaults to the local `mock` provider; `.env*`, logs, reports, archives, and dependencies are ignored.
- **Local retention:** analyses, drafts, cases, and feedback expire after 30 days; Settings can clear visible local/session data.
- **Safe exports:** developer exports contain only synthetic IDs, categories, and expected metadata—not narratives, patient data, or logs.

See [SECURITY.md](SECURITY.md) for reporting and data-handling guidance.

## Demo and installation

```bash
npm install
copy .env.example .env
npm start
```

Open `http://localhost:3000`, select **Yeni Vaka**, choose **Sentetik örnek vakayı yükle**, review the generated form, and run the analysis. The checked-in `.env.example` uses `MODEL_PROVIDER=mock`, so this demo does not need an API key or external network access.

Developer tools are available from Dashboard or Settings:

- `#/synthetic-report` — metadata-only case quality report with total cases, expected low/medium/high confidence, missing-information, safety, audit, and out-of-scope counts; anonymous JSON/CSV export.
- `#/synthetic-compare` — side-by-side comparison of two synthetic cases across findings, tests/missing information, safety, and scope.

No screenshots are included because the publication copy has no verified, non-sensitive image assets. The UI can be previewed locally using the demo flow above.

## Synthetic case boundary

The library contains 30 PII-free cases across complete/stable, missing-information, similar-differential, contradictory, red-flag/safety, and knowledge-base out-of-scope scenarios. The synthetic-case button consumes the shuffled pool without repeating a case until the pool is exhausted. Each case carries hidden `expected` metadata for developer tests and quality reporting; that metadata is not submitted as clinical input and does not disclose a diagnosis in the user flow.

The knowledge base is intentionally limited. Low-match and out-of-scope cases are signals to stop, gather more information, or seek professional evaluation—not evidence of general medical coverage.

## Model and runtime provider

This project was developed with AI-assisted development; this must not be confused with the application's runtime provider:

- **Default runtime:** `mock`, for deterministic local demo and regression tests.
- **Optional live runtime:** DeepSeek or another OpenAI-compatible provider selected through `MODEL_PROVIDER` and locally stored credentials.

Runtime provider/model identity is configuration and is independent of the development workflow.

## Test matrix

| Command | Purpose | External network |
|---|---|---:|
| `npm run test:synthetic-cases` | 30-case schema, metadata, PII, category, ID, and no-repeat pool checks | No |
| `npm run test:pii` | Backend PII and synthetic-mode rejection checks | No |
| `npm test` | Mock regression suite and structured-output checks | No |
| `node --check <file>` | JavaScript syntax validation | No |

## Clinical disclaimer

This prototype does not diagnose, prescribe, triage, or replace a qualified health professional. It may be incomplete, wrong, or overconfident. Red flags require appropriate urgent clinical evaluation; users must not wait for an analysis result. Do not enter real patient data. Use only synthetic or fully anonymized examples.

## License

MIT — see [LICENSE](LICENSE).
