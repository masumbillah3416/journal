/**
 * layout.tsx — root layout for the public diary route group.
 *
 * The `(diary)` group is its own Next.js root layout, parallel to
 * `(payload)`'s: Payload's admin wraps every one of its routes in its own
 * `RootLayout`, and the diary must not inherit that chrome. Two sibling root
 * layouts under two route groups is Next's own supported shape for exactly
 * this - a public surface and an admin surface that share a domain but no
 * document.
 *
 * It carries nothing but the document and the stylesheet, because everything
 * visible belongs to `<Book>`: the diary's chrome that sits OUTSIDE the
 * scaled design box (bookmark rail, bottom bar, page counter) lives in
 * `components/chrome/`, and each page's own title, description and canonical
 * link are `generateMetadata`'s in `p/[n]/page.tsx`. This layout also wraps
 * `not-found.tsx`, so an address naming no page is drawn on the diary's own
 * document rather than on Next's bare default.
 *
 * All three `next/font/local` variable classes (Caveat, EB Garamond,
 * Courier Prime) are applied to `<html>` so their generated `--font-*`
 * custom properties are in scope for the `--td-font-*` tokens `diary.css`
 * redefines - see fonts.ts's header for why `next/font/local` rather than
 * `next/font/google`, and docs/adr/0005-font-hosting.md for the decision
 * record. Courier Prime and EB Garamond's italic were deferred from Phase 1
 * on an LCP measurement that still reproduces - and were wired in anyway,
 * because the route models 2,023ms of its 2,500ms budget with no
 * application code on it at all and paints in ~130ms whatever the fonts do.
 * The class list below is the whole of what re-enabling them took; the
 * reasoning and the numbers are in
 * docs/adr/0008-lcp-budget-and-the-framework-floor.md.
 * Depends on: ./diary.css (which imports the token custom properties), ./fonts.ts.
 */
/* c8 ignore start -- The document shell: a Next.js root layout is never
 * imported by any test in either Vitest config (rendering one needs a real
 * Next request/render context), and there is no integration pass that could
 * reach it either, so a per-file c8 ignore is CLAUDE.md §2.1's honest
 * treatment for a file nothing can measure - not exclude-and-regate, which
 * would promise a pass that does not exist. Its runtime behaviour is covered
 * in the browser by e2e/smoke.spec.ts (zero console errors on /p/1),
 * e2e/a11y.spec.ts and e2e/book.spec.ts. Wraps the import too, not just the
 * export: an unimported file's imports are themselves uncovered lines. */
import type { Metadata } from 'next'
import type React from 'react'
import './diary.css'
import { caveat, courierPrime, ebGaramond } from './fonts'

/**
 * The diary's fallback document title. Every `/p/<n>` overrides it with the
 * page's own (`generateMetadata` in `p/[n]/page.tsx`, from `pageMetadata`);
 * what is left inheriting it is the one diary view that is not a page of the
 * book - `not-found.tsx`, which an address naming no page renders.
 */
export const metadata: Metadata = {
  title: 'Travel Diary',
}

/** Wraps every public diary route in the document the book is drawn into. */
const DiaryLayout = ({ children }: { readonly children: React.ReactNode }): React.JSX.Element => (
  <html lang="en" className={`${caveat.variable} ${ebGaramond.variable} ${courierPrime.variable}`}>
    <body>{children}</body>
  </html>
)

export default DiaryLayout
/* c8 ignore stop */
