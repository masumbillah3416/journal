/**
 * gallery.spec.ts — the gallery route and its lightbox, in a real browser
 * (SCREENS.md §1.8-§1.9).
 *
 * Everything here needs something jsdom cannot give. What the components
 * DECIDE — which frame is open, what the counter says, which decorations a
 * clip gets, where the back link points — is covered without a browser in
 * `apps/web/components/gallery/*.test.tsx`, and the rules under them in
 * `@travel-diary/domain`'s `gallery`/`galleryDownload`, gated at 100%. Five
 * things only a laid-out, served page can answer are here.
 *
 * 1 · THE TILES STAY SQUARE AND UNSQUEEZED AT SIXTY-ONE. SCREENS.md §1.8
 *    records the grid as "Verified with 61 tiles; must stay square and
 *    unsqueezed at 40+", which is a statement about `aspect-ratio: 1/1` and
 *    `object-fit: cover` under a `repeat(auto-fill, minmax(...))` track — none
 *    of which exists until a browser lays it out. `apps/web/scripts/seed.ts`
 *    seeds Patagonia's full sixty-one-frame gallery precisely so this case has
 *    the number the design was verified at rather than a smaller one.
 *
 * 2 · THE DOWNLOAD IS SERVED BY US. SECURITY.md: "the gallery's download
 *    action must serve a derivative through your own handler, not a bucket
 *    URL. Direct URLs invite enumeration of everything in the bucket,
 *    including anything marked hidden." Two halves, both here: the `href` is
 *    a path of ours rather than a store URL, and what answers it carries
 *    `Content-Disposition: attachment` with a strict `Content-Type` — which
 *    is a response header, and therefore a thing only a real request can see.
 *
 * 3 · RETURNING RESTORES `/p/<n>`, NOT `/`. The design spec asks for it by
 *    name, and there are two ways a reader does it — the gallery's own back
 *    control and the browser's Back button. Both are asserted, because they
 *    are different mechanisms: the control is a link whose `href` the SERVER
 *    renders from the `from` parameter the diary's own gallery link carries,
 *    and the Back button depends on `Book.tsx`'s `history.replaceState` having
 *    written the reader's page onto the entry the gallery was opened from.
 *    `e2e/routing.spec.ts` has covered the second half against a 404 since
 *    Task 13; this file is where it meets a real gallery. A third case reads
 *    the control's `href` out of the RAW HTML, because an earlier design
 *    resolved it from `document.referrer` after mount and a reader who
 *    clicked before hydration landed on the cover.
 *
 * 4 · ESCAPE, THE ARROWS AND FOCUS. A modal's keyboard contract is only real
 *    in a browser: jsdom dispatches synthetic key events against a tree that
 *    was never laid out, and has no notion of what a browser will actually
 *    let Tab reach.
 *
 * 5 · THE DOCUMENT NEVER SCROLLS SIDEWAYS. This is `e2e/layout.spec.ts`'s
 *    measurement asked of a route with no design box to be centred in, and it
 *    is here because it caught a real defect at 390px: the header's single
 *    flex row was wider than the viewport, with the title and the census
 *    clipped off the right edge
 *    (docs/qa/2026-09-03-gallery-sweep.md, GAL-004). A baseline could not
 *    have caught it — a picture of a clipped header is still a picture.
 *
 * THE SEEDED JOURNEY IS PATAGONIA, not Tokyo, and that is deliberate:
 * Patagonia is the prototype journey whose gallery `count` is 61
 * (`Travel Diary.dc.html`), which is the number SCREENS.md verified the grid
 * at and the `003 / 061` its lightbox counter prints. Its three pages are 9,
 * 10 and 11 of the reading sequence (Cover, Contents, then three pages per
 * journey), so page 9 is the first that carries a link to it.
 * Depends on: @playwright/test, `waitForLiveBook` (./support/liveBook), the
 * running app from playwright.config.ts's `webServer`, and the seeded diary
 * (`npm run db:seed`).
 */
import { expect, test } from '@playwright/test'
import { waitForLiveBook } from './support/liveBook'

/** The seeded journey whose gallery holds the sixty-one frames §1.8 was verified against. */
const GALLERY = '/gallery/patagonia'

/** The same gallery as the book links to it: with the page the reader left. */
const GALLERY_FROM_NOTES = `${GALLERY}?from=9`

/** How many frames that gallery holds. */
const FRAMES = 61

/** Patagonia's Notes page — the first page of the book that links to its gallery. */
const NOTES_PAGE = '/p/9'

test('draws every one of the sixty-one tiles the design was verified with', async ({ page }) => {
  await page.goto(GALLERY)

  await expect(page.locator('[data-tile]')).toHaveCount(FRAMES)
})

