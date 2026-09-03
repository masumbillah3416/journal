/**
 * imageWindow.spec.ts — the leaves near the reader are the only ones that
 * fetch photographs, driven in a real browser.
 *
 * Task 10 measured `/p/1` requesting all twenty of the seeded book's
 * photographs — 1,833,312 bytes — with the reader on the Cover, and the LCP
 * gate went red at 3,247ms against a 2,500ms budget. The cause is structural:
 * `Book.tsx` renders every one of the thirty-three leaves, and every leaf is
 * absolutely positioned at `inset: 0`, so the browser considers all of them
 * in the viewport and `loading="lazy"` defers nothing. The fix is
 * `leafPresentation.loadsImages` (packages/domain/src/pageStack.ts), whose
 * arithmetic is unit-tested; what only a browser can settle is whether the
 * bytes actually stop arriving, and whether the destination of a turn is
 * ready BEFORE the reader sees it rather than popping in afterwards.
 *
 * THE FIRST CASE IS THE ONE THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT. It
 * counts real network responses rather than inspecting attributes, because
 * `loading="lazy"` was present the whole time the twenty images were being
 * fetched — an attribute-level assertion would have passed while the budget
 * burned.
 *
 * The two mid-turn cases fire their trigger from inside `page.evaluate` and
 * read exactly one animation frame later, for the reasons `flip.spec.ts`'s
 * header sets out at length: firing from inside the page removes the driver
 * round-trip, and one frame is the shortest wait that is actually enough
 * because React does not flush a click's re-render synchronously.
 * TASK 11 MADE THIS FILE'S BUDGET FOUR AND A HALF TIMES LARGER. The Frames
 * pages put SEVEN more photographs on every journey, taking the seeded book
 * from twenty images to roughly ninety — so a Frames page that rendered its
 * mounts without honouring the window would silently reverse
 * `docs/adr/0006-diary-image-window.md` across seventy images, and the first
 * case below (which counts real network responses on `/p/1`) is the one that
 * would catch it. The two cases added with those pages check the same thing
 * from the other side: which leaves are OPEN when the reader is standing on a
 * Frames page, and that a Frames page two leaves away is still shut.
 * Depends on: @playwright/test, `waitForLiveBook` (./support/liveBook), the
 * running app from playwright.config.ts's `webServer`, and the seeded diary
 * (`npm run db:seed`): 10 journeys, 33 pages, Tokyo's notes on page 3, its
 * Frames I on page 4 and its Frames II on page 5.
 */
import { expect, test } from '@playwright/test'
import { waitForLiveBook, wholeBookPath } from './support/liveBook'
import { drawsMobileReadingMode } from './support/surface'

