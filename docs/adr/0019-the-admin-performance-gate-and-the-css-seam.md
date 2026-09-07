# 0019 — The admin's performance gate, and the CSS seam it exposed

**Status: DECIDED**, on measurements taken on this machine, 2026-09-07.

Two decisions, recorded together because the first found the second.

1. `CLAUDE.md` §6's admin budgets are gated by a **third** Lighthouse configuration,
   `lighthouserc.admin.json`, collecting at **1440x900 desktop emulation**.
2. The `(admin)` route group **declares its own fonts** instead of importing the diary's,
   because a module reachable from both route entries cannot be merged into either entry's
   stylesheet — and the chunk it becomes was being served on `/p/1`, the route the diary's
   LCP budget gates.

Neither budget moved. `/p/1` stays at 3,000ms (ADR 0008); the admin's route-JS ceiling is
`CLAUDE.md` §6's 320KB, unaltered.

---

## Part 1 — a third measurement viewport

### Context

`CLAUDE.md` §6 sets an LCP budget **scoped explicitly to `/p/1`**, a CLS budget and a
320KB admin route-JS ceiling, and until Phase 2 Task 11 nothing measured any of them on
`/admin/*`. **The LCP number this ADR gates the three admin routes on is therefore this
ADR's own, not §6's** — §6 names one route and this creates a hard CI gate on three more.
That is a decision, and saying "neither budget moved" was true of the diary's gate and not
of the admin's, which had no gate to move (Phase 2's final review, finding 41). The number
chosen is the same 3,000ms, because the same simulated network and CPU produce it and a
looser one would be a budget picked to fit what the screens already do. `lighthouserc.json` collects
the diary's mobile surface, the gallery and `/cms`; `lighthouserc.book.json` collects the
book surface at 1350x940 (ADR 0014). Tasks 7, 8 and 9 each closed reporting the admin
budgets **UNRESOLVED** for that reason. A budget nothing measures is a budget nobody is
holding.

### Options

**A — add the admin URLs to `lighthouserc.json`.** Rejected for the reason ADR 0014
already gives for the book: lhci's `collect.settings` are per **run**, not per URL. The
diary's default config collects under Lighthouse's phone emulation; the admin is an
authoring surface nobody edits a diary on from a phone. Sharing a run means measuring one
of them at the wrong viewport.

**B — collect the admin under the same phone emulation and accept it.** Rejected: it
would gate a surface at a viewport its own visual baselines and accessibility cases never
use, and `SCREENS.md` §3's wide layout — the cloth panel beside the form — only exists
above 820px. The gate would be green for a screen nobody sees.

**C — a third config at a desktop viewport.** Taken.

### Decision

`lighthouserc.admin.json`, `formFactor: desktop`, `screenEmulation` 1440x900, DPR 1,
`numberOfRuns: 5`, `aggregationMethod: median` — the same shape as the other two.

**1440x900 is not a new number.** It is `playwright.config.ts`'s `desktop` project, which
is the viewport the admin's visual baselines (`admin-sign-in`, `admin-sign-in-code`,
`admin-reset`, `admin-reset-sent`, `admin-reset-expired`, `admin-signed-in`) and its axe
and contrast cases already run at. Measuring performance somewhere the pixels are not
checked would be a third opinion about the same screen.

It collects the three addresses a reader can reach without a session:
`/admin/sign-in`, `/admin/sign-in/code`, `/admin/reset`.

**Two addresses are deliberately not collected, and are bounded rather than guessed.**
`/admin/sign-in/done` is behind the session guard, so Lighthouse — which sends no
cookie — would collect the redirect. Rather than mint a session for the collector it is
left out: it ships strictly **fewer** client modules than the three that are collected,
because `SignedInStep` is not a `'use client'` component and the other three panes are, so
its script total cannot exceed theirs. `/admin/reset/<token>` renders `NewPasswordStep`,
which is a client component and therefore _not_ bounded by that argument; it was measured
directly instead — 8 scripts, 176,211 bytes gzipped, against the 320KB ceiling — and is
recorded in `docs/testing.md` §7 rather than collected, because its address needs a live
token that changes every run.

