/**
 * chrome.spec.ts — the book's chrome in a real layout engine: the rail, the
 * bar and the ribbon (SCREENS.md §1.7).
 *
 * Everything asserted here is something jsdom cannot see and a screenshot
 * cannot prove. `BookmarkRail.test.tsx`, `BottomBar.test.tsx` and
 * `Ribbon.test.tsx` cover the markup — which tab carries `aria-current`, what
 * each tab prints, that the arrows are labelled and go dead at the ends of the
 * book. None of them can say whether the ribbon takes a click meant for the
 * page under it, whether the bar is 58px, whether a control has been laid out
 * under the rail, or whether the rail scrolls without showing a scrollbar,
 * because all four are questions about layout and hit-testing. A visual
 * baseline cannot answer them either: a picture of a swallowed click looks
 * exactly like a picture of a working one, which is the lesson
 * `e2e/layout.spec.ts` was written from.
 *
 * THE RIBBON CASE IS THE ONE THAT MATTERS MOST. It is the single piece of
 * chrome that lies OVER the page rather than beside it, and this project has
 * already lost a debugging session to a transparent element swallowing clicks
 * (`book.module.css`'s rule 2: the back face, whose handlers were fine and
 * whose page was completely dead). SCREENS.md §1.7 says `pointer-events: none`
 * for that reason, and this file is what makes the words enforceable.
 *
 * THE 58px CASE IS THE SECOND. Task 8 gave the bar `flex-wrap: wrap` and a
 * `min-height`, because at 390px the arrows spilled out of the row and under
 * the bookmark rail, which then intercepted every click on one of them. The
 * height came back with this task by letting the readout column shrink
 * instead, so both facts — the stated height AND the reachable control — are
 * asserted together, at all three viewport projects, since either alone was
 * true at some point while the other was not.
 *
 * All three projects run every case: `desktop` was fine throughout the sweep,
 * and every chrome defect this file guards lived at `mid` or `mobile`.
 * Depends on: @playwright/test, `waitForLiveBook` (./support/liveBook), the
 * running app from playwright.config.ts's `webServer`, and the seeded diary
 * (`npm run db:seed`) — thirteen bookmarks, Tokyo spanning pages 3-5.
 */
import { expect, test } from '@playwright/test'
import { waitForLiveBook } from './support/liveBook'
import { drawsMobileReadingMode } from './support/surface'

// SCREENS.md §1.10 replaces the book below 860px - "No book, no flip, no
// scaling" - so this file's subject does not exist at the `mobile` project.
// The mobile reading mode has its own suite in `e2e/mobile.spec.ts`; see
// `e2e/support/surface.ts` for why this is a skip rather than a rewrite.
test.skip(({ viewport }) => drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

/** The `data-bookmark` of whichever tab the rail marks as the reader's, or `'none'`. */
const markedTab = async (page: import('@playwright/test').Page): Promise<string> =>
  page.evaluate(
    () => document.querySelector('[data-bookmark][aria-current="page"]')?.getAttribute('data-bookmark') ?? 'none',
  )

test('never lets the spine ribbon take a click meant for what is under it', async ({ page }) => {
  // Page 3, not page 1: what the ribbon lies over is the 30px backward
  // page-edge strip (the ribbon is `left: 42px`, 22px wide; the strip runs
  // from 36px for 30px), and a strip at the front of the book is disabled and
  // would refuse the click for a reason that has nothing to do with the
  // ribbon. Asserting on a LIVE trigger is what makes this case non-vacuous:
  // an earlier draft only asked whether the hit was the ribbon, and passed
  // with `pointer-events` removed, because the strip's own `z-index: 900`
  // already sits above the ribbon's 400 and answered for it.
  await page.goto('/p/3')
  await waitForLiveBook(page)

  const centre = await page.evaluate(() => {
    const ribbon = document.querySelector('[data-ribbon]')
    if (ribbon === null) throw new Error('no ribbon rendered')

    const rect = ribbon.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) throw new Error('the ribbon has no area, so this case proves nothing')

    const x = rect.x + rect.width / 2
    const y = rect.y + rect.height / 2
    const hit = document.elementFromPoint(x, y)
    return { x, y, hit: hit === null ? 'nothing - outside the viewport' : (hit.getAttribute('data-edge') ?? hit.tagName) }
  })

  // Pointer-transparent, so the hit test resolves straight past it.
  expect(centre.hit).toBe('left')

  // And a real click at that same point turns the page back, rather than
  // landing on a strip of cloth and doing nothing at all.
  await page.mouse.click(centre.x, centre.y)
  await expect(page).toHaveURL(/\/p\/2/)
})

