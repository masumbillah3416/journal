/**
 * serverWindow.spec.ts — the served document carries a window of the book,
 * and every one of the thirty-three deep links still carries its own page.
 *
 * `/p/<n>` used to render all thirty-three pages' markup into every document.
 * That is 274,459 raw bytes on `/p/1` for a reader looking at the Cover, and
 * the LCP gate went red at 3,084ms against 3,000ms with Style & Layout on
 * thirty-three page faces as the largest item this repository owns in that
 * number (`docs/adr/0008-lcp-budget-and-the-framework-floor.md`). The route
 * now renders the addressed page and three leaves either side
 * (`@travel-diary/domain/contentWindow`), and the book asks the server for
 * the rest of itself on the reader's first turn
 * (`apps/web/components/book/useRestOfBook.ts`).
 *
 * THE FIRST CASE IS THE ONE THE WHOLE CHANGE STANDS OR FALLS ON. The design
 * spec's §8 requires the deep links to be indexable, and that requirement is
 * PER ROUTE: `/p/12` must serve page 12's content. Nothing ever asked `/p/1`
 * to serve page 20's, because `/p/20` does. So the case walks all
 * thirty-three routes and requires each document to carry its own page's
 * text — and it does not compare against a transcription, which would rot,
 * but against the SAME leaf rendered by the completed book in the same run.
 * If a route's own page ever thins out, the two stop matching.
 *
 * It reads the raw HTML with `request.get` and parses it with `DOMParser`,
 * never by navigating: a crawler runs no JavaScript, so neither may the
 * assertion that a crawler is served. `page.goto` would let the book's own
 * request for the rest of itself land before anything was read, and the case
 * would pass on a document that never existed.
 *
 * The three browser cases below are the other half. A document that indexes
 * beautifully and strands a reader on a blank leaf four turns in has not
 * solved anything, so they turn past the window's edge, jump across the book
 * from a bookmark, and — with the rest of the book deliberately held up on
 * the network — check that the reader waits for a page rather than being
 * shown an empty one.
 * Depends on: @playwright/test, `CONTENT_WINDOW_RADIUS`/`contentWindow`
 * (@travel-diary/domain/contentWindow), `waitForLiveBook`/`waitForWholeBook`/
 * `wholeBookPath` (./support/liveBook),
 * the running app from playwright.config.ts's `webServer`, and the seeded
 * diary (`npm run db:seed`): 10 journeys, 33 pages.
 */
import { CONTENT_WINDOW_RADIUS, contentWindow } from '@travel-diary/domain/contentWindow'
import { expect, test, type Page } from '@playwright/test'
import { waitForLiveBook, waitForWholeBook, wholeBookPath } from './support/liveBook'

/** The flip's own duration, plus the arming and settling either side of it. */
const A_WHOLE_TURN_MS = 1_100

/** What one leaf of a document holds, read out of raw HTML with no JavaScript run. */
interface LeafReading {
  /** How many leaves the document rendered in total. */
  readonly leaves: number
  /** The leaf's own text, whitespace-collapsed. */
  readonly text: string
  /** The span the document says it carries, from `data-content-window`. */
  readonly window: string
  /** Which leaves carry a real page face. */
  readonly faces: readonly number[]
}

/**
 * Fetches a route's raw HTML and reads one leaf out of it without executing a
 * line of the page's JavaScript — the crawler's view, not the reader's.
 * @param page - A Playwright page, used only for its `DOMParser` and its request context.
 * @param path - The route to fetch.
 * @param leafIndex - The leaf to read out of the returned document.
 * @returns What that document says about itself and about that leaf.
 */
