# 6 · Accessibility — the detail

The detail for `docs/testing.md` §6. That document states the suite's tool, its scope
and how to run it, and points here; everything else about the suite is below. The section
numbers are `docs/testing.md`'s and do not change.

- **Tool:** axe-core in Playwright (`@axe-core/playwright`, `e2e/a11y.spec.ts`), via the
  shared `expectNoAxeViolations` helper (`e2e/support/axe.ts`, Task 1 of Phase 1) — plus
  `measureContrastOverGradient` (`e2e/support/coverContrast.ts`) for the one thing axe
  will not judge: text over a gradient (finding 2 below).
- **Scope:** every route. Contrast ratios from the handoff's token table are asserted,
  not assumed (e.g. `ink-muted` must stay opaque — an alpha version measures below
  4.5:1, per the handoff's own note). Where axe returns `incomplete` rather than a
  verdict, the ratio is measured from the rendered pixels and asserted anyway; an
  `incomplete` is never read as a pass.
- **Status:** implemented for every view that exists — including, since Phase 2 Task 7,
  the first screen of the bespoke admin: `/admin/sign-in` runs `expectNoAxeViolations`
  with **no exclusions**, and it is the first view in the product where `label`,
  `form-field-multiple-labels` and `autocomplete-valid` have anything to judge. It is
  followed by TWO contrast cases of the same kind the cover has, and for the same reason:
  the cloth panel and the narrow masthead are gradients, so axe returns `color-contrast`
  INCOMPLETE over both and a green axe run says nothing about the cream lines drawn on
  them. Measured from the rendered pixels, the panel's eyebrow came in at 4.447:1 —
  below AA — which is what `docs/deviations.md` §32 records and fixes; the masthead
  needed no change and measures 4.805, 7.974 and 4.577. The masthead case runs at the
  `mobile` project alone and the panel case at the other two, because each block is drawn
  at one side of the breakpoint only.

  **Phase 2 Task 8 adds the second sign-in state**, `/admin/sign-in/code`, in TWO cases
  and with no exclusions either: the screen as it loads, and the screen after it has
  refused a code. The second exists because the error box is the one part of that pane
  axe never sees on a clean load, and it is what `aria-describedby` on the cell group has
  to resolve to. This is also the first view in the product where `label` has six
  boxes with no visible label to judge — `SCREENS.md` §3.2 gives the row one heading
  ("The code") and no per-cell text, so each cell carries an `aria-label` ("Digit 1 of
  6") and the row is a `role="group"` named by that heading. The cloth and masthead
  contrast cases already cover this route's frame, since it is the same shell drawn from
  the same stylesheet; its pane is dark ink on `#fffdf6`, which axe judges for itself.

  Implemented for each designed diary page in turn — `/p/1` (Cover, Task 7), `/p/2` (Contents, Task 9), `/p/3` (Notes, Task 10)
  and `/p/4`, `/p/5`, `/p/33` (Frames I, Frames II and About, Task 11), because each
  page kind renders different markup on the same URL shape — plus Task 13's
  page-not-found view (`/p/999`), the one diary view that is not a page of the book and
  the one where an unlabelled way back would strand a reader with nothing else on
  screen. Task 14 added two more: `/gallery/patagonia` and the same route with its
  LIGHTBOX OPEN. The second of those is the only view in the product that traps a
  reader's focus, and axe knows most of what that costs — `aria-dialog-name` (a dialog
  needs an accessible name), `button-name` on its four controls, and `color-contrast` on
  cream type over a 95%-opaque near-black scrim. It runs with no exclusions,
  deliberately: silencing one of those rules would be silencing the only automated check
  this project has on that view. The gallery case itself is where `image-alt` has most
  to judge anywhere in the product, a gallery being almost entirely photographs. All
  nine
  call `expectNoAxeViolations(page)` with **no exclusions at all** — every rule in the
  full ruleset applies to a route this project authored, and `/cms`'s allowances below
  must never be inherited by them. All nine pass on all three viewport projects. The
  Notes case is the first with anything for `image-alt`, `definition-list` or
  `link-name` to judge: it is the first page in the diary with photographs, a
  description list (the tally ticket) and a link styled as a button. The two Frames
  cases are three quarters and four fifths photograph, so a slot whose alt text went
  missing would be most of the page; the About case is the one page in the book with
  nothing clickable on it at all, and the one whose level-one heading is a static
  string rather than editor content — which is what keeps `page-has-heading-one` green
  on a book whose `about` global has never been filled in. `/cms`
  asserts `results.violations` is empty — zero violations, not "no critical violations"; CLAUDE.md's
  non-negotiables draw no line between severities. `expectNoAxeViolations` defaults to
  the FULL ruleset with no exclusions; a caller passes rule ids to disable only via its
  `options.allow`, visibly, at its own call site. Running axe against `/cms` today
  surfaced two real findings that belong to Payload's own stock admin markup, not to any
  code authored in this repository: `landmark-one-main` and `page-has-heading-one`, both
  `impact: moderate`, both scoped to the bare `<html>` element. `/cms` is explicitly
  "development scaffolding ... not the product" (`apps/web/payload.config.ts`'s own
  header) and is disabled outright in production, so `e2e/a11y.spec.ts` calls
  `expectNoAxeViolations(page, { allow: ['landmark-one-main', 'page-has-heading-one'] })`
  — narrowly, with the finding and the reasoning recorded in the test file's own header,
  not by loosening the helper's default. Any _other_ violation, on this route or any
  future one, still fails the suite, and a diary route calling the helper with no
  `allow` cannot inherit `/cms`'s exclusion — each call site names its own. This
  exclusion is revisited the moment `/cms` stops being the route under test — the bespoke
  `/admin` replaces it, and Phase 2 Task 7 mounted its first screen (`/admin/sign-in`,
  which needs no `allow` at all).

- **The mobile reading mode is audited separately, because it is a separate tree**
  (Phase 1 Task 15). Six of the diary's axe cases are the BOOK's and now skip below
  860px; six new ones take their place at the `mobile` project - `/p/1`, `/p/2`, `/p/3`,
  `/p/4` and `/p/33` for §1.10's four page kinds, plus the bookmark drawer OPEN over
  `/p/3`. All six call `expectNoAxeViolations(page)` with **no exclusions**, the same bar
  the book's pages are held to. The drawer case is the second view in this product that
  traps a reader's focus (the lightbox is the first), so `aria-dialog-name`,
  `button-name`, `aria-allowed-attr` on `aria-current` and `color-contrast` over
  `#3b332a` all have something real to judge - and that last one is why the drawer's tab
  list is not painted the way the book's paper-backed rail is: the prototype's own
  colours measure 2.28:1 and 1.68:1 on that panel (`docs/deviations.md` §22).
- **Proof the helper actually catches something:** verified by planting a real violation
  (an `<img>` with no `alt`, no `aria-label`, no `title` — axe's `image-alt`, `impact:
critical`) into the live `/cms` DOM via `page.evaluate` and calling
  `expectNoAxeViolations(page)` with no `allow` — the assertion failed, listing
  `image-alt` alongside the two known `/cms` findings (`region` also fired, since the
  planted `<img>` sat outside any landmark). Removing the plant and calling
  `expectNoAxeViolations(page, { allow: [...] })` with the two known exclusions passed
  cleanly. See this task's report for the pasted runs.
- **Run:** `npm run test:a11y`.
- **Add one:** call `expectNoAxeViolations(page)` against every new route as it is added
  — with no `allow`, which asserts zero violations against the full ruleset. Only pass
  `allow` with the same standard of evidence as above (a named, understood, vendor-owned
  finding), with a comment at the call site — never to make an inconvenient result
  disappear, and never inherited from another spec's exclusion.

#### Findings recorded here rather than silenced

**1 · The `/cms` axe case had been passing vacuously.** Until Phase 1 Task 9,
`e2e/a11y.spec.ts`'s `/cms` case called `expectNoAxeViolations` immediately after
`page.goto`, with no wait for Payload's asynchronously-rendered login form — so axe was
analysing a nearly empty document. The gap surfaced as an intermittent failure under
concurrent workers that named a _different_ rule on each run (`region` once, a
keyboard finding on `.checkbox.field-type` another), while passing every time the case
ran alone. The case now waits for the form and for Next's dev overlay, exactly as
`e2e/visual.spec.ts`'s `/cms` case already did. With the analysis deterministic, a
**third** Payload-owned finding is visible and is now in that call site's `allow` list:
`region` ("All page content should be contained by landmarks"), the same landmark family
as `landmark-one-main` and `page-has-heading-one`. The diary route carries no exclusions
of any kind — the Cover and Contents cases call `expectNoAxeViolations(page)` with no
`allow` argument at all — and adding one there would be a defect, not a workaround.

**2 · The Cover's contrast is measured, not asserted by axe — and two handoff values were
changed so it clears AA.** axe-core reports `color-contrast` as **incomplete** on both
diary pages (7 nodes on the Cover, 45 on Contents), because it cannot resolve a gradient
background. Incomplete is not a violation, so the suite is green; that is axe declining to
judge, not a contrast pass, and `CLAUDE.md` §2 requires the ratios to be _asserted_. They
are now asserted by a test rather than measured by hand: `e2e/a11y.spec.ts`'s cover case
calls `measureContrastOverGradient` (`e2e/support/coverContrast.ts`), which hides each
line with `visibility: hidden` so its box shows only the cloth it sat on, screenshots the
cover element, takes the **lightest** pixel under each line as that line's background —
the worst case, since the 45° texture makes the background a range rather than a value —
flattens the line's own translucent cream onto it, and runs both through
`packages/domain/src/contrast.ts`. It runs at all three viewport projects.

Measured with SCREENS.md §1.1's literal values, four of the five lines failed. Both
columns below are the `desktop` project's, the tightest of the three:

| Cover line             | Size        | Before     | After  | Required |
| ---------------------- | ----------- | ---------- | ------ | -------- |
| "Travel Diary" eyebrow | 12px        | **2.86:1** | 4.52:1 | 4.5:1    |
| "Wanderings" title     | 124px       | 3.81:1     | 8.13:1 | 3:1      |
| Subtitle               | 22px italic | **2.72:1** | 5.33:1 | 4.5:1    |
| "Kept by …"            | 12.5px      | **2.37:1** | 4.73:1 | 4.5:1    |
| Years                  | 12.5px      | **1.87:1** | 5.26:1 | 4.5:1    |

The 22px italic subtitle does **not** qualify for SC 1.4.3's large-text exemption, which
needs 24px or 18.66px bold, so it is held to 4.5:1; only the 124px title is large text.
The cause was in the specified gradient rather than in the transcription — the handoff's
own prototype renders the same way: the cloth interpolates from an opaque colour to a
28%-opaque black, so by mid-page the cloth is only ~72% opaque and the light paper face
beneath washes it from `#2f4a47` up to roughly `#5e6d67`, precisely where the small
Courier lines sit. **The user approved two value changes** (`docs/deviations.md` §12): the
gradient's end stop is now the opaque form of that same `rgba(0,0,0,.28)` overlay, and the
years line's alpha is `.78` rather than `.5` — the one line an opaque cloth alone does not
rescue. No new colour was introduced, and every other §1.1 value is unchanged. The
eyebrow's 4.52:1 is the narrowest margin on the page and must be re-measured, not reasoned
about, after any change to the cloth, the texture over it, or that line's own alpha.
**The Contents page needs no such note: every one of its fourteen text roles was measured
against the darkest paper stop and clears its bar, the lowest at 4.57:1.**

**3 · All three handoff fonts are self-hosted, at all five faces the design uses.**
README.md's "Fonts are Google Fonts (Caveat, EB Garamond, Courier Prime) — self-host in
production" is closed via `next/font/local`, with the five `.woff2` files committed and
`next build` never touching the network (`docs/adr/0005-font-hosting.md`,
`apps/web/app/(diary)/fonts.ts`). Courier Prime 400/700 and EB Garamond's italic face
were deferred through Phase 1 on a real LCP measurement, and that measurement **still
reproduces**: `/p/1` measures 2,488.2ms with two faces, 2,637.4ms with four and
2,933.8ms with five, against CLAUDE.md §6's 2,500ms gate — the gate at the time of
writing; **3,000ms today**, see §7.0's current-state table below. They were wired in
anyway, because a minimal fontless route in this same app models 2,023.2ms of that
budget on its own and the route's OBSERVED paint is ~130ms in every configuration —
`docs/adr/0008-lcp-budget-and-the-framework-floor.md` has the floor measurement, the
options, and the record that the gate was left **red and unraised** at the time — raised
to 3,000ms since, and green today (§7.0). Every visual
baseline was regenerated in the pinned container against the five-face state, with
`e2e/layout.spec.ts` green in the same run.
