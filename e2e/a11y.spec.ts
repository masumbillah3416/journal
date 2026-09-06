/**
 * a11y.spec.ts — zero-axe-violations gate for every route this app serves.
 *
 * CLAUDE.md §2 requires axe-core in Playwright against every route, asserting
 * zero violations rather than "no critical violations" — the non-negotiables
 * draw no line between severities. Two routes exist today, `/cms` and the
 * diary's `/p/<n>`; the diary route is checked once per designed PAGE rather
 * than once per route, because each page kind renders different markup on the
 * same URL shape (Phase 1 Task 9 added the Cover and Contents cases, Task 10
 * the Notes page and Task 11 the two Frames pages and About - all six page
 * kinds the book has). Add one `test()` per route or page as the rest of the
 * public diary and the bespoke admin land.
 *
 * Every case calls `expectNoAxeViolations` (`e2e/support/axe.ts`) rather than
 * building its own `AxeBuilder`, so the FULL ruleset is the default everyone
 * gets and any exclusion is a visible, explicit argument at its own call
 * site — never a shared default that a future diary-route test could
 * silently inherit.
 *
 * `/cms` is Payload's own stock admin UI, not this project's code — per
 * `apps/web/payload.config.ts`'s own header, it is "development scaffolding
 * ... not the product" and is disabled outright in production. Running axe
 * against it today surfaces three real, pre-existing findings that belong to
 * Payload's generated markup, not to anything authored here:
 * `landmark-one-main` ("Document should have one main landmark"),
 * `page-has-heading-one` ("Page should contain a level-one heading") and
 * `region` ("All page content should be contained by landmarks") — one
 * family, all `impact: moderate`, all describing an admin shell with no
 * landmark elements. They are disabled by id, narrowly, via `allow` — passed
 * explicitly at this call site, not baked into the helper — rather than by
 * loosening the assertion.
 *
 * `region` was only found in Phase 1 Task 9, and finding it was the point of
 * that task's change to this case. Until then `/cms` was analysed immediately
 * after `goto`, with no wait for Payload's asynchronously-rendered form — so
 * axe was inspecting a document that had barely any content in it, and the
 * case was passing vacuously. Under concurrent workers that race surfaced as
 * an intermittent failure naming a DIFFERENT rule on each run, which is what
 * exposed it. The wait it now shares with `e2e/visual.spec.ts`'s `/cms` case
 * makes the analysis deterministic, and `region` is what a fully-rendered
 * Payload admin has always been violating.
 * Any *other* violation, on this route or any future one, still fails the
 * suite. See docs/testing.md's Accessibility section for the same note.
 *
 * THE LAST CASE IS NOT AN AXE CASE, and is here because the axe ones cannot
 * reach it. axe returns `color-contrast` INCOMPLETE on the Cover — it reads a
 * computed `background-color` and the cloth is a gradient — so a green axe run
 * on `/p/1` says nothing about whether the cover's text is legible. CLAUDE.md
 * §2 requires the handoff's contrast ratios to be asserted rather than
 * assumed, so that case measures them from the rendered pixels
 * (`e2e/support/coverContrast.ts`). Deleting it would leave this route's
 * contrast unasserted while the suite still looked green, which is the state
 * it was written to end.
 * THE SIGN-IN SCREEN JOINS BOTH KINDS OF CASE (Phase 2 Task 7). Its axe case
 * runs with NO exclusions - the whole screen is code authored here, so
 * `landmark-one-main`, `page-has-heading-one`, `region`, `label` and
 * `link-name` are all requirements rather than vendor noise - and it is
 * followed by a second contrast case for the same reason the cover has one:
 * the cloth panel is a gradient, so axe returns `color-contrast` INCOMPLETE
 * over it and a green axe run says nothing about the four cream lines drawn
 * on it. They are measured from the rendered pixels by the same helper.
 * TASK 8 ADDS THE SECOND SIGN-IN STATE, `/admin/sign-in/code`, with no
 * exclusions either. It is the first view in the product where `label` has six
 * unlabelled-looking boxes to judge - the code cells carry `aria-label`s
 * rather than visible labels, because `SCREENS.md` §3.2 gives the row one
 * heading ("The code") and no per-cell text - and where `aria-allowed-attr`
 * and `aria-valid-attr-value` have a `role="group"` and its `aria-labelledby`
 * to check. The cloth and masthead contrast cases above cover this route's
 * frame too, since it is the SAME shell drawn from the same stylesheet; only
 * the pane differs, and the pane is dark ink on `#fffdf6`, which axe judges
 * for itself.
 * Revisit when the bespoke admin at `/admin` replaces `/cms` as the route
 * under test (Phase 1+) — Payload's stock scaffolding will no longer be in
 * scope at all.
 * Depends on: @playwright/test, e2e/support/axe.ts, e2e/support/coverContrast.ts,
 * the running app from playwright.config.ts's `webServer`, and the seeded
 * diary (`npm run db:seed`) — the cover's copy is what the last case measures.
 */
