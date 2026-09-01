/**
 * layout.spec.ts — where the scaled book actually lands on the screen.
 *
 * The visual-regression suite was supposed to own this and demonstrably did
 * not: `e2e/visual.spec.ts`'s `mid` and `mobile` baselines were regenerated
 * over a book that had been pushed off the screen entirely, and stayed green
 * on a blank page for two commits (docs/qa/2026-09-01-diary-sweep.md,
 * DIARY-004). A baseline can only say "this looks like it did last time"; it
 * cannot say "the book is on the screen", because a picture of no book is a
 * picture. These cases say it in numbers instead, and they run at all three
 * viewport projects, which is where the defect lived — `desktop` was fine
 * throughout.
 *
 * All three cases are one root cause seen from three sides
 * (DIARY-001/002/003), and each is written from the symptom a READER meets
 * rather than from the CSS that produced it:
 *
 *   1. The book is drawn inside the area whose size decided its scale, and
 *      concentric with it. `useBookScale` measures `.bookArea` and returns a
 *      factor that fits the 1300x860 box into exactly that box; if the drawn
 *      result is not centred there, the scale is fitting one rectangle and
 *      the reader is looking at another. At 390px that difference was the
 *      whole book.
 *   2. Every bookmark tab receives a click. SCREENS.md §1.7 gives the rail
 *      its own 158px column BESIDE the book, so no part of the book can lie
 *      over a tab; when the book did, nine of thirteen tabs swallowed every
 *      click in silence, with no console error and a handler that was fine.
 *   3. Both page-edge turn strips can be pressed. `e2e/flip.spec.ts` clicks
 *      them through Playwright, which scrolls an off-screen element into view
 *      first and so passed throughout; a reader cannot scroll `.stage`, which
 *      is `overflow: hidden`. Hit-testing at the strip's own centre is the
 *      question Playwright's click was answering for the wrong element.
 *
 * Depends on: @playwright/test, `waitForLiveBook` (./support/liveBook), the
 * running app from playwright.config.ts's `webServer`, and the seeded diary
 * (`npm run db:seed`) whose thirteen bookmarks include Marrakech at index 11.
 */
import { expect, test } from '@playwright/test'
import { waitForLiveBook } from './support/liveBook'

/**
 * Reports a measured offset in whole pixels, treating anything under one
 * pixel as zero. A fractional scale (0.647692 at the `mid` project) leaves
 * sub-pixel remainders in every rect it produces; rounding them away is what
 * keeps this suite reporting real mis-centring rather than the last bit of a
 * float.
 */
const wholePixels = (value: number): number => (Math.abs(value) < 1 ? 0 : Math.round(value))

test('draws the book inside the area its scale was measured from, and concentric with it', async ({ page }) => {
  await page.goto('/p/1')
  await waitForLiveBook(page)

  const placement = await page.evaluate(() => {
    const box = document.querySelector('[data-design-box]')
    const area = box?.parentElement
    if (box === null || area === null || area === undefined) throw new Error('no design box rendered')

    const drawn = box.getBoundingClientRect()
    const measured = area.getBoundingClientRect()
    return {
      offCentreX: measured.x + measured.width / 2 - (drawn.x + drawn.width / 2),
      offCentreY: measured.y + measured.height / 2 - (drawn.y + drawn.height / 2),
      spillLeft: measured.x - drawn.x,
      spillRight: drawn.right - measured.right,
      spillTop: measured.y - drawn.y,
      spillBottom: drawn.bottom - measured.bottom,
    }
  })

  expect({
    offCentreX: wholePixels(placement.offCentreX),
    offCentreY: wholePixels(placement.offCentreY),
    spillLeft: Math.max(0, wholePixels(placement.spillLeft)),
    spillRight: Math.max(0, wholePixels(placement.spillRight)),
    spillTop: Math.max(0, wholePixels(placement.spillTop)),
    spillBottom: Math.max(0, wholePixels(placement.spillBottom)),
  }).toEqual({ offCentreX: 0, offCentreY: 0, spillLeft: 0, spillRight: 0, spillTop: 0, spillBottom: 0 })
})

test('lets a reader click every bookmark tab rather than the book covering them', async ({ page }) => {
  await page.goto('/p/1')
  await waitForLiveBook(page)

  const blocked = await page.evaluate(() =>
    [...document.querySelectorAll('[data-bookmark]')].flatMap((tab) => {
      const rect = tab.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      if (hit === tab) return []
      return [{ tab: tab.getAttribute('data-bookmark'), covering: hit === null ? 'off-viewport' : hit.tagName }]
    }),
  )

  expect(blocked).toEqual([])

  // The census above is what fails when a tab is covered; this click is what
  // makes the case a reader's, not a probe's. Marrakech is one of the nine
  // tabs the sweep found dead at 1000x800.
  await page.locator('[data-bookmark="11"]').click()
  await expect(page).toHaveURL(/\/p\/12/)
})

test('keeps both page-edge turn strips reachable by pointer', async ({ page }) => {
  // Page 3, not page 1: at the ends of the book a strip is disabled, and a
  // disabled strip is meant to refuse a click.
  await page.goto('/p/3')
  await waitForLiveBook(page)

  const unreachable = await page.evaluate(() =>
    ['left', 'right'].flatMap((edge) => {
      const strip = document.querySelector(`[data-edge="${edge}"]`)
      if (strip === null) return [{ edge, reason: 'not rendered' }]
      const rect = strip.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      if (hit === strip) return []
      return [{ edge, reason: hit === null ? 'off-viewport' : `covered by ${hit.tagName}` }]
    }),
  )

  expect(unreachable).toEqual([])
})
