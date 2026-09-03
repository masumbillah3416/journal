/**
 * frames.spec.ts — the Frames I and Frames II pages' browser-only guarantees
 * (SCREENS.md §1.4, §1.5).
 *
 * Everything here needs a real layout engine. What the two components DECIDE
 * — which slot goes in which frame, which lines they print, which decorations
 * they draw — is covered without a browser in
 * `apps/web/components/pages/FramesI.test.tsx` and `FramesII.test.tsx`, and
 * their appearance by the baselines in `e2e/visual.spec.ts`. Three things
 * only a laid-out page can answer are here.
 *
 * 1 · THE ROTATIONS ARE AUTHORED, NOT JITTER. SCREENS.md gives each of the
 *    seven photographs its own angle — −1.4°, −1.2°, −0.7°, −0.5°, +0.8°,
 *    +1.0°, +1.5° — and they are read back out of the resolved transform
 *    matrix, one case per page, to three decimal places. Rounded to whole
 *    degrees (the technique `e2e/notes.spec.ts` uses for its two badges at
 *    −6° and +5°) six of these seven collapse onto −1, 0 or +1 and the case
 *    would pass against a page that had swapped them.
 *
 * 2 · THE GRID IS THE DESIGN. Both pages are `1fr`-tracked grids whose
 *    photographs are sized by the tracks rather than by their own aspect
 *    ratio, so a wrong span is not a small visual difference — it is a
 *    photograph in the wrong cell. `gridColumnStart`/`gridRowEnd` are read
 *    per mount rather than inferred from bounding boxes, because two adjacent
 *    cells of equal size are indistinguishable by rect alone.
 *
 * 3 · THE FOCAL POINT MOVES THE CROP, on a `frame`-role slot rather than on
 *    a hero. `e2e/notes.spec.ts` proved this for the Notes hero; the wiring
 *    that carries it reaches seven more photographs per journey here, and a
 *    version of it that held only for the hero would look identical in every
 *    screenshot. The method is the same one that spec sets out: assert
 *    `object-fit` is `cover` (an `object-position` on a `fill` image is
 *    inert), assert the computed value, then screenshot the element twice —
 *    once at its own focal point, once forced back to the centre — and
 *    require the two buffers to DIFFER. `apps/web/scripts/seed-data.ts` gives
 *    Tokyo's first Frames I slot and third Frames II slot the seed's only
 *    non-default frame focal points, so there is something real to move.
 *
 * EVERY SELECTOR IS SCOPED TO ONE LEAF, for the reason `e2e/notes.spec.ts`'s
 * header sets out at length: `Book.tsx` renders all thirty-three leaves at
 * once, so `[data-page="frames-i"]` alone matches ten sections.
 *
 * Depends on: @playwright/test, the running app from playwright.config.ts's
 * `webServer`, and the seeded diary (`npm run db:seed`) — Tokyo's Frames I at
 * `/p/4` and Frames II at `/p/5`.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { drawsMobileReadingMode } from './support/surface'

// SCREENS.md §1.10 replaces the book below 860px - "No book, no flip, no
// scaling" - so this file's subject does not exist at the `mobile` project.
// The mobile reading mode has its own suite in `e2e/mobile.spec.ts`; see
// `e2e/support/surface.ts` for why this is a skip rather than a rewrite.
test.skip(({ viewport }) => drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

/** Tokyo's Frames I page: the first journey's second page, three photographs. */
const TOKYO_FRAMES_I_PAGE = 4

/** Tokyo's Frames II page: the first journey's third page, four photographs. */
const TOKYO_FRAMES_II_PAGE = 5

/** The focal points `apps/web/scripts/seed-data.ts` gives Tokyo's two off-centre frame slots. */
const TOKYO_FRAME_FOCALS = {
  framesIp1: { x: 22, y: 78 },
  framesIIp3: { x: 80, y: 24 },
} as const

