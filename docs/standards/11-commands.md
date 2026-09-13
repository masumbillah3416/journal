# 11 · Commands

The detail for `CLAUDE.md` §11. `CLAUDE.md` states the rule in short and points here; the
full text — including every sentence this repository quotes as `CLAUDE.md` §11 — is below.
The section numbers are `CLAUDE.md`'s and do not change.

Every one of these runs from the repository root. The four marked _(→ apps/web)_ are
root passthroughs to the `apps/web` workspace script of the same name, so a new
contributor never has to know where the Payload CLI lives.

```
npm run dev              # Next + Payload against local Postgres  (→ apps/web)
npm run verify           # typecheck + lint + format:check + unit tests + unit coverage gates  <- pre-commit
npm run verify:full      # verify, plus the integration suite and its own coverage gate  <- CI
npm run test             # every Vitest project, watch mode
npm run test:unit        # both Docker-free projects once — `unit` and `unit-dom` — with coverage
npm run test:integration # the integration project once — needs the Docker Postgres
npm run test:integration:coverage  # the same, plus the integration-only coverage gate  <- what verify:full runs
npm run test:e2e         # Playwright
npm run test:e2e:headed  # Playwright, visible browser — the engine for QA sweeps
npm run test:e2e:container          # the whole browser suite in the pinned image, many workers
npm run test:visual      # visual regression - SKIPS off Linux; see docs/testing.md
npm run test:visual:container       # visual regression in the pinned Playwright image
npm run test:visual:container:update  # regenerate only the baselines that changed
npm run test:a11y        # accessibility
npm run test:perf        # Lighthouse CI budgets
npm run db:migrate       # apply every pending migration  (→ apps/web)
npm run db:migrate:down  # roll the most recent batch back  (→ apps/web)
npm run db:seed          # seed from the handoff prototype content  (→ apps/web)
```

**There are two gates, deliberately, and they are not the same gate.**

`npm run verify` is the pre-commit gate, run by the Husky hook. It is **typecheck, lint,
`prettier --check .` and the two Docker-free Vitest projects only** — `unit` (pure, Node) and `unit-dom`
(`*.test.tsx`, jsdom), which `test:unit` runs together under one coverage report. No
integration tests, no Docker. That is a decision, not
an oversight: a pre-commit gate that fails whenever a developer's Postgres container is
down trains its author to reach for `--no-verify`, which §8.2 forbids outright. A gate
has to be one a developer can always pass honestly.

`npm run verify:full` is the CI gate. It is `verify` plus **`test:integration:coverage`**,
which runs the integration suite AND the separate coverage pass that gates the
integration-only files (`vitest.integration.config.ts`). That is the script `verify:full`
actually depends on — `test:integration` is the same suite without the coverage gate, kept
for a fast local run. It needs a running Postgres. **It is what must pass before any completion claim**, and
what a branch is merged on — `verify` alone is not evidence that the work is done.