const readServedLeaf = async (page: Page, path: string, leafIndex: number): Promise<LeafReading> => {
  const response = await page.request.get(path)
  expect(response.status(), `${path} did not serve a document`).toBe(200)
  const html = await response.text()

  return page.evaluate(
    ([source, leaf]: [string, number]): LeafReading => {
      const document_ = new DOMParser().parseFromString(source, 'text/html')
      const leaves = [...document_.querySelectorAll('[data-leaf]')]
      const own = document_.querySelector(`[data-leaf="${String(leaf)}"]`)

      return {
        leaves: leaves.length,
        text: (own?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        window: document_.querySelector('main')?.getAttribute('data-content-window') ?? 'none',
        faces: leaves
          .filter((node) => node.querySelector('[data-page]') !== null)
          .map((node) => Number(node.getAttribute('data-leaf'))),
      }
    },
    [html, leafIndex] as [string, number],
  )
}

/** Every leaf's own text, as the completed book renders it — the truth the served documents are held to. */
const wholeBookText = async (page: Page): Promise<readonly string[]> => {
  await page.goto(wholeBookPath(1))
  await waitForWholeBook(page)
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-leaf]')].map((leaf) => leaf.textContent.replace(/\s+/g, ' ').trim()),
  )
}

/** The leaf the reader can currently see, and how much text is on it. */
const visibleLeaf = (page: Page): Promise<{ readonly leaf: string; readonly characters: number }> =>
  page.evaluate(() => {
    const showing = [...document.querySelectorAll('[data-leaf]')].filter(
      (leaf) => getComputedStyle(leaf).visibility === 'visible',
    )
    const last = showing[showing.length - 1]
    return {
      leaf: last?.getAttribute('data-leaf') ?? 'none',
      characters: (last?.textContent ?? '').trim().length,
    }
  })

/** Presses one of the book's own controls from inside the page, then waits out the turn. */
const turn = async (page: Page, direction: 'next' | 'prev'): Promise<void> => {
  await page.evaluate((nav: string) => {
    document.querySelector<HTMLElement>(`[data-nav="${nav}"]`)?.click()
  }, direction)
  await page.waitForTimeout(A_WHOLE_TURN_MS)
}

test('serves every one of the thirty-three deep links its own page, in raw HTML', async ({ page }) => {
  // Thirty-three dynamic renders and thirty-three parsed documents in one
  // case, which is more than the harness's default budget allows for on a
  // shared container: the alternative is thirty-three cases that each say a
  // third of a sentence, and the point of this one is that ALL of them hold.
  test.setTimeout(120_000)

  const expected = await wholeBookText(page)
  expect(expected.length).toBeGreaterThan(2 * CONTENT_WINDOW_RADIUS + 1)

  const documents = await Promise.all(
    expected.map(async (_, leaf) => {
      const response = await page.request.get(`/p/${String(leaf + 1)}`)
      expect(response.status(), `/p/${String(leaf + 1)} did not serve a document`).toBe(200)
      return response.text()
    }),
  )
  // One trip into the browser for all thirty-three, not thirty-three trips.
  const served = await page.evaluate(
    (sources: readonly string[]): readonly string[] =>
      sources.map((source, leaf) => {
        const parsed = new DOMParser().parseFromString(source, 'text/html')
        const own = parsed.querySelector(`[data-leaf="${String(leaf)}"]`)
        return (own?.textContent ?? '').replace(/\s+/g, ' ').trim()
      }),
    documents,
  )

  expect(served).toEqual(expected)
})

test('renders only a window of the book into the document, not all thirty-three pages', async ({ page }) => {
  const middle = 16
  const { faces, window } = await readServedLeaf(page, `/p/${String(middle + 1)}`, middle)
  const expectedWindow = contentWindow(middle, 33)

  expect(window).toBe(`${String(expectedWindow.from)}-${String(expectedWindow.to)}`)
  expect(faces).toEqual([13, 14, 15, 16, 17, 18, 19])
})

test('keeps a leaf in the stack for every page, even where the document carries no face', async ({ page }) => {
  // The leaf is the stack's geometry — its resting angle, its z-order, and
  // the page count printed under the book. Only its content is windowed.
  const { leaves, faces } = await readServedLeaf(page, '/p/1', 0)

  expect(leaves).toBe(33)
  expect(faces).toEqual([0, 1, 2, 3])
})