**`/admin/sign-in/code` is collected with no cookie**, so what it measures is the
no-challenge placeholder rather than the pane a signing-in reader sees. That is the right
thing to gate and it is stated rather than assumed: the placeholder renders the same
shell, the same six cells and the same client bundle, and it is what an unauthenticated
visitor to that address is actually served. The states that differ from it differ in text,
not in bytes.

### Consequences

- Measured, twice: LCP medians **2,928.4 / 2,928.4 / 2,926.9 ms** against 3,000; CLS
  **0.0000** on all thirty runs; script transfer **140,641 / 141,323 / 140,489 bytes**
  against 327,680. Total blocking time 19–21ms.
- **INP is asserted by no config**, here or on the diary: it is a field metric with no
  Lighthouse lab equivalent. `CLAUDE.md` §6's 200ms is therefore unmeasured, and total
  blocking time is what the lab can say. Stated so a green run is not read as more than it
  is.
- `npm run test:perf` runs all three. It stopped being a `&&` chain in the same round —
  see Part 2's consequences.

---

## Part 2 — the admin surface was leaking into the diary's LCP route

### Context — a gate that went red, and was wrongly explained

Task 11 reported `lighthouserc.book.json`'s `/p/1` LCP at **3,082.6ms** against its
3,000ms budget, and attributed it to the bimodal split ADR 0008 named and ADR 0014
characterised. The evidence offered was that the same gate measured red at `d61ab9e` with
the task's own changes stashed.

**That baseline could not answer the question it was asked.** `d61ab9e` is on this
branch. A baseline only separates "did we cause it" from "is the host slow today" if it
sits on the other side of the change. The review took the one that does:

```
main   0bac9bd   2,924.3ms median   exit 0   GREEN
branch fdff259   3,078.3ms median   exit 1   RED
```

Same host, same committed config, minutes apart, both on a deleted `.next`. The
distributions do not overlap — main's slowest run is 8ms below the branch's fastest — so
this is not ADR 0008's bimodality. It is a Phase 2 regression.

ADR 0014's own closing bullet forbids exactly the explanation that was used: a gate is
characterised, not attributed.

### The cause, read out of the build rather than reasoned about

`/p/1` was serving **four render-blocking stylesheets where main serves two** (19 requests
against 17; FCP 1,053.8ms against 908.7ms):

```
3q03h-ytil7r0.css   2,467 B   packages/tokens/src/tokens.css
3lnwk95d-rnit.css   1,494 B   app/(diary)/diary.css
1b8ufanodnx1w.css   1,844 B   next/font/local's @font-face declarations
1g8qu58aprhre.css  28,599 B   the diary's own CSS modules
```

Two of those are chunks only because **two route groups import the same module**.
`app/(admin)/layout.tsx` imported `../(diary)/fonts`, and `app/(admin)/admin.css`
`@import`s `@travel-diary/tokens/tokens.css` — which `app/(diary)/diary.css` also imports.
Turbopack cannot merge a module reachable from two entries into either entry's stylesheet,
so each became a chunk of its own, and `/p/1` had to fetch both before it could paint.

That is the admin surface arriving on the public book across the seam ADR 0012 drew two
route entries to keep apart.

**Isolated by measurement, one variable at a time**, each a full `next build` on a deleted
`.next`:

| Build                              | `/p/1` stylesheets | `/admin/sign-in` stylesheets |
| ---------------------------------- | ------------------ | ---------------------------- |
| Both modules shared (as committed) | **4**              | 3                            |
| `fonts.ts` unshared only           | 3                  | 3                            |
| `tokens.css` unshared only         | 3                  | 3                            |
| Neither shared                     | **2**              | 2                            |

Each shared module costs the diary exactly one render-blocking request.

### Options

**A — move the budget.** Refused outright. ADR 0014's opening says raising a gate to
accommodate a real regression is dishonest, and this is a real regression.

