---
kind: build_system
name: Next.js App Build & Smoke/E2E Scripts
category: build_system
scope:
    - '**'
source_files:
    - stepwise ai/app/package.json
    - stepwise ai/app/next.config.js
    - stepwise ai/smoke.mjs
    - stepwise ai/e2e.mjs
    - stepwise ai/app/tsconfig.json
    - stepwise ai/app/postcss.config.js
    - stepwise ai/app/tailwind.config.js
---

## Build System Overview

This repository is a Next.js application with a minimal, npm-script-driven build system. There are no Makefiles, Dockerfiles, or CI pipeline definitions in the repository.

### Build Toolchain
- **Framework**: Next.js 14 (`next` ^14.2.13) with React 18 and TypeScript 5.
- **Configuration files**:
  - `app/package.json` — defines all scripts and dependencies.
  - `app/next.config.js` — enables `reactStrictMode`; otherwise uses Next.js defaults.
  - `app/tsconfig.json` — TypeScript configuration (with generated `tsconfig.tsbuildinfo`).
  - `app/postcss.config.js`, `app/tailwind.config.js` — CSS pipeline via Tailwind + PostCSS.
- **Scripts** (from `package.json`):
  - `dev`: `next dev -p 3000` — development server on port 3000.
  - `build`: `next build` — production build output to `.next/`.
  - `start`: `next start -p 3000` — serves the built app.
  - `lint`: `next lint` — ESLint via Next.js integration.
  - `typecheck`: `tsc --noEmit` — type-check only (no JS emitted).

### Artifacts
- The Next.js build produces a `.next/` directory (present in the repo snapshot), which is the standard Next.js production artifact consumed by `next start`.
- No custom bundler plugins, webpack overrides, or external asset pipelines beyond Tailwind/PostCSS.

### Testing & Verification Scripts
Two Node.js ESM scripts live at the repository root and act as ad-hoc smoke/e2e checks against a running instance at `http://localhost:3000`:

- **`smoke.mjs`** — Iterates over a fixed list of pages (`/login`, `/signup`, `/onboarding`, `/home`, `/journey`, `/settings`, `/`, `/session/1`, `/report/1`) and asserts each returns an HTML response (status 200 or 307 redirect). Exits with code 1 on any failure.
- **`e2e.mjs`** — A full MVP loop that signs up a user, creates a session, writes board objects, triggers AI analysis/hints, completes steps, generates a report, verifies idempotency, fetches reports/journey data, enforces ownership isolation (second user cannot read first user's board), and blocks unauthenticated access. Uses plain `fetch` with cookie-jar style header propagation; exits with code 1 on assertion failures.

These scripts are not invoked from `package.json` scripts — they must be run directly via `node e2e.mjs` / `node smoke.mjs` after starting the dev server.

### Environment
- `app/.env.example` and `app/.env.local` provide environment variable templates for the Next.js runtime.

### Conventions Observed
- All build/test orchestration lives in flat npm scripts and standalone Node scripts; there is no task runner (Make, Gulp, etc.).
- Port 3000 is hardcoded across `dev`, `start`, `smoke.mjs`, and `e2e.mjs`.
- Type checking is decoupled from linting (`tsc --noEmit` vs `next lint`).
- No containerization, no cross-compilation, no version bump/release automation is present in this branch.