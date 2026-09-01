/**
 * pages.spec.ts — the Cover and Contents pages' browser-only guarantees.
 *
 * Everything here needs a real layout engine, which is why it is a Playwright
 * spec rather than a jsdom test. What the two components DECIDE is already
 * covered without a browser (`apps/web/components/pages/Cover.test.tsx`,
 * `Contents.test.tsx`) and so is the arithmetic behind those decisions
 * (`packages/domain/src/coverTitle.test.ts`, `contentsLayout.test.ts`). This
 * file covers the three things only a laid-out page can answer:
 *
 *   1. **The absolute measurements are absolute.** SCREENS.md §1's numbers are
 *      CSS pixels inside the 1300x860 design box, which `Book.tsx` draws with
 *      `transform: scale(k)`. A transform takes no part in layout, so
 *      `offsetTop`/`offsetLeft`/`offsetWidth` still report the authored value
 *      at every viewport — which is exactly the claim worth asserting, and the
 *      reason these cases run at all three viewport projects. If a future
 *      change made a page responsive, these numbers would move at 390px and
 *      not at 1440px, and this file would catch it.
 *   2. **The title actually fits.** `fitTitleSize` sizes the title from an
 *      estimate of Caveat's advance width, not from a measurement — no font
 *      metrics exist on the server. Only a browser can confirm the estimate
 *      was good enough that the ellipsis floor never engages, and
 *      `scrollWidth <= clientWidth` is that confirmation.
 *   3. **The Contents index does not overflow.** SCREENS.md §1.2 claims zero
 *      overflow; the body is a `1fr` track between an `auto` header and an
 *      `auto` footer, so a row height that does not fit shows up here and
 *      nowhere else. Asserted for the entry count the seeded book actually
 *      renders — see docs/deviations.md §9 for why the multi-column count is
 *      still unverified in a browser.
 *
 * Depends on: @playwright/test, the running app from playwright.config.ts's
 * `webServer`, and the seeded diary (`npm run db:seed`) — the cover copy
 * asserted below is `apps/web/scripts/seed-data.ts`'s `bookGlobalSeed`.
 */
import { expect, test } from '@playwright/test'

/** The seeded `book` global's cover copy, asserted verbatim — this copy is final. */
const SEEDED = {
  title: 'Wanderings',
  subtitle: 'field notes, photographs and other scraps',
  owner: 'M. Alvarez',
  years: '2025 — 2026',
} as const

test.describe('Cover', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/p/1')
    await expect(page.locator('[data-page="cover"]')).toBeVisible()
  })

  test('prints the seeded cover copy, verbatim', async ({ page }) => {
    const cover = page.locator('[data-page="cover"]')

    await expect(cover.getByRole('heading', { level: 1 })).toHaveText(SEEDED.title)
    await expect(cover).toContainText('Travel Diary')
    await expect(cover).toContainText(SEEDED.subtitle)
    await expect(cover).toContainText(`Kept by ${SEEDED.owner}`)
    await expect(cover).toContainText(SEEDED.years)
  })

  test('holds the two nested rules at their authored insets, whatever the viewport', async ({ page }) => {
    const insets = await page.evaluate(() => {
      const cover = document.querySelector('[data-page="cover"]')
      if (cover === null) return null
      return [...cover.children]
        .filter((node) => node.getAttribute('aria-hidden') === 'true' && node.parentElement === cover)
        .slice(0, 2)
        .map((node) => {
          const style = getComputedStyle(node)
          return { top: style.top, left: style.left, borderTopWidth: style.borderTopWidth }
        })
    })

    // SCREENS.md §1.1: "inset: 22px at 1px solid ..., inset: 29px at 2.5px
    // solid ...". The second width reads back as `2px`, not `2.5px`: Chromium
    // snaps a computed border width to a whole CSS pixel (measured here at
    // devicePixelRatio 1 AND 3, so it is not a density effect). The authored
    // value in `cover.module.css` IS 2.5px, per SCREENS.md, and the rendered
    // difference between the two rules is what the visual baseline guards;
    // asserting `2.5px` here would only assert that Chromium had stopped
    // rounding.
    expect(insets).toEqual([
      { top: '22px', left: '22px', borderTopWidth: '1px' },
      { top: '29px', left: '29px', borderTopWidth: '2px' },
    ])
  })

  test('places the washi strip at the authored offset, in layout pixels the scale does not touch', async ({ page }) => {
    const washi = await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[data-decoration="washi"]')
      if (node === null) return null
      const matrix = new DOMMatrix(getComputedStyle(node).transform)
      return {
        top: node.offsetTop,
        left: node.offsetLeft,
        width: node.offsetWidth,
        height: node.offsetHeight,
        // The rotation read back out of the resolved matrix, rather than the
        // matrix itself: Chromium's own cosine of 7 degrees differs in the
        // sixth decimal place between builds, and a test that pinned those
        // digits would break on an image bump without anything having moved.
        rotationDeg: Math.round((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI),
      }
    })

    // SCREENS.md §1.1: "washi strip 190x36px at top: 52px; left: -26px, rotate(-7deg)".
    expect(washi).toEqual({ top: 52, left: -26, width: 190, height: 36, rotationDeg: -7 })
  })

  test('places the airmail stamp 32px from the bottom-right, at its authored size', async ({ page }) => {
    const stamp = await page.evaluate(() => {
      const mount = document.querySelector<HTMLElement>('[data-decoration="stamp"]')
      const face = mount?.firstElementChild
      if (mount === null || !(face instanceof HTMLElement)) return null
      const style = getComputedStyle(mount)
      return {
        right: style.right,
        bottom: style.bottom,
        padding: style.paddingTop,
        faceWidth: face.offsetWidth,
        faceHeight: face.offsetHeight,
      }
    })

    // SCREENS.md §1.1: "Airmail stamp at bottom: 32px; right: 32px ...: 5px
    // perforated mount ... around a 104x126px face".
    expect(stamp).toEqual({ right: '32px', bottom: '32px', padding: '5px', faceWidth: 104, faceHeight: 126 })
  })

  test('fits the title inside the cover column rather than falling back to the ellipsis', async ({ page }) => {
    // `fitTitleSize` sizes from an estimate of Caveat's advance width; only a
    // browser can confirm the estimate held. SCREENS.md §1.1 calls the
    // ellipsis "a last-resort floor only", so it must not be engaged here.
    const title = await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[data-page="cover"] h1')
      if (node === null) return null
      return { scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }
    })

    expect(title).not.toBeNull()
    expect(title?.scrollWidth).toBeLessThanOrEqual(title?.clientWidth ?? 0)
  })
})

