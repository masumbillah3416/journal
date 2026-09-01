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
 * scaled design box (bookmark rail, bottom bar, page counter) is Task 12, and
 * the `/p/<n>` metadata is Task 13.
 * Depends on: ./diary.css (which imports the token custom properties).
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

/** The browser-tab title every diary page inherits until Task 13 gives each page its own. */
export const metadata: Metadata = {
  title: 'Travel Diary',
}

/** Wraps every public diary route in the document the book is drawn into. */
const DiaryLayout = ({ children }: { readonly children: React.ReactNode }): React.JSX.Element => (
  <html lang="en">
    <body>{children}</body>
  </html>
)

export default DiaryLayout
/* c8 ignore stop */