import { expect, test } from '@playwright/test'
import { expectNoAxeViolations } from './support/axe'
import { measureContrastOverGradient } from './support/coverContrast'
import { drawsMobileReadingMode } from './support/surface'

test('has no axe violations on /cms', async ({ page }) => {
  await page.goto('/cms')

  // Wait for Payload's form, exactly as e2e/visual.spec.ts's /cms case does,
  // and for the same reason: Payload renders its login form asynchronously, so
  // `goto` alone can hand axe a half-rendered document. This case had no wait
  // until Phase 1 Task 9, and the omission was not theoretical — under
  // concurrent workers it produced two DIFFERENT spurious violations on
  // Payload's own markup on different runs (`region`, "All page content should
  // be contained by landmarks", and a keyboard finding on
  // `.checkbox.field-type`), while passing every time the case ran alone. That
  // is a readiness race, not a real finding, and the fix is the wait rather
  // than another entry in `allow`.
  await expect(page.locator('form')).toBeVisible()
  await expect(page.getByText(/Rendering/)).toBeHidden()

  // These THREE rules belong to Payload's own generated admin markup, not to
  // any code authored here — see this file's header for the findings. `region`
  // joined the list in Task 9 and is not a regression: adding the readiness
  // wait above is what made it visible. Before the wait, axe was analysing a
  // half-rendered document and this case was passing vacuously, which is the
  // more serious of the two defects this change fixes.
  await expectNoAxeViolations(page, { allow: ['landmark-one-main', 'page-has-heading-one', 'region'] })
})

