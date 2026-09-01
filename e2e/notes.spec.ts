/**
 * notes.spec.ts — the Notes page's browser-only guarantees (SCREENS.md §1.3).
 *
 * Everything here needs a real layout engine. What the component DECIDES —
 * which lines it prints, which glyph it draws, how many highlights it lets
 * through — is covered without a browser in
 * `apps/web/components/pages/Notes.test.tsx`. What only a laid-out page can
 * answer is here, and two of these cases exist because of a defect that has
 * already happened once.
 *
 * 1 · THE HIGHLIGHT GAPS. SCREENS.md §1.3 carries a block quote explaining
 *    why the ephemera slot exists at all: "Fixed content plus leftover height
 *    produced a dead band, and `justify-content: space-between` on the
 *    highlight list dumped 232px into two gaps when a journey had three
 *    highlights instead of four." The fix is structural — the highlights are
 *    `flex: 0 0 auto` and sized to their content, and a media element takes
 *    the elastic space — so the regression this guards against is somebody
 *    reaching for `space-between`, `space-around` or a `1fr` row track to
 *    "fill the column" again. It is asserted on a THREE-highlight journey
 *    (Lisbon), because three is the case that broke; a four-highlight journey
 *    filled the column by accident and never showed the defect.
 *
 * 2 · THE FOCAL POINT. `readBookBundle` carries each slot's `focalX`/`focalY`
 *    through, and SCREENS.md is blunt about what happens if the page ignores
 *    them: "If this is not wired through to rendering, the admin's
 *    focal-point picker is decorative — that is the whole point of it." A
 *    test asserting only that `object-position` carries the right string
 *    would pass against a stylesheet that had `object-fit: fill` on the same
 *    element, where `object-position` does nothing at all. This one takes the
 *    rendered pixels twice — once at the slot's own focal point, once forced
 *    back to the centre — and requires them to differ, so what is asserted is
 *    that the crop MOVED, not that an attribute is present.
 *
 * 3 · The rest are SCREENS.md §1.3's absolute measurements, read back from
 *    the laid-out page. They run at all three viewport projects on purpose:
 *    the 1300x860 box is drawn with `transform: scale(k)`, a transform takes
 *    no part in layout, and so every one of these numbers must be identical
 *    at 1440px and at 390px. If a future change made this page responsive,
 *    these cases fail at one project and not another.
 *
 * EVERY SELECTOR IS SCOPED TO ONE LEAF. `Book.tsx` renders all thirty-three
 * leaves at once — that is what makes the flip a flip rather than a page
 * load — so `[data-page="notes"]` alone matches ten sections, one per
 * journey. `notesLeaf` narrows to the leaf a given page number occupies via
 * `Leaf.tsx`'s own `data-leaf` index, which is the same 0-based index the
 * page counter and the bookmark spans use.
 *
 * Depends on: @playwright/test, the running app from playwright.config.ts's
 * `webServer`, and the seeded diary (`npm run db:seed`) — Tokyo's four
 * highlights at `/p/3`, Lisbon's three at `/p/6`, and Tokyo's hero slot,
 * which is the seed's one non-default focal point.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'

/** Tokyo's notes page: the first journey's first page, four highlights. */
const TOKYO_NOTES_PAGE = 3

/** Lisbon's notes page: the second journey's first page, THREE highlights. */
const LISBON_NOTES_PAGE = 6

/**
 * The focal point `apps/web/scripts/seed-data.ts` gives Tokyo's hero slot —
 * the seed's only non-default one, so that this page's use of it is provable
 * in a browser rather than only in jsdom.
 */
const TOKYO_HERO_FOCAL = { x: 18, y: 82 } as const

/**
 * A CSS selector for the notes section on the leaf a 1-based page number
 * occupies. See this file's header for why the scope is necessary.
 * @param pageNumber - The 1-based page number, as it appears in `/p/<n>`.
 * @returns A selector matching exactly one `[data-page="notes"]`.
 */
const notesSelector = (pageNumber: number): string => `[data-leaf="${String(pageNumber - 1)}"] [data-page="notes"]`

