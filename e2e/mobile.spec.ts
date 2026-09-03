/**
 * mobile.spec.ts — SCREENS.md §1.10's mobile reading mode, in a real browser.
 *
 * The surface a reader below 860px actually gets. Every case here runs only at
 * the `mobile` project, whose viewport is 390x844 AND whose user agent is a
 * phone's — the second half matters, because which surface a request is served
 * is decided on the server from that user agent before any viewport can be
 * measured (`@travel-diary/domain/readingSurface`, and
 * `docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md`).
 *
 * THE SWIPES ARE REAL TOUCHES, NOT SYNTHETIC EVENTS. `shouldTurnPage`'s
 * arithmetic is unit-tested to 100% and `useSwipe.test.tsx` drives it with
 * dispatched React events; neither of those can tell you whether a finger
 * dragged down the page ALSO turns it, because neither of them scrolls
 * anything. These cases dispatch through the Chrome DevTools Protocol's
 * `Input.dispatchTouchEvent`, which is the same input path a finger takes:
 * the browser scrolls the column itself, momentum and all, and the page turn
 * either happens or does not. The vertical-scroll case is the one this whole
 * rule exists for, and it asserts BOTH halves — that the column actually
 * moved, and that the address did not.
 *
 * IT ALSO ASSERTS WHAT THE SURFACE COSTS AND WHAT IT KEEPS: that a phone's
 * document carries the mobile mode and no book at all (the weight this split
 * exists to avoid), that each `/p/<n>` still serves its own page's words in
 * raw HTML with no script run (design spec §8's indexability, the same promise
 * `e2e/serverWindow.spec.ts` makes for the book), and that a reader whose
 * user agent and viewport disagree — a desktop browser at a narrowed window —
 * is corrected onto the right surface rather than left on the wrong one.
 * Depends on: @playwright/test, `drawsMobileReadingMode` (./support/surface),
 * the running app from playwright.config.ts's `webServer`, and the seeded
 * diary (`npm run db:seed`) whose thirteen bookmarks include Marrakech at
 * index 11.
 */
import { expect, test, type Page } from '@playwright/test'
import { drawsMobileReadingMode } from './support/surface'

test.skip(({ viewport }) => !drawsMobileReadingMode(viewport), 'the mobile reading mode is not drawn at or above 860px')

/** A point on the screen, in CSS pixels. */
interface Point {
  readonly x: number
  readonly y: number
}

/**
 * Drags a finger across the page through the browser's own input pipeline.
 *
 * `Input.dispatchTouchEvent` is what a real touch produces: the compositor
 * sees it, so a vertical drag scrolls the column exactly as a reader's would,
 * and the page's own `touchstart`/`touchend` handlers see the same
 * coordinates. A `page.dispatchEvent` would only synthesise the two handlers
 * and never scroll anything, which would make the scroll case vacuous.
 *
 * @param page - The page to drag on.
 * @param from - Where the finger goes down.
 * @param to - Where it lifts.
 * @param steps - How many move events the drag is broken into. More than one,
 *   always: a single jump from `from` to `to` is not a gesture a browser
 *   scrolls on.
 */
const dragFinger = async (page: Page, from: Point, to: Point, steps = 10): Promise<void> => {
  const session = await page.context().newCDPSession(page)
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y }],
  })

  for (let step = 1; step <= steps; step += 1) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * step) / steps,
          y: from.y + ((to.y - from.y) * step) / steps,
        },
      ],
    })
  }

  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await session.detach()
}

/** How far the scrolling content column has been scrolled, in pixels. */
const scrollOffset = (page: Page): Promise<number> =>
  page.evaluate(() => document.querySelector('[data-mobile-content]')?.scrollTop ?? -1)

test('serves a phone the mobile reading mode, and no book at all', async ({ page }) => {
  await page.goto('/p/1')

  await expect(page.locator('[data-reading-surface="mobile"]')).toBeVisible()
  // The whole point of the split: a phone's document carries no design box,
  // no leaves and no page stack.
  await expect(page.locator('[data-design-box]')).toHaveCount(0)
  await expect(page.locator('[data-leaf]')).toHaveCount(0)
})

test('carries one page rather than a window of seven, which is the smallest document the diary serves', async ({
  page,
}) => {
  await page.goto('/p/3')

  await expect(page.locator('[data-mobile-page]')).toHaveCount(1)
  await expect(page.locator('[data-mobile-page="notes"] h1')).toHaveText('Tokyo')
})

