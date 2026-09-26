/**
 * robots.ts — `/robots.txt`, generated from the `site` global rather than
 * served as a file.
 *
 * ═══ WHY IT REPLACED THE STATIC FILE UNDER `public/` ═══
 *
 * `SECURITY.md` requires `site.indexGalleries` to be respected "in
 * `robots.txt` **and** with `X-Robots-Tag`", and a static file under
 * `public/` cannot consult a database. The file it replaces said so in its
 * own header, and `docs/security.md`'s `indexGalleries` row named this module
 * by path as the mechanism Phase 4 owed. The directives that do NOT depend on
 * a setting — `/cms` and `/admin`, both authenticated — are unchanged, and
 * `e2e/routing.spec.ts` still asserts them off the served response.
 *
 * ═══ IT IS DYNAMIC, AND THAT IS THE WHOLE POINT OF IT ═══
 *
 * Next.js prerenders a metadata route at build time by default, which would
 * bake whatever `indexGalleries` happened to be during the build and serve
 * that until the next deploy — so the author's toggle would appear to work
 * on a development server and do nothing in production, which is the worst
 * of the three possible outcomes. `dynamic = 'force-dynamic'` is what makes
 * the answer a function of the setting rather than of the build.
 *
 * MEASURED RATHER THAN ASSUMED, TWICE. `next build` without this line prints
 * `○ /robots.txt` and the production server answers `x-nextjs-cache: HIT`;
 * with it, the same build prints `ƒ /robots.txt`. And `e2e/bookGate.spec.ts`
 * toggles the setting against an ALREADY-RUNNING server and reads
 * `/robots.txt` back both ways round — run against that production build
 * without this line, `disallows the galleries in robots.txt when the author
 * has turned indexing off` fails. A development server proves neither, because
 * `next dev` prerenders nothing.
 *
 * ═══ IT IS NOT THE WHOLE REQUIREMENT ═══
 *
 * A `Disallow` asks a crawler not to FETCH a path; it does not remove a URL
 * the crawler already knows from an index. That is why `SECURITY.md` asks for
 * both halves, and the second is the `noindex` directive
 * `app/(diary)/gallery/[slug]/page.tsx` carries from the same setting — see
 * that file, and `docs/deviations.md` §101 for the mechanism it is delivered
 * with and the one it is not.
 * Depends on: `MetadataRoute` (next), `readPublicAccess`/`galleriesAreIndexable`
 * (../lib/bookAccess).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: read the
 * two public settings and return Next's own robots shape. The one decision it
 * appears to take - whether the galleries are indexable - is
 * `galleriesAreIndexable`'s, executed against a real Payload by
 * `apps/web/lib/bookAccess.integration.test.ts`. It cannot be measured by
 * either Vitest config (a metadata route needs a real Next request context,
 * and no integration test can supply one), so a per-file c8 ignore is
 * CLAUDE.md §2.1's honest treatment. This file is NOT under a bracketed
 * directory, so the hint is read here - the control for that is
 * `(diary)/layout.tsx`, which this coverage pass reports as 0 of 0. Its
 * runtime behaviour is covered in the browser by e2e/routing.spec.ts (the
 * permissive default) and e2e/bookGate.spec.ts (both sides of the toggle). */
import type { MetadataRoute } from 'next'
import { galleriesAreIndexable, readPublicAccess } from '../lib/bookAccess'

/**
 * Read per request, never prerendered. See this module's header — a baked
 * `robots.txt` would make the author's toggle a no-op in production.
 */
export const dynamic = 'force-dynamic'

/** The two authenticated surfaces, which are `Disallow`ed whatever the settings say. */
const ALWAYS_DISALLOWED = ['/cms', '/admin']

/** Where a gallery lives, as a crawler would match it. */
const GALLERIES = '/gallery/'

/**
 * What a crawler may read of the public diary.
 *
 * @returns Next's own robots shape, which it serialises to `/robots.txt`.
 * @example
 * // indexGalleries off:
 * // User-agent: *
 * // Allow: /
 * // Disallow: /cms
 * // Disallow: /admin
 * // Disallow: /gallery/
 */
const robots = async (): Promise<MetadataRoute.Robots> => {
  const access = await readPublicAccess()

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: galleriesAreIndexable(access) ? ALWAYS_DISALLOWED : [...ALWAYS_DISALLOWED, GALLERIES],
    },
  }
}

export default robots
/* c8 ignore stop */
