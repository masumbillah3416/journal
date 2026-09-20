# Sweep: the slot panel's keyboard path — 2026-09-21

**Build:** `e25f26b` (`feat/phase-4-admin`) **Engine:** Playwright (`chromium`), driven by one
temporary spec (`e2e/t7kb.spec.ts`) and, for the auto-repeat case, by **CDP
`Input.dispatchKeyEvent` with `autoRepeat`** — deleted after the walk, readings committed
**Routes walked:** 2 — `/admin/journeys/276?page=534` (the seeded Tokyo journey's Frames I, whose
first cell holds a non-default crop of 22/78) and `/p/4`, the published face that cell prints on
**Surfaces:** `desktop` 1440x900 and `mobile` 390x844 (iPhone UA, touch)
**Result:** 1 defect — S1:0 S2:0 S3:0 S4:1 — and **one question UNRESOLVED on this machine**

**Why this sweep exists.** `docs/qa/2026-09-20-journey-slots-sweep.md` walked the slot panel with
a mouse. Task 7's fix round then **added a keyboard path** to the same control — H1: Enter or
Space was writing `0, 0` over the author's crop, so the activation is refused and the arrow keys
aim instead (`docs/deviations.md` §65). Eleven jsdom cases cover that, and `CLAUDE.md` §10 is
explicit that they are one half: the control behind the phase's second exit criterion had gained
an interaction no browser had ever driven. The scope below is the fix review's own (F4).

**Instrumentation, attached before the first navigation on every context:** `console` (all
levels), `pageerror`, every `response` with a status ≥ 400, every `requestfailed`, and **a count
of every `POST`**, which is what a Server Action is. Across thirteen walks the only console output
was Next's development banner and `[HMR] connected`; **no `pageerror`, no response ≥ 400, no
failed request.**

**Where the evidence is.** Every reading is in `docs/qa/assets/2026-09-21-slots-keyboard/` —
`k1`–`k7`, one file per case per surface, plus one screenshot. A citation like `(k2-desktop.json)`
means that file.

**Every write is restored**, and the walk that writes says so in its own body. `pages_slots` for
pages 533/534/535 reads the same nine rows before and after:

```text
533|1|1501|18|82   534|1|1503|22|78   535|1|1506|50|50   535|3|1508|80|24
533|2|1502|50|50   534|2|1504|50|50   535|2|1507|50|50   535|4|1509|50|50
                   534|3|1505|50|50
```

---

## Defects

### KB-001 · S4 · While a focal cell has focus, the arrow keys no longer scroll the page

- **Route:** `/admin/journeys/276?page=534` — measured at `mobile` 390x844, where the screen
  really scrolls; `desktop` has only 45px of scroll and cannot tell the two answers apart.
- **Steps:**
  1. Cold load the editor at 390x844 with a live session.
  2. Focus a frame cell (Tab to it, or click it).
  3. Press ArrowDown and read `window.scrollY`.
- **Expected:** the page scrolls, as it does with any other control focused. `SCREENS.md` §2.3
  says nothing about the arrows, and the admin shell's content area is a scrolling region
  (`padding: 24px 30px 44px; overflow-x: hidden`).
- **Actual:** it does not move. `SlotPanel.tsx`'s `onKeyDown` calls `preventDefault()` for the
  four arrows so that aiming the crop does not also scroll the pane out from under it — which is
  the right trade for the control and a real cost for the page. The content is 3,142px inside an
  844px viewport, and `scrollY` stays where it was.

  ```text
  k3-mobile.json: "measured": { "contentScrollHeight": 3142, "contentClientHeight": 844 },
                  "pageScroll": { "before": 863, "after": 863 }
  k3-desktop.json: "pageScroll": { "before": 0, "after": 0 }   ← only 45px of scroll to lose
  ```

- **Why S4 and not higher:** nobody is blocked. Tab moves on to Replace and the arrows work
  again; the mouse and the scrollbar are unaffected; and the pool's own scroller still takes the
  arrows when IT has the focus (`"poolScroll": { "before": 0, "after": 40 }` at both surfaces),
  which is SLOT-001's fix still holding. The alternative — cancelling only when the crop actually
  moves, so an arrow at the frame's edge scrolls instead — makes the behaviour depend on a value
  the author cannot see, which is worse than the cost.
- **Evidence:** `k3-mobile.json`, `k3-desktop.json`.

## Unresolved

### Whether the control is operable for a virtual-cursor screen-reader user

`docs/deviations.md` §65 records this and the fix review raised it (F4, item 3). Two halves, and
this machine can answer one of them.

- **Answered.** A programmatic activation — `element.click()`, which is what voice control and
  several assistive technologies dispatch — carries `detail: 0` and is **refused**: no `POST`
  left, the pill still read `focus 22% 78%`, and the row was unchanged. So AT cannot destroy the
  crop; it also cannot set one this way (`k7-desktop.json`).
