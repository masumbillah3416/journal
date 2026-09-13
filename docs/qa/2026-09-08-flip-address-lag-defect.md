# Defect: `e2e/flip.spec.ts:157` read the address as part of the published page — 2026-09-08

**Subject:** `e2e/flip.spec.ts:157`, `publishes no page but the one it left and the one it was
asked for, for the whole of a bookmark jump` — the case that guards PH1-001
(`docs/qa/2026-09-03-phase-1-closing-sweep.md`, S2).

**Engine:** Playwright 1.62.1, Chromium, `npm run dev` (Turbopack) on the seeded local
Postgres. Projects `desktop` 1440×900 and `mid` 1000×800; `mobile` skips this file, because
below 860px SCREENS.md §1.10 replaces the book.

**Classification:** **test-side**, confirmed twice in Phase 2 review and confirmed a third
time here by measurement. **No application file was changed.**

**Result:** fixed. One case became three — one behaviour each — plus one test-support
export. The reproduction is kept as a permanent case rather than thrown away, and that case
asserts something only the reproduction can produce, so it cannot decay into a duplicate of
its neighbour.

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
  **three ordered, adjacent-deduplicated series** instead of one tuple: `identities`
  (counter, label, active tab), `addresses` (`location.pathname`), and `pairs`
  (`identity @ address`, the two as they were actually observed together).
- **One behaviour per case, three cases**, all reading the same helper so they cannot drift:

  | Case                                                                                      | Its one assertion                                                                                                    |
  | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
  | `publishes no page but the one it left and the one it was asked for…` (PH1-001 itself)    | `expect(published.identities).toEqual([published.identities[0], '02 / 33 \| Contents \| 1'])`                        |
  | `writes the address of the page it was asked for and of no other, during a bookmark jump` | `expect(published.addresses).toEqual(['/p/30', '/p/2'])`                                                             |
  | `publishes no third page even when the address write is delayed well past a poll`         | `expect(published.pairs).toEqual([pairs[0], '02 / 33 \| Contents \| 1 @ /p/30', '02 / 33 \| Contents \| 1 @ /p/2'])` |

  The address was split into its own case because a failure in it was otherwise reported
  under a test name about published pages, which sends whoever triages it to the wrong half
  of the book — observed, not hypothesised, in §6 run 6.

- **The third case keeps `deferAddressWrites(page, { delayMs: 200 })` permanently, and now
  pins the instrument itself.** Asserting only the identities there would have made it a
  verbatim duplicate of the first case the day the deferral stopped biting — and ADR 0009
  records the address hold as held open pending a measurement nobody has taken, so how
  `Book.tsx` writes the address is a thing this repository expects to revisit. The middle
  pair, `02 / 33 | Contents | 1 @ /p/30`, cannot be produced unless the deferral is really
  in force, so the case goes red instead of quietly guarding nothing. §6 runs 4 and 5 are
  that claim, watched.

**What is no longer asserted, precisely.** The old tuple forbade two things at once, and
only one of them was ever the application's to promise:

- `identity = destination, address = origin` — the address LAGGING the published page.
  `Book.tsx`'s header declines to promise this does not happen, and it is what caused the
  flake. **Released deliberately**, and the third case now asserts it explicitly under a
  widened lag rather than merely tolerating it.
- `identity = origin, address = destination` — the address RUNNING AHEAD of the published
  page. That would be a real defect (a reload would take the reader somewhere the book has
  not published), and nothing in the split can see it. **Released as a side effect, and the
  release is intended**: it is structurally impossible today, because the effect is keyed on
  `[state.index, complete]` and writes `pagePath(state.index)`, so the address cannot lead
  the index. Re-coupling the two series to catch a state that cannot arise would be the
  premature abstraction CLAUDE.md §4 rejects. If `Book.tsx` ever writes the address from
  anything other than the committed index, this paragraph is the thing to revisit.

**The window is 2,000ms, not the original 1,400ms, and the number came from a measurement.**
Under the 200ms deferral the identity commits at t≈1,011–1,035ms and the address lands at
t≈1,209–1,241ms (three runs each, §6 run 3). A 1,400ms window left ~160ms of margin on that
last event — one long frame from dropping it, which is how the next flake would have been
born. 2,000ms leaves ~760ms. The 40ms poll interval is unchanged.

**Adjacent-deduplicated and ordered, not a `Set`.** The original used `new Set(readings)`,
which discards order — a book that published the destination, went back to the origin and
returned would have produced the same set as one that never wavered. Two of the three things
these cases guard are about order.

## 6 · Verification

All runs from the worktree, `npm run dev` on port 3000, seeded local Postgres. Runs 1–2
are the volume runs; 3 is the measurement the 2,000ms window is sized from; 4–7 are the
watched failures, one per mechanism.

