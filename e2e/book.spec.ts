/**
 * book.spec.ts — the browser-only guarantees of the book's DOM binding.
 *
 * Everything here needs a real layout engine, which is why it is a Playwright
 * spec and not a jsdom component test: jsdom performs no layout, so it cannot
 * tell us that a back face swallows a click, that the design box actually
 * rescales, or that nothing but `transform` and `opacity` is animated. The
 * flip state machine itself (`packages/domain/src/flip.ts`) and the per-leaf
 * geometry (`pageStack.ts`) are already unit-tested to 100%; this file covers
 * only the binding those two feed — the part that has no other test.
 *
 * The first case is the one that matters most. The handoff records the exact
 * defect it guards (README "Pointer-events warning"): when the back face was
 * not `pointer-events: none` it silently swallowed every click on page
 * content, and Contents links and gallery buttons appeared completely dead
 * while their handlers were fine. It cost a debugging session to find. The
 * assertion is deliberately end-to-end — a real click on a real Contents
 * link — because that is the only shape of test the defect could not slip
 * past.
 * Depends on: @playwright/test, the running app from playwright.config.ts's
 * `webServer`, and the seeded diary (`npm run db:seed`) whose first journey is
 * Tokyo on page 3.
 */
import { expect, test } from '@playwright/test'

test('a click on page content is not swallowed by a back face', async ({ page }) => {
  await page.goto('/p/2')
  const link = page.getByRole('link', { name: /Tokyo/ })

  await link.click()

  await expect(page).toHaveURL(/\/p\/3/)
})

test('never lets a back face receive pointer events', async ({ page }) => {
  await page.goto('/p/1')

  const faces = await page.evaluate(() => {
    const backs = [...document.querySelectorAll('[data-face="back"]')]
    return {
      total: backs.length,
      clickable: backs.filter((face) => getComputedStyle(face).pointerEvents !== 'none').length,
    }
  })

  // Asserting the count as well as the offenders: "none are clickable" is
  // vacuously true of a book that rendered no back faces at all.
  expect(faces).toEqual({ total: 33, clickable: 0 })
})

test('holds 60fps by animating only transform and opacity', async ({ page }) => {
  await page.goto('/p/1')

  const animated = await page.evaluate(() => {
    const leaf = document.querySelector('[data-leaf]')
    if (leaf === null) return []
    return getComputedStyle(leaf)
      .transitionProperty.split(',')
      .map((property) => property.trim())
  })

  expect(animated).toEqual(['transform'])
})

test('animates no layout property anywhere inside the book', async ({ page }) => {
  await page.goto('/p/1')

  const offenders = await page.evaluate(() => {
    const box = document.querySelector('[data-design-box]')
    if (box === null) return ['no design box rendered']

    return [...box.querySelectorAll('*')].flatMap((element) => {
      const declared = getComputedStyle(element).transitionProperty
      // `all` at the browser's own 0s default is "no transition declared",
      // not a layout property being animated - every element in the tree
      // reports it, so counting it would make this assertion meaningless.
      if (declared === 'all') return []
      return declared
        .split(',')
        .map((property) => property.trim())
        .filter((property) => property !== 'transform' && property !== 'opacity' && property !== 'none')
        .map((property) => `${element.tagName}[${element.getAttribute('data-face') ?? ''}] animates ${property}`)
    })
  })

  expect(offenders).toEqual([])
})

test('scales the fixed 1300x860 design box rather than reflowing it', async ({ page }) => {
  await page.goto('/p/1')
  const box = page.locator('[data-design-box]')

  const size = await box.evaluate((element) => ({
    width: element.style.width,
    height: element.style.height,
    transform: getComputedStyle(element).transform,
  }))

  expect(size.width).toBe('')
  expect(size.height).toBe('')
  await expect(box).toHaveCSS('width', '1300px')
  await expect(box).toHaveCSS('height', '860px')
  expect(size.transform).toMatch(/^matrix\(/)
})

test('the book rescales when the viewport changes', async ({ page }) => {
  await page.goto('/p/1')
  const box = page.locator('[data-design-box]')
  const before = await box.evaluate((element) => getComputedStyle(element).transform)

  await page.setViewportSize({ width: 900, height: 700 })

  // The scale is measured inside a requestAnimationFrame (CLAUDE.md §6 - no
  // synchronous layout read in a resize handler), so the new transform lands
  // a frame after the viewport changes; polling is the honest wait for it.
  await expect.poll(async () => box.evaluate((element) => getComputedStyle(element).transform)).not.toBe(before)
})

test('renders exactly one visible leaf at rest', async ({ page }) => {
  await page.goto('/p/2')

  const visible = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-leaf]')].filter((leaf) => getComputedStyle(leaf).visibility === 'visible')
        .length,
  )

  expect(visible).toBe(1)
})
