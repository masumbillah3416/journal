# 1 · Documentation standard

The detail for `CLAUDE.md` §1. `CLAUDE.md` states the rule in short and points here; the
full text — including every sentence this repository quotes as `CLAUDE.md` §1 — is below.
The section numbers are `CLAUDE.md`'s and do not change.

Documentation is a deliverable, not an afterthought. **All of the following types are required.**

### 1.1 Code-level

| Type              | Rule                                                                                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Module header** | Every `.ts`/`.tsx` file opens with a block comment: what it does, the pattern it implements, what it depends on. **Roughly five lines. It is an orientation, not a history** — see §1.4.                                                                                 |
| **TSDoc**         | Every exported symbol **whose signature does not already say what it is**. `@param`, `@returns`, `@throws`, and `@example` where they carry information the types do not. `/** The object's key. */` above `key: string` is noise, and noise is a defect like any other. |
| **Why-comments**  | Inline comments explain _why_, never _what_. A comment restating the code is a defect.                                                                                                                                                                                   |
| **Invariants**    | Any assumption a future edit could break is stated at the point it is relied upon.                                                                                                                                                                                       |
| **Deviations**    | Any departure from the handoff carries `// HANDOFF-DEVIATION: <reason>` and an entry in `docs/deviations.md`.                                                                                                                                                            |

### 1.2 Repository-level

| Document     | Location                  | Contents                                                                                                                                              |
| ------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| README       | `README.md`               | What it is, prerequisites, setup in copy-pasteable steps, common commands                                                                             |
| Architecture | `docs/architecture.md`    | System diagram, module boundaries, data flow, why each seam exists. **Revised when it becomes false, not on every commit that touches it** — see §1.3 |
| ADRs         | `docs/adr/NNNN-<slug>.md` | One per irreversible decision. Context / Options / Decision / Consequences                                                                            |
| Data model   | `docs/data-model.md`      | Collections, relationships, derived-vs-stored, migration history. **Revised when it becomes false, not on every commit that touches it** — see §1.3   |
| API          | `docs/api.md`             | Every route and server action: input, output, errors, auth requirement                                                                                |
| Runbook      | `docs/runbook.md`         | Deploy, rollback, restore-from-backup, rotate secrets, common incidents                                                                               |
| Security     | `docs/security.md`        | How each `SECURITY.md` requirement is discharged, with file references                                                                                |
| Testing      | `docs/testing.md`         | Strategy, how to run each suite, how to add each test type                                                                                            |
| Deviations   | `docs/deviations.md`      | Every `HANDOFF-DEVIATION`, with rationale                                                                                                             |

### 1.3 Rules

- Documentation ships **in the same commit** as the code it describes. Never a follow-up.
- A stale document is worse than none — changing behaviour means updating its docs in that commit.

**Two tiers, because lockstep across nine documents was manufacturing defects.**
Measured at the end of Phase 3 Task 7: **eight of that review's fifteen findings
were prose-accuracy findings** — a document asserting what the code does not do,
a count that had drifted, a citation pointing at the wrong line. Every one was
real, and every one existed because a sentence was written twice and maintained
once.

- **Load-bearing, and they ship in the commit:** `docs/security.md`,
  `docs/testing.md`, `docs/runbook.md`, `docs/deviations.md`, the ADRs, and
  `README.md`. These record obligations, decisions and operational steps that
  exist nowhere else. If the code contradicts them, the code is not done.
- **Descriptive, and they are revised when they become false:**
  `docs/architecture.md`, `docs/data-model.md`, `docs/api.md`. These largely
  restate what the code and the schema already say, and restating code is
  precisely what drifts. Correct them when an assertion in them stops being
  true — not because a commit happened to touch a file they mention.

What keeps the second tier honest is **automation, not diligence**:
`apps/web/lib/docs/` already fails `verify` on a broken path citation, a stale
config citation, an uncompilable fenced example and a drifted case count. That
is a guard that cannot forget. A blanket rule asking every author to re-read
nine documents is a guard that forgets constantly, and then gets caught by a
reviewer at review prices.

**Prose that restates code earns nothing and costs on every read.** Prefer
deleting a sentence to maintaining it. A count in prose is a floor, or it is
deleted.

- Diagrams as Mermaid in Markdown, so they diff.
- No `TODO`, `TBD`, `FIXME` or placeholder text on a branch proposed for merge.

### 1.4 A module header is an orientation, not a history

Roughly five lines: what the module does, the pattern it implements (§3.3), what
it depends on. Plus — and this is the part worth its space — any **invariant a
future edit could break**, stated where it is relied upon.

**What does not belong in a header is the story of how it got this way.**
Narrating a past fix round, a defect that was corrected, or the option that was
rejected is writing a changelog into a file that is re-read every time anyone
opens it. `scripts/run-lighthouse.mjs` reached a 67-line header on a 130-line
file, most of it recounting a Phase 2 fix round. That history is worth keeping —
it is simply worth keeping **once**, where it is read once:

| What you want to record                  | Where it goes                        |
| ---------------------------------------- | ------------------------------------ |
| Why this decision, and what was rejected | an ADR (`docs/adr/`)                 |
| What went wrong and how it was found     | the commit body (§8.2)               |
| An invariant a future edit could break   | the header, at the point relied upon |
| A count, a measurement, a benchmark      | a test that fails when it changes    |

A sentence that would fail if the code changed belongs in a test, not a comment.
A sentence that only a human can check belongs where humans look things up.

The existing headers are not being rewritten wholesale — they are corrected as
their files are touched. Deleting accurate prose has its own cost, and a
repository-wide reflow would be a diff nobody can review.