test('has no axe violations on /p/1, the Cover page', async ({ page, viewport }) => {
  // Below 860px this route draws SCREENS.md §1.10's mobile reading mode
  // instead of the book. That surface is audited by its own cases at the foot
  // of this file, with the same helper and the same absence of exclusions.
  test.skip(drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

  await page.goto('/p/1')
  await expect(page.locator('[data-page="cover"]')).toBeVisible()

  // No exclusions, deliberately: every rule in the full ruleset applies to a
  // route this project authored. The `allow` list on /cms above is scoped to
  // Payload's own generated markup and must never be inherited here - a diary
  // page has a `<main>` (Book.tsx) and a level-one heading of its own, so
  // `landmark-one-main` and `page-has-heading-one` are requirements here, not
  // vendor noise to disable.
  await expectNoAxeViolations(page)
})

test('has no axe violations on /p/2, the Contents page', async ({ page, viewport }) => {
  // Below 860px this route draws SCREENS.md §1.10's mobile reading mode
  // instead of the book. That surface is audited by its own cases at the foot
  // of this file, with the same helper and the same absence of exclusions.
  test.skip(drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

  await page.goto('/p/2')
  await expect(page.locator('[data-page="contents"]')).toBeVisible()

  // Also no exclusions - see the case above. The Contents index is ten real
  // anchors, each carrying its journey's name, place, dates and page number,
  // so `link-name` and `color-contrast` both have something real to check.
  await expectNoAxeViolations(page)
})

test('has no axe violations on /p/3, a journey’s Notes page', async ({ page, viewport }) => {
  // Below 860px this route draws SCREENS.md §1.10's mobile reading mode
  // instead of the book. That surface is audited by its own cases at the foot
  // of this file, with the same helper and the same absence of exclusions.
  test.skip(drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

  await page.goto('/p/3')
  await expect(page.locator('[data-leaf="2"] [data-page="notes"]')).toBeVisible()

  // Also no exclusions - see the two cases above. This page is the first in
  // the diary to carry photographs, a description list, a link styled as a
  // button and two badges whose glyphs are drawn in CSS, so `image-alt`,
  // `definition-list`, `link-name` and `color-contrast` all have something
  // real to check here that they did not on the Cover or the Contents.
  //
  // The locator is scoped to leaf 2 deliberately: `Book.tsx` renders all
  // thirty-three leaves, so ten notes pages are in this document and an
  // unscoped locator would be a strict-mode violation rather than a wait.
  // axe still analyses the WHOLE page, all ten of them included.
  await expectNoAxeViolations(page)
})

test('has no axe violations on /p/4, a journey’s Frames I page', async ({ page, viewport }) => {
  // Below 860px this route draws SCREENS.md §1.10's mobile reading mode
  // instead of the book. That surface is audited by its own cases at the foot
  // of this file, with the same helper and the same absence of exclusions.
  test.skip(drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

  await page.goto('/p/4')
  await expect(page.locator('[data-leaf="3"] [data-page="frames-i"]')).toBeVisible()

  // Also no exclusions - see the cases above. This page carries three
  // `<figure>`/`<figcaption>` pairs and no other content but its header, so
  // `image-alt` has more to judge here than anywhere in the book: a slot
  // whose alt text went missing would be three quarters of the page.
  await expectNoAxeViolations(page)
})

test('has no axe violations on /p/5, a journey’s Frames II page', async ({ page, viewport }) => {
  // Below 860px this route draws SCREENS.md §1.10's mobile reading mode
  // instead of the book. That surface is audited by its own cases at the foot
  // of this file, with the same helper and the same absence of exclusions.
  test.skip(drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

  await page.goto('/p/5')
  await expect(page.locator('[data-leaf="4"] [data-page="frames-ii"]')).toBeVisible()

  // Also no exclusions. Four photographs and a footer whose gallery control
  // is a link styled as a button, so `image-alt`, `link-name` and
  // `color-contrast` all have something real to check.
  await expectNoAxeViolations(page)
})

test('has no axe violations on /p/33, the About page', async ({ page, viewport }) => {
  // Below 860px this route draws SCREENS.md §1.10's mobile reading mode
  // instead of the book. That surface is audited by its own cases at the foot
  // of this file, with the same helper and the same absence of exclusions.
  test.skip(drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

  await page.goto('/p/33')
  await expect(page.locator('[data-leaf="32"] [data-page="about"]')).toBeVisible()

  // Also no exclusions. This page has a list, a portrait, two long
  // paragraphs, three `aria-hidden` stamps and - uniquely in the book -
  // nothing clickable at all, so `list`, `image-alt`, `empty-heading` and
  // `color-contrast` are what it exercises. It is also the page whose
  // level-one heading is a static string rather than editor content
  // (`About.tsx`'s header), which is what keeps `page-has-heading-one` green
  // on a book whose `about` global has never been filled in.
  await expectNoAxeViolations(page)
})

test('has no axe violations on the page-not-found view', async ({ page }) => {
  // The one diary view that is not a page of the book: Task 13's
  // `app/(diary)/not-found.tsx`, which an address naming no page renders with
  // HTTP 404. It is a route this project serves, so CLAUDE.md §2's "every
  // route" covers it, and a reader who reaches it has nothing else on screen -
  // an unlabelled way back would strand them completely.
  await page.goto('/p/999')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // No exclusions - see the diary cases above. This view has its own `<main>`
  // and its own level-one heading, so `landmark-one-main` and
  // `page-has-heading-one` are requirements here too, and its single link and
  // four lines of type on a paper gradient are what `link-name` and
  // `color-contrast` have to check.
  await expectNoAxeViolations(page)
})

test('has no axe violations on a journey’s full gallery', async ({ page }) => {
  await page.goto('/gallery/patagonia')
  await expect(page.locator('[data-tile]').first()).toBeVisible()

  // No exclusions - see the diary cases above. This route has its own
  // `<main>`, its own level-one heading and sixty-one image buttons, so
  // `landmark-one-main`, `page-has-heading-one`, `image-alt`, `button-name`
  // and `color-contrast` all have something real to check - and `image-alt`
  // has more to judge here than anywhere in the product, since a gallery is
  // almost entirely photographs.
  await expectNoAxeViolations(page)
})

test('has no axe violations with the lightbox open over that gallery', async ({ page }) => {
  // A modal has requirements a static page does not, and axe knows most of
  // them: `aria-dialog-name` (a dialog needs an accessible name),
  // `aria-required-attr`, `button-name` on the four controls, and
  // `color-contrast` on cream type over a 95%-opaque near-black scrim. Run
  // with no exclusions, deliberately: silencing one of these would be
  // silencing the only automated check this project has on the one view it
  // traps a reader's focus inside.
  await page.goto('/gallery/patagonia')
  await page.locator('[data-tile]').nth(2).click()
  await expect(page.locator('[data-lightbox]')).toBeVisible()

  await expectNoAxeViolations(page)
})

/**
 * Every page kind of SCREENS.md §1.10's mobile reading mode, by the address
 * that draws it and the marker it publishes. Four kinds, five addresses: a
 * journey's three pages share one renderer, and both a Notes page and a
 * Frames page are audited because only one of them draws the highlights, the
 * note and the tally card.
 */
const MOBILE_PAGES = [
  { path: '/p/1', kind: 'cover' },
  { path: '/p/2', kind: 'contents' },
  { path: '/p/3', kind: 'notes' },
  { path: '/p/4', kind: 'frames-i' },
  { path: '/p/33', kind: 'about' },
] as const

for (const { path, kind } of MOBILE_PAGES) {
  test(`has no axe violations on ${path}, the mobile reading mode's ${kind} page`, async ({ page, viewport }) => {
    // The mirror of the six book cases above, on the surface a reader below
    // 860px actually gets - a different component tree, different markup and
    // a different stylesheet, so it needs its own audit rather than
    // inheriting the book's (SCREENS.md §1.10,
    // docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md).
    test.skip(!drawsMobileReadingMode(viewport), 'the mobile reading mode is not drawn at or above 860px')

    await page.goto(path)
    await expect(page.locator(`[data-mobile-page="${kind}"]`)).toBeVisible()

    // No exclusions, deliberately - the same bar the book's own pages are
    // held to. This surface has its own `<main>` and its own level-one
    // heading, a 44px burger and two 52px arrows for `button-name` and
    // `link-name`, cream type on `#3b332a` in the header and dark ink on
    // paper below it for `color-contrast`, and - on a journey page - the
    // photographs and description list `image-alt` and `definition-list`
    // judge.
    await expectNoAxeViolations(page)
  })
}

test('has no axe violations with the bookmark drawer open over the mobile reading mode', async ({ page, viewport }) => {
  // The second modal in this product, and the second view that traps a
  // reader's focus. axe knows most of what that costs - `aria-dialog-name` (a
  // dialog needs an accessible name), `button-name` on the burger and the
  // close control, `aria-allowed-attr` on `aria-current`, and
  // `color-contrast` on a whole tab list drawn on `#3b332a`, which is the
  // reason those tabs are not painted the way the book's paper-backed rail is
  // (docs/deviations.md §22). Run with no exclusions: silencing one of them
  // would be silencing the only automated check this project has on this view.
  test.skip(!drawsMobileReadingMode(viewport), 'the mobile reading mode is not drawn at or above 860px')

  await page.goto('/p/3')
  await page.locator('[data-burger]').click()
  await expect(page.locator('[data-drawer]')).toBeVisible()

  await expectNoAxeViolations(page)
})

/**
 * The cover's five text lines, with the WCAG 2.1 AA floor each one has to
 * clear. Only the title qualifies as large text: SC 1.4.3's exemption needs
 * 24px, or 18.66px at bold, and the 22px italic subtitle is neither — so it
 * is held to 4.5:1 like the three Courier lines, not to 3:1.
 */
const COVER_LINES = [
  { name: 'eyebrow (Courier 12px)', selector: '[data-page="cover"] p:nth-of-type(1)', minimumRatio: 4.5 },
  { name: 'title (Caveat 124px)', selector: '[data-page="cover"] h1', minimumRatio: 3 },
  { name: 'subtitle (Garamond italic 22px)', selector: '[data-page="cover"] p:nth-of-type(2)', minimumRatio: 4.5 },
  { name: '"Kept by" (Courier 12.5px)', selector: '[data-page="cover"] p:nth-of-type(3)', minimumRatio: 4.5 },
  { name: 'years (Courier 12.5px)', selector: '[data-page="cover"] p:nth-of-type(4)', minimumRatio: 4.5 },
] as const

test('meets AA contrast on every line of the cover, which axe cannot judge', async ({ page, viewport }) => {
  test.skip(drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

  // The case above cannot cover this. axe reports `color-contrast` as
  // INCOMPLETE on this route rather than as a pass — it reads a computed
  // `background-color`, and the cloth is a gradient — so `expectNoAxeViolations`
  // is green here because axe declined to judge, not because the ratios are
  // sound. They are measured from the rendered pixels instead; see
  // `e2e/support/coverContrast.ts` for the method, and docs/deviations.md §12
  // for the two cover values that were changed to clear these floors.
  await page.goto('/p/1')
  await expect(page.locator('[data-page="cover"]')).toBeVisible()
  // AND WAIT FOR THE BOOK TO BE SCALED, not merely drawn. The cover is
  // server-rendered but `useBookScale` sets the design box's transform on the
  // client, and every rect this measurement reads - the cover's own origin and
  // each line's box - is the SCALED one. Measured before the transform lands,
  // a line's box is an unscaled 1300x860 coordinate against a screenshot of a
  // scaled element, and `coverContrast.ts` throws "a line's box fell outside
  // the captured cover" rather than reporting a wrong ratio. Reproduced on the
  // `mid` project (Phase 2 Task 7): one failure in two consecutive runs, the
  // years line at y=551.8 against a cover roughly 392px tall on screen. It is
  // the same readiness race, and the same fix, as the `/cms` case at the top of
  // this file, and it is the wait `e2e/visual.spec.ts`'s `settled()` already
  // makes before every screenshot of this page.
  await expect(page.locator('[data-design-box]')).toHaveAttribute('style', /scale\(/)

  const measured = await measureContrastOverGradient(page, '[data-page="cover"]', COVER_LINES)

  // Asserting the shortfalls rather than each ratio in turn: a failure then
  // names every line that is below its floor, with the number it reached, in
  // one run — and pinning exact ratios would make this a change-detector for
  // anti-aliasing rather than a floor.
  expect(measured.filter((line) => line.ratio < line.minimumRatio)).toEqual([])
})

/**
 * The sign-in cloth panel's four cream lines, with the WCAG 2.1 AA floor each
 * one has to clear. Only the fitted title qualifies as large text (SC 1.4.3
 * needs 24px, or 18.66px at bold): it renders at 75px for the seeded title.
 * The 17px italic subtitle is not large, so it is held to 4.5:1 like the two
 * Courier lines.
 */
const SIGN_IN_CLOTH_LINES = [
  { name: 'eyebrow (Courier 10.5px)', selector: '[data-sign-in-cloth-eyebrow]', minimumRatio: 4.5 },
  { name: 'title (Caveat, fitted)', selector: '[data-sign-in-cloth-title]', minimumRatio: 3 },
  { name: 'subtitle (Garamond italic 17px)', selector: '[data-sign-in-cloth-subtitle]', minimumRatio: 4.5 },
  { name: '"The back room" (Courier 10.5px)', selector: '[data-sign-in-cloth-footer]', minimumRatio: 4.5 },
] as const

test('has no axe violations on /admin/sign-in, the password step', async ({ page }) => {
  await page.goto('/admin/sign-in')
  await expect(page.locator('[data-password-step]')).toBeVisible()

  // No exclusions, deliberately: every rule in the full ruleset applies to a
  // screen this project authored end to end. The `allow` list on /cms above
  // is scoped to Payload's own generated markup and must never be inherited
  // here - this screen has a `<main>` (SignInShell.tsx), a level-one heading
  // of its own ("Welcome back"), a labelled field per input and a named
  // control per button, so every one of those rules is a requirement.
  await expectNoAxeViolations(page)
})

test('has no axe violations on /admin/sign-in/code, the one-time-code step', async ({ page }) => {
  await page.goto('/admin/sign-in/code')
  // The pane is visible AND its six cells are drawn before axe looks: a route
  // that rendered an empty shell would have no violations either.
  await expect(page.locator('[data-code-step-pane]')).toBeVisible()
  await expect(page.locator('[data-code-cell]')).toHaveCount(6)

  // No exclusions, for the same reason the password step has none.
  await expectNoAxeViolations(page)
})

test('has no axe violations on the code step after it has refused a code', async ({ page }) => {
  await page.goto('/admin/sign-in/code')
  await expect(page.locator('[data-code-cell]')).toHaveCount(6)

  // The error box is the one part of this pane axe never sees on a clean
  // load, and it is a live region - `aria-describedby` on the cell group has
  // to resolve to it, which `aria-valid-attr-value` checks only while it is
  // in the document.
  await page.getByRole('button', { name: 'Verify and sign in' }).click()
  await expect(page.locator('[data-code-step-pane] [role="alert"]')).toHaveText(
    'All six digits, then we can look.',
  )

  await expectNoAxeViolations(page)
})

test('meets AA contrast on the sign-in cloth panel, which axe cannot judge', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 820, 'the cloth panel is drawn only above SCREENS.md §3’s breakpoint')

  // Same limitation as the cover's case above, on the same kind of surface:
  // axe reports `color-contrast` INCOMPLETE over a gradient, so the case
  // before this one is green because axe declined to judge. The ratios are
  // measured from the rendered pixels instead; see
  // `e2e/support/coverContrast.ts` for the method, and docs/deviations.md §32
  // for the one value that was changed to clear these floors.
  await page.goto('/admin/sign-in')
  await expect(page.locator('[data-sign-in-cloth]')).toBeVisible()

  const measured = await measureContrastOverGradient(page, '[data-sign-in-cloth]', SIGN_IN_CLOTH_LINES)

  // Asserting the shortfalls rather than each ratio in turn - see the cover's
  // case for why - but asserting first that four lines were measured at all,
  // because an empty result set has no line below its floor either.
  expect(measured).toHaveLength(SIGN_IN_CLOTH_LINES.length)
  expect(measured.filter((line) => line.ratio < line.minimumRatio)).toEqual([])
})

/**
 * The narrow masthead's three lines, with the same floors. The masthead is a
 * separate measurement rather than an extension of the panel's: it is a
 * different block, drawn only below the breakpoint, over the same cloth
 * gradient at a different inset shadow (`inset 0 0 50px` against the panel's
 * `90px`), so the background under its lines is not the panel's background.
 */
const SIGN_IN_MASTHEAD_LINES = [
  { name: 'eyebrow (Courier 9px)', selector: '[data-sign-in-masthead-eyebrow]', minimumRatio: 4.5 },
  { name: 'title (Caveat, fitted)', selector: '[data-sign-in-masthead-title]', minimumRatio: 3 },
  { name: '"The back room" (Courier 9px)', selector: '[data-sign-in-masthead-footer]', minimumRatio: 4.5 },
] as const

test('meets AA contrast on the sign-in masthead, which axe cannot judge either', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) >= 820, 'the masthead is drawn only below SCREENS.md §3’s breakpoint')

  await page.goto('/admin/sign-in')
  await expect(page.locator('[data-sign-in-masthead]')).toBeVisible()

  const measured = await measureContrastOverGradient(page, '[data-sign-in-masthead]', SIGN_IN_MASTHEAD_LINES)

  expect(measured).toHaveLength(SIGN_IN_MASTHEAD_LINES.length)
  expect(measured.filter((line) => line.ratio < line.minimumRatio)).toEqual([])
})