test('starts reading from the cover, which is the only way forward it offers a thumb', async ({ page }) => {
  await page.goto('/p/1')
  await expect(page.locator('[data-mobile-page="cover"]')).toBeVisible()

  await page.locator('[data-start-reading]').click()

  await expect(page).toHaveURL(/\/p\/2$/)
  await expect(page.locator('[data-mobile-page="contents"]')).toBeVisible()
})

test('turns the page forward when the reader swipes left', async ({ page }) => {
  await page.goto('/p/3')
  await expect(page.locator('[data-mobile-page="notes"]')).toBeVisible()

  await dragFinger(page, { x: 320, y: 420 }, { x: 60, y: 430 })

  await expect(page).toHaveURL(/\/p\/4$/)
})

test('turns the page back when the reader swipes right', async ({ page }) => {
  await page.goto('/p/3')
  await expect(page.locator('[data-mobile-page="notes"]')).toBeVisible()

  await dragFinger(page, { x: 60, y: 420 }, { x: 320, y: 430 })

  await expect(page).toHaveURL(/\/p\/2$/)
})

test('scrolls the page without turning it when the reader drags upward', async ({ page }) => {
  // THE CASE THE 1.4 RATIO EXISTS FOR, driven by a real finger rather than a
  // dispatched event. Both halves are asserted: a run where nothing scrolled
  // would pass the URL check while proving nothing at all.
  await page.goto('/p/3')
  await expect(page.locator('[data-mobile-page="notes"]')).toBeVisible()
  expect(await scrollOffset(page)).toBe(0)

  // A thumb's scroll is never perfectly vertical: 70px of sideways drift is
  // over the 60px distance threshold, so only the ratio clause can refuse it.
  await dragFinger(page, { x: 200, y: 700 }, { x: 270, y: 260 })

  expect(await scrollOffset(page)).toBeGreaterThan(0)
  await expect(page).toHaveURL(/\/p\/3$/)
  await expect(page.locator('[data-mobile-page="notes"]')).toBeVisible()
})

test('scrolls the page without turning it when the reader drags downward again', async ({ page }) => {
  await page.goto('/p/3')
  await expect(page.locator('[data-mobile-page="notes"]')).toBeVisible()
  await dragFinger(page, { x: 200, y: 700 }, { x: 200, y: 200 })
  const scrolled = await scrollOffset(page)
  expect(scrolled).toBeGreaterThan(0)

  // Back up the page, drifting the other way, which is the gesture that would
  // turn a leaf BACKWARD if the ratio clause were dropped.
  await dragFinger(page, { x: 200, y: 260 }, { x: 130, y: 700 })

  expect(await scrollOffset(page)).toBeLessThan(scrolled)
  await expect(page).toHaveURL(/\/p\/3$/)
})

test('turns no page when a swipe is shorter than the threshold', async ({ page }) => {
  await page.goto('/p/3')
  await expect(page.locator('[data-mobile-page="notes"]')).toBeVisible()

  await dragFinger(page, { x: 240, y: 420 }, { x: 190, y: 420 })

  await expect(page).toHaveURL(/\/p\/3$/)
})

test('turns the page on the bottom bar’s arrows', async ({ page }) => {
  await page.goto('/p/3')

  await page.locator('[data-nav="next"]').click()
  await expect(page).toHaveURL(/\/p\/4$/)

  await page.locator('[data-nav="prev"]').click()
  await expect(page).toHaveURL(/\/p\/3$/)
})

test('spends both arrows at the ends of the book rather than removing them', async ({ page }) => {
  await page.goto('/p/1')
  await expect(page.locator('[data-nav="prev"]')).toBeDisabled()

  await page.goto('/p/33')
  await expect(page.locator('[data-nav="next"]')).toBeDisabled()
})

test('opens the bookmark drawer, jumps with it, and closes it behind the reader', async ({ page }) => {
  await page.goto('/p/1')
  await expect(page.locator('[data-drawer]')).toHaveCount(0)

  await page.locator('[data-burger]').click()
  await expect(page.locator('[data-drawer]')).toBeVisible()

  await page.locator('[data-bookmark="11"]').click()

  await expect(page).toHaveURL(/\/p\/12$/)
  await expect(page.locator('[data-drawer]')).toHaveCount(0)
})

