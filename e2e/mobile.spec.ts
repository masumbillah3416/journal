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
 * exists to avoid), that ALL THIRTY-THREE `/p/<n>` routes serve their own page
 * in raw HTML with no script run, and that a reader whose user agent and
 * viewport disagree — a desktop browser at a narrowed window — is corrected
 * onto the right surface rather than left on the wrong one.
 *
 * THE THIRTY-THREE-ROUTE CASE IS NOT OPTIONAL COVERAGE, IT IS THE ONE THAT
 * MATTERS MOST. Design spec §8 requires the deep links to be indexable, and
 * `e2e/serverWindow.spec.ts` proves that per route for the book — but it skips
 * below 860px, because there is no book there. Googlebot Smartphone is served
 * THIS surface, so until the Phase 1 final review the surface most likely to be
 * indexed was the only one with no such guarantee. That case now stands here,
 * held against the book fetched in the same run rather than against a
 * transcription; see its own comment for what the two surfaces can and cannot
 * be compared on.
 * Depends on: @playwright/test, `drawsMobileReadingMode` (./support/surface),
 * `wholeBookPath` (./support/liveBook), the running app from
 * playwright.config.ts's `webServer`, and the seeded diary
 * (`npm run db:seed`): 10 journeys, 33 pages, thirteen bookmarks including
 * Marrakech at index 11.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { wholeBookPath } from './support/liveBook'
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

/**
 * The class-name prefix Turbopack gives every rule and every class-map entry
 * of one surface's stylesheet. It appears in that surface's CSS chunk AND in
 * the client chunk that imports it, so one marker settles both halves.
 */
const MOBILE_STYLESHEET_MARKER = 'mobile-module__'

/** The same, for the book's own stylesheet - see {@link MOBILE_STYLESHEET_MARKER}. */
const BOOK_STYLESHEET_MARKER = 'book-module__'

/** A phone's user agent, which is served the mobile reading surface's route entry. */
const PHONE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

/** A desktop browser's user agent, which names no device kind and so is served the book. */
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/** Every script and stylesheet `/p/1`'s document asks a reader with this user agent to fetch. */
const assetsOf = async (request: APIRequestContext, userAgent: string): Promise<readonly string[]> => {
  const html = await (await request.get('/p/1', { headers: { 'user-agent': userAgent } })).text()
  return [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[\w.-]+\.(?:js|css)/g)].map(([asset]) => asset))]
}

/** Which of `assets` carry `marker` in their bytes - named, so a failure says which chunk. */
const assetsContaining = async (
  request: APIRequestContext,
  assets: readonly string[],
  marker: string,
): Promise<readonly string[]> => {
  const bodies = await Promise.all(assets.map(async (asset) => (await request.get(asset)).text()))
  return assets.filter((_asset, index) => (bodies[index] ?? '').includes(marker))
}

test('serves a phone the mobile reading mode, and no book at all', async ({ page }) => {
  await page.goto('/p/1')

  await expect(page.locator('[data-reading-surface="mobile"]')).toBeVisible()
  // The whole point of the split: a phone's document carries no design box,
  // no leaves and no page stack.
  await expect(page.locator('[data-design-box]')).toHaveCount(0)
  await expect(page.locator('[data-leaf]')).toHaveCount(0)
})

