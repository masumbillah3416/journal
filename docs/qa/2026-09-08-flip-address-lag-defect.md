# Defect: `e2e/flip.spec.ts:157` read the address as part of the published page — 2026-09-08

**Subject:** `e2e/flip.spec.ts:157`, `publishes no page but the one it left and the one it was
asked for, for the whole of a bookmark jump` — the case that guards PH1-001
(`docs/qa/2026-09-03-phase-1-closing-sweep.md`, S2).

**Engine:** Playwright 1.62.1, Chromium, `npm run dev` (Turbopack) on the seeded local
Postgres. Projects `desktop` 1440×900 and `mid` 1000×800; `mobile` skips this file, because
below 860px SCREENS.md §1.10 replaces the book.

**Classification:** **test-side**, confirmed twice in Phase 2 review and confirmed a third
time here by measurement. **No application file was changed.**

**Result:** fixed. One case rewritten, one case added, one test-support export added. The
reproduction is kept as a permanent case rather than thrown away.

---

## 1 · What was observed

The case failed roughly 2% of runs, in CI and locally, with a third reading between the two
ends:

```
Array [
  "30 / 33 | Seville — Notes | 29 | /p/30",
+ "02 / 33 | Contents | 1 | /p/30",
  "02 / 33 | Contents | 1 | /p/2",
]
```

Read as the case read it, that third entry says "the diary published a page that is neither
the one the reader left nor the one they asked for" — the exact shape of PH1-001. Read
field by field it says something else entirely: the first three fields **are** the
destination, and only the fourth, the address, is still the origin.

## 2 · Reproducing it deterministically

A 2% flake cannot be watched to fail on demand, so the reproduction makes the lag certain
rather than occasional. `deferAddressWrites(page, { delayMs })` in `e2e/support/liveBook.ts`
wraps `history.replaceState` from an `addInitScript`, so every address write the book makes
is delayed past the case's own 40ms poll.

Installed into the case **as it then stood, unmodified**:

```
npx playwright test e2e/flip.spec.ts -g "publishes no page but the one it left" --repeat-each=5
```

**10 of 10 failed** (5 repeats × the two projects that draw a book; 5 mobile skipped), every
one of them on the same third reading:

```
  1) [desktop] › e2e\flip.spec.ts:157:1 › publishes no page but the one it left and the one it was asked for, for the whole of a bookmark jump

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 0
    + Received  + 1

      Array [
        "30 / 33 | Seville — Notes | 29 | /p/30",
    +   "02 / 33 | Contents | 1 | /p/30",
        "02 / 33 | Contents | 1 | /p/2",
      ]

    > 204 |   expect(published.seen).toEqual([published.origin, '02 / 33 | Contents | 1 | /p/2'])

  10 failed
    [desktop] › … × 5
    [mid] › … × 5
  5 skipped
```

That output is the diagnosis, made by the machine rather than asserted by a human: the extra
reading differs from the destination **in the address and nowhere else**.

**And the same command without the lag, at `--repeat-each=50`, passed 100 of 100** (12.2m).
That is what a 2% flake looks like on a good afternoon, and it is why the reproduction above
exists. A green fifty-run is the expected outcome of changing nothing at all; it is evidence
about the afternoon, not about the fix.

## 3 · Root cause

The case polled one tuple every 40ms —

```
counter | page label | aria-current bookmark | location.pathname
```

— and asserted the set of distinct readings was exactly `[origin, destination]`. Three of
those four fields are the book's **published identity**, written in one React commit. The
fourth is the **address**, written by a separate effect in
`apps/web/components/book/Book.tsx`:

```ts
useEffect(() => {
  if (!complete) return

  window.history.replaceState(null, '', pagePath(state.index))
}, [state.index, complete])
```

That effect runs _after_ the render that already shows the new counter, label and tab. So
there is a window of up to one 40ms poll in which the tuple reads
`02 / 33 | Contents | 1 | /p/30` — a value that is neither end.

## 4 · Why the application was not changed

`Book.tsx`'s header already records this, deliberately and at length:

> SO THE ADDRESS CAN LAG A COMMITTED TURN, AND THAT IS A KNOWN COST RATHER THAN AN
> INVARIANT. […] a turn whose destination the served window already carries commits on its
> own schedule, so between the commit and the answer the counter names the new page and the
> address still names the old one […] It is held open deliberately, because the alternative
> costs the remount above, and it is pinned by `Book.test.tsx`'s "holds the address behind a
> committed turn".

