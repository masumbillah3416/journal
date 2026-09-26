# Sweep: the Publish screen (`SCREENS.md` §2.8) — 2026-09-26

**Build:** `fb446e2` **Engine:** playwright (chromium, `desktop` project driving its own viewports)
**Routes walked:** 1 (`/admin/publish`, at 1440, 1200, 1000 and 390 wide)
**Result:** 3 defects — S1:0 S2:0 S3:2 S4:1 (and one finding withdrawn under measurement)

The screen was walked with four real pending changes on it — three journeys edited after
publishing and one never published — created for the sweep and deleted after it. **Nothing was
published.** A publish cannot be undone, and pressing the primary button with the developer's
own drafts on screen would have been irreversible rather than untidy (standing orders §9). The
dev database was dumped before and after: `journeys` (id, name, slug, `_status`, `order`),
`pages`, and a per-parent version tally carrying its `latest` and draft counts. All three
diffed identical.

## Defects

### PUB-001 · S3 · The header chip and the headline print two different numbers for one fact

- **Route:** `/admin/publish` at 1440x900
- **Steps:**
  1. Put four changes into the diary: three journeys edited after publishing, one never
     published.
  2. Load `/admin/publish` cold.
  3. Read the chip at the right of the screen header, then the headline in the first card.
- **Expected:** one number. `SCREENS.md` §2 gives the header an "n unpublished" chip and §2.8
  gives the headline "{n} changes waiting"; the handoff's prototype computes BOTH from the same
  `pending` list — `pendingLabel` and `pendingHeadline` are two renderings of
  `pending.length`.
- **Actual:** the chip reads **"1 unpublished"** and the headline reads **"4 changes
  waiting"**, side by side. The chip is `readNavCounts`'s `unpublished`, which counts live
  journeys whose `_status` is `draft` — journeys that have never been published — and the
  headline is `readPendingChanges().length`, which counts every row whose newest version is a
  draft. Only the never-published fixture is in both.
- **Evidence:** `test-results/sweep-publish-1440.png`. The two readings are in the same
  screenshot, 1,100px apart.
- **Not fixed here, deliberately.** `readNavCounts` is drawn on EVERY admin screen, so making
  its number the pending one costs four more queries on all twelve of them — a decision about
  the shell's chrome, which is the Overview screen's (`SCREENS.md` §2.1, Task 12) rather than
  this task's. `docs/deviations.md` §91 records it with the measurement, so whoever takes §2.1
  inherits a number rather than a surprise.

### PUB-002 · S3 · A Revert that cannot be pressed looks and behaves exactly like one that can

- **Route:** `/admin/publish` at 1440x900
- **Steps:**
  1. Load `/admin/publish` with at least one never-published row and one edited row waiting.
  2. Compare the Revert control on the `added` row with the Revert on an `edited` row.
  3. Hover the first.
- **Expected:** a control that does nothing should not look like one that does. The `added`
  row's Revert is `disabled` on purpose — the row has no published version behind it, the write
  refuses it, and §2.8 draws no error surface (`docs/deviations.md` §60) — so the refusal has
  to be visible before the press, not after it. The handoff's own hotspot list names the
  opposite failure ("look dead while their handlers are fine") for the same reason.
- **Actual:** identical. Both paint `rgb(115, 98, 71)` at `opacity: 1` with `cursor: pointer`.
  `publish.module.css` has a `.restore:disabled` rule and **no `.revert:disabled` rule at
  all**, so the disabled state changes nothing but the `disabled` attribute.
- **Evidence:** the sweep's own readings, verbatim:

  ```text
  revert added (disabled): rgb(115, 98, 71) op 1 cursor pointer
  revert edited (enabled): rgb(115, 98, 71) op 1 cursor pointer
  ```

### PUB-003 · WITHDRAWN · The live edition's Restore, which is distinguishable after all

**This was written as an S4 and does not survive its own measurement.** It is left here rather
than deleted, because a finding withdrawn quietly is a finding nobody can check.

The claim was that the live edition's disabled Restore is only faintly different from an
enabled one. It came from reading a downscaled screenshot. The numbers say otherwise: against
the card's `#fffdf6`, the disabled `rgb(143, 131, 109)` sits at **3.64:1** and the enabled
`rgb(115, 98, 71)` at **5.75:1** — a 37% drop in contrast — and the cursor changes from
`pointer` to `default`. That is the same treatment the fix for PUB-002 gives Revert, and it was
already there.

```text
restore live (disabled): rgb(143, 131, 109) op 1 cursor default
restore other (enabled): rgb(115, 98, 71) op 1 cursor pointer
```

Standing orders §10: an understated capability is as false as an overstated one, and a
limitation has to be watched failing before it is written down.

### PUB-004 · S4 · At 390px the change row keeps the chip and Revert inline, and the text takes what is left

- **Route:** `/admin/publish` at 390x900
- **Steps:**
  1. Load `/admin/publish` at 390 wide with four changes waiting.
  2. Read a row.
- **Expected:** nothing specific. `SCREENS.md` §2.8 gives the row one shape — a 21px checkbox,
  the kind chip, the text over its location line, and Revert — and names no narrow behaviour
  for it; the handoff's responsive table says only that the admin "stacks below" its mid rung.
- **Actual:** the row keeps all four in one flex line, so the text column is about 100px wide
  and "Sweep publish four has never been published" takes four lines with its location line
  taking three more. Nothing overflows — `scrollWidth` equals `clientWidth` on the document,
  the card, the row and the editions card at every width walked — and nothing is unreadable.