test('ships neither surface the other’s code, which is what two route entries bought', async ({ request }) => {
  // The markup split above was never the whole promise. While one route
  // branched between the two surfaces, Turbopack compiled BOTH component trees
  // into that route's single chunk group, so every desktop reader downloaded
  // this surface's client half and its stylesheet and LCP went over its gate
  // (docs/adr/0012-two-route-entries-for-two-reading-surfaces.md). Two entries
  // split it; this case is what fails if they are ever merged back, or if a
  // shared import quietly pulls one surface into the other's chunk.
  const [bookAssets, mobileAssets] = await Promise.all([
    assetsOf(request, DESKTOP_USER_AGENT),
    assetsOf(request, PHONE_USER_AGENT),
  ])

  expect(bookAssets.length).toBeGreaterThan(0)
  expect(mobileAssets.length).toBeGreaterThan(0)
  expect(await assetsContaining(request, bookAssets, MOBILE_STYLESHEET_MARKER)).toEqual([])
  expect(await assetsContaining(request, mobileAssets, BOOK_STYLESHEET_MARKER)).toEqual([])
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

/** What one mobile document says about itself, read out of raw HTML with no JavaScript run. */
interface ServedPage {
  /** How many mobile pages the document carries - one, on this surface, always. */
  readonly pages: number
  /** How many of the book's leaves it carries - none, on this surface, ever. */
  readonly leaves: number
  /** How many design boxes it carries - none, on this surface, ever. */
  readonly designBoxes: number
  /** Which kind of page it is, from `data-mobile-page`. */
  readonly kind: string
  /** The journey or section the header names. */
  readonly name: string
  /** The counter the header prints, e.g. `03 / 33`. */
  readonly counter: string
  /** The page's own text, whitespace-collapsed - the header and bottom bar excluded. */
  readonly text: string
}

/** What the BOOK surface says the book is, which is what the mobile documents are held to. */
interface BookShape {
  /** Every leaf's page kind, in reading order, from the completed book's own `data-page`. */
  readonly kinds: readonly string[]
  /** The bookmark tab governing each leaf, as its full text - the rail's own answer to "which journey is this". */
  readonly governingTab: readonly string[]
}

test('serves every one of the thirty-three deep links its own page, in raw HTML', async ({ page, request }) => {
  // THE MOBILE COUNTERPART OF `e2e/serverWindow.spec.ts`'s thirty-three-route
  // case, and the reason it had to exist: Googlebot Smartphone is served THIS
  // surface, so the one most likely to be indexed was the one with no
  // equivalent guarantee. That file's case skips below 860px
  // (`e2e/support/surface.ts`), and this one is what stands in its place.
  //
  // IT DOES NOT COMPARE AGAINST A TRANSCRIPTION, for the same reason that one
  // does not: a list of expected words rots the moment the seed changes, and
  // rots silently. It compares against the BOOK, fetched in the same run with
  // a desktop user agent, which is a genuinely independent answer - since
  // `docs/adr/0012-two-route-entries-for-two-reading-surfaces.md` the two
  // surfaces are two route entries with two page components, so agreement
  // between them is a real check rather than a tautology. The book's completed
  // render (`?pages=all`, the same address `useRestOfBook` asks with) says what
  // kind of page sits at each of the thirty-three leaves; its bookmark rail
  // says which journey governs each leaf. Both are read off the document.
  //
  // AN EXACT TEXT MATCH ACROSS THE TWO IS NOT AVAILABLE, and pretending
  // otherwise would have produced a test that asserts a coincidence. The
  // surfaces render the same content differently on purpose - the mobile Cover
  // carries "Start reading" and a swipe hint where the book's carries its
  // postal stamps, a mobile frames page repeats the journey's weather and mood
  // badges where the book's prints "Frames 01 - 03", and the mobile About
  // drops the kit list. So the identity of each page is asserted through what
  // both surfaces must agree on (its kind, and the journey that governs it),
  // and the SUBSTANCE of each page is asserted where only this surface can
  // speak: every one of the thirty-three carries real text, and no two of them
  // carry the same text. A route serving another route's page fails the first
  // pair; a route thinning out to nothing fails the second.
  test.setTimeout(120_000)

  const asPhone = { headers: { 'user-agent': PHONE_USER_AGENT } }
  const asDesktop = { headers: { 'user-agent': DESKTOP_USER_AGENT } }

  const bookHtml = await (await request.get(wholeBookPath(1), asDesktop)).text()
  const book = await page.evaluate((source: string): BookShape => {
    const parsed = new DOMParser().parseFromString(source, 'text/html')
    const leaves = [...parsed.querySelectorAll('[data-leaf]')]
    const tabs = [...parsed.querySelectorAll('[data-bookmark]')].map((tab) => ({
      leaf: Number(tab.getAttribute('data-bookmark')),
      text: tab.textContent.replace(/\s+/g, ' ').trim(),
    }))

    return {
      kinds: leaves.map((leaf) => leaf.querySelector('[data-page]')?.getAttribute('data-page') ?? 'none'),
      governingTab: leaves.map((_leaf, index) => {
        const governing = tabs.filter((tab) => tab.leaf <= index)
        return governing[governing.length - 1]?.text ?? 'none'
      }),
    }
  }, bookHtml)

  expect(book.kinds, 'the completed book served no leaves to hold the mobile surface to').not.toHaveLength(0)
  expect(book.kinds).not.toContain('none')
  expect(book.governingTab).not.toContain('none')

  const documents = await Promise.all(
    book.kinds.map(async (_kind, leaf) => {
      const path = `/p/${String(leaf + 1)}`
      const response = await request.get(path, asPhone)
      expect(response.status(), `${path} did not serve a document`).toBe(200)
      return response.text()
    }),
  )

  // One trip into the browser for all thirty-three, not thirty-three trips.
  const served = await page.evaluate(
    (sources: readonly string[]): readonly ServedPage[] =>
      sources.map((source) => {
        const parsed = new DOMParser().parseFromString(source, 'text/html')
        const own = parsed.querySelector('[data-mobile-page]')

        return {
          pages: parsed.querySelectorAll('[data-mobile-page]').length,
          leaves: parsed.querySelectorAll('[data-leaf]').length,
          designBoxes: parsed.querySelectorAll('[data-design-box]').length,
          kind: own?.getAttribute('data-mobile-page') ?? 'none',
          name: (parsed.querySelector('[data-header-name]')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
          counter: (parsed.querySelector('[data-counter]')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
          text: (own?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        }
      }),
    documents,
  )

  const total = book.kinds.length

  // One page per document, and no book anywhere in it - the whole reason this
  // surface has its own route entry.
  expect(served.map(({ pages, leaves, designBoxes }) => ({ pages, leaves, designBoxes }))).toEqual(
    book.kinds.map(() => ({ pages: 1, leaves: 0, designBoxes: 0 })),
  )

  // Each route serves the kind of page the book puts at that leaf...
  expect(served.map(({ kind }) => kind)).toEqual(book.kinds)

  // ...belonging to the journey the book's own rail says governs that leaf...
  const misattributed = served
    .map(({ name }, leaf) => ({ path: `/p/${String(leaf + 1)}`, name, tab: book.governingTab[leaf] ?? '' }))
    .filter(({ name, tab }) => name === '' || !tab.includes(name))
  expect(misattributed, 'these routes name a journey the book’s bookmark rail does not put at that leaf').toEqual([])

  // ...printing its own place in the book, which is arithmetic the document
  // has to have got right on its own before a crawler can trust the rest.
  expect(served.map(({ counter }) => counter)).toEqual(
    book.kinds.map((_kind, leaf) => `${String(leaf + 1).padStart(2, '0')} / ${String(total)}`),
  )

  // And every one of them carries real, page-specific text: none thinned out,
  // and no two the same. This is the half only this surface can answer, and it
  // is what fails if a route ever starts serving an empty or a borrowed page.
  const thin = served
    .map(({ text }, leaf) => ({ path: `/p/${String(leaf + 1)}`, characters: text.length }))
    .filter(({ characters }) => characters <= 50)
  expect(thin, 'these routes served a page with almost nothing on it').toEqual([])
  expect(new Set(served.map(({ text }) => text)).size, 'two routes served the same page').toBe(total)
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
