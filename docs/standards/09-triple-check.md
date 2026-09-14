# 9 · Triple-check protocol

The detail for `CLAUDE.md` §9. `CLAUDE.md` states the rule in short and points here; the
full text — including every sentence this repository quotes as `CLAUDE.md` §9 — is below.
The section numbers are `CLAUDE.md`'s and do not change.

Before presenting any implementation as complete, three distinct passes:

**Pass 1 — Correctness.** Re-read the diff line by line as a hostile reviewer. Off-by-ones, null paths, error branches, race conditions, missing `await`. Trace the unhappy path.

**Pass 2 — Verification.** Run everything. Paste the output: `npm run verify`, the relevant Playwright suites, the coverage report. A suite you did not watch run is a hypothesis.

**Pass 3 — Specification.** Re-open the handoff section this implements. Diff it against what was built, item by item: every colour token, spacing value, interaction, and copy string. The design is high-fidelity and the copy is deliberate — "nineteen tarts, no regrets" is not a placeholder.

Only after all three: report completion, plainly, with evidence. If something is partial, say exactly what is missing and why — never round up.
