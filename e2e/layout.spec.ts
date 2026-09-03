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
 * All four cases are one root cause seen from four sides
 * (DIARY-001/002/003), and each is written from the symptom a READER meets
 * rather than from the CSS that produced it:
 *
 *   1. The book is drawn inside the area whose size decided its scale, and
 *      concentric with it. `useBookScale` measures `.bookArea` and returns a
 *      factor that fits the 1300x860 box into exactly that box; if the drawn
 *      result is not centred there, the scale is fitting one rectangle and
 *      the reader is looking at another. At 390px that difference was the
 *      whole book.
 *   2. The book is really THERE, not merely laid out somewhere. A rect can
 *      look right and still describe a box the reader cannot see, so the
 *      centre of the area is hit-tested and has to resolve to something
 *      inside the design box. `document.elementFromPoint` returning `null`
 *      at 390px is the measurement that named this defect in the first place.
 *   3. Every bookmark tab receives a click. SCREENS.md §1.7 gives the rail
 *      its own 158px column BESIDE the book, so no part of the book can lie
 *      over a tab; when the book did, nine of thirteen tabs swallowed every
 *      click in silence, with no console error and a handler that was fine.
 *   4. Both page-edge turn strips can be pressed. `e2e/flip.spec.ts` clicks
 *      them through Playwright, which scrolls an off-screen element into view
 *      first and so passed throughout; a reader cannot scroll `.stage`, which
 *      is `overflow: hidden`. Hit-testing at the strip's own centre is the
 *      question Playwright's click was answering for the wrong element.
 *
 * BELOW 860px THERE IS NO BOOK TO PLACE, AND THIS FILE DID NOT DELETE ITS
 * MOBILE CASE OVER THAT. SCREENS.md §1.10 replaces the book with a scrolling
 * column below the breakpoint (Phase 1 Task 15), so the four questions above
 * cannot be asked of a design box that is not rendered - but they are the
 * record of an S1 defect found at 390px, and standing them down at the one
 * viewport where that defect lived would leave the `mobile` project with no
 * placement test at all, which is exactly the hole this file exists to fill.
 * Every book case is therefore PAIRED with a mobile case that asks the same
 * question of the surface that IS drawn there, in the same order:
 *
 *   1. the surface fills the viewport it was given, with nothing spilling out
 *      of it and no sideways scroll - the mobile counterpart of "the book is
 *      inside the area its scale was measured from";
 *   2. the page is really THERE: `elementFromPoint` at the middle of the
 *      scrolling column resolves to something inside the page;
 *   3. every bookmark in the drawer receives a tap, and one of them is tapped
 *      to prove it;
 *   4. both 52px bottom-bar arrows can be pressed, hit-tested at their own
 *      centres rather than through a Playwright click, which would scroll
 *      them into view first and answer a question nobody asked.
 *
 * Depends on: @playwright/test, `waitForLiveBook` (./support/liveBook),
 * `drawsMobileReadingMode` (./support/surface), the running app from
 * playwright.config.ts's `webServer`, and the seeded diary (`npm run db:seed`)
 * whose thirteen bookmarks include Marrakech at index 11.
 */
import { expect, test } from '@playwright/test'
import { waitForLiveBook } from './support/liveBook'
import { drawsMobileReadingMode } from './support/surface'

/**
 * Reports a measured offset in whole pixels, treating anything under one
 * pixel as zero. A fractional scale (0.647692 at the `mid` project) leaves
 * sub-pixel remainders in every rect it produces; rounding them away is what
 * keeps this suite reporting real mis-centring rather than the last bit of a
 * float.
 */
const wholePixels = (value: number): number => (Math.abs(value) < 1 ? 0 : Math.round(value))

