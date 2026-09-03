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
import { drawsMobileReadingMode } from './support/surface'

// SCREENS.md §1.10 replaces the book below 860px - "No book, no flip, no
// scaling" - so this file's subject does not exist at the `mobile` project.
// The mobile reading mode has its own suite in `e2e/mobile.spec.ts`; see
// `e2e/support/surface.ts` for why this is a skip rather than a rewrite.
test.skip(({ viewport }) => drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

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

  test('renders the title in the self-hosted Caveat face, not the fallback', async ({ page }) => {
    // The tempting check here — `document.fonts.check('124px Caveat')` — is a
    // trap, verified directly against this route: it returns `true` even
    // when nothing self-hosted is involved, because the Font Loading spec's
    // `check()` returns `true` for a family with NO matching FontFace at
    // all (there is nothing pending to wait for). `next/font/local` also
    // never registers a `@font-face` literally named "Caveat" — it
    // generates its own family (`caveat`), so a family-name string
    // comparison against the literal handoff token is not a safe
    // regression guard either.
    //
    // The real assertion: read the computed `font-family` the browser is
    // ACTUALLY using, then confirm `document.fonts` (the set of FontFace
    // objects a real `@font-face` rule put there) contains an entry for
    // that exact family with status `loaded`. If the wiring ever reverted
    // to the bare handoff stack (`'Caveat', cursive`, neither of which has
    // any `@font-face` behind it), no such entry would exist and this fails.
    await page.evaluate(() => document.fonts.ready)
    const result = await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[data-page="cover"] h1')
      if (node === null) return null
      const style = getComputedStyle(node)
      const firstFamily = (style.fontFamily.split(',')[0]?.trim() ?? '').replace(/^["']|["']$/g, '')
      const hasLoadedFace = [...document.fonts].some(
        (face) =>
          face.family.replace(/^["']|["']$/g, '').toLowerCase() === firstFamily.toLowerCase() &&
          face.status === 'loaded',
      )
      return { fontSize: style.fontSize, firstFamily, hasLoadedFace }
    })

    expect(result).not.toBeNull()
    expect(result?.fontSize).toBe('124px')
    expect(result?.hasLoadedFace).toBe(true)
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

  test('renders the meta line in the self-hosted Garamond face', async ({ page }) => {
    // Same technique as the Cover's Caveat check: read the family the
    // browser actually computed, then confirm `document.fonts` holds a
    // `loaded` FontFace for it — not `document.fonts.check()` against the
    // literal handoff name, which returns `true` vacuously for a family with
    // no `@font-face` at all (see the Cover test's comment).
    await page.evaluate(() => document.fonts.ready)
    const result = await page.evaluate(() => {
      const firstFamily = (family: string) => (family.split(',')[0]?.trim() ?? '').replace(/^["']|["']$/g, '')
      const hasLoadedFace = (family: string) =>
        [...document.fonts].some(
          (face) =>
            face.family.replace(/^["']|["']$/g, '').toLowerCase() === family.toLowerCase() && face.status === 'loaded',
        )
      const meta = document.querySelector<HTMLElement>('[data-contents-body] li:first-child span:nth-child(3)')
      if (meta === null) return null
      const metaFamily = firstFamily(getComputedStyle(meta).fontFamily)
      return {
        metaText: meta.textContent,
        metaLoaded: hasLoadedFace(metaFamily),
      }
    })

    expect(result).not.toBeNull()
    expect(result?.metaText).toContain('Japan')
    expect(result?.metaLoaded).toBe(true)
  })

  test('renders the Courier eyebrow in the self-hosted Courier Prime face', async ({ page }) => {
    // This case replaces a fallback-PINNING test that asserted the opposite:
    // `font-family === '"Courier Prime", monospace'`, deliberately written so
    // that wiring Courier Prime back in would fail loudly rather than pass
    // silently. Courier Prime has now been wired in - not because the LCP
    // measurement behind the deferral stopped reproducing (it does), but
    // because the route models most of its budget before any of this
    // repository's code runs (docs/adr/0008-lcp-budget-and-the-framework-
    // floor.md). The pin has served its purpose, and is replaced by the same
    // positive assertion the Caveat and Garamond cases make: read the family
    // the browser actually computed,
    // then require a `loaded` FontFace for it. `document.fonts.check()` is
    // still not used here, for the reason the Cover case's comment gives.
    await page.evaluate(() => document.fonts.ready)
    const result = await page.evaluate(() => {
      const eyebrow = document.querySelector<HTMLElement>('[data-page="contents"] header p:first-child')
      if (eyebrow === null) return null
      const style = getComputedStyle(eyebrow)
      const firstFamily = (style.fontFamily.split(',')[0]?.trim() ?? '').replace(/^["']|["']$/g, '')
      const hasLoadedFace = [...document.fonts].some(
        (face) =>
          face.family.replace(/^["']|["']$/g, '').toLowerCase() === firstFamily.toLowerCase() &&
          face.status === 'loaded',
      )
      return { text: eyebrow.textContent, firstFamily, hasLoadedFace }
    })

    expect(result).not.toBeNull()
    expect(result?.text).toBe('Index')
    expect(result?.firstFamily).not.toBe('Courier Prime')
    expect(result?.hasLoadedFace).toBe(true)
  })

  test('has a real EB Garamond italic face behind the italic meta line, not a synthesised slant', async ({ page }) => {
    // `contents.module.css`'s `.meta` sets `font-style: italic` on
    // `--td-font-garamond`. Until the italic file was wired in, the browser
    // synthesised the slant from the upright face; `document.fonts` is what
    // distinguishes the two, because a synthesised oblique adds no FontFace.
    await page.evaluate(() => document.fonts.ready)
    const italics = await page.evaluate(() => {
      const meta = document.querySelector<HTMLElement>('[data-contents-body] li:first-child span:nth-child(3)')
      if (meta === null) return null
      const style = getComputedStyle(meta)
      const family = (style.fontFamily.split(',')[0]?.trim() ?? '').replace(/^["']|["']$/g, '')
      return {
        fontStyle: style.fontStyle,
        hasItalicFace: [...document.fonts].some(
          (face) =>
            face.family.replace(/^["']|["']$/g, '').toLowerCase() === family.toLowerCase() &&
            face.style === 'italic' &&
            face.status === 'loaded',
        ),
      }
    })

    expect(italics?.fontStyle).toBe('italic')
    expect(italics?.hasItalicFace).toBe(true)
  })
})
