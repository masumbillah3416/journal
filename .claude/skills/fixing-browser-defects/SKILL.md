---
name: fixing-browser-defects
description: Use when fixing anything observed in a browser — a defect from a QA sweep, a bug the user saw on screen, a visual mismatch, a dead click, a console error, or flaky behaviour in the running app.
---

# Fixing Browser Defects

## Overview

A defect you watched happen in a browser feels understood. It usually isn't — you saw the symptom, not the cause. The pull to fix it immediately is strongest exactly when the fix is small, and that is where wrong fixes come from.

**The Iron Law:**

```
NO FIX WITHOUT A FAILING AUTOMATED TEST THAT REPRODUCES IT FIRST
```

**No exceptions:**
- Not for a one-line CSS change
- Not when you can see exactly what's wrong
- Not when the browser already confirms your fix works
- Not for "obviously cosmetic" drift
- Not because writing the test is slower than the fix

Fixed it before writing the test? Revert the fix. Write the test. Watch it fail. Fix it again. **Revert means revert** — not "keep it in the editor and paste it back".

Violating the letter of this rule is violating the spirit of it.

## Why

A fix without a failing test proves nothing. The test can never fail, so it never guards. And the handoff's own defect log is full of bugs that a passing manual check would have missed: the swallowed clicks looked like broken handlers, the desynced gallery selection looked correct until you sorted, the stuck "Checking…" only appeared when two flows overlapped. Each was one line. Each cost a debugging session.

## Process

1. **Reproduce manually, minimally.** Strip the steps to the shortest sequence from a cold load that still fails. If you cannot reproduce it, you cannot fix it — say so.
2. **Find the root cause.** Use `superpowers:systematic-debugging`. Do not skip to the patch. "Add `pointer-events: none`" is a fix; "the back face sits above page content and captures clicks" is a cause.
3. **Write the failing test, at the right level:**

| Defect is in | Test with |
|---|---|
| Pure logic — flip state, page math, contents pagination, OTP lifecycle | Vitest unit test |
| An interaction — clicks, keyboard, swipe, routing, focus | Playwright |
| Appearance — token, spacing, weight, layout | Playwright visual snapshot |
| Server behaviour — access control, rate limit, upload rejection | Integration test against the test database |
| Timing or a race | Unit test with an **injected clock**, never a sleep |

4. **Watch it fail, and read the failure.** It must fail for the reason you diagnosed. A test that fails for a different reason is testing something else.
5. **Fix the cause.** Not the symptom, not the nearest surface.
6. **Watch it pass.**
7. **Re-verify in the browser.** The test passing and the app being right are two claims. Confirm both.
8. **Fix the class, not the instance.** If this was one of the handoff's recorded defect classes — positional indexing, per-journey state held globally, a shared timeout handle, nested toggle state, an unhidden back face — grep for the others now. These arrive in families.
9. **Run `npm run verify`.** Paste the output.
10. **Commit** per `CLAUDE.md` §8, as `fix(<scope>)`, with a body naming the cause and the class.

## Rationalizations

| Excuse | Reality |
|---|---|
| "I can see exactly what's wrong" | You see the symptom. The handoff's dead Contents links looked like broken handlers; the cause was an unhidden back face. |
| "It's a one-line CSS fix" | The `pointer-events` bug was one line and silently broke every click on the page. |
| "A Playwright test for a visual bug is overkill" | The visual snapshot **is** the test. The design is high-fidelity; drift is a defect. |
| "I'll add the test after I confirm the fix" | Then it can never fail, and it guards nothing. |
| "I verified it in the browser, that's better than a test" | Manual verification is one moment. A test is every commit after. |
| "It's flaky, not a real bug" | Flaky means a race. A race is a real bug, and it will surface in front of a reader. |
| "The sweep already documented it, that's the reproduction" | A report is prose. A test is executable. |
| "This is too small to be worth a test" | Small bugs are what the handoff's defect log is entirely made of. |
| "I'll write one test covering all four findings" | Then you cannot tell which regressed. One test per defect. |

## Red flags — stop and restart

- You edited a source file before a test failed
- You are running the browser to decide whether the fix worked
- Your test asserts the fix rather than the behaviour (`expect(el).toHaveCSS('pointer-events','none')` instead of `expect(link).toBeClickable()`)
- You are about to write "should be fine now"
- The failing test passed on its first run
- You found the defect class but only fixed the one instance

**All of these mean: revert, write the test, watch it fail, start again.**

## Common mistakes

- **Testing the implementation, not the behaviour.** Assert that the reader can click the Contents link, not that a CSS property has a value. The property is how it's fixed today; the behaviour is what must stay true.
- **Widening the fix.** A defect report is not permission to refactor the module. Fix the cause, note the refactor separately.
- **Batching fixes into one commit.** One defect, one commit, one test. `git bisect` has to stay useful.
- **Silencing rather than fixing.** Adding a `try/catch`, a `?.`, or a snapshot update to make a symptom disappear leaves the cause in place.