**B — a Next.js configuration knob.** `experimental.cssChunking` was tried and is not
available: `next build` refuses it with "`experimental.cssChunking: false` is only
supported with webpack". `'strict'` produces _more_ requests by design. Measured, not
assumed.

**C — un-share the fonts module.** The admin declares its own `next/font/local` faces
from the same five `.woff2` files.

**D — un-share the token stylesheet too.** Would need a second copy of
`packages/tokens/src/tokens.css`, which is the single source of truth for the `--td-*`
properties.

### Decision — C, and deliberately not D

`app/(admin)/fonts.ts` declares the three families for the admin group.
`app/(admin)/layout.tsx` imports it instead of the diary's.

**The reasoning that put the shared import there was sound and its premise was false.**
The layout's header said a second declaration would emit a second `@font-face` set and a
second preload "for bytes the browser already has". Nothing was saved: `(diary)` and
`(admin)` have separate root layouts, so no document ever loads both, and there is no
browser that already has them. What is duplicated is ~1.8KB of `@font-face` CSS served
only to a signed-in reader. What is _not_ duplicated is the fonts: `src` points at the
same five files, `next/font/local` copies each to a content-hashed URL, and identical
bytes hash the same.

**D was rejected on a measurement, not on principle.** With the fonts unshared and the
tokens still shared — 3 stylesheets, 18 requests — `/p/1` measures:

```
fonts unshared, tokens shared   LCP 2,926.1 / 2,925.8ms   FCP 909.0ms   18 requests
nothing shared                  LCP 2,924.8ms             FCP 908.8ms   17 requests
main (0bac9bd)                  LCP 2,924.3ms                           17 requests
```

The remaining shared module costs **about 1.3ms of LCP and 0.2ms of FCP**. Duplicating
the single source of truth for the design tokens to buy that back would be a bad trade,
and the temporary copy that produced the third row was deleted.

### Consequences

- `/p/1` is green again at **2,926.1ms and 2,925.8ms** across two runs, within 1.8ms of
  `main`.
- **An invariant, stated where it can be relied on:** a module imported by both
  `app/(diary)/**` and `app/(admin)/**` becomes a chunk the diary must fetch. The seam is
  not only about documents and layouts; it is about the module graph. `admin.css`'s
  `@import` of the shared tokens is the one crossing that remains, and it is here on the
  record with the number it costs.
- **`npm run test:perf` no longer short-circuits.** It ran `lhci autorun && lhci autorun
&& lhci autorun`, so with the book gate red the admin gate — added in the same task,
  third in the chain — never executed once under its own command. It is now
  `scripts/run-lighthouse.mjs`, which runs every config it is named and exits non-zero if
  any failed. The configs stay named in `package.json` rather than discovered, so
  `e2e/ciRegistration.test.ts`'s guard against an unrun config keeps working.
- **What to do if this recurs: count the `<link rel="stylesheet">` elements `/p/1` serves
  from a production build, before reaching for the LCP number. THREE is the shape** — and
  the count is only a signal if the three are named, so here they are, measured off the
  shipped build rather than inferred from the table above:

  ```
  2,467 B  packages/tokens/src/tokens.css        SHARED with (admin), deliberately - see the Decision
  3,338 B  app/(diary)/diary.css + the diary's own next/font @font-face rules, merged
  ```

28,599 B the diary's CSS modules

```

A stray fence closed that block one line early and reopened it around everything after
it, so the rest of this ADR — including the actionable line below — rendered as code in
any Markdown view (Phase 2's final review, finding 40).

`/admin/sign-in` serves three of the same shape: the same shared token chunk, its own
`admin.css` + `@font-face` merge, and its own modules.

**A FOURTH stylesheet on `/p/1` means something new is shared across the seam.** Two would
mean the token crossing had been closed, which nothing has decided to do. Writing "two" here
first — while §"The cause" three paragraphs above measures three — is worth recording as
the error it was: a heuristic written from the intent of the fix rather than from the
measurement sitting beside it, which is the same species as the four documents that once
asserted `() => false` on a collection that permitted `delete`.
```
