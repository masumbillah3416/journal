# 10 · Browser QA

The detail for `CLAUDE.md` §10. `CLAUDE.md` states the rule in short and points here; the
full text — including every sentence this repository quotes as `CLAUDE.md` §10 — is below.
The section numbers are `CLAUDE.md`'s and do not change.

Automated suites catch the regressions someone already anticipated. Driving the real app in a browser catches the rest. Both are required; neither substitutes for the other.

Two project skills in `.claude/skills/` govern this, and they are **mandatory, not optional**:

| Skill                              | Use it when                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`sweeping-for-browser-defects`** | Any UI phase is claimed complete, any screen needs verifying, or bugs need finding. Produces a triaged defect report at `docs/qa/YYYY-MM-DD-<area>-sweep.md` — a sweep that produces no file did not happen. |
| **`fixing-browser-defects`**       | Fixing _anything_ observed in a browser. Enforces: reproduce, root-cause, **failing automated test first**, fix the cause, re-verify in the browser, fix the whole defect class.                             |

**The rule that matters:** never patch a defect straight from a sweep. A fix without a test that failed first proves nothing and guards nothing — the test can never fail again, so it never catches the regression.

Every sweep instruments `console`, `pageerror` and failed responses before walking a route. The handoff's own defect log is mostly _silent_ failures — a swallowed click, a missing derivative, a rejected autoplay promise — none of which are visible in a screenshot.

Defect reports are committed. They are the record of what was covered, and what was not.
