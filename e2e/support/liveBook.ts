/**
 * liveBook.ts — waits until the book's own effects have run.
 *
 * Shared by every spec that presses one of the book's triggers or measures
 * its geometry. The book is a client component, so between the server's HTML
 * arriving and React hydrating it there is a window in which the page renders
 * perfectly and no trigger does anything at all — a key press lost in that
 * window is lost for good, and a rect read in it is the server's unmeasured
 * `scale(1)` rather than the reader's book. Extracted here rather than
 * repeated per spec so both callers wait on the same signal by construction.
 *
 * A SERVED DOCUMENT CARRIES ONLY A WINDOW OF THE BOOK'S PAGES
 * (`docs/adr/0009-server-rendered-page-window.md`), and the book asks the
 * server for the rest of them on the reader's first turn. So a spec that
 * needs a leaf far from the page it opened on has two honest ways to get one,
 * and `wholeBookPath` below is the second of them:
 *
 *   - turn a page and wait, which is what a reader does — used by
 *     `e2e/serverWindow.spec.ts`, whose subject is exactly that sequence;
 *   - open the address that asks for the whole book outright, which is what
 *     `useRestOfBook` itself asks with — used by the two specs that assert on
 *     the single animation frame after a bookmark click, where waiting for a
 *     round trip first would be measuring the wrong thing.
 *
 * `waitForLiveBook` deliberately does NOT wait for the whole book: on a
 * document that is only ever a window until the reader turns a page, it would
 * wait for something that is not coming.
 * Depends on: @playwright/test.
 */
import { WHOLE_BOOK_QUERY } from '@travel-diary/domain/contentWindow'
import type { Page } from '@playwright/test'

/**
 * Resolves once `useBookScale` has replaced the server-rendered `scale(1)`
 * with a measured value — the earliest observable proof that React is in
 * charge of the page, and true of every viewport the harness runs at (0.98
 * desktop, 0.65 mid, 0.18 mobile).
 *
 * @param page - A Playwright page already navigated to a `/p/<n>` route.
 * @example
 * await page.goto('/p/3')
 * await waitForLiveBook(page)
 */
export const waitForLiveBook = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const box = document.querySelector('[data-design-box]')
    return box instanceof HTMLElement && box.style.transform !== 'scale(1)'
  })
}

/**
 * Resolves once the book carries every page's content — either because the
 * document arrived that way, or because the reader has turned a page and the
 * book's own request for the rest of it has landed.
 *
 * Read against the leaf count rather than a hard-coded `'0-32'`, so a book
 * that gains a journey does not turn this into a hang. Both numbers come out
 * of the same DOM, so they cannot drift apart.
 *
 * @param page - A Playwright page already navigated to a `/p/<n>` route.
 * @example
 * await page.goto('/p/1')
 * await turnOnce(page)
 * await waitForWholeBook(page)
 */
export const waitForWholeBook = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const leaves = document.querySelectorAll('[data-leaf]').length
    return leaves > 0 && document.querySelector('main')?.getAttribute('data-content-window') === `0-${String(leaves - 1)}`
  })
}

/**
 * The address that asks the server for every page's content in one document —
 * the same one `useRestOfBook` navigates to, so a spec using it is exercising
 * the shipped path rather than a test-only back door.
 *
 * @param pageNumber - The 1-based page to open on.
 * @returns The `/p/<n>` path carrying the whole-book query.
 * @example
 * await page.goto(wholeBookPath(30))
 */
export const wholeBookPath = (pageNumber: number): string => `/p/${String(pageNumber)}?${WHOLE_BOOK_QUERY}`
