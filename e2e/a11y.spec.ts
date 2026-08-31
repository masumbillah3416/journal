/**
 * a11y.spec.ts — zero-axe-violations gate for every route this app serves.
 *
 * CLAUDE.md §2 requires axe-core in Playwright against every route, asserting
 * zero violations rather than "no critical violations" — the non-negotiables
 * draw no line between severities. Only `/cms` exists today (see
 * smoke.spec.ts's header for why); add one `test()` per route as the public
 * diary and the bespoke admin land in later phases.
 *
 * `/cms` is Payload's own stock admin UI, not this project's code — per
 * `apps/web/payload.config.ts`'s own header, it is "development scaffolding
 * ... not the product" and is disabled outright in production. Running axe
 * against it today surfaces two real, pre-existing findings that belong to
 * Payload's generated markup, not to anything authored here:
 * `landmark-one-main` ("Document should have one main landmark") and
 * `page-has-heading-one` ("Page should contain a level-one heading"), both
 * `impact: moderate`, both scoped to the `<html>` element itself. They are
 * disabled by id, narrowly, rather than by loosening the assertion below —
 * any *other* violation, on this route or any future one, still fails the
 * suite. See docs/testing.md's Accessibility section for the same note.
 * Revisit when the bespoke admin at `/admin` replaces `/cms` as the route
 * under test (Phase 1+) — Payload's stock scaffolding will no longer be in
 * scope at all.
 * Depends on: @playwright/test, @axe-core/playwright, the running app from
 * playwright.config.ts's `webServer`.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('has no axe violations on /cms', async ({ page }) => {
  await page.goto('/cms')

  const results = await new AxeBuilder({ page })
    .disableRules(['landmark-one-main', 'page-has-heading-one'])
    .analyze()

  expect(results.violations).toEqual([])
})
