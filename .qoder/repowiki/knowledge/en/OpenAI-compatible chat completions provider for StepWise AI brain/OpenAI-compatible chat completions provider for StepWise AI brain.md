---
kind: external_dependency
name: OpenAI-compatible chat completions provider for StepWise AI brain
slug: openai-compatible-llm-api
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
    - sdk_real_api
scope:
    - '**'
---

StepWise uses an OpenAI-compatible `/chat/completions` endpoint as the production AI provider behind a pluggable `AIProvider` interface. The provider is selected at runtime via `AI_PROVIDER=openai` plus `OPENAI_API_KEY`, with optional `OPENAI_BASE_URL` and `OPENAI_MODEL` overrides (default model `gpt-4o-mini`). All calls are made server-side from Next.js API routes; keys never reach the client. Responses are parsed as JSON (`response_format: json_object`) and then sanitized through strict validators that clamp strings, whitelist enums, and enforce schema shapes before any state mutation — the app treats all AI output as untrusted input.

- Integration point: `lib/ai/openaiProvider.ts` implements `analyzeQuestion`, `evaluateStudentWork`, `generateHint`, `generateExplanation`, `generateFinalReport` by POSTing to `${OPENAI_BASE_URL}/chat/completions` with Bearer auth.
- Fallback: when `AI_PROVIDER=mock` or no key is set, `lib/ai/demoProvider.ts` supplies a clearly labeled offline demo tutor that is never presented as real AI.
- Auth: HMAC-signed session cookies via `AUTH_SECRET` in `lib/auth.ts`; the cookie name is `stepwise_session`, httpOnly, sameSite lax, secure in production.
- Database: embedded JSON store in `lib/db.ts` (file path `DATABASE_FILE`, default `./data/stepwise.db` rewritten as `.json`); designed to be swapped for PostgreSQL later by reimplementing only this module's interface.