- **UNRESOLVED.** Whether NVDA's or JAWS's **browse mode** passes ArrowLeft/Right/Up/Down through
  to a focused `<button>`, or consumes them for virtual-cursor navigation. If it consumes them,
  the control has no keyboard path for those users at all — a different WCAG 2.1.1 answer from
  the one axe gives, and axe cannot see it (the sweep before this one records axe passing this
  control while H1 was live: _"a behaviour defect wearing a well-formed control"_).
  **Neither screen reader is installed on this machine, and `CLAUDE.md` §7.1 forbids routing the
  question anywhere else.** It is named here, in §65, and in `SlotPanel.tsx`'s header so the next
  task with a screen reader in reach can close it. The cheap mitigation if it turns out to be
  real is a pair of visible ± controls per axis, which is UI `SCREENS.md` does not specify and
  which should not be invented on a guess.

## Clean

Each with what was measured, because "clean" with no measurement is the claim these sweeps exist
to stop.

- **H1 is fixed in a real browser, at both surfaces.** With Frame 1 focused (`document.activeElement`
  confirmed as `[data-focal-target="534:0"]`), **Enter** and then **Space**: `posts: 0` for each,
  the pill still `focus 22% 78%`, and the row unchanged at `22/78`. In jsdom this was a spy; here
  it is a request counter on the wire (`k1-desktop.json`, `k1-mobile.json`).
- **Auto-repeat loses no presses, and F2's fix holds under the real thing.** Playwright's own
  keyboard does **not** auto-repeat — `keyboard.down` sends one `keydown` however long it is held,
  which was measured first and is why this case goes through CDP. Driven properly: **25 `keydown`s,
  24 of them with `event.repeat === true`**, moved the crop from 22% to **47%** — twenty-five
  steps for twenty-five presses, none lost (`k2-desktop.json`, `k2-mobile.json`).
- **Exactly one write leaves, and only on release.** `postsBeforeRelease: 0` across all
  twenty-five repeats, `postsAfterRelease: 1`. That is the whole argument for binding the write to
  `keyup` rather than `keydown` on a collection where every write mints a version row, measured
  rather than asserted.
- **The pill and the column agree after a nudge**, at both surfaces: `focus 47% 78%` against
  `focalX: 47, focalY: 78`.
- **The exit criterion holds through the new path.** Five ArrowRights and three ArrowDowns on
  Frame 2, then `/p/4` loaded fresh: the pill read `focus 55% 53%`, `pages_slots` held
  `55 / 53`, and that mount's computed `object-position` was **`55% 53%`** while the other six
  photographs on the leaf were unmoved (`22% 78%`, `80% 24%`, `50% 50%`…). The sweep before this
  one proved that chain for a click; this proves it for a keyboard (`k4.json`).
- **F1 is fixed in the product, not only in jsdom.** Crop Frame 1 a quarter across (pill
  `focus 25% 50%`, column `25/50`), press **Replace**, tick **the same photograph** (`1503`): the
  pill reads `centred — click to focus`, `background-position` computes to `50% 50%`, and the
  column holds `50/50`. The dropped crop does not come back (`k5.json`, `k5.png`).
- **The tab order through a cell is the order it is drawn in**, at both surfaces, and every stop
  is named: the focal button ("Set the focal point of Frame 1 — click it, or move it with the
  arrow keys"), Replace, Clear, "Caption for Frame 1", "Alt text for Frame 1", "Save words" — then
  the same six for Frame 2, and for Frame 3. Fourteen stops walked, none unlabelled, none
  unexpectedly disabled. This is the by-hand tab walk the previous sweep listed under "Not
  covered" (`k6-desktop.json`, `k6-mobile.json`).
- **The pool's grid still takes the focus and still scrolls with the arrows** when it holds the
  focus — SLOT-001's fix, re-measured here because KB-001 is about the same key on a different
  element.
- **The console is quiet.** Thirteen walks, no `pageerror`, no response ≥ 400, no failed request.

## Not covered

- **A real screen reader**, for the reason above. UNRESOLVED, not deferred quietly.
- **Any surface but 1440x900 and 390x844.** The previous sweep walked three; this one walks the
  two where the answers differ, because nothing in the keyboard path is width-dependent except
  KB-001, which needs a page that scrolls.
- **The Notes pane's two cells.** `SlotPanel` is one component and the frames pane exercises it;
  what the Notes pane adds is the surrounding `<form>`, which the previous sweep measured
  (0 nested forms, every button `type="button"`) and which no keyboard interaction changes.
- **Other input methods.** Touch, a physical keyboard's IME, and a game-controller cursor were not
  driven.
- **What a screen reader ANNOUNCES on focus.** The label is read off the DOM here; how it is
  spoken, and whether "move it with the arrow keys" survives a verbosity setting, is the same
  UNRESOLVED question one step on.

## What this sweep deliberately did not change

Nothing. KB-001 is recorded and not patched: `CLAUDE.md` §10 — a fix without a test that failed
first guards nothing — and the fix it would take is a behaviour change to a documented deviation,
which belongs in a commit of its own with the case that demands it.