test('keeps the bottom bar at the handoff’s 58px, and both arrows reachable inside it', async ({ page }) => {
  await page.goto('/p/3')
  await waitForLiveBook(page)

  const bar = await page.evaluate(() => {
    const prev = document.querySelector('[data-nav="prev"]')
    const next = document.querySelector('[data-nav="next"]')
    if (prev === null || next === null) return { height: 0, unreachable: ['the bar rendered no arrows'] }

    const row = prev.parentElement
    const unreachable = [prev, next].flatMap((arrow) => {
      const rect = arrow.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      if (hit === arrow || arrow.contains(hit)) return []
      const name = arrow.getAttribute('data-nav') ?? 'unnamed'
      return [hit === null ? `${name}: off-viewport` : `${name}: covered by ${hit.tagName}`]
    })

    return { height: Math.round(row?.getBoundingClientRect().height ?? 0), unreachable }
  })

  // Both numbers in one assertion: a bar that is 58px with an arrow under the
  // rail, and a bar that grew to fit its contents, are the two failures this
  // case exists to tell apart.
  expect(bar).toEqual({ height: 58, unreachable: [] })
})

test('lifts the active tab out of the rail and onto the page', async ({ page }) => {
  await page.goto('/p/3')
  await waitForLiveBook(page)

  const drawn = await page.evaluate(() => {
    const active = document.querySelector('[data-bookmark][aria-current="page"]')
    const resting = document.querySelector('[data-bookmark]:not([aria-current])')
    if (active === null || resting === null) return { active: 'no active tab', resting: 'no resting tab' }

    const read = (tab: Element): string => {
      const style = getComputedStyle(tab)
      return `${style.transform} on ${style.backgroundColor}`
    }
    return { active: read(active), resting: read(resting) }
  })

  // `#fbf6e9` is the page's own paper and `matrix(1, 0, 0, 1, -6, 0)` is
  // SCREENS.md §1.7's `translateX(-6px)`: together they are what makes the
  // tab read as part of the sheet the reader is on rather than part of the
  // rail. The resting tab is read in the same run so a stylesheet that failed
  // to load could not pass this case with two identical "none"s.
  expect(drawn).toEqual({
    active: 'matrix(1, 0, 0, 1, -6, 0) on rgb(251, 246, 233)',
    resting: 'none on rgba(120, 98, 60, 0.07)',
  })
})

test('scrolls the bookmark rail without ever showing a scrollbar', async ({ page }) => {
  await page.goto('/p/1')
  await waitForLiveBook(page)

  // Forced short, so the thirteen tabs overflow at every project rather than
  // only at the two where they happen to. A case that asserted scrolling only
  // where the rail already overflowed would prove nothing on `desktop`.
  await page.setViewportSize({ width: 1000, height: 460 })

  const column = await page.evaluate(() => {
    const tabs = document.querySelector('[data-rail-tabs]')
    if (tabs === null) throw new Error('the rail rendered no scrolling column')

    tabs.scrollTop = 40
    return {
      overflows: tabs.scrollHeight > tabs.clientHeight,
      // A classic scrollbar takes width out of the client box; a hidden or an
      // overlay one takes none. This browser draws overlay scrollbars, so the
      // gutter alone cannot tell "hidden" from "drawn over the content" —
      // which is exactly why the declared property is read as well. Measured
      // rather than assumed: with the diary-wide rule removed, `gutter` stayed
      // 0 here and `scrollbarWidth` did not.
      gutter: tabs.getBoundingClientRect().width - tabs.clientWidth,
      scrollbarWidth: getComputedStyle(tabs).scrollbarWidth,
      scrolled: tabs.scrollTop,
    }
  })

  // Content still scrolls (SCREENS.md §1.7 hides the indicator, not the
  // overflow) — a rail that had been made `overflow: hidden` to lose the
  // scrollbar would fail on `scrolled`, not on `gutter`.
  expect(column).toEqual({ overflows: true, gutter: 0, scrollbarWidth: 'none', scrolled: 40 })
})

