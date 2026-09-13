# 5 · Definition of Done

The detail for `CLAUDE.md` §5. `CLAUDE.md` states the rule in short and points here; the
full text — including every sentence this repository quotes as `CLAUDE.md` §5 — is below.
The section numbers are `CLAUDE.md`'s and do not change.

A change is done only when **all** hold:

- [ ] Tests written first; every applicable type from §2 is present
- [ ] Full suite green — output pasted
- [ ] Coverage gates met — report pasted
- [ ] Typecheck clean, lint clean, zero warnings
- [ ] Every §1 document affected is updated in the same commit
- [ ] Performance budgets (§6) verified
- [ ] Accessibility checks pass on touched routes
- [ ] Handoff spec re-read and diffed against the implementation
- [ ] **UI changes: a browser sweep has been run and its report committed (§10)**
- [ ] Self-review of the diff, as a reviewer would
- [ ] No `TODO`/`FIXME`/placeholder/commented-out code
- [ ] Commits follow §8
