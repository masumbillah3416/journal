# Browser sweep — the mobile reading mode

**Date:** 2026-09-03
**Area:** `SCREENS.md` §1.10 — the surface `/p/<n>` serves below 860px: header, scrolling
column, bottom bar, bookmark drawer, and the swipe.
**Phase / task:** Phase 1, Task 15.
**Engine:** `npx playwright test` at the `mobile` project (390x844, `deviceScaleFactor: 3`,
`hasTouch`, and — new in this task — an iPhone user agent, because the surface is chosen
on the server from that user agent), plus the pinned container
`mcr.microsoft.com/playwright:v1.62.1-noble` for the baselines and the confirming run.
Swipes and scrolls were driven through the DevTools Protocol's
`Input.dispatchTouchEvent`, not through dispatched DOM events: a synthetic event cannot
scroll a column, and "a vertical scroll does not turn a page" is meaningless against a
column that never moved.
**Instrumentation, attached before every navigation:** `console` (errors only),
`pageerror`, and every response with a status ≥ 400 — the three `e2e/smoke.spec.ts`
attaches, because the handoff's defect log is mostly SILENT failures.

This file is the record of what was covered and what was not. Defects are numbered
`MOB-nnn`, and each names the automated test that now fails without the fix — per
CLAUDE.md §10, nothing here was patched straight from the sweep.

---

## What was walked

| Route                   | Kind               | Drawer | Swipe | Scroll | axe                    |
| ----------------------- | ------------------ | ------ | ----- | ------ | ---------------------- |
| `/p/1`                  | Cover              | ✓      | ✓     | ✓      | ✓                      |
| `/p/2`                  | Contents           | —      | —     | —      | ✓                      |
| `/p/3`                  | Journey (Notes)    | ✓      | ✓     | ✓      | ✓                      |
| `/p/4`                  | Journey (Frames I) | —      | —     | —      | ✓                      |
| `/p/33`                 | About              | —      | —     | —      | ✓                      |
| `/p/3` + drawer open    | modal              | ✓      | —     | —      | ✓                      |
| `/gallery/tokyo?from=3` | return path        | —      | —     | —      | ✓ (gallery's own case) |

Console errors: **0**. Page errors: **0**. Responses ≥ 400: **0**. Recorded by
`e2e/smoke.spec.ts`'s "walks every page kind of the mobile reading mode without console
errors", which is the permanent home of that instrumentation rather than a probe.

---

## Defects found and fixed

### MOB-001 · The scrolling column could not be scrolled from a keyboard on the About page

**Severity:** serious (axe's own rating) — a WCAG 2.1 A failure
(`scrollable-region-focusable`, SC 2.1.1) on a page a reader cannot otherwise reach the
bottom of without a pointer.

**Symptom.** No visual symptom at all; found by axe on `/p/33`:

```
"help": "Scrollable region must have keyboard access",
"id": "scrollable-region-focusable",
"impact": "serious",
"html": "<div data-mobile-content=\"\" class=\"mobile-module__content\">",
"failureSummary": "Fix any of the following:
  Element should have focusable content
  Element should be focusable"
```

**Root cause.** The content column is `overflow-y: auto`, and a scrollable element is only
reachable by keyboard if it is focusable **or** contains something focusable. Every other
mobile page contains links — the Contents rows, the gallery button, "Start reading" — so
they satisfied the rule by accident. The About page is the one page in the book with
nothing clickable on it at all (`apps/web/components/pages/About.tsx`'s own header says
so), which is precisely where the accident ran out.

**Fix.** The column is now `role="region"` with `aria-label={label}` — the page's own
label, so the tab stop is a named one rather than an anonymous div — and `tabIndex={0}`.
Nothing about the drawn page changed.

**The tests that failed first.** `e2e/a11y.spec.ts`'s "has no axe violations on `/p/33`,
the mobile reading mode's about page" — red with the violation above, green after — and
`apps/web/components/mobile/MobileDiary.test.tsx`'s "makes the scrolling column a named,
focusable region", which is the fast test that keeps it fixed.

---

### MOB-002 · Next's development overlay swallowed every press of the previous-page arrow

**Severity:** medium, and it is a **tooling** defect rather than a product one — but it
made two suites unrunnable on a developer's machine, which is the more expensive failure.

**Symptom.** `e2e/mobile.spec.ts`'s "turns the page on the bottom bar's arrows" and
`e2e/layout.spec.ts`'s "keeps both bottom-bar arrows reachable by pointer" both failed
locally and only locally, with Playwright naming the culprit outright:

```
<nextjs-portal></nextjs-portal> from <script data-nextjs-dev-overlay="true">…</script>
  subtree intercepts pointer events
```

and the hit-test census answering `{ direction: 'prev', reason: 'covered by NEXTJS-PORTAL' }`.

**Root cause.** Next's development indicator is fixed to the bottom-left of the viewport.
At 390px that is exactly where `SCREENS.md` §1.10 puts the 52px previous-page arrow. It
does not exist in a production build, so CI — which serves `next start` — was green
throughout.

**Fix.** `devIndicators: false` in `apps/web/next.config.ts`, with the reason at the
declaration. The alternative — teaching two suites to click around a dev-only element —
would have left the local and CI runs testing different things, and a suite that only
passes on the runner is one a developer learns to skip.

**The tests that failed first.** The two named above, red locally and green after.

---

## Two harness findings, recorded because they are the kind of thing that becomes a myth

1. **A tab scrolled past the foot of the drawer is not a covered tab.** The first version
   of `layout.spec.ts`'s drawer census reported bookmark `32` (About) as `off-viewport`.
   It is: thirteen tabs at 13px rows do not fit an 844px phone, and the panel scrolls.
   The census now hit-tests only tabs whose CENTRE is on the screen, which is the
   question it was always meant to ask.
2. **The scrim's centre is underneath the panel.** Clicking `[data-drawer-scrim]` at its
   own midpoint is a click on the drawer, because the panel is 82% of a 390px screen. The
   case now clicks at `x: 370`, to the right of the panel, which is where a reader's
   thumb actually lands when they mean to dismiss it.

---

## What was NOT covered

- **A real phone.** Everything here is Chromium's device emulation with a phone user
  agent. Momentum scrolling, the URL bar's collapse (which `100dvh` is written for) and
  Safari's own touch behaviour are all unverified on real hardware.
- **iOS Safari and Android Chrome as engines.** The harness runs Chromium at all three
  projects, per `docs/testing.md`'s standing scope note. `100dvh`, `overscroll-behavior`
  and `aspect-ratio` are all widely supported, but "widely supported" is not "measured
  here".
- **A tablet.** The one device class the server's user-agent hint is most often wrong
  about is covered only by the narrowed-desktop-window correction case in
  `e2e/mobile.spec.ts`, which exercises the same code path with a different user agent.
- **The clip transport.** `SCREENS.md` §1.10 puts photographs on the mobile journey page;
  the prototype also plays a video in a mount that has one. No journey seeds a clip yet
  (`docs/deviations.md` §18), so nothing was there to sweep.
