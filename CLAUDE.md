# Travel Diary — Engineering Standards

Authoritative working agreement for this repository. These rules are **not advisory**. If a task cannot be completed without breaking one of them, stop and say so rather than breaking it quietly.

> Source of truth for *what* to build: `handoff/design_handoff_travel_diary/` (`README.md`, `SCREENS.md`, `DATA_MODEL.md`, `SECURITY.md`).
> Source of truth for *how* to build it: this file.

---

## 0 · The ten non-negotiables

1. Every public symbol is documented. Every module has a header explaining its purpose.
2. Every behaviour is tested. Domain logic is tested to 100%.
3. TDD: a failing test exists before the implementation that satisfies it.
4. No claim of "done", "fixed" or "passing" without pasted command output proving it.
5. Patterns are chosen deliberately and named in the module header. No accidental architecture.
6. Readability outranks cleverness. If it needs a comment to explain *what*, rewrite it.
7. Performance budgets are hard gates, not aspirations (§6).
8. Data is fetched narrowly, keyed by id, and never over-fetched (§7).
9. One logical change per commit, with a body explaining *why* (§8).
10. Triple-check before handoff: self-review, test-run, spec-diff (§9).

---

## 1 · Documentation standard

Documentation is a deliverable, not an afterthought. **All of the following types are required.**

### 1.1 Code-level

| Type | Rule |
|---|---|
| **Module header** | Every `.ts`/`.tsx` file opens with a block comment: what it does, the pattern it implements, what it depends on. |
| **TSDoc** | Every exported function, type, class, constant. `@param`, `@returns`, `@throws`, and `@example` for anything non-obvious. |
| **Why-comments** | Inline comments explain *why*, never *what*. A comment restating the code is a defect. |
| **Invariants** | Any assumption a future edit could break is stated at the point it is relied upon. |
| **Deviations** | Any departure from the handoff carries `// HANDOFF-DEVIATION: <reason>` and an entry in `docs/deviations.md`. |

### 1.2 Repository-level

| Document | Location | Contents |
|---|---|---|
| README | `README.md` | What it is, prerequisites, setup in copy-pasteable steps, common commands |
| Architecture | `docs/architecture.md` | System diagram, module boundaries, data flow, why each seam exists |
| ADRs | `docs/adr/NNNN-<slug>.md` | One per irreversible decision. Context / Options / Decision / Consequences |
| Data model | `docs/data-model.md` | Collections, relationships, derived-vs-stored, migration history |
| API | `docs/api.md` | Every route and server action: input, output, errors, auth requirement |
| Runbook | `docs/runbook.md` | Deploy, rollback, restore-from-backup, rotate secrets, common incidents |
| Security | `docs/security.md` | How each `SECURITY.md` requirement is discharged, with file references |
| Testing | `docs/testing.md` | Strategy, how to run each suite, how to add each test type |
| Deviations | `docs/deviations.md` | Every `HANDOFF-DEVIATION`, with rationale |

### 1.3 Rules

- Documentation ships **in the same commit** as the code it describes. Never a follow-up.
- A stale document is worse than none — changing behaviour means updating its docs in that commit.
- Diagrams as Mermaid in Markdown, so they diff.
- No `TODO`, `TBD`, `FIXME` or placeholder text on a branch proposed for merge.

---

## 2 · Testing standard

**All of the following types are required.** A feature is not complete until every applicable row is satisfied.

| Type | Tool | Scope |
|---|---|---|
| **Unit** | Vitest | Pure functions, state machines, mappers, validators. Fast, no I/O. |
| **Integration** | Vitest + test Postgres | Collections, hooks, server actions, access control against a real database. |
| **Contract** | Vitest | Every adapter (storage, mailer, queue) — one shared suite run against both the local and the production implementation. |
| **End-to-end** | Playwright | Real journeys: page flip, bookmark jump, gallery, lightbox, mobile swipe, sign-in + OTP, upload round-trip. |
| **Visual regression** | Playwright snapshots | Every page type and every admin screen, at each breakpoint. The design is high-fidelity; drift is a defect. |
| **Accessibility** | axe-core in Playwright | Every route. Contrast ratios from the handoff's token table are asserted, not assumed. |
| **Performance** | Lighthouse CI + custom probes | Budgets in §6, enforced in CI. |
| **Security** | Vitest + scripted probes | Rate limits, lockout, OTP single-use, SVG rejection, EXIF stripping, authorization on every mutation. |
| **Migration** | Vitest | Every migration runs up, down, and up again against a seeded database. |

### 2.1 Coverage gates — enforced in `vitest.config.ts`; CI fails below