test('closes the drawer on the scrim, on the close button and on Escape', async ({ page }) => {
  await page.goto('/p/3')

  await page.locator('[data-burger]').click()
  // Clicked to the RIGHT of the panel, not at the scrim's own centre: the
  // panel is 82% of a 390px screen, so the scrim's midpoint is underneath it
  // and Playwright would (correctly) report the panel intercepting.
  await page.locator('[data-drawer-scrim]').click({ position: { x: 370, y: 500 } })
  await expect(page.locator('[data-drawer]')).toHaveCount(0)

  await page.locator('[data-burger]').click()
  await page.locator('[data-drawer-close]').click()
  await expect(page.locator('[data-drawer]')).toHaveCount(0)

  await page.locator('[data-burger]').click()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-drawer]')).toHaveCount(0)
})

test('traps focus inside the open drawer and gives it back to the burger on close', async ({ page }) => {
  await page.goto('/p/3')
  await page.locator('[data-burger]').click()
  await expect(page.locator('[data-drawer]')).toBeVisible()

  // Focus lands on the way out, and Tab walks the tabs without ever leaving
  // the panel - which is what `aria-modal` promises a screen-reader user.
  await expect(page.locator('[data-drawer-close]')).toBeFocused()
  for (let press = 0; press < 20; press += 1) await page.keyboard.press('Tab')
  const stillInside = await page.evaluate(
    () => document.querySelector('[data-drawer]')?.contains(document.activeElement) ?? false,
  )
  expect(stillInside).toBe(true)

  await page.keyboard.press('Escape')

  await expect(page.locator('[data-burger]')).toBeFocused()
})

test('serves every deep link its own page’s words in raw HTML, for a crawler that runs no script', async ({ page }) => {
  // The mobile counterpart of `e2e/serverWindow.spec.ts`'s thirty-three-route
  // case. The surface renders one page per document, so indexability per ROUTE
  // is not merely preserved here - it is the only thing the document contains.
  const wanted = [
    { path: '/p/1', text: 'Wanderings' },
    { path: '/p/2', text: 'Contents' },
    { path: '/p/3', text: 'Tokyo' },
    { path: '/p/33', text: 'About' },
  ] as const

  const served = await Promise.all(
    wanted.map(async ({ path, text }) => {
      const html = await (await page.request.get(path)).text()
      return { path, carriesItsOwnPage: html.includes(text), carriesTheBook: html.includes('data-design-box') }
    }),
  )

  expect(served).toEqual(wanted.map(({ path }) => ({ path, carriesItsOwnPage: true, carriesTheBook: false })))
})

test('corrects a desktop browser at a narrowed window onto the mobile reading mode', async ({ browser }) => {
  // The one reader the server's user-agent hint gets wrong, and the reason
  // `SurfaceCorrection` exists. Its own context, so the user agent is a
  // desktop's while the viewport is under the breakpoint - the combination no
  // project emulates.
  const context = await browser.newContext({
    viewport: { width: 700, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()

  const served = await (await page.request.get('/p/3')).text()
  await page.goto('/p/3')

  // Served the book from the hint, and corrected to the mobile mode once the
  // browser had measured its own window.
  expect(served).toContain('data-reading-surface="book"')
  await expect(page.locator('[data-reading-surface="mobile"]')).toBeVisible()

  // And it stays corrected across a navigation, because the correction is
  // remembered in a cookie rather than in the address.
  await page.locator('[data-nav="next"]').click()
  await expect(page).toHaveURL(/\/p\/4$/)
  await expect(page.locator('[data-reading-surface="mobile"]')).toBeVisible()

  await context.close()
})

test('returns the reader to the page they left the book from', async ({ page }) => {
  // The mobile half of `e2e/gallery.spec.ts`'s two return cases. On this
  // surface the address is correct by construction - a page change IS a
  // navigation - so both the gallery's own control and the browser's Back
  // button land back on the page the reader left.
  await page.goto('/p/3')
  await expect(page.locator('[data-mobile-page="notes"]')).toBeVisible()

  await page.locator('[data-gallery-link]').click()
  await expect(page).toHaveURL(/\/gallery\/tokyo\?from=3$/)

  await page.getByRole('link', { name: /Back to the diary/ }).click()
  await expect(page).toHaveURL(/\/p\/3$/)
  await expect(page.locator('[data-mobile-page="notes"]')).toBeVisible()
})
