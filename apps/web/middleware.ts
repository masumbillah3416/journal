/**
 * middleware.ts — routes a `/p/<n>` request to the reading surface it is served.
 *
 * Adapter (CLAUDE.md §3.3, Ports & Adapters): it reads two signals off the
 * request, hands them to `servedReadingSurface` and turns that decision into a
 * Next.js response. It takes no decision of its own - the surface is
 * `@travel-diary/domain/readingSurface`'s, gated at 100%, and is the same
 * function `SurfaceCorrection` uses in the browser, so the two halves cannot
 * drift apart.
 *
 * WHY THE SURFACE IS A ROUTE AND NOT AN `if` INSIDE ONE. The diary draws one
 * of two reading surfaces (`docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md`),
 * and while both were chosen by a branch inside a single `/p/[n]` page,
 * Turbopack compiled both component trees into that one route's chunk group:
 * the book's readers downloaded the mobile mode's client half and 23,923 bytes
 * of its stylesheet, and phones downloaded the book's. `next/dynamic` does not
 * split it - measured twice - because the split Turbopack performs is per
 * ROUTE ENTRY, not per import. Two entries split it exactly:
 * `/p/[n]` compiles only `Book`, `/m/[n]` only `MobileDiary`, and this
 * middleware is what puts a request on the right one. The measurements are in
 * `docs/adr/0012-two-route-entries-for-two-reading-surfaces.md`.
 *
 * IT REWRITES, IT DOES NOT REDIRECT, and that is the point of doing this here
 * rather than with two public addresses. The reader's address stays `/p/<n>`,
 * so a page has exactly one address to share, one to index and one to declare
 * canonical, on both surfaces - which is what design spec §8 asked `/p/<n>`
 * for. A redirect would also cost every mobile page load a round trip, against
 * a budget `docs/adr/0008-lcp-budget-and-the-framework-floor.md` shows has
 * none to give.
 *
 * `/m/<n>` IS NOT AN ADDRESS, and this file is what keeps it from becoming
 * one. Next.js does not run middleware again on its own rewrites, so every
 * `/m/<n>` request that reaches here came from outside - a crawler that found
 * the path, or a reader who typed it - and is sent to `/p/<n>` with a 308, the
 * page's one public address. Without that, the diary would answer to two
 * addresses for every page and hand a crawler thirty-three duplicates.
 *
 * WHY NOT `next.config.ts` REWRITES. A `has` clause can match a cookie or a
 * user-agent regex, but it would be a SECOND definition of which reader gets
 * which surface - written in configuration no test collects, next to a domain
 * function that is gated at 100% precisely so that decision is written once.
 *
 * Depends on: `servedReadingSurface`/`rememberedSurface`
 * (@travel-diary/domain/readingSurface), `NextResponse`/`userAgent`
 * (next/server).
 */
import { rememberedSurface, servedReadingSurface } from '@travel-diary/domain/readingSurface'
import type { NextRequest } from 'next/server'
import { NextResponse, userAgent } from 'next/server'

/** Where the mobile reading surface's own route entry lives. */
const MOBILE_ROUTE_PREFIX = '/m/'

/** Where the book's route entry lives, and the only address either surface is served at. */
const PAGE_ROUTE_PREFIX = '/p/'

/**
 * Sends a diary page request to the route entry that renders the surface it is
 * served, without moving the address the reader sees.
 *
 * @param request - The incoming request, for a path this file's `config`
 *   matcher narrowed to `/p/…` or `/m/…`.
 * @returns A rewrite onto `/m/<n>` for a reader served the mobile surface, a
 *   308 back onto `/p/<n>` for a direct request for the internal path, and an
 *   untouched pass-through for everyone else.
 */
export const middleware = (request: NextRequest): NextResponse => {
  const { pathname } = request.nextUrl

  if (pathname.startsWith(MOBILE_ROUTE_PREFIX)) {
    const address = request.nextUrl.clone()
    address.pathname = `${PAGE_ROUTE_PREFIX}${pathname.slice(MOBILE_ROUTE_PREFIX.length)}`
    return NextResponse.redirect(address, 308)
  }

  const surface = servedReadingSurface({
    remembered: rememberedSurface(request.headers.get('cookie') ?? undefined),
    device: userAgent({ headers: request.headers }).device.type,
  })
  if (surface === 'book') return NextResponse.next()

  const entry = request.nextUrl.clone()
  entry.pathname = `${MOBILE_ROUTE_PREFIX}${pathname.slice(PAGE_ROUTE_PREFIX.length)}`
  return NextResponse.rewrite(entry)
}

/**
 * The paths this middleware runs on: the diary's page address and the mobile
 * surface's route entry, and nothing else. Payload's `/api` and `/cms`, the
 * gallery, `/_next` and every static asset are left alone, so nothing outside
 * the two reading surfaces pays for a middleware hop.
 */
export const config = { matcher: ['/p/:path*', '/m/:path*'] }
