# Security policy

## Scope

This is a portfolio prototype for synthetic/anonymous cases. Do not submit real patient data, API keys, logs, or other sensitive material as an issue or pull request.

## Reporting

For a suspected vulnerability, contact the repository owner privately before public disclosure. Include a minimal reproducible description without personal or clinical data.

## Built-in protections

- Server-side PII pattern rejection runs before model invocation.
- `.env*` and runtime output are excluded from version control.
- The default runtime provider is `mock`; live providers require local configuration.
- Developer exports contain only synthetic IDs, categories, and expected metadata—not case narratives or logs.

This project is not a clinical device and has no guarantee of diagnostic completeness or emergency suitability.