test('draws the book inside the area its scale was measured from, and concentric with it', async ({
  page,
  viewport,
}) => {
  test.skip(drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

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

test('puts the book itself under a pointer aimed at the centre of its area', async ({ page, viewport }) => {
  test.skip(drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

  await page.goto('/p/1')
  await waitForLiveBook(page)

  const atCentre = await page.evaluate(() => {
    const box = document.querySelector('[data-design-box]')
    const area = box?.parentElement
    if (box === null || area === null || area === undefined) throw new Error('no design box rendered')

    const measured = area.getBoundingClientRect()
    const hit = document.elementFromPoint(measured.x + measured.width / 2, measured.y + measured.height / 2)
    if (hit === null) return 'nothing - the point is outside the viewport'
    return box.contains(hit) ? 'the book' : `${hit.tagName}, outside the book`
  })

  // `elementFromPoint` returning `null` here is what a reader at 390px met:
  // a blank page carrying only the rail, the counter and the two arrows,
  // because the whole book had been clipped away by `.stage`'s `overflow:
  // hidden`. Hit-testing is the only assertion that can tell "drawn" from
  // "laid out somewhere off the screen".
  expect(atCentre).toBe('the book')
})

test('lets a reader click every bookmark tab rather than the book covering them', async ({ page, viewport }) => {
  test.skip(drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

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

test('keeps both page-edge turn strips reachable by pointer', async ({ page, viewport }) => {
  test.skip(drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

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

test('draws the mobile reading mode inside the viewport it was given, with nothing spilling out', async ({
  page,
  viewport,
}) => {
  test.skip(!drawsMobileReadingMode(viewport), 'the mobile reading mode is not drawn at or above 860px')

  await page.goto('/p/1')
  await expect(page.locator('[data-reading-surface="mobile"]')).toBeVisible()

  const placement = await page.evaluate(() => {
    const surface = document.querySelector('[data-reading-surface="mobile"]')
    if (surface === null) throw new Error('no mobile reading mode rendered')

    const drawn = surface.getBoundingClientRect()
    return {
      spillLeft: -drawn.x,
      spillRight: drawn.right - window.innerWidth,
      spillTop: -drawn.y,
      spillBottom: drawn.bottom - window.innerHeight,
      // The document itself must not scroll sideways: the content column
      // scrolls, and it scrolls DOWN. A horizontal overflow here means a
      // header or a bar wider than the phone, which is exactly how the
      // gallery's own mobile defect looked
      // (docs/qa/2026-09-03-gallery-sweep.md, GAL-004).
      sidewaysScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })

  expect({
    spillLeft: Math.max(0, wholePixels(placement.spillLeft)),
    spillRight: Math.max(0, wholePixels(placement.spillRight)),
    spillTop: Math.max(0, wholePixels(placement.spillTop)),
    spillBottom: Math.max(0, wholePixels(placement.spillBottom)),
    sidewaysScroll: placement.sidewaysScroll,
  }).toEqual({ spillLeft: 0, spillRight: 0, spillTop: 0, spillBottom: 0, sidewaysScroll: 0 })
})

test('puts the page itself under a pointer aimed at the middle of the scrolling column', async ({ page, viewport }) => {
  test.skip(!drawsMobileReadingMode(viewport), 'the mobile reading mode is not drawn at or above 860px')

  await page.goto('/p/3')
  await expect(page.locator('[data-mobile-page="notes"]')).toBeVisible()

  const atCentre = await page.evaluate(() => {
    const content = document.querySelector('[data-mobile-content]')
    const printed = document.querySelector('[data-mobile-page]')
    if (content === null || printed === null) throw new Error('no mobile page rendered')

    const box = content.getBoundingClientRect()
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    if (hit === null) return 'nothing - the point is outside the viewport'
    return printed.contains(hit) ? 'the page' : hit.tagName + ', outside the page'
  })

  // The book's own version of this assertion is what named DIARY-001: a rect
  // can look right and still describe a box the reader cannot see.
  expect(atCentre).toBe('the page')
})

test('lets a reader tap every bookmark in the drawer rather than something covering them', async ({
  page,
  viewport,
}) => {
  test.skip(!drawsMobileReadingMode(viewport), 'the mobile reading mode is not drawn at or above 860px')

  await page.goto('/p/1')
  await page.locator('[data-burger]').click()
  await expect(page.locator('[data-drawer]')).toBeVisible()

  const blocked = await page.evaluate(() =>
    [...document.querySelectorAll('[data-bookmark]')].flatMap((tab) => {
      const rect = tab.getBoundingClientRect()
      const centreY = rect.y + rect.height / 2
      // Only a tab whose CENTRE is on the screen can be hit-tested at all. The
      // drawer's list scrolls (thirteen tabs do not fit an 844px phone), and a
      // tab below the fold is not covered - it is somewhere the reader has to
      // scroll to, which is what `overflow-y: auto` is for.
      if (centreY < 0 || centreY > window.innerHeight) return []
      const hit = document.elementFromPoint(rect.x + rect.width / 2, centreY)
      if (hit === tab) return []
      return [{ tab: tab.getAttribute('data-bookmark'), covering: hit === null ? 'off-viewport' : hit.tagName }]
    }),
  )

  expect(blocked).toEqual([])

  // The census above is what fails when a tab is covered; this tap is what
  // makes the case a reader's. Marrakech is the same bookmark the book's own
  // case clicks, so both surfaces are proven against the same tab.
  await page.locator('[data-bookmark="11"]').click()
  await expect(page).toHaveURL(/\/p\/12/)
})

test('keeps both bottom-bar arrows reachable by pointer', async ({ page, viewport }) => {
  test.skip(!drawsMobileReadingMode(viewport), 'the mobile reading mode is not drawn at or above 860px')

  // Page 3, not page 1: at the ends of the book an arrow is disabled, and a
  // disabled control is meant to refuse a press.
  await page.goto('/p/3')
  await expect(page.locator('[data-reading-surface="mobile"]')).toBeVisible()

  const unreachable = await page.evaluate(() =>
    ['prev', 'next'].flatMap((direction) => {
      const arrow = document.querySelector('[data-nav="' + direction + '"]')
      if (arrow === null) return [{ direction, reason: 'not rendered' }]
      const rect = arrow.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      if (hit === arrow) return []
      return [{ direction, reason: hit === null ? 'off-viewport' : 'covered by ' + hit.tagName }]
    }),
  )

  expect(unreachable).toEqual([])
})