/**
 * Opens a notes page and returns a locator for its section alone.
 * @param page - The Playwright page.
 * @param pageNumber - The 1-based page number to open.
 * @returns The notes section on that leaf, already asserted visible.
 */
const openNotes = async (page: Page, pageNumber: number): Promise<Locator> => {
  await page.goto(`/p/${String(pageNumber)}`)
  const notes = page.locator(notesSelector(pageNumber))
  await expect(notes).toBeVisible()
  return notes
}

test.describe('Notes — the highlight list never distributes leftover space', () => {
  test('a three-highlight journey does not open gaps between highlights', async ({ page }) => {
    const notes = await openNotes(page, LISBON_NOTES_PAGE)
    const highlights = notes.locator('[data-highlight]')
    await expect(highlights).toHaveCount(3)

    const gaps: number[] = []
    const count = await highlights.count()
    for (let index = 1; index < count; index += 1) {
      const previous = await highlights.nth(index - 1).boundingBox()
      const next = await highlights.nth(index).boundingBox()
      if (previous === null || next === null) throw new Error('highlight not laid out')
      gaps.push(next.y - (previous.y + previous.height))
    }

    // SCREENS.md §1.3 gives the list a 13px gap. The recorded defect dumped
    // 232px into these two. The bound is deliberately loose — this case is
    // about the difference between "sized to content" and "given the leftover
    // height", not about pinning 13 to the pixel, which the visual baseline
    // does. Measured in the scaled book, so a real gap is 13 x scale, which
    // is under 13 at every project this suite runs.
    expect(gaps).toHaveLength(2)
    for (const gap of gaps) expect(gap).toBeLessThan(30)
  })

  test('leaves the leftover height to the ephemera slot rather than to the highlights', async ({ page }) => {
    await openNotes(page, LISBON_NOTES_PAGE)

    const elastic = await page.evaluate((selector) => {
      const list = document.querySelector(`${selector} [data-highlights]`)
      const ephemera = document.querySelector(`${selector} [data-ephemera]`)
      if (list === null || !(ephemera instanceof HTMLElement)) return null
      return {
        listGrow: getComputedStyle(list).flexGrow,
        listJustify: getComputedStyle(list).justifyContent,
        ephemeraGrow: getComputedStyle(ephemera).flexGrow,
        ephemeraMinHeight: getComputedStyle(ephemera).minHeight,
        // The slot has to be MEASURABLY taller than its 54px floor on a
        // three-highlight page: that height is the leftover the highlights
        // did not take, and absorbing it is the whole reason the element
        // exists. `offsetHeight` is a layout pixel, untouched by the book's
        // `scale(k)`, so this number is the authored one at every viewport.
        ephemeraHeight: ephemera.offsetHeight,
      }
    }, notesSelector(LISBON_NOTES_PAGE))

    expect(elastic?.listGrow).toBe('0')
    expect(elastic?.listJustify).not.toBe('space-between')
    expect(elastic?.ephemeraGrow).toBe('1')
    expect(elastic?.ephemeraMinHeight).toBe('54px')
    expect(elastic?.ephemeraHeight ?? 0).toBeGreaterThan(54)
  })
})

test.describe('Notes — the focal point moves the crop', () => {
  test('crops the hero at the slot’s focal point, not at the centre', async ({ page }) => {
    const notes = await openNotes(page, TOKYO_NOTES_PAGE)
    const hero = notes.locator('[data-hero]')
    // Decoded, not merely attached: a screenshot of an image still being
    // decoded is a race, not a measurement.
    await hero.evaluate(async (node) => {
      if (node instanceof HTMLImageElement) await node.decode()
    })

    const applied = await hero.evaluate((node) => {
      const style = getComputedStyle(node)
      return { objectFit: style.objectFit, objectPosition: style.objectPosition }
    })

    // `object-position` only means anything while the image is being cropped.
    expect(applied.objectFit).toBe('cover')
    expect(applied.objectPosition).toBe(`${String(TOKYO_HERO_FOCAL.x)}% ${String(TOKYO_HERO_FOCAL.y)}%`)

    const atFocalPoint = await hero.screenshot()
    await hero.evaluate((node) => {
      if (node instanceof HTMLElement) node.style.objectPosition = '50% 50%'
    })
    const atCentre = await hero.screenshot()

    // The proof: the same element, the same box, the same photograph, and
    // different pixels. An `object-position` the browser is ignoring — because
    // the fit is `fill`, or because the styled element is not the image —
    // produces two identical buffers here and fails.
    expect(atFocalPoint.equals(atCentre)).toBe(false)
  })
})

