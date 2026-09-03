/**
 * axe.ts — shared accessibility assertion for Playwright specs.
 *
 * CLAUDE.md §2 requires axe-core against every route, asserting zero
 * violations rather than "no critical violations." `expectNoAxeViolations`
 * is the one place that assertion is made, so every spec holds every route
 * to the same bar by construction.
 *
 * Defaults to the FULL ruleset, no exclusions. `e2e/a11y.spec.ts`'s `/cms`
 * case disables `landmark-one-main` and `page-has-heading-one` for Payload's
 * own generated admin markup — that exclusion is local to Payload's
 * scaffolding and must never leak into a diary route by inheritance. Routing
 * every caller through this helper's `allow` option, rather than each spec
 * building its own `AxeBuilder`, makes any such exclusion visible at the
 * call site instead of buried in a shared default.
 * Depends on: @axe-core/playwright, @playwright/test.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/**
 * Asserts a page has zero axe violations.
 *
 * @param page - The Playwright page to analyse.
 * @param options.allow - Rule ids to disable, checked against the FULL
 *   ruleset otherwise. Each id passed here requires a comment at the call
 *   site justifying it with evidence (a named, understood, vendor-owned
 *   finding) — never to silence an inconvenient result.
 * @throws if `results.violations` is non-empty — the assertion failure lists
 *   every violation axe found.
 */
export const expectNoAxeViolations = async (
  page: Page,
  options: { allow?: readonly string[] } = {},
): Promise<void> => {
  const builder = new AxeBuilder({ page })
  const scoped = options.allow ? builder.disableRules([...options.allow]) : builder
  const results = await scoped.analyze()

  expect(results.violations).toEqual([])
}
