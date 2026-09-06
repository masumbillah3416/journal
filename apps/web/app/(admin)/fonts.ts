/**
 * fonts.ts — the admin group's own `next/font/local` declarations, from the
 * same five files the diary's are declared from.
 *
 * ═══ WHY THIS IS A SECOND DECLARATION AND NOT AN IMPORT ═══
 *
 * `layout.tsx` imported `../(diary)/fonts` until Phase 2 Task 11's fix round,
 * on the reasoning that `next/font/local` registers each face once per MODULE
 * and a second declaration emits a second `@font-face` set for bytes the
 * browser already has. That reasoning is sound WITHIN one document and there
 * is no document that loads both: `(diary)` and `(admin)` have separate root
 * layouts, so moving between them is a full page load. Nothing was ever saved.
 *
 * What it cost was paid by the public diary. A module reachable from two route
 * entries cannot be merged into either entry's stylesheet, so Turbopack
 * emitted it as a chunk of its own — and that chunk was then referenced by
 * `/p/1`, which is the route `CLAUDE.md` §6's LCP budget gates. Measured on
 * this host, on a deleted `.next`, against a production build:
 *
 *   both modules shared      `/p/1` served 4 stylesheets   LCP 3,078.3ms  RED
 *   this module unshared     `/p/1` served 3 stylesheets
 *   both unshared            `/p/1` served 2 stylesheets   (main's shape)
 *
 * Each shared module cost the diary one extra render-blocking request. That is
 * the admin surface leaking into the public book across the seam
 * `docs/adr/0012-two-route-entries-for-two-reading-surfaces.md` drew two route
 * entries to keep apart, and it is why the declaration is duplicated here
 * rather than the budget being moved. The whole ruling, with every number and
 * the option it rejected, is
 * `docs/adr/0019-the-admin-performance-gate-and-the-css-seam.md`.
 *
 * ═══ WHAT IS DUPLICATED, AND WHAT IS NOT ═══
 *
 * The DECLARATIONS are duplicated — about 1.8KB of `@font-face` CSS, served
 * only to a reader who has signed in. The FILES are not: `src` points at the
 * same five `.woff2` files, `next/font/local` copies each to a content-hashed
 * URL under `_next/static/media/`, and identical bytes hash the same, so both
 * surfaces reference the same asset URLs. The generated `font-family` names
 * differ between the two declarations, which is `next/font`'s own scoping and
 * is invisible to both documents because neither loads the other's stylesheet.
 *
 * The path crosses into `(diary)/fonts/` for the files themselves. That is an
 * asset reference rather than a module import, so it creates no shared module
 * and no chunk — and the folder is where it is because the diary was the first
 * surface to need type, not because the faces belong to it.
 *
 * Every option in `../(diary)/fonts.ts`'s header still applies unchanged:
 * `display: 'swap'`, `adjustFontFallback` left on, `preload` left on.
 *
 * Depends on: `next/font/local`, all five files in `../(diary)/fonts/`.
 * Imported only by `./layout.tsx`, which is itself never imported by any test
 * (see that file's `c8 ignore` note). Not under a bracketed route segment, so
 * `c8 ignore` is trusted here per vitest.config.ts's documented finding.
 */
/* c8 ignore start -- see module header, and `../(diary)/fonts.ts`'s: the real
 * `next/font/local` implementation only exists inside the Next.js compiler, so
 * importing this file under Vitest throws rather than executing normally.
 * Nothing here can be unit-tested; that the admin's faces actually render is
 * asserted in the browser by e2e/visual.spec.ts's `admin-*` baselines and by
 * e2e/a11y.spec.ts's contrast cases on the cloth panel and the masthead. */
import localFont from 'next/font/local'

/** Caveat, 400 only — `SCREENS.md` §3's "Welcome back" and its three siblings. */
export const caveat = localFont({
  src: '../(diary)/fonts/caveat-400.woff2',
  weight: '400',
  style: 'normal',
  display: 'swap',
  variable: '--font-caveat',
})

/** EB Garamond, 400 upright and 400 italic — the pane's body copy and its fields. */
export const ebGaramond = localFont({
  src: [
    { path: '../(diary)/fonts/eb-garamond-400.woff2', weight: '400', style: 'normal' },
    { path: '../(diary)/fonts/eb-garamond-italic.woff2', weight: '400', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-eb-garamond',
})

/** Courier Prime, 400 and 700 — the eyebrows, the buttons and the six code cells. */
export const courierPrime = localFont({
  src: [
    { path: '../(diary)/fonts/courier-prime-regular.woff2', weight: '400', style: 'normal' },
    { path: '../(diary)/fonts/courier-prime-bold.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-courier-prime',
})
/* c8 ignore stop */