Writing the address earlier is what `docs/adr/0009-server-rendered-page-window.md` measured
and rejected: `history.replaceState` moves the router's own idea of which `/p/<n>` it is on,
so a write issued before the whole-book answer lands turns the next turn into a segment
navigation, which unmounts the book.

The case therefore asserted a coupling the application has never promised. Published page
identities are only ever the two ends; the address is a separate series that settles. The
defect is in the assertion, and a change to `Book.tsx` would have been a real regression
bought to make a test stop complaining.

## 5 · The fix

- `e2e/support/liveBook.ts` gains `deferAddressWrites`, the reproduction above, as a
  supported export rather than a throwaway.
- `e2e/flip.spec.ts` gains one local helper,
  `pollPublishedSeriesAfterContentsClick(page)`, which clicks the Contents tab and polls
  **two ordered, adjacent-deduplicated series** instead of one tuple: `identities` (counter,
  label, active tab) and `addresses` (`location.pathname`).
- The original case asserts them separately:

  ```ts
  expect(published.identities).toEqual([published.identities[0], '02 / 33 | Contents | 1'])
  expect(published.addresses).toEqual(['/p/30', '/p/2'])
  ```

  The address still may not visit a third place, and still must start where the reader was
  and end where they went. What is no longer asserted is that it changes on the _same poll_
  as the identity — which is the only thing `Book.tsx` does not promise.

- A second case, `publishes no third page even when the address write is delayed well past a
poll`, keeps `deferAddressWrites(page, { delayMs: 200 })` permanently. The reproduction
  becomes the regression guard: it proves the identity series does not depend on when the
  address is written. It deliberately does **not** assert the address series, because under
  an injected 200ms delay that would be asserting on the injection.

**Adjacent-deduplicated and ordered, not a `Set`.** The original used `new Set(readings)`,
which discards order — a book that published the destination, went back to the origin and
returned would have produced the same set as one that never wavered. Two of the three things
these cases guard are about order.

## 6 · Verification

All three runs from the worktree, `npm run dev` on port 3000, seeded local Postgres.

**1 · The fixed case, fifty repeats.**

```
npx playwright test e2e/flip.spec.ts -g "publishes no page but the one it left" --repeat-each=50

  50 skipped
  100 passed (11.8m)
```

**2 · The new lag case, ten repeats.**

```
npx playwright test e2e/flip.spec.ts -g "publishes no third page even when the address write is delayed" --repeat-each=10

  10 skipped
  20 passed (2.7m)
```

