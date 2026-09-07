/**
 * layout.tsx — root layout for the bespoke admin route group.
 *
 * A THIRD ROOT LAYOUT, alongside `(diary)`'s and `(payload)`'s, and for the
 * same reason the first two are separate: Payload wraps every one of its own
 * routes in its `RootLayout`, the diary has a document built around a scaled
 * paper object, and neither is the document an admin screen belongs in. Next's
 * own supported shape for surfaces that share a domain but no document is one
 * root layout per route group.
 *
 * WHY THE GROUP IS `(admin)` AND THE SEGMENT IS `admin`. The URL is
 * `/admin/sign-in`: the parenthesised group name is organisational and does
 * not appear in a path, and the `admin/` folder inside it is what does. That
 * address is not a preference - `apps/web/payload.config.ts` moves Payload's
 * own stock admin to `/cms` precisely so this panel can own `/admin`, and the
 * session cookie is scoped `Path=/admin`, which RFC 6265 sends only to
 * `/admin` and its descendants. A sign-in screen mounted anywhere else would
 * set a cookie it could never read back.
 *
 * IT CARRIES THE DOCUMENT AND THE STYLESHEET AND NOTHING ELSE. There is no
 * admin chrome here yet - the nav rail, the header and the ten screens behind
 * them are Phase 4 - and inventing one now would be an abstraction with a
 * single caller (CLAUDE.md §4).
 *
 * All three `next/font/local` variable classes are applied to `<html>` so
 * their generated `--font-*` custom properties are in scope for the
 * `--td-font-*` tokens `admin.css` redefines. They come from THIS group's own
 * `./fonts.ts`, not from the diary group's.
 *
 * THAT IS A CORRECTION, AND IT IS THE REASON THE DIARY'S LCP GATE WENT RED.
 * Until Phase 2 Task 11's fix round this file imported `../(diary)/fonts`, to
 * avoid a second `@font-face` set for bytes the browser already has. Nothing
 * was saved: `(diary)` and `(admin)` have separate root layouts, so no
 * document ever loads both and there is no browser that already has them. What
 * it cost was real — a module reachable from two route entries cannot be
 * merged into either entry's stylesheet, so it became a chunk of its own that
 * `/p/1` then had to fetch before it could paint. `./fonts.ts`'s header has
 * the measurements and what is and is not duplicated.
 * Depends on: ./admin.css (which imports the token custom properties),
 * ./fonts.ts.
 */
/* c8 ignore start -- The document shell: a Next.js root layout is never
 * imported by any test in either Vitest config (rendering one needs a real
 * Next request/render context), and there is no integration pass that could
 * reach it either, so a per-file c8 ignore is CLAUDE.md §2.1's honest
 * treatment for a file nothing can measure - not exclude-and-regate, which
 * would promise a pass that does not exist. Its runtime behaviour is covered
 * in the browser by e2e/signIn.spec.ts and e2e/a11y.spec.ts. Wraps the import
 * too, not just the export: an unimported file's imports are themselves
 * uncovered lines. */
import type { Metadata } from 'next'
import type React from 'react'
import './admin.css'
import { caveat, courierPrime, ebGaramond } from './fonts'

/**
 * The admin's fallback document title. `/admin/sign-in` overrides it with its
 * own; it is here so a screen added without one is still named.
 */
export const metadata: Metadata = {
  title: 'The back room',
}

/** Wraps every bespoke admin route in the document its screens are drawn into. */
const AdminLayout = ({ children }: { readonly children: React.ReactNode }): React.JSX.Element => (
  <html lang="en" className={`${caveat.variable} ${ebGaramond.variable} ${courierPrime.variable}`}>
    <body>{children}</body>
  </html>
)

export default AdminLayout
/* c8 ignore stop */