/**
 * A CSS selector for a frames section on the leaf a 1-based page number
 * occupies. See this file's header for why the scope is necessary.
 * @param pageNumber - The 1-based page number, as it appears in `/p/<n>`.
 * @param kind - Which of the two frames pages that number addresses.
 * @returns A selector matching exactly one frames section.
 */
const framesSelector = (pageNumber: number, kind: 'frames-i' | 'frames-ii'): string =>
  `[data-leaf="${String(pageNumber - 1)}"] [data-page="${kind}"]`

/**
 * Opens a frames page and returns a locator for its section alone.
 * @param page - The Playwright page.
 * @param pageNumber - The 1-based page number to open.
 * @param kind - Which of the two frames pages that number addresses.
 * @returns The frames section on that leaf, already asserted visible.
 */
const openFrames = async (page: Page, pageNumber: number, kind: 'frames-i' | 'frames-ii'): Promise<Locator> => {
  await page.goto(`/p/${String(pageNumber)}`)
  const frames = page.locator(framesSelector(pageNumber, kind))
  await expect(frames).toBeVisible()
  return frames
}

/** One mount's authored geometry, as read back out of the laid-out page. */
interface MountGeometry {
  readonly gridColumnStart: string
  readonly gridColumnEnd: string
  readonly gridRowStart: string
  readonly gridRowEnd: string
  readonly rotationDeg: number
  readonly padding: string
  readonly captionSize: string
}

/**
 * Reads every mount on a frames page, in document order.
 *
 * The rotation comes out of the resolved transform MATRIX rather than the
 * authored string, which Chromium does not echo — and is reported to three
 * decimal places rather than rounded, because six of this task's seven
 * authored angles round to the same three integers (see this file's header).
 * @param page - The Playwright page, already on the frames page.
 * @param selector - The frames section's own selector.
 * @returns Each mount's grid placement, rotation, padding and caption size.
 */