**1 · All three cases, fifty repeats each.**

```
npx playwright test e2e/flip.spec.ts -g "publishes no page but|writes the address of the page|publishes no third page" --repeat-each=50

  150 skipped
  300 passed (30.6m)
```

**2 · The pre-fix pair, for the record.** Before the case was split, the first case ran
100/100 and the lag case 20/20 (11.8m and 2.7m). Those numbers are superseded by run 1 and
are kept only to say that the split did not buy its green by shrinking what runs.

**3 · The measurement behind the 2,000ms window.** A throwaway probe recorded the elapsed
time at which each pair changed, three runs with the deferral and three without:

```
with deferAddressWrites(page, { delayMs: 200 }):
  "t=0    30 / 33 | Seville — Notes | 29 @ /p/30"
  "t=1035 02 / 33 | Contents | 1 @ /p/30"     "t=1011 …"   "t=1026 …"   "t=1020 …"
  "t=1211 02 / 33 | Contents | 1 @ /p/2"      "t=1241 …"   "t=1214 …"   "t=1209 …"

with no deferral:
  "t=0    30 / 33 | Seville — Notes | 29 @ /p/30"
  "t=1028 02 / 33 | Contents | 1 @ /p/2"      "t=1033 …"   "t=1012 …"   "t=995 …"
```

The lagged address lands at 1,209–1,241ms. In the original 1,400ms window that is 159–191ms
of margin on the last event this case depends on; in a 2,000ms window it is ~760ms. The
review's stronger claim — that under this deferral the final write lands _after_ the poll
window — is **false**, measured here, and the comment that repeated it has been replaced by
this number.

**4 · Watched failure — the instrument pin bites when the instrument is taken away.**
`deferAddressWrites` removed from the third case, changing nothing else:

```
npx playwright test e2e/flip.spec.ts -g "publishes no third page" --project=desktop

  x  1 [desktop] › e2e\flip.spec.ts:336:1 › publishes no third page even when the address write is delayed well past a poll (5.6s)

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 0

      Array [
        "30 / 33 | Seville — Notes | 29 @ /p/30",
    -   "02 / 33 | Contents | 1 @ /p/30",
        "02 / 33 | Contents | 1 @ /p/2",
      ]

      358 |   const published = await pollPublishedSeriesAfterContentsClick(page)
      359 |
    > 360 |   expect(published.pairs).toEqual([
          |                           ^
```

The missing middle pair IS the instrument: with no deferral the identity and the address
move on the same poll, so no sample can show one without the other.

**5 · Watched failure — the real decay scenario.** `Book.tsx` temporarily writing the
address through `window.history.pushState` instead of `replaceState`, which is a method
`deferAddressWrites` does not patch. The deferral silently becomes zero. This is the day
the review predicted, and the case goes **red** rather than passing forever as a duplicate
of the first:

```
npx playwright test e2e/flip.spec.ts -g "publishes no page but|writes the address of the page|publishes no third page" --project=desktop

  ok 1 [desktop] › e2e\flip.spec.ts:284:1 › publishes no page but the one it left and the one it was asked for… (5.8s)
  ok 2 [desktop] › e2e\flip.spec.ts:317:1 › writes the address of the page it was asked for and of no other… (5.7s)
  x  3 [desktop] › e2e\flip.spec.ts:336:1 › publishes no third page even when the address write is delayed well past a poll (5.4s)

    - Expected  - 1
    + Received  + 0

      Array [
        "30 / 33 | Seville — Notes | 29 @ /p/30",
    -   "02 / 33 | Contents | 1 @ /p/30",
        "02 / 33 | Contents | 1 @ /p/2",
      ]
```

The first two stay green, correctly: neither is about how the write is made. This is the
run that answers "could this case ever fail again?" — and it is the run that would have
been impossible to produce had the case asserted only its neighbour's assertion.

**6 · Watched failure — the address half still bites, and now under its own name.**
`Book.tsx`'s address effect temporarily writing `pagePath(state.index + 1)`, leaving the
published identity correct:

```
  ok 1 [desktop] › e2e\flip.spec.ts:284:1 › publishes no page but the one it left and the one it was asked for… (5.7s)
  x  2 [desktop] › e2e\flip.spec.ts:317:1 › writes the address of the page it was asked for and of no other, during a bookmark jump (5.4s)
  x  3 [desktop] › e2e\flip.spec.ts:336:1 › publishes no third page even when the address write is delayed well past a poll (5.5s)

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 2
    + Received  + 2

      Array [
    -   "/p/30",
    -   "/p/2",
    +   "/p/31",
    +   "/p/3",
      ]

      331 |   const published = await pollPublishedSeriesAfterContentsClick(page)
      332 |
    > 333 |   expect(published.addresses).toEqual(['/p/30', '/p/2'])
          |                               ^
```

