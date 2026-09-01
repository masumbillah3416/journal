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
 * Depends on: @playwright/test, `waitForLiveBook` (./support/liveBook), the
 * running app from playwright.config.ts's `webServer`, and the seeded diary
 * (`npm run db:seed`): 10 journeys, 33 pages, Tokyo's notes on page 3.
 */
import { expect, test } from '@playwright/test'
import { waitForLiveBook } from './support/liveBook'

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

test("keeps every page's words in the document while withholding its bytes", async ({ page }) => {
  // The design spec's §8 requires the server to render every page's content
  // so the deep links are indexable. It is the image BYTES that are deferred,
  // never the markup: a distant leaf still carries its heading, its caption
  // and its alt text, with only its `src` stood in for.
  await page.goto('/p/1')

  const distant = page.locator('[data-leaf="29"]')
  await expect(distant).toContainText('Seville')
  await expect(distant.locator('[data-hero]')).toHaveAttribute('src', DEFERRED)
  await expect(distant.locator('[data-hero]')).not.toHaveAttribute('alt', '')
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
  await page.goto('/p/1')
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