test('keeps every tile square and unsqueezed at sixty-one of them', async ({ page }) => {
  await page.goto(GALLERY)
  await expect(page.locator('[data-tile]').first()).toBeVisible()

  const misshapen = await page.$$eval('[data-tile] img', (images) =>
    images.flatMap((image) => {
      const box = image.getBoundingClientRect()
      const fit = window.getComputedStyle(image).objectFit
      const square = box.height === 0 ? 0 : box.width / box.height
      // A square within half a pixel either way: a fractional `1fr` track
      // leaves sub-pixel remainders that are not a design defect.
      if (Math.abs(square - 1) < 0.01 && fit === 'cover') return []
      return [{ square, fit, width: box.width }]
    }),
  )

  expect(misshapen).toEqual([])
})

test('tracks the grid at the tile size the book global asked for', async ({ page }) => {
  await page.goto(GALLERY)
  await expect(page.locator('[data-tile]').first()).toBeVisible()

  const track = await page.locator('[data-gallery-grid]').evaluate((grid) => {
    const style = window.getComputedStyle(grid)
    return {
      // The resolved track widths, which is what `auto-fill` actually decided
      // - not the declaration, which would tell us only what we wrote.
      tracks: style.gridTemplateColumns.split(' ').map((width) => Number.parseFloat(width)),
      gap: style.gap,
      width: grid.getBoundingClientRect().width,
    }
  })

  // SCREENS.md §1.8's `gap: 18px 16px`, and no track narrower than the
  // configured 200px minimum. Not "more than one column": at the 390px
  // project the grid is 322px wide and one 322px track is the correct answer
  // to `minmax(200px, 1fr)`, so a column count would be asserting the
  // viewport rather than the design.
  expect(track.gap).toBe('18px 16px')
  expect(track.tracks.filter((width) => width < Math.min(200, track.width))).toEqual([])
})

test('defers the tiles below the fold to the browser’s own lazy loading', async ({ page }) => {
  await page.goto(GALLERY)
  await expect(page.locator('[data-tile]').first()).toBeVisible()

  const eager = await page.$$eval('[data-tile] img', (images) =>
    images.filter((image) => image.getAttribute('loading') !== 'lazy').length,
  )

  expect(eager).toBe(0)
})

test('answers a slug naming no journey with a 404 rather than an empty gallery', async ({ request }) => {
  expect((await request.get('/gallery/no-such-journey')).status()).toBe(404)
})

test('opens the lightbox on the tile the reader picked, counted as SCREENS.md §1.9 prints it', async ({ page }) => {
  await page.goto(GALLERY)
  await page.locator('[data-tile]').nth(2).click()

  await expect(page.locator('[data-counter]')).toHaveText(`003 / 0${String(FRAMES)}`)
})

test('steps the open frame with the arrow keys', async ({ page }) => {
  await page.goto(GALLERY)
  await page.locator('[data-tile]').nth(2).click()

  await page.keyboard.press('ArrowRight')

  await expect(page.locator('[data-counter]')).toHaveText(`004 / 0${String(FRAMES)}`)
})

test('closes the lightbox on Escape', async ({ page }) => {
  await page.goto(GALLERY)
  await page.locator('[data-tile]').nth(2).click()
  await expect(page.locator('[data-lightbox]')).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(page.locator('[data-lightbox]')).toBeHidden()
})

test('returns focus to the tile the reader was on, so the keyboard does not start over', async ({ page }) => {
  await page.goto(GALLERY)
  await page.locator('[data-tile]').nth(2).click()
  await page.keyboard.press('ArrowRight')

  await page.keyboard.press('Escape')

  // Frame 4 is the tile the reader stepped to, not the one they opened.
  await expect(page.locator('[data-tile]').nth(3)).toBeFocused()
})

test('keeps Tab inside the open dialog rather than letting it reach the page behind', async ({ page }) => {
  await page.goto(GALLERY)
  await page.locator('[data-tile]').nth(2).click()

  // Round the dialog's controls twice over, which is more presses than it has.
  for (let press = 0; press < 12; press += 1) await page.keyboard.press('Tab')

  const inside = await page.evaluate(
    () => document.querySelector('[data-lightbox]')?.contains(document.activeElement) ?? false,
  )
  expect(inside).toBe(true)
})

test('offers the download from a handler of ours, never from the store', async ({ page }) => {
  await page.goto(GALLERY)
  await page.locator('[data-tile]').nth(2).click()

  const href = await page.locator('[data-lightbox-download]').getAttribute('href')

  expect(href).toMatch(/^\/gallery\/patagonia\/download\/\d+$/)
  // No scheme and no authority: this cannot resolve to MEDIA_ORIGIN or to any
  // other origin, whatever either is configured to.
  expect(href).not.toMatch(/^[a-z][a-z0-9+.-]*:/i)
  expect(href?.startsWith('//')).toBe(false)
  // And not Payload's own file route either, which is where the `<img>` tags
  // point and which serves inline, by filename.
  expect(href).not.toContain('/api/media/file/')
})

