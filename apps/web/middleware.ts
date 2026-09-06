/**
 * middleware.ts — the two things that have to happen before a route is
 * entered: a `/p/<n>` request is routed to the reading surface it is served,
 * and an `/admin` request is put through the admin's own request policy.
 *
 * Adapter (CLAUDE.md §3.3, Ports & Adapters): it reads a few signals off the
 * request, hands them to a decision function and turns that decision into a
 * Next.js response. It takes no decision of its own - the surface is
 * `@travel-diary/domain/readingSurface`'s, gated at 100%, and is the same
 * function `SurfaceCorrection` uses in the browser, so the two halves cannot
 * drift apart; the admin's policy is `lib/auth/adminAccess.ts`'s, unit-tested
 * beside it.
 *
 * ═══ WHY THE ADMIN'S POLICY IS HERE AND ITS GUARD IS NOT ═══
 *
 * THREE THINGS BELONG IN A MIDDLEWARE and are here: the admin's security
 * headers, the cross-site refusal, and the identifier minted for a browser
 * that has never signed in. Each has to happen for EVERY admin request,
 * including one for a screen Phase 4 has not written yet, and each can be
 * decided from a path, a method and two origins.
 *
 * ONE THING DOES NOT BELONG HERE AND IS DELIBERATELY ABSENT: deciding whether
 * a request is authenticated. This file runs in Next.js's Edge runtime, where
 * `pg`, Payload and `node:crypto` do not exist, so the only question it could
 * answer is whether a cookie is PRESENT — and the answer would be worthless,
 * because the value this very file mints for an anonymous browser is carried
 * in that same cookie. A presence check would admit every revoked session,
 * every expired one, and every visitor who has ever loaded the sign-in page.
 * `lib/auth/guard.ts` is the authority, it runs in the Node server, and
 * `lib/auth/adminGuardRegistration.test.ts` is what stops a later screen
 * forgetting to call it. Do not add a second, weaker check here.
 *
 * THE DIARY'S OWN HEADERS ARE UNTOUCHED, and the negative cases in
 * `middleware.test.ts` are what keep them that way: none of the admin's
 * headers reaches a `/p/<n>` response, a `/m/<n>` rewrite or the 308 off the
 * internal path, and no cookie is minted for a reader who will never sign in.
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
 * (next/server), ./lib/auth/adminAccess, ./lib/auth/browserSession.
 */
import { rememberedSurface, servedReadingSurface } from '@travel-diary/domain/readingSurface'
import type { NextRequest } from 'next/server'
import { NextResponse, userAgent } from 'next/server'
import {
  ADMIN_SECURITY_HEADERS,
  isAdminPath,
  isCrossSiteMutation,
  isGuardedAdminPath,
  isMutation,
} from './lib/auth/adminAccess'
import { browserSessionCookie, newBrowserSession, readBrowserSession } from './lib/auth/browserSession'

/** Where the mobile reading surface's own route entry lives. */
const MOBILE_ROUTE_PREFIX = '/m/'

/** Where the book's route entry lives, and the only address either surface is served at. */
const PAGE_ROUTE_PREFIX = '/p/'

/** What a cross-site mutation is answered with: nothing, under a 403. */
const CROSS_SITE_REFUSED_STATUS = 403

/**
 * The same response, carrying every header an admin response must have.
 *
 * Applied to what is refused as well as to what is admitted: a 403 with no
 * `frame-ancestors` is a 403 that can be framed, and a refusal is exactly the
 * response an attacker gets to look at.
 *
 * @param response - The response so far.
 * @returns The same object, for chaining.
 */
const withAdminHeaders = (response: NextResponse): NextResponse => {
  for (const [name, value] of Object.entries(ADMIN_SECURITY_HEADERS)) response.headers.set(name, value)
  return response
}

/**
 * Puts one `/admin` request through the admin's request policy.
 *
 * @param request - The incoming request, for a path under `/admin`.
 * @returns A 403 for a mutation that did not come from one of our own pages,
 *   otherwise a pass-through carrying the admin's headers — and, for a browser
 *   arriving at a public admin address without one, a freshly minted pre-auth
 *   identifier.
 */
const admittedAdminRequest = (request: NextRequest): NextResponse => {
  const { pathname, origin } = request.nextUrl
  const method = request.method

  if (isCrossSiteMutation({ method, origin: request.headers.get('origin'), target: origin })) {
    return withAdminHeaders(new NextResponse(null, { status: CROSS_SITE_REFUSED_STATUS }))
  }

  const response = withAdminHeaders(NextResponse.next())

  // MINTED ONLY WHERE IT ANSWERS SOMETHING, AND ONLY WHEN THE BROWSER HAS
  // NONE. `signIn.ts` requires a non-null `browserSession` and
  // `otpService.issueChallenge` binds the code to it, so a browser arriving at
  // the sign-in screen for the first time needs one. Minting on a guarded path
  // would hand an identifier to a request the guard is about to refuse;
  // minting on a mutation would fight the handler, which sets its own on the
  // response it answers with; and minting over an identifier the browser
  // ALREADY holds would replace a signed-in reader's session with a pre-auth
  // value on their next page load.
  const mintable = !isMutation(method) && !isGuardedAdminPath(pathname)
  if (mintable && readBrowserSession(request.headers.get('cookie')) === null) {
    response.headers.append('Set-Cookie', browserSessionCookie(newBrowserSession()))
  }

  return response
}

/**
 * Sends a diary page request to the route entry that renders the surface it is
 * served, without moving the address the reader sees.
 *
 * @param request - The incoming request, for a path this file's `config`
 *   matcher narrowed to `/p/…`, `/m/…` or `/admin/…`.
 * @returns For the admin, whatever {@link admittedAdminRequest} decides. For
 *   the diary, a rewrite onto `/m/<n>` for a reader served the mobile surface,
 *   a 308 back onto `/p/<n>` for a direct request for the internal path, and
 *   an untouched pass-through for everyone else.
 */
export const middleware = (request: NextRequest): NextResponse => {
  const { pathname } = request.nextUrl

  if (isAdminPath(pathname)) return admittedAdminRequest(request)

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
 * The paths this middleware runs on: the diary's page address, the mobile
 * surface's route entry, and the bespoke admin. Payload's `/api` and `/cms`,
 * the gallery, `/_next` and every static asset are left alone, so nothing
 * outside those three pays for a middleware hop.
 *
 * `/admin/:path*` MATCHES `/admin` ITSELF as well as everything under it —
 * `:path*` allows zero segments — which matters because `/admin` is the panel
 * Phase 4 builds and it must not be the one address the policy misses.
 *
 * PAYLOAD'S OWN ADMIN IS NOT UNDER THIS PREFIX and is deliberately left out:
 * `payload.config.ts` moved it to `/cms`, it authenticates with Payload's own
 * cookie rather than this one, and it serves a bundled application whose
 * scripts this file's CSP was not written for.
 */
export const config = { matcher: ['/p/:path*', '/m/:path*', '/admin/:path*'] }
