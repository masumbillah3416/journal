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

test('has no axe violations on /p/1, the Cover page', async ({ page }) => {
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

test('has no axe violations on /p/2, the Contents page', async ({ page }) => {
  await page.goto('/p/2')
  await expect(page.locator('[data-page="contents"]')).toBeVisible()

  // Also no exclusions - see the case above. The Contents index is ten real
  // anchors, each carrying its journey's name, place, dates and page number,
  // so `link-name` and `color-contrast` both have something real to check.
  await expectNoAxeViolations(page)
})

test('has no axe violations on /p/3, a journey’s Notes page', async ({ page }) => {
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

test('has no axe violations on /p/4, a journey’s Frames I page', async ({ page }) => {
  await page.goto('/p/4')
  await expect(page.locator('[data-leaf="3"] [data-page="frames-i"]')).toBeVisible()

  // Also no exclusions - see the cases above. This page carries three
  // `<figure>`/`<figcaption>` pairs and no other content but its header, so
  // `image-alt` has more to judge here than anywhere in the book: a slot
  // whose alt text went missing would be three quarters of the page.
  await expectNoAxeViolations(page)
})

test('has no axe violations on /p/5, a journey’s Frames II page', async ({ page }) => {
  await page.goto('/p/5')
  await expect(page.locator('[data-leaf="4"] [data-page="frames-ii"]')).toBeVisible()

  // Also no exclusions. Four photographs and a footer whose gallery control
  // is a link styled as a button, so `image-alt`, `link-name` and
  // `color-contrast` all have something real to check.
  await expectNoAxeViolations(page)
})

test('has no axe violations on /p/33, the About page', async ({ page }) => {
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

test('meets AA contrast on every line of the cover, which axe cannot judge', async ({ page }) => {
  // The case above cannot cover this. axe reports `color-contrast` as
  // INCOMPLETE on this route rather than as a pass — it reads a computed
  // `background-color`, and the cloth is a gradient — so `expectNoAxeViolations`
  // is green here because axe declined to judge, not because the ratios are
  // sound. They are measured from the rendered pixels instead; see
  // `e2e/support/coverContrast.ts` for the method, and docs/deviations.md §12
  // for the two cover values that were changed to clear these floors.
  await page.goto('/p/1')
  await expect(page.locator('[data-page="cover"]')).toBeVisible()

  const measured = await measureContrastOverGradient(page, '[data-page="cover"]', COVER_LINES)

  // Asserting the shortfalls rather than each ratio in turn: a failure then
  // names every line that is below its floor, with the number it reached, in
  // one run — and pinning exact ratios would make this a change-detector for
  // anti-aliasing rather than a floor.
  expect(measured.filter((line) => line.ratio < line.minimumRatio)).toEqual([])
})