const readMounts = async (page: Page, selector: string): Promise<readonly MountGeometry[]> =>
  page.evaluate((scope) => {
    const mounts = [...document.querySelectorAll<HTMLElement>(`${scope} [data-mount]`)]
    return mounts.map((mount) => {
      const style = getComputedStyle(mount)
      const matrix = new DOMMatrix(style.transform)
      const caption = mount.querySelector('figcaption')
      return {
        gridColumnStart: style.gridColumnStart,
        gridColumnEnd: style.gridColumnEnd,
        gridRowStart: style.gridRowStart,
        gridRowEnd: style.gridRowEnd,
        rotationDeg: Number(((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI).toFixed(3)),
        padding: style.padding,
        captionSize: caption === null ? 'no caption' : getComputedStyle(caption).fontSize,
      }
    })
  }, selector)

/**
 * Proves a slot's focal point is actually cropping the photograph, not merely
 * present as an attribute — the method `e2e/notes.spec.ts` establishes.
 * @param photograph - The `<img>` under test.
 * @param focal - The focal point the seed gives that slot.
 */
const expectTheCropToMove = async (
  photograph: Locator,
  focal: { readonly x: number; readonly y: number },
): Promise<void> => {
  // Decoded, not merely attached: a screenshot of an image still being
  // decoded is a race, not a measurement.
  await photograph.evaluate(async (node) => {
    if (node instanceof HTMLImageElement) await node.decode()
  })

  const applied = await photograph.evaluate((node) => {
    const style = getComputedStyle(node)
    return { objectFit: style.objectFit, objectPosition: style.objectPosition }
  })

  // `object-position` only means anything while the image is being cropped.
  expect(applied.objectFit).toBe('cover')
  expect(applied.objectPosition).toBe(`${String(focal.x)}% ${String(focal.y)}%`)

  const atFocalPoint = await photograph.screenshot()
  await photograph.evaluate((node) => {
    if (node instanceof HTMLElement) node.style.objectPosition = '50% 50%'
  })
  const atCentre = await photograph.screenshot()

  // The proof: the same element, the same box, the same photograph, and
  // different pixels.
  expect(atFocalPoint.equals(atCentre)).toBe(false)
}

test.describe('Frames I — SCREENS.md §1.4', () => {
  const TOKYO = framesSelector(TOKYO_FRAMES_I_PAGE, 'frames-i')

  test.beforeEach(async ({ page }) => {
    await openFrames(page, TOKYO_FRAMES_I_PAGE, 'frames-i')
  })

  test('holds the page at its authored padding, gap and two rows', async ({ page }) => {
    const box = await page.evaluate((selector) => {
      const node = document.querySelector(selector)
      if (node === null) return null
      const style = getComputedStyle(node)
      return { padding: style.padding, gap: style.rowGap, rows: style.gridTemplateRows.split(' ').length }
    }, TOKYO)

    // "grid-template-rows: auto 1fr, padding 30px 44px 30px 52px, gap 16px."
    expect(box?.padding).toBe('30px 44px 30px 52px')
    expect(box?.gap).toBe('16px')
    expect(box?.rows).toBe(2)
  })

  test('splits the photo grid 1.5fr / 1fr over two rows with a 22px / 24px gap', async ({ page }) => {
    const grid = await page.evaluate((selector) => {
      const node = document.querySelector(`${selector} [data-frames-grid]`)
      if (node === null) return null
      const style = getComputedStyle(node)
      const [left, right] = style.gridTemplateColumns.split(' ').map(Number.parseFloat)
      return {
        rowGap: style.rowGap,
        columnGap: style.columnGap,
        rows: style.gridTemplateRows.split(' ').length,
        ratio: (left ?? 0) / (right ?? 1),
      }
    }, TOKYO)

    // "Grid 1.5fr 1fr x 1fr 1fr, gap 22px 24px." The ratio is read back from
    // the two resolved track widths rather than from the authored string,
    // which Chromium does not echo.
    expect(grid?.rowGap).toBe('22px')
    expect(grid?.columnGap).toBe('24px')
    expect(grid?.rows).toBe(2)
    expect(grid?.ratio).toBeCloseTo(1.5, 2)
  })

  test('places all three photographs in their authored cells', async ({ page }) => {
    const mounts = await readMounts(page, TOKYO)

    expect(
      mounts.map(({ gridColumnStart, gridColumnEnd, gridRowStart, gridRowEnd }) => ({
        gridColumnStart,
        gridColumnEnd,
        gridRowStart,
        gridRowEnd,
      })),
    ).toEqual([
      // "P1 column 1, spanning both rows."
      { gridColumnStart: '1', gridColumnEnd: 'auto', gridRowStart: '1', gridRowEnd: 'span 2' },
      // "P2 column 2 row 1."
      { gridColumnStart: '2', gridColumnEnd: 'auto', gridRowStart: '1', gridRowEnd: 'auto' },
      // "P3 column 2 row 2."
      { gridColumnStart: '2', gridColumnEnd: 'auto', gridRowStart: '2', gridRowEnd: 'auto' },
    ])
  })

  test('rotates each mount by its own authored angle, not by a shared jitter', async ({ page }) => {
    const mounts = await readMounts(page, TOKYO)

    // "P1 rotate(-.7deg) ... P2 rotate(1deg) ... P3 rotate(-1.4deg)".
    expect(mounts.map((mount) => mount.rotationDeg)).toEqual([-0.7, 1, -1.4])
  })

  test('gives each mount its authored padding and caption size', async ({ page }) => {
    const mounts = await readMounts(page, TOKYO)

    // "P1 ... mount padding 12px 12px 0, caption 26px ... P2 padding
    //  10px 10px 0, caption 23px ... P3 caption 23px".
    expect(mounts.map(({ padding, captionSize }) => ({ padding, captionSize }))).toEqual([
      { padding: '12px 12px 0px', captionSize: '26px' },
      { padding: '10px 10px 0px', captionSize: '23px' },
      { padding: '10px 10px 0px', captionSize: '23px' },
    ])
  })

  test('tapes the washi strip to the first mount at its authored offset and angle', async ({ page }) => {
    const washi = await page.evaluate((selector) => {
      const strips = [...document.querySelectorAll<HTMLElement>(`${selector} [data-decoration="washi"]`)]
      const first = strips[0]
      if (first === undefined) return { count: strips.length }
      const style = getComputedStyle(first)
      const matrix = new DOMMatrix(style.transform)
      return {
        count: strips.length,
        top: style.top,
        right: style.right,
        rotationDeg: Number(((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI).toFixed(3)),
        inFirstMount: document.querySelector(`${selector} [data-mount="p1"]`)?.contains(first) ?? false,
      }
    }, TOKYO)

    // "washi at top: -14px; right: 22px rotate(4deg)" — one strip on this
    // page, and it belongs to P1's mount rather than to the page.
    expect(washi).toEqual({ count: 1, top: '-14px', right: '22px', rotationDeg: 4, inFirstMount: true })
  })

  test('prints the journey, the frame range and the dates in the header, verbatim', async ({ page }) => {
    const header = page.locator(`${TOKYO} header`)

    // SCREENS.md's copy is final (CLAUDE.md §9, Pass 3), including the spaced
    // en dash in "Frames 01 – 03".
    await expect(header.getByRole('heading', { level: 1 })).toHaveText('Tokyo')
    await expect(header).toContainText('Frames 01 – 03')
    await expect(header).toContainText('12 – 24 March 2025')
  })

  test('carries no footer at all, unlike every other journey page', async ({ page }) => {
    // SCREENS.md §1.4 gives this page two grid rows and no footer; §1.5 gives
    // Frames II three and a footer. A footer here would eat the photo grid's
    // `1fr` track.
    await expect(page.locator(`${TOKYO} footer`)).toHaveCount(0)
  })

  test('crops a frame photograph at its slot’s focal point, not at the centre', async ({ page }) => {
    await expectTheCropToMove(page.locator(`${TOKYO} [data-mount="p1"] img`), TOKYO_FRAME_FOCALS.framesIp1)
  })
})

test.describe('Frames II — SCREENS.md §1.5', () => {
  const TOKYO = framesSelector(TOKYO_FRAMES_II_PAGE, 'frames-ii')

  test.beforeEach(async ({ page }) => {
    await openFrames(page, TOKYO_FRAMES_II_PAGE, 'frames-ii')
  })

  test('holds the page at its authored padding, gap and three rows', async ({ page }) => {
    const box = await page.evaluate((selector) => {
      const node = document.querySelector(selector)
      if (node === null) return null
      const style = getComputedStyle(node)
      return { padding: style.padding, gap: style.rowGap, rows: style.gridTemplateRows.split(' ').length }
    }, TOKYO)

    expect(box?.padding).toBe('30px 44px 24px 52px')
    expect(box?.gap).toBe('16px')
    // Three rows, because this page has the footer Frames I does not.
    expect(box?.rows).toBe(3)
  })

  test('splits the photo grid into three equal columns over two rows with a 20px / 22px gap', async ({ page }) => {
    const grid = await page.evaluate((selector) => {
      const node = document.querySelector(`${selector} [data-frames-grid]`)
      if (node === null) return null
      const style = getComputedStyle(node)
      const widths = style.gridTemplateColumns.split(' ').map(Number.parseFloat)
      return {
        rowGap: style.rowGap,
        columnGap: style.columnGap,
        rows: style.gridTemplateRows.split(' ').length,
        columns: widths.length,
        // `1fr 1fr 1fr` splits an odd number of pixels three ways, so equality
        // is asserted to within a pixel rather than exactly.
        equalColumns: Math.max(...widths) - Math.min(...widths) <= 1,
      }
    }, TOKYO)

    expect(grid).toEqual({ rowGap: '20px', columnGap: '22px', rows: 2, columns: 3, equalColumns: true })
  })

  test('places all four photographs in their authored cells', async ({ page }) => {
    const mounts = await readMounts(page, TOKYO)

    expect(
      mounts.map(({ gridColumnStart, gridColumnEnd, gridRowStart, gridRowEnd }) => ({
        gridColumnStart,
        gridColumnEnd,
        gridRowStart,
        gridRowEnd,
      })),
    ).toEqual([
      // "P1 column 1, both rows."
      { gridColumnStart: '1', gridColumnEnd: 'auto', gridRowStart: '1', gridRowEnd: 'span 2' },
      // "P2 column 2 row 1."
      { gridColumnStart: '2', gridColumnEnd: 'auto', gridRowStart: '1', gridRowEnd: 'auto' },
      // "P3 column 3 row 1."
      { gridColumnStart: '3', gridColumnEnd: 'auto', gridRowStart: '1', gridRowEnd: 'auto' },
      // "P4 columns 2-3 row 2."
      { gridColumnStart: '2', gridColumnEnd: 'span 2', gridRowStart: '2', gridRowEnd: 'auto' },
    ])
  })

  test('rotates each mount by its own authored angle, not by a shared jitter', async ({ page }) => {
    const mounts = await readMounts(page, TOKYO)

    // "P1 rotate(.8deg) ... P2 rotate(-1.2deg) ... P3 rotate(1.5deg) ...
    //  P4 rotate(-.5deg)".
    expect(mounts.map((mount) => mount.rotationDeg)).toEqual([0.8, -1.2, 1.5, -0.5])
  })

  test('gives each mount its authored caption size', async ({ page }) => {
    const mounts = await readMounts(page, TOKYO)

    // "P1 ... caption 24px ... P2 ... caption 22px ... P3 [no caption size
    //  stated, so it keeps its neighbour's 22px] ... P4 ... caption 23px".
    expect(mounts.map((mount) => mount.captionSize)).toEqual(['24px', '22px', '22px', '23px'])
  })

  test('tapes the washi strip to the third mount at its authored offset and angle', async ({ page }) => {
    const washi = await page.evaluate((selector) => {
      const strips = [...document.querySelectorAll<HTMLElement>(`${selector} [data-decoration="washi"]`)]
      const first = strips[0]
      if (first === undefined) return { count: strips.length }
      const style = getComputedStyle(first)
      const matrix = new DOMMatrix(style.transform)
      return {
        count: strips.length,
        top: style.top,
        left: style.left,
        rotationDeg: Number(((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI).toFixed(3)),
        inThirdMount: document.querySelector(`${selector} [data-mount="p3"]`)?.contains(first) ?? false,
      }
    }, TOKYO)

    // "P3 ... with washi at top: -13px; left: 18px rotate(-5deg)".
    expect(washi).toEqual({ count: 1, top: '-13px', left: '18px', rotationDeg: -5, inThirdMount: true })
  })

  test('prints the journey, the frame range and the place in the header, verbatim', async ({ page }) => {
    const header = page.locator(`${TOKYO} header`)

    // "Same header pattern ("Frames 04 – 07", place on the right)."
    await expect(header.getByRole('heading', { level: 1 })).toHaveText('Tokyo')
    await expect(header).toContainText('Frames 04 – 07')
    await expect(header).toContainText('Japan')
  })

  test('prints the gallery button, the count and the frames line in the footer, verbatim', async ({ page }) => {
    const footer = page.locator(`${TOKYO} footer`)

    // "Footer: gallery button, count, and "Only a few frames live in the
    // book"." The button is an anchor to a real path, never a click handler —
    // see `Notes.tsx`'s header for the defect that rule comes from.
    // As `e2e/notes.spec.ts`: this page's own number rides along, so the
    // gallery's back control returns the reader to page 5.
    await expect(footer.getByRole('link', { name: /See full gallery/ })).toHaveAttribute(
      'href',
      '/gallery/tokyo?from=5',
    )
    await expect(footer).toContainText('photographs and')
    await expect(footer).toContainText('clips in the gallery')
    await expect(footer).toContainText('Only a few frames live in the book')
  })

  test('crops a frame photograph at its slot’s focal point, not at the centre', async ({ page }) => {
    await expectTheCropToMove(page.locator(`${TOKYO} [data-mount="p3"] img`), TOKYO_FRAME_FOCALS.framesIIp3)
  })
})
