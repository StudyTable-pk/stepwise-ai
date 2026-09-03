---
kind: configuration_system
name: Environment-Based Configuration with Feature-Flagged AI Provider Selection
category: configuration_system
scope:
    - '**'
source_files:
    - stepwise ai/app/.env.example
    - stepwise ai/app/lib/ai/index.ts
    - stepwise ai/app/lib/ai/openaiProvider.ts
    - stepwise ai/app/lib/auth.ts
    - stepwise ai/app/lib/db.ts
    - stepwise ai/app/next.config.js
    - stepwise ai/app/package.json
---

## What system/approach is used

The application uses a **plain `process.env` environment-variable configuration** strategy, with no dedicated config library. Configuration lives in `.env.local` (loaded automatically by Next.js) and is documented via an `.env.example` template. There are no YAML/JSON/TOML config files consumed at runtime; all settings are read directly from Node's `process.env` inside the modules that need them.

## Key files and packages

- `app/.env.example` — single source of truth for required/optional env vars, with comments explaining each variable and its purpose.
- `app/lib/ai/index.ts` — feature-flag style selection of the active AI provider based on `AI_PROVIDER` + presence of `OPENAI_API_KEY`.
- `app/lib/ai/openaiProvider.ts` — reads OpenAI-specific keys (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`) and throws if missing.
- `app/lib/auth.ts` — reads `AUTH_SECRET` and `NODE_ENV`; enforces a non-default secret in production.
- `app/lib/db.ts` — reads `DATABASE_FILE` to resolve the persistence store path; defaults to `./data/stepwise.db` (renamed to `.json`).
- `app/next.config.js` — minimal Next.js config (`reactStrictMode: true`); no env-based toggles here.
- `app/package.json` — scripts hardcode port `3000` via `-p 3000`; no env-driven build flags.

## Architecture and conventions

1. **Single-file env template**: All configurable variables are declared in `app/.env.example`. The file explicitly instructs users to copy it to `.env.local` and never commit real credentials. This is the only place new env var names should be introduced.

2. **Server-only secrets**: Secrets (`AUTH_SECRET`, `OPENAI_API_KEY`) are read exclusively in server-side modules (`lib/auth.ts`, `lib/ai/openaiProvider.ts`). No `NEXT_PUBLIC_` prefixed variables exist anywhere in the codebase, so nothing leaks to the client bundle.

3. **Feature-flag pattern for providers**: `lib/ai/index.ts` implements a simple runtime switch:
   - `AI_PROVIDER=mock` (default) → uses `demoProvider`.
   - `AI_PROVIDER=openai` AND `OPENAI_API_KEY` set → uses `openaiProvider`.
   - Any other value falls back to mock.
   This makes swapping AI backends a pure configuration change with no code edits.

4. **Per-module env access**: Each module reads only the variables it needs rather than loading a central config object. `db.ts` reads `DATABASE_FILE`, `auth.ts` reads `AUTH_SECRET` and `NODE_ENV`, `openaiProvider.ts` reads `OPENAI_*` vars. There is no shared `config.ts` or typed config registry.

5. **Defaults and fallbacks**: Every env var has a sensible default:
   - `AI_PROVIDER` defaults to `"mock"`.
   - `OPENAI_BASE_URL` defaults to `https://api.openai.com/v1`.
   - `OPENAI_MODEL` defaults to `gpt-4o-mini`.
   - `DATABASE_FILE` defaults to `./data/stepwise.db` (internally stored as `.json`).
   - Auth session cookie `secure` flag is derived from `NODE_ENV === "production"`.

6. **Production safety checks**: In `lib/auth.ts`, if `AUTH_SECRET` is unset or still contains the placeholder `change-me`, the code throws in production but allows a dev-only insecure key in development. Similarly, `openaiProvider.ts` throws immediately if `OPENAI_API_KEY` is missing when the OpenAI provider is selected.

7. **No build-time env processing**: `next.config.js` does not reference `process.env`, so there are no `NEXT_PUBLIC_` variables exposed to the browser. All configuration is evaluated at request/runtime on the server side.

## Conventions and constraints

- **Never commit secrets**: The `.env.example` header explicitly states credentials must never be committed; `.gitignore` excludes `.env*` files.
- **One env var per concern**: Each external dependency (AI provider, auth signing, database path) maps to one or a small group of related env vars under a consistent prefix (`OPENAI_*`, `AUTH_*`, `DATABASE_*`).
- **Fail fast on missing secrets**: Required secrets cause explicit errors at startup/request time (`throw new Error(...)`) rather than silently degrading, except where a safe demo mode exists (AI provider).
- **Provider selection is opt-in**: The mock/demo provider is always available without any configuration; enabling OpenAI requires both setting `AI_PROVIDER=openai` and providing `OPENAI_API_KEY`.
- **Database path abstraction**: `DATABASE_FILE` can point to any path; the implementation normalizes relative paths against `process.cwd()` and swaps the `.db` extension for `.json` internally, making it easy to swap storage backends later by reimplementing only this module.