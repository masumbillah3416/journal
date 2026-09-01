/**
 * a11y.spec.ts — zero-axe-violations gate for every route this app serves.
 *
 * CLAUDE.md §2 requires axe-core in Playwright against every route, asserting
 * zero violations rather than "no critical violations" — the non-negotiables
 * draw no line between severities. Two routes exist today, `/cms` and the
 * diary's `/p/<n>`; the diary route is checked once per designed PAGE rather
 * than once per route, because each page kind renders different markup on the
 * same URL shape (Phase 1 Task 9 added the Cover and Contents cases; Notes,
 * Frames I/II and About join as Tasks 10 and 11 build them). Add one `test()`
 * per route or page as the rest of the public diary and the bespoke admin
 * land.
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
 * Revisit when the bespoke admin at `/admin` replaces `/cms` as the route
 * under test (Phase 1+) — Payload's stock scaffolding will no longer be in
 * scope at all.
 * Depends on: @playwright/test, e2e/support/axe.ts, the running app from
 * playwright.config.ts's `webServer`.
 */
import { expect, test } from '@playwright/test'
import { expectNoAxeViolations } from './support/axe'

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