test('serves that download as an attachment with a strict type', async ({ page, request }) => {
  await page.goto(GALLERY)
  await page.locator('[data-tile]').nth(2).click()
  const href = await page.locator('[data-lightbox-download]').getAttribute('href')

  const response = await request.get(href ?? '')

  expect(response.status()).toBe(200)
  expect(response.headers()['content-disposition']).toContain('attachment')
  expect(response.headers()['content-disposition']).toContain('patagonia-003')
  expect(response.headers()['content-type']).toBe('image/png')
  expect(response.headers()['x-content-type-options']).toBe('nosniff')
  expect((await response.body()).byteLength).toBeGreaterThan(0)
})

test('refuses a download addressed through a journey the frame does not belong to', async ({ page, request }) => {
  await page.goto(GALLERY)
  await page.locator('[data-tile]').nth(2).click()
  const href = await page.locator('[data-lightbox-download]').getAttribute('href')

  const wrongJourney = await request.get((href ?? '').replace('/patagonia/', '/tokyo/'))

  expect(wrongJourney.status()).toBe(404)
})

test('returns the reader to the page they left the book from, by the gallery’s own control', async ({ page }) => {
  await page.goto(NOTES_PAGE)
  await waitForLiveBook(page)

  await page.locator('[data-leaf="8"]').getByRole('link', { name: /See full gallery/ }).click()
  // The string form, not a pattern: `?` is a regex quantifier, and a pattern
  // built from this address would silently make its `y` optional.
  await expect(page).toHaveURL(GALLERY_FROM_NOTES)
  await page.getByRole('link', { name: /Back to the diary/ }).click()

  await expect(page).toHaveURL(/\/p\/9$/)
})

test('returns the reader to that same page by the browser’s own Back button', async ({ page }) => {
  await page.goto(NOTES_PAGE)
  await waitForLiveBook(page)

  await page.locator('[data-leaf="8"]').getByRole('link', { name: /See full gallery/ }).click()
  await expect(page).toHaveURL(GALLERY_FROM_NOTES)
  await page.goBack()

  await expect(page).toHaveURL(/\/p\/9$/)
})

test('points the back control at the page the link named before any script runs', async ({ request }) => {
  // Read out of the raw HTML with `request.get`, never `page.goto`: the whole
  // point of putting the page number in the link is that the control is right
  // in the first bytes, and an earlier design that corrected it in an effect
  // sent a reader who clicked too early to the cover
  // (docs/qa/2026-09-03-gallery-sweep.md, GAL-005).
  const html = await (await request.get(GALLERY_FROM_NOTES)).text()

  expect(html).toContain('href="/p/9"')
})

test('opens the book at its first page for a reader who arrived at a gallery from nowhere', async ({ page }) => {
  // A shared gallery link, with no diary page behind it. The control still
  // has to lead into the book - `/p/1`, never `/`.
  await page.goto(GALLERY)

  await expect(page.getByRole('link', { name: /Back to the diary/ })).toHaveAttribute('href', '/p/1')
})

test('never scrolls the document sideways, at any viewport this suite runs at', async ({ page }) => {
  // The gallery's header is a single flex row of a back control, a title block
  // and a census, and at 390px it was wider than the viewport: the title and
  // the count were clipped off the right edge and the document scrolled
  // sideways (docs/qa/2026-09-03-gallery-sweep.md, GAL-004). This is the
  // measurement `e2e/layout.spec.ts` makes for the book, asked of a route
  // that has no design box to be centred in.
  await page.goto(GALLERY)
  await expect(page.locator('[data-tile]').first()).toBeVisible()

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)
})

test('never scrolls the document sideways with the lightbox open', async ({ page }) => {
  await page.goto(GALLERY)
  await page.locator('[data-tile]').nth(2).click()
  await expect(page.locator('[data-lightbox]')).toBeVisible()

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)
})

test('opens the frame a shared address names, so a Share link lands on the photograph', async ({ page }) => {
  // The address the lightbox's Share control builds - a fragment carrying the
  // frame's own media id, never its position, so it survives a re-sort.
  await page.goto(GALLERY)
  const fifth = await page.locator('[data-tile]').nth(4).getAttribute('data-tile')

  // `goto` to a URL that differs only in its fragment is a fragment
  // navigation, not a load - the mount effect that reads the hash would never
  // run. The reload is what makes this the arrival a shared link actually is.
  await page.goto(`${GALLERY}#frame-${fifth ?? ''}`)
  await page.reload()

  await expect(page.locator('[data-counter]')).toHaveText(`005 / 0${String(FRAMES)}`)
})