test('completes itself on the first turn, and leaves no query behind in the address', async ({ page }) => {
  // The book asks for the rest of itself by putting a query on the address,
  // so the address a reader can copy has to come back clean - and it comes
  // back naming the page they have actually turned to.
  await page.goto('/p/1')
  await waitForLiveBook(page)
  await expect(page.locator('[data-page-deferred]')).toHaveCount(29)

  await turn(page, 'next')
  await waitForWholeBook(page)

  await expect(page.locator('[data-page-deferred]')).toHaveCount(0)
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/p/2')
})

test('turns past the window’s edge onto a page that has content on it', async ({ page }) => {
  await page.goto('/p/1')
  await waitForLiveBook(page)

  for (let step = 0; step <= CONTENT_WINDOW_RADIUS; step++) await turn(page, 'next')

  // Leaf 4 is one past the far edge of `/p/1`'s served window, and the first
  // of those four turns is what fetched it.
  expect((await visibleLeaf(page)).leaf).toBe(String(CONTENT_WINDOW_RADIUS + 1))
  expect((await visibleLeaf(page)).characters).toBeGreaterThan(50)
})

test('turns back past the window’s edge onto a page that has content on it', async ({ page }) => {
  await page.goto('/p/9')
  await waitForLiveBook(page)

  for (let step = 0; step <= CONTENT_WINDOW_RADIUS; step++) await turn(page, 'prev')

  expect((await visibleLeaf(page)).leaf).toBe('4')
  expect((await visibleLeaf(page)).characters).toBeGreaterThan(50)
})

test('lands a bookmark jump across the book on a page that has content on it', async ({ page }) => {
  // The jump is the case the window interacts with most directly: it moves
  // the reader twenty-nine leaves at once, and `useFlip.jumpTo` anchors it one
  // page from its target, so BOTH of those leaves have to be real - and on a
  // reader's first gesture NEITHER of them is in the document yet. The jump is
  // held for the one round trip that fixes that, then played.
  await page.goto('/p/1')
  await waitForLiveBook(page)

  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-bookmark]')]
    tabs.find((tab) => tab.textContent.includes('Seville'))?.click()
  })
  await waitForWholeBook(page)
  await page.waitForTimeout(A_WHOLE_TURN_MS)

  expect((await visibleLeaf(page)).leaf).toBe('29')
  expect((await visibleLeaf(page)).characters).toBeGreaterThan(50)
})

test('holds a turn at the window’s edge rather than showing an empty leaf', async ({ page }) => {
  // The one failure this whole design has to rule out. The rest of the book
  // is held up on the network for longer than a reader could possibly take to
  // walk to the window's edge, and the reader walks there and keeps going.
  await page.route('**/*pages=all*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6_000))
    await route.continue()
  })
  await page.goto('/p/1')
  await waitForLiveBook(page)
  await expect(page.locator('main')).toHaveAttribute('data-content-window', `0-${String(CONTENT_WINDOW_RADIUS)}`)

  for (let step = 0; step <= CONTENT_WINDOW_RADIUS; step++) await turn(page, 'next')

  // The fourth press asked for leaf 4, which is not in this document. The
  // reader is still on leaf 3, and leaf 3 is a real page.
  expect((await visibleLeaf(page)).leaf).toBe(String(CONTENT_WINDOW_RADIUS))
  expect((await visibleLeaf(page)).characters).toBeGreaterThan(50)

  await waitForWholeBook(page)
  await page.waitForTimeout(A_WHOLE_TURN_MS)

  // And the turn was held, not dropped: it happens the moment it can.
  expect((await visibleLeaf(page)).leaf).toBe(String(CONTENT_WINDOW_RADIUS + 1))
  expect((await visibleLeaf(page)).characters).toBeGreaterThan(50)
})
