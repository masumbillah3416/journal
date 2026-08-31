# Travel Diary

A personal travel blog styled as a physical custom diary: a public site the reader turns
page by page with a realistic 3D page-flip, a bespoke admin panel for editing every
journey, and a sign-in screen with an optional one-time-code step. Built on Payload CMS 3
inside Next.js, on Postgres.

The source of truth for *what* to build is `handoff/design_handoff_travel_diary/`
(`README.md`, `SCREENS.md`, `DATA_MODEL.md`, `SECURITY.md`). The source of truth for
*how* to build it is `CLAUDE.md`.

## Prerequisites

- Node.js 22+
- npm 10+
- Docker (for local Postgres, used by integration and end-to-end tests)

## Setup

```bash
git clone <repo-url>
cd travel-diary
npm install
cp .env.example .env   # fill in local values; validated by apps/web/lib/env.ts
docker compose up -d   # local Postgres, for integration tests and `npm run dev`
npm run verify
```

`.env` lives at the repository root next to `.env.example`, even though `next dev` and
the Payload CLI both run from `apps/web` (`-w apps/web`) — `apps/web/lib/env.ts` resolves
the repo root itself rather than trusting the working directory, so one file backs all of
`next dev`, the Payload CLI and the integration test suite.

`npm install` also installs the Husky pre-commit hook (`npm run prepare`), which runs
`npm run verify` before every commit.

## Workspace layout

This is an npm-workspaces monorepo:

- `apps/*` — deployable applications. `apps/web` is the Next.js app hosting Payload CMS
  (its own admin UI at `/cms`; the bespoke admin panel from the design lands at `/admin`
  in a later phase).
- `packages/*` — shared libraries. `packages/domain` holds pure domain logic with no
  dependency on any app, and no dependency on I/O.

## Commands

```
npm run dev -w apps/web   # Next + Payload against local Postgres
npm run verify         # typecheck + lint + unit + coverage gates  <- pre-commit
npm run verify:full    # verify + integration tests               <- CI
npm run test           # unit + integration, watch mode
npm run test:unit      # unit tests only, with coverage
npm run test:integration # integration tests only (requires DATABASE_URL)
npm run test:e2e       # Playwright
npm run test:e2e:headed # Playwright, visible browser — the engine for QA sweeps
npm run test:visual    # visual regression
npm run test:a11y      # accessibility
npm run test:perf      # Lighthouse CI budgets
npm run db:migrate -w apps/web        # run migrations
npm run db:migrate:create -w apps/web # generate a new migration from schema changes
npm run db:seed -w apps/web           # seed the ten prototype journeys and their pages
```

`test:e2e`, `test:e2e:headed`, `test:visual` and `test:a11y` need Playwright's Chromium
browser (`npx playwright install chromium`) and the app running (`playwright.config.ts`'s
`webServer` starts it automatically). `test:perf` needs a system Chrome/Chromium install.
See `docs/testing.md` for what each suite covers today versus once the public diary
(Phase 1) exists to test against.

## The verify gate

`npm run verify` is the gate: typecheck, lint (zero warnings), and unit tests with
coverage thresholds enforced in `vitest.config.ts` (100% for `packages/domain/**`, 95%
for `apps/web/lib/**`, 90% repository-wide). It runs in the pre-commit hook and must pass
before any change is committed.

Unit tests (no I/O, no database) run in `verify`. Integration tests — anything matching
`*.integration.test.ts`, which require `DATABASE_URL` — run separately in
`npm run verify:full`, which is what CI runs. This split keeps the pre-commit gate
something a developer can always pass honestly, even with Docker down.