test.describe('Notes — SCREENS.md §1.3’s absolute measurements', () => {
  const TOKYO = notesSelector(TOKYO_NOTES_PAGE)

  test.beforeEach(async ({ page }) => {
    await openNotes(page, TOKYO_NOTES_PAGE)
  })

  test('holds the page grid at its authored padding, gap and three rows', async ({ page }) => {
    const box = await page.evaluate((selector) => {
      const node = document.querySelector(selector)
      if (node === null) return null
      const style = getComputedStyle(node)
      return { padding: style.padding, gap: style.rowGap, rows: style.gridTemplateRows.split(' ').length }
    }, TOKYO)

    // "grid-template-rows: auto 1fr auto, padding 32px 44px 24px 52px, gap 18px."
    expect(box?.padding).toBe('32px 44px 24px 52px')
    expect(box?.gap).toBe('18px')
    expect(box?.rows).toBe(3)
  })

  test('splits the body 1.06fr / .94fr with a 36px gap', async ({ page }) => {
    const body = await page.evaluate((selector) => {
      const node = document.querySelector(`${selector} [data-notes-body]`)
      if (node === null) return null
      const style = getComputedStyle(node)
      const [left, right] = style.gridTemplateColumns.split(' ').map(Number.parseFloat)
      return { columnGap: style.columnGap, ratio: (left ?? 0) / (right ?? 1) }
    }, TOKYO)

    expect(body?.columnGap).toBe('36px')
    // 1.06 / .94, read back from the two resolved track widths rather than
    // from the authored string, which Chromium does not echo.
    expect(body?.ratio).toBeCloseTo(1.06 / 0.94, 2)
  })

  test('draws both badges as 98px circles at their authored rotations and borders', async ({ page }) => {
    const badges = await page.evaluate((selector) => {
      const read = (badge: string) => {
        const node = document.querySelector(`${selector} [data-badge="${badge}"]`)
        if (!(node instanceof HTMLElement)) return null
        const style = getComputedStyle(node)
        const matrix = new DOMMatrix(style.transform)
        return {
          width: node.offsetWidth,
          height: node.offsetHeight,
          borderStyle: style.borderTopStyle,
          // Rounded out of the resolved matrix rather than compared as a
          // string: Chromium's own cosine differs in the sixth decimal place
          // between builds, and pinning those digits would break on an image
          // bump with nothing having moved (same technique as e2e/pages.spec.ts).
          rotationDeg: Math.round((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI),
        }
      }
      return { weather: read('weather'), mood: read('mood') }
    }, TOKYO)

    // "two 98px circles ... Weather — 1.5px solid ..., rotate(-6deg) ...
    //  Mood — 1.5px dashed ..., rotate(5deg)".
    expect(badges.weather).toEqual({ width: 98, height: 98, borderStyle: 'solid', rotationDeg: -6 })
    expect(badges.mood).toEqual({ width: 98, height: 98, borderStyle: 'dashed', rotationDeg: 5 })
  })

  test('draws the weather glyph in CSS at its authored size', async ({ page }) => {
    const glyph = await page.evaluate((selector) => {
      const node = document.querySelector(`${selector} [data-weather-glyph]`)
      if (!(node instanceof HTMLElement)) return null
      return { kind: node.dataset['weatherGlyph'], width: node.offsetWidth, height: node.offsetHeight }
    }, TOKYO)

    // Tokyo's glyph is `sun`: "sun 16px circle #a34434".
    expect(glyph).toEqual({ kind: 'sun', width: 16, height: 16 })
  })

  test('divides the tally ticket into four equal cells', async ({ page }) => {
    const ticket = await page.evaluate((selector) => {
      const cells = [...document.querySelectorAll<HTMLElement>(`${selector} [data-tally-cell]`)]
      const [first, second] = cells
      if (first === undefined || second === undefined) return null
      // `offsetWidth`, not the bounding rect: the ticket is drawn at
      // `rotate(-.5deg)`, so a rect would report the rotated box rather than
      // the cell. Widths are compared with a one-pixel tolerance because
      // `flex: 1` splits an odd number of pixels four ways and the browser
      // rounds the remainder into one of them - a real inequality here is a
      // cell sized by its content, which is tens of pixels, not one.
      const widths = cells.map((cell) => cell.offsetWidth)
      return {
        count: cells.length,
        equalWidths: Math.max(...widths) - Math.min(...widths) <= 1,
        // "divided by 1px dotted": the divider sits BETWEEN cells, so the
        // first cell must not carry one.
        firstDivider: getComputedStyle(first).borderLeftStyle,
        secondDivider: getComputedStyle(second).borderLeftStyle,
      }
    }, TOKYO)

    expect(ticket).toEqual({ count: 4, equalWidths: true, firstDivider: 'none', secondDivider: 'dotted' })
  })

  test('fits the left column and the footer inside the page, on the four-highlight journey', async ({ page }) => {
    const fit = await page.evaluate((selector) => {
      const notes = document.querySelector(selector)
      const footer = notes?.querySelector('footer')
      const column = notes?.querySelector('[data-highlights]')?.parentElement
      const last = column?.lastElementChild
      if (notes == null || footer == null || column == null || !(last instanceof HTMLElement)) return null
      return {
        footerBelowPage: Math.round(footer.getBoundingClientRect().bottom - notes.getBoundingClientRect().bottom),
        // The bottom of the column's last child against the bottom of the
        // column's own content box, both in untransformed layout pixels and
        // both measured from the same offset parent (the page section, which
        // is the only positioned ancestor).
        //
        // NOT `scrollHeight`, which measures the scrollable overflow region
        // and therefore includes the ROTATED bounding boxes of the tally
        // ticket and the ephemera scrap — both deliberately crooked
        // (SCREENS.md §1.3 gives them -0.5deg and +0.5deg), each contributing
        // about a pixel and a half of bounding box that is design, not
        // overflow. Measured that way every notes page in the book "overflows"
        // by exactly 3px, on a column whose content fits perfectly.
        columnSpill: last.offsetTop + last.offsetHeight - (column.offsetTop + column.clientHeight),
      }
    }, TOKYO)

    // Tokyo is the journey with FOUR highlights and the longest note, so it
    // is the tightest of the ten: if the authored sizes do not fit, they fail
    // here first.
    expect(fit?.footerBelowPage ?? 1).toBeLessThanOrEqual(0)
    expect(fit?.columnSpill ?? 1).toBeLessThanOrEqual(0)
  })

  test('gives the gallery button a real path rather than a dead click target', async ({ page }) => {
    // The handoff's own defect log records gallery buttons that looked dead;
    // `e2e/book.spec.ts` exists because a back face was swallowing clicks. A
    // real anchor is what makes the target inspectable and indexable — and it
    // is what Task 13's own case (`getByRole('link', { name: /See full
    // gallery/ })`) will press.
    const button = page.locator(TOKYO).getByRole('link', { name: /See full gallery/ })

    await expect(button).toHaveAttribute('href', '/gallery/tokyo')
  })

  test('prints the seeded sign-off and gallery count in the footer, verbatim', async ({ page }) => {
    const footer = page.locator(`${TOKYO} footer`)

    // SCREENS.md's copy is final (CLAUDE.md §9, Pass 3).
    await expect(footer).toContainText('twelve days, one corner of it')
    await expect(footer).toContainText('photographs and')
    await expect(footer).toContainText('clips in the gallery')
  })
})
