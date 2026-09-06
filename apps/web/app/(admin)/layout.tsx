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
 * `--td-font-*` tokens `admin.css` redefines. They are imported from the
 * diary group's `fonts.ts` rather than re-declared: `next/font/local`
 * registers each face once per MODULE, so a second declaration of the same
 * five files would emit a second set of `@font-face` rules and a second
 * preload for bytes the browser already has. The module's folder is a legacy
 * of the diary being the first surface to need type, not a statement that the
 * faces belong to it.
 * Depends on: ./admin.css (which imports the token custom properties),
 * ../(diary)/fonts.ts.
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
import { caveat, courierPrime, ebGaramond } from '../(diary)/fonts'

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
