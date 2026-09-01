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
 * Depends on: @playwright/test.
 */
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