test.describe('Contents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/p/2')
    await expect(page.locator('[data-page="contents"]')).toBeVisible()
  })

  test('prints its heading, its eyebrow and the seeded header note', async ({ page }) => {
    const contents = page.locator('[data-page="contents"]')

    await expect(contents.getByRole('heading', { level: 1 })).toHaveText('Contents')
    await expect(contents).toContainText('Index')
    await expect(contents).toContainText(
      'Each journey runs three pages — notes, then two spreads of frames. The rest lives in the galleries.',
    )
  })

  test('tallies the whole book in the footer, not the index', async ({ page }) => {
    // The seeded book is 33 pages (Cover + Contents + 10 x 3 + About); the
    // index holds ten entries. The footer counts pages.
    await expect(page.locator('[data-page="contents"] footer')).toContainText('33 pages so far')
  })

  test('holds the page grid at its authored padding and gap', async ({ page }) => {
    const box = await page.evaluate(() => {
      const node = document.querySelector('[data-page="contents"]')
      if (node === null) return null
      const style = getComputedStyle(node)
      return { padding: style.padding, gap: style.rowGap, rows: style.gridTemplateRows.split(' ').length }
    })

    // SCREENS.md §1.2: "grid-template-rows: auto 1fr auto, padding
    // 34px 46px 26px 52px, gap 20px."
    expect(box?.padding).toBe('34px 46px 26px 52px')
    expect(box?.gap).toBe('20px')
    expect(box?.rows).toBe(3)
  })

  test('flows the seeded ten entries into a single column, with the authored column gap', async ({ page }) => {
    const body = await page.evaluate(() => {
      const node = document.querySelector('[data-contents-body]')
      if (node === null) return null
      const style = getComputedStyle(node)
      return {
        columns: node.getAttribute('data-columns'),
        compact: node.getAttribute('data-compact'),
        autoFlow: style.gridAutoFlow,
        columnGap: style.columnGap,
      }
    })

    expect(body).toEqual({ columns: '1', compact: 'false', autoFlow: 'column', columnGap: '34px' })
  })

  test('does not overflow its own track — SCREENS.md §1.2’s "zero overflow"', async ({ page }) => {
    const body = await page.evaluate(() => {
      const node = document.querySelector('[data-contents-body]')
      if (node === null) return null
      return { scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }
    })

    expect(body).not.toBeNull()
    expect(body?.scrollHeight).toBeLessThanOrEqual(body?.clientHeight ?? 0)
  })

  test('keeps the footer inside the page rather than pushing it off the bottom', async ({ page }) => {
    const fits = await page.evaluate(() => {
      const page_ = document.querySelector('[data-page="contents"]')
      const footer = page_?.querySelector('footer')
      if (page_ === null || footer == null) return null
      return footer.getBoundingClientRect().bottom <= page_.getBoundingClientRect().bottom + 1
    })

    expect(fits).toBe(true)
  })

  test('gives every row a real anchor to the page its journey starts on', async ({ page }) => {
    const rows = page.locator('[data-contents-body] a')

    await expect(rows).toHaveCount(10)
    // The first journey's notes page is the third page of the book.
    await expect(rows.first()).toHaveAttribute('href', '/p/3')
  })
})