**This is the concrete value of the split.** Before it, this same mutation was reported
under `publishes no page but the one it left and the one it was asked for…` — a name about
published pages, for a failure about the address.

**7 · Watched failure — the cases still guard PH1-001.** `Book.tsx` was
temporarily made to publish the page stack's **anchor** as the reader's page — the three
published fields read `state.anchor` instead of `state.index`, which is exactly the defect
PH1-001 recorded ("clicking Contents from `/p/29` read `03 / 33 · Tokyo — Notes` at `/p/3`,
with Tokyo's tab lit, for 981ms"). **Both cases that read the published page failed, on the
identity series carrying a third entry — and the address case stayed green, correctly:**

```
npx playwright test e2e/flip.spec.ts -g "publishes no page but|writes the address of the page|publishes no third page" --project=desktop

  x  1 [desktop] › e2e\flip.spec.ts:284:1 › publishes no page but the one it left and the one it was asked for, for the whole of a bookmark jump (6.1s)
  ok 2 [desktop] › e2e\flip.spec.ts:317:1 › writes the address of the page it was asked for and of no other, during a bookmark jump (5.2s)
  x  3 [desktop] › e2e\flip.spec.ts:336:1 › publishes no third page even when the address write is delayed well past a poll (5.2s)

  1) [desktop] › e2e\flip.spec.ts:284:1 › publishes no page but the one it left and the one it was asked for, for the whole of a bookmark jump

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 0
    + Received  + 1

      Array [
        "30 / 33 | Seville — Notes | 29",
    +   "03 / 33 | Tokyo — Notes | 2",
        "02 / 33 | Contents | 1",
      ]

      312 |   // spans it. The origin is read out of the page rather than written down, so
      313 |   // the case cannot drift from the seed.
    > 314 |   expect(published.identities).toEqual([published.identities[0], '02 / 33 | Contents | 1'])
          |                                ^
```

`03 / 33 | Tokyo — Notes | 2` is PH1-001's own signature, to the character: the jump from
page 30 to the Contents is anchored on leaf 2, and under the mutation the diary published
that anchor as the reader's page for the length of the turn. The address case stays green,
correctly — this mutation moves the published page, not the address.

**An equivalent mutant, worth knowing about.** Mutating the address effect to
`pagePath(state.anchor)` is undetectable by any of the three cases, and that is not a gap:
by the time that effect runs after a jump, `state.anchor` has already collapsed to
`state.index`, so the two spellings are the same write. Recorded here so the next person
mutation-testing that line does not spend an afternoon concluding their harness is broken.

The mutation was reverted each time with `git checkout -- apps/web/components/book/Book.tsx`,
and `git status` was read afterwards to confirm the only modified files were the two under
`e2e/`. Every run quoted in this section — the mutated ones and runs 1 and 2 — was executed
against exactly the spec text committed here, so the line numbers in the frames above are the
committed file's own.

**What this section would look like if nothing had been fixed.** Runs 1 and 2 would look
identical — a 2% flake passes fifty times more often than not, so a green volume run is
evidence about the afternoon and not about the fix. Everything that cannot be produced by a
lucky afternoon is a watched failure: §2's 10-of-10 under the instrument, and runs 4, 5, 6
and 7 here. Run 4 in particular is the one that would be missing if the third case had been
left asserting only what its neighbour asserts — it would have been green then too, and
green forever after.

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
a loop. **One instance, fixed; no neighbours in `e2e/`.**

**The one sibling outside `e2e/`, checked and left alone.**
`apps/web/components/book/Book.test.tsx:276`'s `publishedLocation` reads the same four
values as one tuple, and polls them every 40ms across a jump (line 603) — the same shape.
It is **not** an instance of this class, and the difference is the reason the class exists:
that poll runs under `act()`, which flushes React's effects before it returns, so every
sample is taken after both the render and the address effect have run. There is no point in
time at which the pair can be observed half-written, which is why that case has never
flaked. The browser has no `act()`, and that is the whole of the difference. Left unchanged
deliberately: the tuple there is a fair reading of "where does the diary say the reader is",
and splitting it would weaken it for no gain.

## 8 · Residue

**None outstanding.** One item was carried out of the first round and has since been
discharged: `docs/testing.md`'s flake ledger described `e2e/flip.spec.ts:157` as "the ~2%
flake carried to Phase 3 by ruling". That was left alone at first because this task's file
set was scoped for parallel work — which the review correctly rejected as insufficient under
CLAUDE.md §1.3, and on a second ground the first round missed: the sentence was not merely
stale but **misdirecting**, because line 157 now holds a different case entirely, so a reader
following the pointer would have found a case with no address in it and no flake history.
The ledger entry now says the flake is fixed, warns off line 157 by name, and points here.