- **Not fixed, and this is the reason:** the prototype's own row is the same flex line with the
  same `flex: 1; min-width: 0` on the text, so at this width it would draw exactly this. A
  wrap rung here would be behaviour the handoff does not describe, invented during a sweep.
  Recorded so that a `SCREENS.md` revision naming a narrow shape has somewhere to land.
- **Evidence:** `test-results/sweep-publish-390.png`.

## The class, not just the instance

PUB-002 is one shape: a control rendered `disabled` whose stylesheet has no `:disabled` arm, so
it paints and behaves exactly like a live one. Every admin stylesheet was grepped for the
family:

| Screen           | Disabled controls | `:disabled` arms                                 |
| ---------------- | ----------------- | ------------------------------------------------ |
| Book (§2.6)      | the row arrows    | `.arrow:disabled` ✓                              |
| Editor (§2.3)    | five              | `.tool`, `.tile`, `.grip`, `.slotTool` ✓         |
| Media (§2.4)     | Browse            | `.browse:disabled` ✓                             |
| Publish (§2.8)   | three             | Publish ✓, Restore ✓, **Revert ✗** — this defect |
| Galleries (§2.5) | two               | **none**                                         |

**One more instance, on a screen this task does not own.**
`components/admin/galleries/CaptionAll.tsx`'s "Apply captions" is `disabled` when the panel has
no rows, and `galleries.module.css` has no `:disabled` rule at all — the same shape as PUB-002,
on SCREENS.md §2.5. (Its sibling, `SelectedFrame.tsx`'s cover checkbox, is a native
`<input type="checkbox">`, which the browser greys on its own, so that one signals without a
rule.) It is **not fixed here**: it is another screen's, it needs its own failing browser case
and its own commit, and a defect report is not permission to reach into a neighbouring task.
**It carries a number now — `docs/deviations.md` §92** — because a finding recorded only in a
dated sweep file has no carrier: nothing reads this file again, and the numbered entries are
what a task inherits.

## Clean

**`/admin/publish` at 1440, 1200, 1000 and 390** — walked cold at each, plus one reload.

- **Column shape.** `1440: 766px 360px` — §2.8's `minmax(0,1fr) 360px`, at the design's own
  reference width. `1200: 902px`, `1000: 718px`, `390: 346px` — one column, which is the
  conversion `book.module.css` records: the prototype's rung is the content box's width and the
  shell's `.content` adds 60px of padding, so 1180 is 1120 to a container query, and a 1200
  viewport leaves 902.
- **No horizontal overflow anywhere.** `scrollWidth === clientWidth` on the document, the
  Changes card, a change row and the Editions card, at all four widths — measured rather than
  looked at, because an ellipsis hides an overflow from every other number.
- **The button's label follows the ticks**, which is §2.8's own sentence and the handoff's
  named hotspot: `PUBLISH ALL 4` → untick two → `PUBLISH 2 OF 4` → untick the rest →
  `PUBLISH 0 OF 4`, `disabled: true`, painted `rgb(143, 131, 109)` on `rgba(0, 0, 0, 0)` inside
  `rgba(120, 98, 60, 0.34)` — §2.8's muted ring and `#8f836d`. Re-ticking returns `PUBLISH ALL
4`.
- **The toggle-twice hotspot holds.** Tick a cleared box and clear it again: the label reads
  `PUBLISH 2 OF 4`, not a stale `PUBLISH 3 OF 4`. (Five separate defects in the handoff's own
  history came from this shape.)
- **An excluded row strikes through** — `text-decoration-line: line-through` at
  `rgb(143, 131, 109)`, which is §2.8's `#8f836d`.
- **High-fidelity values, measured:** the kind chip is 64px wide at Courier 9px with 1.44px
  (0.16em) tracking, drawn `rgb(47, 107, 104)` for `added`; the checkbox is 21x21 with
  `accent-color: rgb(163, 68, 52)`; the headline is 40px Caveat; the washi carries
  `rotate(3deg)`; the live edition's mark is a 9px square rotated 45° (13px as a bounding box)
  filled `rgb(163, 68, 52)`.
- **Console, page errors and failed responses: none.** Six `console` lines across four loads,
  all of them Next's dev-server HMR notice and React's DevTools suggestion. No `pageerror`, and
  no response at 400 or above.
- **A reload keeps the screen.** `PUBLISH ALL 4` after `page.reload()`, so nothing depended on
  the first render's state.
- **axe, full ruleset: no violations** — `e2e/a11y.spec.ts`'s own case for this screen, run
  against a real change waiting on it, because a Changes card with no rows has no controls to
  judge.

## Not covered

- **The publish itself, and the revert, from this sweep.** Both are exercised in
  `e2e/admin.spec.ts` against fixtures of their own; this sweep deliberately presses neither,
  because a publish cannot be undone and a sweep is not the place to find that out.
- **The mid and mobile Playwright projects.** The sweep drives its own four viewports from the
  `desktop` project rather than running three times; `e2e/a11y.spec.ts` and `e2e/admin.spec.ts`
  cover the other two.
- **A visual baseline.** There is none for this screen, as there is none for the six admin
  screens before it — `docs/deviations.md` §86, taken together in Task 15 under the pinned
  container. What that leaves unseen is a colour, a weight or a spacing that is declared
  correctly and drawn wrongly; the measurements above are what bound it meanwhile.
- **The Editions card past twelve rows.** `EDITIONS_SHOWN` is pinned from both sides by
  `publishSelection.integration.test.ts`; the browser was not asked to scroll it.