// SCREENS.md §1.10 replaces the book below 860px - "No book, no flip, no
// scaling" - so this file's subject does not exist at the `mobile` project.
// The mobile reading mode has its own suite in `e2e/mobile.spec.ts`; see
// `e2e/support/surface.ts` for why this is a skip rather than a rewrite.
test.skip(({ viewport }) => drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

/** The 1x1 transparent GIF a deferred photograph carries; see `deferredPhotograph.ts`. */
const DEFERRED = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

test('fetches no photograph at all for a page with none on it', async ({ page }) => {
  const photographs: string[] = []
  page.on('response', (response) => {
    if (response.request().resourceType() === 'image') photographs.push(response.url())
  })

  await page.goto('/p/1')
  await waitForLiveBook(page)
  await page.waitForLoadState('networkidle')

  // The Cover and the Contents page carry no photographs, so a window around
  // leaf 0 asks for nothing. Before the window, this was twenty images.
  expect(photographs).toEqual([])
})

test("keeps a page's words in the book while withholding its bytes", async ({ page }) => {
  // The two windows do different things and this case is what keeps them
  // apart. A leaf outside the IMAGE window still carries its heading, its
  // caption and its alt text, with only its `src` stood in for — the markup
  // is never what is deferred there.
  //
  // The leaf it asks about used to be 29, chosen because it was as far from
  // the reader as the book allows. It is 4 now, because the CONTENT window
  // (docs/adr/0009-server-rendered-page-window.md) means leaf 29's face is
  // not in `/p/1`'s document at all until the book asks for the rest of
  // itself — and this case is about the image window, not that one. Leaf 4 is
  // inside every served window of `/p/2` and outside its image window, which
  // is exactly the pairing this asserts.
  await page.goto('/p/2')
  await waitForLiveBook(page)

  const distant = page.locator('[data-leaf="4"]')
  await expect(distant).toContainText('Tokyo')
  await expect(distant.locator('img').first()).toHaveAttribute('src', DEFERRED)
  await expect(distant.locator('img').first()).not.toHaveAttribute('alt', '')
})

test("has the next page's photograph decoded before its leaf becomes visible", async ({ page }) => {
  // The window is one page wider than `visible` on each side precisely so
  // this holds. Opening on the Contents page (leaf 1) puts Tokyo's notes
  // (leaf 2) inside the window, so its hero is fetched while the book is at
  // rest — and is already decoded at the first frame of the turn that reveals
  // it, rather than starting to load then.
  await page.goto('/p/2')
  await waitForLiveBook(page)
  await page.waitForFunction(() => {
    const hero = document.querySelector('[data-leaf="2"] [data-hero]')
    return hero instanceof HTMLImageElement && hero.complete && hero.naturalWidth > 0
  })

  const atTheFirstFrame = await page.evaluate(async () => {
    document.querySelector<HTMLElement>('[data-nav="next"]')?.click()
    await new Promise((resolve) => requestAnimationFrame(resolve))

    const leaf = document.querySelector('[data-leaf="2"]')
    const hero = document.querySelector('[data-leaf="2"] [data-hero]')
    return {
      visible: leaf !== null && getComputedStyle(leaf).visibility === 'visible',
      decoded: hero instanceof HTMLImageElement && hero.complete && hero.naturalWidth > 0,
    }
  })

  expect(atTheFirstFrame).toEqual({ visible: true, decoded: true })
})

test("opens the window on a bookmark jump's destination at the first frame of the turn", async ({ page }) => {
  // A jump moves the reader many pages at once, so its destination cannot
  // have been preloaded. What must not happen is the destination waiting for
  // the turn to COMMIT before it is allowed to fetch: it has to be inside the
  // window from the first frame, so the 900ms of the turn is loading time.
  //
  // Opened on the whole-book address for the same reason `flip.spec.ts`'s
  // anchor case is: this reads one animation frame after the click, and the
  // SERVER's content window (a different window from this file's subject —
  // docs/adr/0009-server-rendered-page-window.md) leaves leaf 29 without a
  // face on the bare `/p/1` until the reader's first turn fetches it.
  await page.goto(wholeBookPath(1))
  await waitForLiveBook(page)
  await expect(page.locator('[data-leaf="29"] [data-hero]')).toHaveAttribute('src', DEFERRED)

  const sourceAtTheFirstFrame = await page.evaluate(async () => {
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-bookmark]')]
    const seville = tabs.find((tab) => tab.textContent.includes('Seville'))
    if (seville === undefined) return 'no Seville bookmark tab in the rail'

    seville.click()
    await new Promise((resolve) => requestAnimationFrame(resolve))

    return document.querySelector('[data-leaf="29"] [data-hero]')?.getAttribute('src') ?? 'no hero on leaf 29'
  })

  expect(sourceAtTheFirstFrame).toMatch(/^\/api\/media\/file\/seville-hero/)
})

test('opens the window on a Frames page to its own leaf and its two neighbours, and no further', async ({ page }) => {
  // Asserted as the SET OF LEAVES carrying a real `src` rather than as a
  // count of responses, so the case names which leaf is wrong when it fails
  // rather than only that the total moved. On `/p/4` the reader is on Tokyo's
  // Frames I (leaf 3), so the window is leaves 2, 3 and 4 — Tokyo's whole
  // journey and nothing else. Every other journey's seven frames stay shut.
  await page.goto('/p/4')
  await waitForLiveBook(page)

  const open = await page.evaluate((deferred) => {
    const leaves = [...document.querySelectorAll('[data-leaf]')]
    return leaves.flatMap((leaf) => {
      const photographs = [...leaf.querySelectorAll('img')]
      const loaded = photographs.filter((image) => image.getAttribute('src') !== deferred)
      return loaded.length === 0 ? [] : [Number(leaf.getAttribute('data-leaf'))]
    })
  }, DEFERRED)

  expect(open.sort((a, b) => a - b)).toEqual([2, 3, 4])
})

test('leaves a Frames page two leaves away from the reader deferred', async ({ page }) => {
  // The complement of the case above, from the reader's side. `/p/2` is the
  // Contents page (leaf 1), so Tokyo's Frames I (leaf 3) is exactly one leaf
  // outside the window — the nearest a Frames page can be to the reader and
  // still be shut. Its markup is all present; only the bytes are withheld.
  await page.goto('/p/2')
  await waitForLiveBook(page)

  const framesI = page.locator('[data-leaf="3"] [data-page="frames-i"]')
  await expect(framesI).toContainText('Frames 01 – 03')

  const sources = await framesI.locator('img').evaluateAll((images) => images.map((image) => image.getAttribute('src')))
  expect(sources).toEqual([DEFERRED, DEFERRED, DEFERRED])
})
