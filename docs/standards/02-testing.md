# 2 · Testing standard

The detail for `CLAUDE.md` §2. `CLAUDE.md` states the rule in short and points here; the
full text — including every sentence this repository quotes as `CLAUDE.md` §2 — is below.
The section numbers are `CLAUDE.md`'s and do not change.

**All of the following types are required.** A feature is not complete until every applicable row is satisfied.

| Type                  | Tool                          | Scope                                                                                                                   |
| --------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Unit**              | Vitest                        | Pure functions, state machines, mappers, validators. Fast, no I/O.                                                      |
| **Integration**       | Vitest + test Postgres        | Collections, hooks, server actions, access control against a real database.                                             |
| **Contract**          | Vitest                        | Every adapter (storage, mailer, queue) — one shared suite run against both the local and the production implementation. |
| **End-to-end**        | Playwright                    | Real journeys: page flip, bookmark jump, gallery, lightbox, mobile swipe, sign-in + OTP, upload round-trip.             |
| **Visual regression** | Playwright snapshots          | Every page type and every admin screen, at each breakpoint. The design is high-fidelity; drift is a defect.             |
| **Accessibility**     | axe-core in Playwright        | Every route. Contrast ratios from the handoff's token table are asserted, not assumed.                                  |
| **Performance**       | Lighthouse CI + custom probes | Budgets in §6, enforced in CI.                                                                                          |
| **Security**          | Vitest + scripted probes      | Rate limits, lockout, OTP single-use, SVG rejection, EXIF stripping, authorization on every mutation.                   |
| **Migration**         | Vitest                        | Every migration runs up, down, and up again against a seeded database.                                                  |

### 2.1 Coverage gates — enforced in `vitest.config.ts` and `vitest.integration.config.ts`; CI fails below

| Layer                             | Lines    | Branches | Functions |
| --------------------------------- | -------- | -------- | --------- |
| `packages/domain/**` (pure logic) | **100%** | **100%** | **100%**  |
| `apps/web/lib/**`, server actions | 95%      | 95%      | 95%       |

**There is no repository-wide floor, deliberately.** There was a 90% one, and it
gated the wrong thing: the layers that carry real behaviour already have
stricter gates above, so the only files a repo-wide number could ever bind are
framework glue — the passthroughs, the route wrappers, the generated types. A
floor across those does not buy coverage of our logic; it buys tests that assert
Next.js and Payload behave as documented, and it produced at least one commit
(`4c1b267`) whose entire purpose was widening floors CI had failed on. That
commit added no test and found no defect.

What replaces it is the rule that was doing the work all along: **no file is in
neither config's `include`** (below). A file nothing measures is the real
danger, and that is a question of registration, not of a percentage.

> **State of this change, stated rather than assumed.** The requirement was
> removed as of Phase 3 Task 8, and the enforcement followed in the standards
> task: `vitest.config.ts` no longer carries the global `90` block, and
> `docs/testing.md`'s table no longer prints the row. Removing a _global_
> threshold is not a deletion — every file inside an `include` that matches no
> per-glob threshold falls through to no gate at all — so the set that was
> falling through was enumerated first, against `coverage/lcov.info` with the
> same `picomatch` call Vitest makes. It held two files,
> `apps/web/scripts/placeholder.ts` and `apps/web/scripts/run-seed.ts`, and
> both are named in `vitest.config.ts` at the numbers they measure.

100% is required where it is meaningful — pure domain logic, where every branch is a real behaviour. It is _not_ demanded of framework glue, where chasing the last percent produces tests that assert the framework rather than our code. Uncovered lines outside the domain layer require an `/* c8 ignore next -- <reason> */` with a real reason.

**No file is in neither config's `include`.** A file no `include` matches is not reported as 0% — it is not reported at all, and an unmeasured file looks exactly like a fully-covered one. Two configs exist because no single Vitest run can execute everything: the Docker-free pass measures what it can run, and `vitest.integration.config.ts` measures what needs a real Postgres. A file unreachable from either gets one of two honest treatments, never silence: exclude-and-regate where some other pass can genuinely see it, or a `c8 ignore` carrying its reason where nothing can. Adding code in a new directory means adding that directory to an `include`, with a real threshold, in the same commit.

**Narrow carve-out: a verified coverage-tooling bug, not an escape hatch.** Both honest treatments above assume the chosen mechanism actually works. It has been observed not to: `@vitest/coverage-v8`'s ignore-hint scanner does not take effect on a file whose path contains a Next.js dynamic-route bracket segment (`[...slug]`, `[[...segments]]`) — reproduced by copying such a file byte-for-byte into an unbracketed sibling directory and observing the copy get ignored correctly while the bracketed original was not (Phase 1, Task 1). A file may be absent from both configs' `include`/reachable-and-ignored set only when **all** of the following hold, each stated at the point of exclusion (the config comment and `docs/testing.md`): (1) the file is verified, by reading it, to contain zero authored logic — a pure re-export or framework passthrough, never a file with a single real branch or line of our own; (2) a specific, reproducible tooling defect is named and demonstrated, showing that neither exclude-and-regate nor `c8 ignore` can be made to work for it, not merely that neither was tried; (3) the exclusion names the file's exact path, never a directory wildcard — so a future file placed alongside it, even one sharing the same bracketed parent, is not silently swept into the same hole and must justify its own exclusion or be measured. Revisit every such exclusion when the coverage tooling's version changes, since a fixed bug removes the justification.

### 2.2 TDD cycle — mandatory

1. **Red** — write the failing test. Run it. Confirm it fails _for the expected reason_.
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
