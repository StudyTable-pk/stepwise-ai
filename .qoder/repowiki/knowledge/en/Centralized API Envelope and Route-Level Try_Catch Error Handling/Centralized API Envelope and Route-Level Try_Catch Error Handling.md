---
kind: error_handling
name: Centralized API Envelope and Route-Level Try/Catch Error Handling
category: error_handling
scope:
    - '**'
source_files:
    - stepwise ai/app/lib/apiHelpers.ts
    - stepwise ai/app/lib/types.ts
    - stepwise ai/app/lib/db.ts
    - stepwise ai/app/app/api/auth/login/route.ts
    - stepwise ai/app/app/api/auth/signup/route.ts
    - stepwise ai/app/app/api/sessions/[id]/analyze/route.ts
    - stepwise ai/app/app/api/boards/[id]/route.ts
    - stepwise ai/app/app/api/me/route.ts
    - stepwise ai/app/app/api/journey/route.ts
---

## System Overview

The StepWise AI Next.js application uses a centralized, envelope-based error handling strategy built on top of Next.js Server Routes. There is no global middleware or framework-level error boundary; instead, every route handler wraps its body in a `try/catch` that falls back to a uniform server error response, while business errors are returned as typed JSON envelopes.

## Core Mechanism: `apiHelpers.ts`

All routes import helpers from `@/lib/apiHelpers.ts`, which define the canonical response shape via the shared `ApiEnvelope<T>` type in `@/lib/types.ts`:

```ts
type ApiEnvelope<T> =
  | { data: T; error: null }
  | { data: null; error: { code: string; message: string } };
```

The helper functions are:
- `ok(data, status?)` — returns `{ data, error: null }` with the given HTTP status (default 200).
- `fail(code, message, status?)` — returns `{ data: null, error: { code, message } }` (default 400).
- `unauthorized()` — convenience for `fail("UNAUTHORIZED", ...)` at 401.
- `notFound()` — convenience for `fail("NOT_FOUND", ...)` at 404.
- `serverError()` — convenience for `fail("SERVER_ERROR", ...)` at 500; explicitly documented as never leaking stack traces.

Input validation is also centralized via `str(value, fallback, max)` and `int(value, fallback)`, which clamp and coerce untrusted request bodies before they reach business logic.

## Route-Level Pattern

Every API route follows the same structure:

1. Parse the request body defensively using `.catch(() => ({}))` on `req.json()` so malformed JSON does not throw.
2. Coerce inputs through `str()` / `int()`.
3. Return early with `fail(...)`, `unauthorized()`, or `notFound()` for domain-level failures (e.g., `MISSING_CREDENTIALS`, `INVALID_CREDENTIALS`, `SESSION_COMPLETED`, `INVALID_STEP`).
4. Wrap the entire handler body in `try/catch`; any unexpected exception returns `serverError()`.

Examples observed across `auth/login`, `auth/signup`, `boards/[id]`, `journey`, `me`, `reports/[sessionId]`, and `sessions/[id]/analyze`.

## Domain Error Modeling

Business-domain errors are modeled as TypeScript enums/union types in `@/lib/types.ts`, not thrown as exceptions:

- `EvaluationStatus`: `"correct" | "partial" | "error" | "uncertain"` — used by the teaching engine to drive state transitions.
- `ErrorCategory`: `"CONCEPTUAL" | "PROCEDURAL" | "CALCULATION" | "MISREADING" | ...` — classifies student mistakes.
- `ErrorSeverity`: `"MINOR" | "MODERATE" | "IMPORTANT" | "FOUNDATIONAL"` — ranks mistake seriousness.
- `DetectedError` interface carries category, severity, description, objectIds, corrected, selfCorrected flags.

These are persisted via `recordErrors(...)` and `markErrorsCorrected(...)` in `sessionsRepo.ts` and surfaced in the final report (`FinalReport.errors`). They are **data**, not control flow — the evaluation pipeline returns them inside an `EvaluationResult` rather than throwing.

## Database Layer Error Behavior

The embedded JSON store in `db.ts` swallows I/O errors silently: `readDisk()` catches parse/fetch errors and returns a fresh default store, so transient disk corruption does not crash a route. Writes use atomic temp-file + rename. A `transaction()` helper buffers mutations and commits only on success, discarding on error — providing rollback semantics without exceptions.

## Frontend / Client-Side

No dedicated client-side error boundary or global error interceptor was found in the inspected files. The frontend consumes the `ApiEnvelope<T>` contract: when `error` is non-null it displays the human-readable `message` associated with the `code`. This keeps UI error presentation decoupled from server internals.

## Conventions Observed

- **Never leak internals**: `serverError()` returns a generic message; comments explicitly forbid leaking stack traces.
- **Constant-ish messages**: Authentication routes deliberately avoid revealing whether an email exists (`"Email or password is incorrect."` regardless of which field failed).
- **Defensive parsing**: Every route calls `req.json().catch(() => ({}))` before accessing fields.
- **Typed codes over strings**: Business errors use uppercase snake-case codes (`MISSING_CREDENTIALS`, `SESSION_COMPLETED`, `INVALID_STEP`) sent in the envelope's `error.code`.
- **State machine driven**: Session progression is driven by `EvaluationStatus` values returned from the AI evaluation, not by thrown exceptions.
- **No panics / throws for control flow**: The codebase avoids throwing custom error classes for normal business conditions; those are represented as envelope responses or domain objects.