| Layer | Lines | Branches | Functions |
|---|---|---|---|
| `packages/domain/**` (pure logic) | **100%** | **100%** | **100%** |
| `apps/web/lib/**`, server actions | 95% | 95% | 95% |
| Repository-wide | 90% | 90% | 90% |

100% is required where it is meaningful — pure domain logic, where every branch is a real behaviour. It is *not* demanded of framework glue, where chasing the last percent produces tests that assert the framework rather than our code. Uncovered lines outside the domain layer require an `/* c8 ignore next -- <reason> */` with a real reason.

### 2.2 TDD cycle — mandatory

1. **Red** — write the failing test. Run it. Confirm it fails *for the expected reason*.
2. **Green** — the minimum code that passes.
3. **Refactor** — clean up with the suite green.
4. Commit red-to-green as one commit; refactors as their own.

A test written after the implementation it covers is not TDD, and tends to encode the bug.

### 2.3 Test quality

- Test names read as sentences: `returns the previous page when the reader flips backward`.
- One behaviour per test. No assertion soup.
- Arrange-Act-Assert, visually separated.
- **No mocking what we own.** Mock the network boundary, the clock, the filesystem — not our own modules.
- Time is always injected. Never `Date.now()` inside logic under test.
- Fixtures are factories with overrides, never shared mutable objects.
- A test that has never failed is unproven — verify it fails when the behaviour is broken.

---

## 3 · Code quality

### 3.1 Non-negotiable

- **TypeScript `strict`**, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- **`any` is banned.** Use `unknown` and narrow. Casts require a comment justifying them.
- **No non-null assertions (`!`)** — narrow properly, or make the state unrepresentable.
- Runtime validation at every trust boundary (Zod): request bodies, environment variables, external responses.
- Errors are typed and handled. No empty `catch`. No swallowed rejections — except the one the handoff mandates for autoplay, which carries a comment saying so.
- ESLint and Prettier enforced pre-commit and in CI. Zero warnings.

### 3.2 Readability

- Names say what a thing *is*. No `data`, `info`, `handle`, `tmp`, `x`.
- Functions do one thing. Past ~40 lines, ask what it is hiding.
- Files stay focused. Past ~300 lines, it is probably two modules.
- Nesting past three levels: use early returns and guard clauses.
- Boolean parameters are banned in public APIs — pass an options object with named fields.
- Prefer pure functions. Push side effects to the edges.
- Delete dead code. Git remembers it.

### 3.3 Design patterns — deliberate, named, documented

Chosen for this codebase. Each module header names the one it implements.

| Pattern | Applied to | Why |
|---|---|---|
| **Ports & Adapters** | storage, mailer, transcode queue | Local stand-ins now, cloud services at deploy, one shared contract suite |
| **State machine** | page-flip lifecycle | The flip is four timers and a latch; as an explicit machine, illegal states become unrepresentable |
| **Repository** | Payload access behind typed accessors | The diary never learns what a CMS row looks like |
| **Data Transfer Object** | `BookBundle` | One serialization boundary between server and diary client |
| **Factory** | test fixtures, seed data | Overridable defaults, no shared mutable state |
| **Value objects** | ids, slugs, focal points | Branded types — a `JourneyId` cannot be passed where a `PageId` belongs |
| **Result type** | fallible operations | Errors are values at boundaries; exceptions stay exceptional |

**Anti-patterns, explicitly rejected:** singletons holding mutable state; god modules; a `utils` dumping ground; inheritance where composition works; premature abstraction — a pattern earns its place on the second real use, never the first.

---

## 4 · YAGNI

Build what the handoff specifies. No speculative extension points, no configuration nobody asked for, no abstraction serving a single caller. Deleting speculative code costs more than never writing it.

---

## 5 · Definition of Done

A change is done only when **all** hold:

- [ ] Tests written first; every applicable type from §2 is present
- [ ] Full suite green — output pasted
- [ ] Coverage gates met — report pasted
- [ ] Typecheck clean, lint clean, zero warnings
- [ ] Every §1 document affected is updated in the same commit
- [ ] Performance budgets (§6) verified
- [ ] Accessibility checks pass on touched routes
- [ ] Handoff spec re-read and diffed against the implementation
- [ ] Self-review of the diff, as a reviewer would
- [ ] No `TODO`/`FIXME`/placeholder/commented-out code
- [ ] Commits follow §8

---

## 6 · Performance budgets — hard gates