**3 · Mutation — the step that proves the cases still guard PH1-001.** `Book.tsx` was
temporarily made to publish the page stack's **anchor** as the reader's page — the three
published fields read `state.anchor` instead of `state.index`, which is exactly the defect
PH1-001 recorded ("clicking Contents from `/p/29` read `03 / 33 · Tokyo — Notes` at `/p/3`,
with Tokyo's tab lit, for 981ms"). **Both cases failed, on the identity series carrying a
third entry:**

```
npx playwright test e2e/flip.spec.ts -g "publishes no" --project=desktop

Running 2 tests using 1 worker

  x  1 [desktop] › e2e\flip.spec.ts:244:1 › publishes no page but the one it left and the one it was asked for, for the whole of a bookmark jump (5.0s)
  x  2 [desktop] › e2e\flip.spec.ts:283:1 › publishes no third page even when the address write is delayed well past a poll (4.5s)


  1) [desktop] › e2e\flip.spec.ts:244:1 › publishes no page but the one it left and the one it was asked for, for the whole of a bookmark jump

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 0
    + Received  + 1

      Array [
        "30 / 33 | Seville — Notes | 29",
    +   "03 / 33 | Tokyo — Notes | 2",
        "02 / 33 | Contents | 1",
      ]

      272 |   // spans it. The origin is read out of the page rather than written down, so
      273 |   // the case cannot drift from the seed.
    > 274 |   expect(published.identities).toEqual([published.identities[0], '02 / 33 | Contents | 1'])
          |                                ^
```

and the second case, run on its own so its own frame is legible:

```
npx playwright test e2e/flip.spec.ts -g "publishes no third page" --project=desktop

  1) [desktop] › e2e\flip.spec.ts:283:1 › publishes no third page even when the address write is delayed well past a poll

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 0
    + Received  + 1

      Array [
        "30 / 33 | Seville — Notes | 29",
    +   "03 / 33 | Tokyo — Notes | 2",
        "02 / 33 | Contents | 1",
      ]

      301 |   const published = await pollPublishedSeriesAfterContentsClick(page)
      302 |
    > 303 |   expect(published.identities).toEqual([published.identities[0], '02 / 33 | Contents | 1'])
          |                                ^
```

`03 / 33 | Tokyo — Notes | 2` is PH1-001's own signature, to the character: the jump from
page 30 to the Contents is anchored on leaf 2, and under the mutation the diary published
that anchor as the reader's page for the length of the turn. Run across both projects that
draw a book, the same mutation gives:

```
npx playwright test e2e/flip.spec.ts -g "publishes no"

  4 failed
    [desktop] › e2e\flip.spec.ts:244:1 › publishes no page but the one it left and the one it was asked for, for the whole of a bookmark jump
    [desktop] › e2e\flip.spec.ts:283:1 › publishes no third page even when the address write is delayed well past a poll
    [mid] › e2e\flip.spec.ts:244:1 › publishes no page but the one it left and the one it was asked for, for the whole of a bookmark jump
    [mid] › e2e\flip.spec.ts:283:1 › publishes no third page even when the address write is delayed well past a poll
  2 skipped
```

The mutation was reverted each time with `git checkout -- apps/web/components/book/Book.tsx`,
and `git status` was read afterwards to confirm the only modified files were the two under
`e2e/`. Every run quoted in this section — the mutated ones and runs 1 and 2 — was executed
against exactly the spec text committed here, so the line numbers in the frames above are the
committed file's own.

**What this section would look like if nothing had been fixed.** Runs 1 and 2 would look
identical — a 2% flake passes fifty times more often than not. The only line here that
cannot be produced by a lucky afternoon is run 3, and the only line that cannot be produced
by an assertion loosened into vacuity is §2's 10-of-10 failure. Those two are the evidence;
the green runs are the background.

## 7 · The defect class

`CLAUDE.md` §10 and the `fixing-browser-defects` skill both require the class, not the
instance. The class is: **an address read as part of a polled tuple alongside page content**,
where the two are written by different commits and the poll can land between them.

```
grep -rn "location.pathname\|location.href" e2e/*.spec.ts
```

| Site                                                                                                                                        | Kind                                                                                   | Verdict                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/flip.spec.ts:184` (before the fix)                                                                                                     | address inside a polled tuple with page content                                        | **the same defect — the instance fixed here.** No other `location.*` read exists in `e2e/`.                                       |
| `e2e/serverWindow.spec.ts:191`                                                                                                              | `page.url()` read once, after `await expect(…toHaveCount(0))` settled                  | Fine. The settled expectation is the whole-book answer landing, which is what releases the write.                                 |
| `e2e/reset.spec.ts:253`, `e2e/signIn.spec.ts:233`                                                                                           | `page.url()` read once, after `await expect(… [role="alert"])` settled                 | Fine. The assertion is "no navigation happened"; the settled alert proves the submission was refused rather than still in flight. |
| `e2e/signInJourney.spec.ts:216, 316`                                                                                                        | `page.url()` read once, after `submitThePasswordForm`, which ends in `page.waitForURL` | Fine — the navigation is awaited by the helper, not sampled.                                                                      |
| `e2e/signInJourney.spec.ts:275–276, 408–409`                                                                                                | `page.url()` read once, after `await page.goto(...)`                                   | Fine. `goto` resolves on the navigation it caused.                                                                                |
| `e2e/flip.spec.ts`'s `changes page instantly under prefers-reduced-motion`, and every other `toHaveURL` site in `e2e/` (7 specs carry them) | `expect(page).toHaveURL(...)`                                                          | Fine. Playwright's own matcher retries until timeout, so it cannot sample a lagging address.                                      |

The three specs that poll inside `page.evaluate` were read individually rather than trusted
to the grep: `e2e/mobile.spec.ts` and `e2e/serverWindow.spec.ts` both use `setTimeout` only
for a `test.setTimeout` budget and a deliberate route delay, and neither reads an address in
a loop. **One instance, fixed; no neighbours.**

## 8 · Residue

`docs/testing.md` line 1549 describes `e2e/flip.spec.ts:157` in passing as "the ~2% flake
carried to Phase 3 by ruling", inside a paragraph recording a past round-9 measurement. The
sentence remains a true record of that run, but the present-tense framing is now stale: the
flake is fixed and the case is at a different line. **It was deliberately not edited here**
— this task's file set was scoped to `e2e/flip.spec.ts` and `e2e/support/liveBook.ts` so it
could run in parallel with other Phase 3 tasks, and `docs/testing.md` is a file those tasks
also write to. It is carried as a follow-up rather than silently left: the line should be
reworded to name this report.