test('keeps one journey’s tab marked across all three of its pages', async ({ page }) => {
  // SCREENS.md §1.7's `[start, start+3)` span, walked as a reader walks it:
  // three separate addresses, one tab. Tokyo is the first seeded journey, so
  // its notes page is page 3 and its tab opens leaf 2.
  await page.goto('/p/3')
  await waitForLiveBook(page)
  const onNotes = await markedTab(page)

  await page.goto('/p/4')
  await waitForLiveBook(page)
  const onFramesI = await markedTab(page)

  await page.goto('/p/5')
  await waitForLiveBook(page)
  const onFramesII = await markedTab(page)

  await page.goto('/p/6')
  await waitForLiveBook(page)
  const onTheNextJourney = await markedTab(page)

  expect({ onNotes, onFramesI, onFramesII, onTheNextJourney }).toEqual({
    onNotes: '2',
    onFramesI: '2',
    onFramesII: '2',
    // Page 6 is the second journey's notes page, one past the exclusive end
    // of Tokyo's span - the off-by-one this rule exists to pin down.
    onTheNextJourney: '5',
  })
})

test('prints the counter and the page label of the address it was opened at', async ({ page }) => {
  await page.goto('/p/13')
  await waitForLiveBook(page)

  const readout = await page.evaluate(() => ({
    counter: document.querySelector('[data-counter]')?.textContent ?? 'no counter',
    label: document.querySelector('[data-page-label]')?.textContent ?? 'no page label',
  }))

  // The label was absent entirely until this task
  // (docs/qa/2026-09-01-diary-sweep.md, DIARY-005). Page 13 is the fourth
  // seeded journey's FIRST FRAMES page, so the label has to name both the
  // journey and which of its three pages this is - a label taken from the
  // bookmark tab alone would read "Marrakech" on all three.
  expect(readout).toEqual({ counter: '13 / 33', label: 'Marrakech — Frames I' })
})

test('marks the tab of the journey a bookmark jump lands on, not the one it left', async ({ page }) => {
  await page.goto('/p/1')
  await waitForLiveBook(page)
  expect(await markedTab(page)).toBe('0')

  await page.locator('[data-bookmark="11"]').click()
  await expect(page).toHaveURL(/\/p\/12/)

  await expect(page.locator('[data-bookmark="11"]')).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('[data-bookmark="0"]')).not.toHaveAttribute('aria-current', 'page')
})

test('reaches every bookmark tab from the keyboard, with the focus visible on each', async ({ page }) => {
  await page.goto('/p/3')
  await waitForLiveBook(page)

  // Start at the control before the rail and walk in with real Tab presses.
  // `.focus()` on each tab in turn would prove they are focusABLE without
  // proving they are REACHABLE, and would not set `:focus-visible` at all —
  // that flag is the browser's own answer to "did a keyboard do this?".
  await page.locator('[data-nav="next"]').focus()

  const reached: string[] = []
  let outlined = 0
  for (let step = 0; step < 13; step += 1) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate(() => {
      const active = document.activeElement
      if (active === null) return { bookmark: 'nothing focused', outlineStyle: 'none' }
      return {
        bookmark: active.getAttribute('data-bookmark') ?? `${active.tagName} (not a bookmark)`,
        outlineStyle: getComputedStyle(active).outlineStyle,
      }
    })
    reached.push(stop.bookmark)
    if (stop.outlineStyle !== 'none') outlined += 1
  }

  // All thirteen seeded bookmarks, in rail order, each showing where the
  // keyboard is. The tab indices are the pages they open, so this also says
  // the focus order follows the reading order rather than the paint order.
  expect({ reached, outlined }).toEqual({
    reached: ['0', '1', '2', '5', '8', '11', '14', '17', '20', '23', '26', '29', '32'],
    outlined: 13,
  })
})