| Budget | Limit |
|---|---|
| Page flip | Sustained 60fps. **Only `transform` and `opacity` animated** — never layout properties |
| Diary route JS | ≤ 180KB gzipped |
| Admin route JS | ≤ 320KB gzipped |
| LCP (diary, 4G) | ≤ 2.5s |
| CLS | ≤ 0.1 |
| INP | ≤ 200ms |
| Database queries per request | No N+1. Every list is one query with joins |
| Images | Always a derivative tier, never an original. `hero2x` for displays ≥2× |

Rules: virtualize the gallery grid past 100 tiles. Debounce or `requestAnimationFrame` every resize and scroll handler. Prefer `ResizeObserver` to resize listeners. No synchronous layout reads inside animation frames. Memoize by identity, not by deep compare. Measure before optimizing — and paste the measurement.

---

## 7 · Data handling

- **Key everything by journey id.** The handoff records five separate defects caused by per-journey state held in one global value. This is the single most important structural rule here.
- **Address rows by id, never by array position.** Sorting reorders; indices desync from what is highlighted.
- **Derive, never store**, what the data model lists as derived: page numbers, the `03 / 33` counter, contents entries, bookmark spans, media counts, storage totals.
- **Soft delete from the first migration** — `deletedAt` and drafts are painful to retrofit.
- Free-text `dates` always travels with a sortable `startsOn`.
- Select only the fields needed; set `depth` explicitly on every Payload query.
- All migrations are reversible and tested in both directions.
- Validate at the boundary, then trust the type inside.
- Never log secrets, tokens, OTP codes, or full email addresses.

---

## 8 · Git workflow

### 8.1 Step by step, every time

1. `git status` — confirm a clean tree before starting.
2. `git checkout main && git pull` — start from current.
3. `git checkout -b <type>/<short-slug>` — never commit directly to `main`.
4. Work in **small commits**, each one green: run `npm run verify` before every commit.
5. `git add -p` — stage deliberately. **Never `git add -A` without reading the diff.**
6. `git diff --staged` — read what you are about to commit, in full.
7. `git commit` — message per §8.2.
8. `git push -u origin <branch>`.
9. Open a PR describing what changed and why, with the verification output pasted.
10. Merge only with CI green.

### 8.2 Commit messages — Conventional Commits, with a real body

```
<type>(<scope>): <imperative summary, 72 chars or fewer>

<why this change exists — the problem, not the diff>
<what approach was taken, and what was rejected, if non-obvious>
<any consequence a future reader needs: migration, breaking change, perf note>

Tests: <what was added or changed>
Refs: <handoff section, ADR, or issue>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

`type`: `feat` `fix` `refactor` `test` `docs` `perf` `chore` `build` `ci` `revert`
`scope`: `diary` `admin` `auth` `media` `db` `tokens` `ui` `infra` `docs`

**Rules**

- One logical change per commit. A commit doing two things gets split.
- The body explains **why**. "Fixed bug" is not a commit message.
- Never `--no-verify`. Never skip hooks. A failing hook is a real signal.
- Never force-push a shared branch.
- Never amend a pushed commit.
- Never commit secrets, `.env`, or generated artefacts.
- Every commit builds and passes tests **on its own** — `git bisect` must stay useful.

### 8.3 Branch naming

`feat/page-flip-engine` · `fix/otp-expiry-race` · `docs/architecture-diagram` · `refactor/book-bundle-seam` · `test/gallery-visual-regression`

---

## 9 · Triple-check protocol

Before presenting any implementation as complete, three distinct passes:

**Pass 1 — Correctness.** Re-read the diff line by line as a hostile reviewer. Off-by-ones, null paths, error branches, race conditions, missing `await`. Trace the unhappy path.

**Pass 2 — Verification.** Run everything. Paste the output: `npm run verify`, the relevant Playwright suites, the coverage report. A suite you did not watch run is a hypothesis.

**Pass 3 — Specification.** Re-open the handoff section this implements. Diff it against what was built, item by item: every colour token, spacing value, interaction, and copy string. The design is high-fidelity and the copy is deliberate — "nineteen tarts, no regrets" is not a placeholder.

Only after all three: report completion, plainly, with evidence. If something is partial, say exactly what is missing and why — never round up.

---

## 10 · Commands

```
npm run dev            # Next + Payload against local Postgres
npm run verify         # typecheck + lint + unit + integration + coverage gates  <- pre-commit
npm run test           # unit + integration, watch mode
npm run test:e2e       # Playwright
npm run test:visual    # visual regression
npm run test:a11y      # accessibility
npm run test:perf      # Lighthouse CI budgets
npm run db:migrate     # run migrations
npm run db:seed        # seed from the handoff prototype content
```

`npm run verify` is the gate. It runs in the pre-commit hook and in CI, and it must pass before any completion claim.
