# Travel Diary — Engineering Standards

The working agreement, **not advisory**: if a task needs one broken, stop and say so.

**Read this whole; read a section's `docs/standards/` detail only when your task touches it.** Section numbers are frozen: `CLAUDE.md §N` is cited everywhere.

> _What_ to build: `handoff/design_handoff_travel_diary/`. _How_: this file and `docs/standards/`.

## 0 · Always true

Binding on every task; no detail file.

1. TDD: the failing test exists first, and is watched failing for the expected reason.
2. A test that has never failed is unproven. Domain logic is tested to 100%.
3. Patterns are chosen deliberately and named in the module header.
4. No claim of "done", "fixed" or "passing" without pasted command output.
5. `npm run verify` before every commit, `npm run verify:full` before any completion claim. Never `--no-verify`.
6. Never commit secrets, `.env`, or generated artefacts.
7. Repository content never leaves this machine; a missing local tool makes a check UNRESOLVED, never outsourced (§7.1).
8. `any` and the non-null `!` are banned — use `unknown` and narrow.
9. Key everything by journey id; address rows by id, never by array position.
10. One logical change per commit, with a body explaining _why_.

## 1 · Documentation standard

A deliverable, not an afterthought.
**Detail:** `docs/standards/01-documentation.md`

### 1.1 Code-level

Module header, TSDoc, why-comments, invariants, `// HANDOFF-DEVIATION:`.

### 1.2 Repository-level

Nine documents with fixed homes; three of them descriptive rather than load-bearing.

### 1.3 Rules

Load-bearing docs ship in the commit; descriptive ones when they become false.

### 1.4 A module header is an orientation, not a history

Five lines or so, plus any invariant a future edit could break.

## 2 · Testing standard

Nine types: unit, integration, contract, end-to-end, visual, accessibility, performance, security, migration.
**Detail:** `docs/standards/02-testing.md`

### 2.1 Coverage gates

100% on `packages/domain/**`, 95% on `apps/web/lib/**`. **No file is in neither config's `include`.**

### 2.2 TDD cycle — mandatory

Red — watched failing for the expected reason — green, refactor. Red-to-green is one commit.

### 2.3 Test quality

One behaviour per test, injected time, factory fixtures. Mock the boundary, not our own modules.

## 3 · Code quality

**Detail:** `docs/standards/03-code-quality.md`

### 3.1 Non-negotiable

`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Zod at every trust boundary. Zero lint warnings.

### 3.2 Readability

Names say what a thing _is_. One job per function, guard clauses, no dead code.

### 3.3 Design patterns — deliberate, named, documented

Ports & Adapters, State machine, Repository, DTO, Factory, Value objects, Result type. A header names the one it implements, or says it implements none and why.

## 4 · YAGNI

Build what the handoff specifies. No abstraction for a single caller.
**Detail:** `docs/standards/04-yagni.md`

## 5 · Definition of Done

Tests first; suite green and pasted; gates met; docs in the same commit; budgets verified; handoff re-diffed; UI sweeps committed.
**Detail:** `docs/standards/05-definition-of-done.md`

## 6 · Performance budgets — hard gates

60fps flip, `transform`/`opacity` only. Diary JS ≤ 180KB gzipped, admin ≤ 320KB. LCP ≤ 3.0s — book at 1350x940, mobile pinned at 412x823, DPR 1.75. CLS ≤ 0.1, INP ≤ 200ms. No N+1; always a derivative tier.
**Detail:** `docs/standards/06-performance.md`

## 7 · Data handling

Key by journey id. Derive what the data model calls derived. Soft delete from migration one; migrations reversible. Select narrowly, set `depth`.
**Detail:** `docs/standards/07-data-handling.md`

### 7.1 Repository content never leaves this machine without explicit approval

Nothing here goes to an external service without the owner's approval for that request. A missing local tool makes a check UNRESOLVED, never outsourced.

## 8 · Git workflow

Never commit to `main`. Branch; small commits, each green under `npm run verify`; read the staged diff before committing.
**Detail:** `docs/standards/08-git-workflow.md`

### 8.2 Commit messages — Conventional Commits, with a real body

`<type>(<scope>): <summary>`, then why the change exists, then `Tests:` and `Refs:`. Never skip hooks.

## 9 · Triple-check protocol

Correctness (a hostile re-read), verification (run it, paste it), specification (re-diff the handoff).
**Detail:** `docs/standards/09-triple-check.md`

## 10 · Browser QA

Mandatory: `sweeping-for-browser-defects` to find, `fixing-browser-defects` to fix. Never patch from a sweep without a failing test first.
**Detail:** `docs/standards/10-browser-qa.md`

## 11 · Commands

`npm run verify` is the Husky pre-commit gate; `npm run verify:full` is the CI gate, and needs Postgres.
**Detail:** `docs/standards/11-commands.md`
