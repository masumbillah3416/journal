/**
 * bookAccess — the two `site` settings the PUBLIC diary answers to, read once
 * per request and turned into two decisions.
 *
 * `SECURITY.md`, Public site, states both: *"The `password the whole book`
 * setting must gate server-side. A client-side check leaves the content
 * fetchable"* and *"Respect `indexGalleries` in `robots.txt` **and** with
 * `X-Robots-Tag`, since the pages are statically served"*. Until Phase 4 Task
 * 13 nothing in this repository read either for the diary, and
 * `docs/security.md` recorded the first as **"STILL NOT DISCHARGED: THERE IS
 * NO GATE"**. This module is what the diary's three route entries now ask
 * before they draw anything.
 *
 * ═══ WHY THE GATE IS HERE AND NOT IN THE MIDDLEWARE ═══
 *
 * `apps/web/middleware.ts` runs on every `/p/` and `/m/` request and would be
 * the obvious home. It cannot be, for exactly the reason
 * `apps/web/lib/auth/guard.ts` gives for the session guard: the middleware
 * runs in Next.js's Edge runtime, where `pg` and Payload do not exist, and
 * the setting lives in Postgres. A gate that could only read a cookie would
 * refuse nobody.
 *
 * ═══ THE REFUSAL IS A 401, AND IT CARRIES NO `WWW-Authenticate` ═══
 *
 * The route entries spend {@link bookIsGated} by calling `unauthorized()`
 * (`next/navigation`), which answers **HTTP 401** and renders
 * `app/(diary)/unauthorized.tsx`. It needs `experimental.authInterrupts` in
 * `apps/web/next.config.ts`, which is why that flag is there.
 *
 * NO CHALLENGE HEADER, and that is a decision with two measurements behind
 * it rather than an omission. FIRST, a Next.js page component cannot set a
 * response header at all: `next/headers`' `headers()` is read-only,
 * `next/server` exports no header API to a page, and `metadata.robots`
 * emits a `<meta>` tag and no `X-Robots-Tag` (measured against this app on
 * Next 16.3.3). SECOND, and independently: `DATA_MODEL.md` stores no book
 * password anywhere and `SCREENS.md` §2.9 offers no field to set one, so a
 * `WWW-Authenticate: Basic` challenge would prompt a reader for a credential
 * that cannot exist and invite a brute force against nothing. `passwordProtect`
 * is therefore a CLOSED book rather than a passworded one, and the screen and
 * this module both say so. `docs/deviations.md` §100 carries it.
 *
 * ═══ AN UNSET COLUMN IS THE DEFAULT THE COLLECTION DECLARES ═══
 *
 * Postgres hands back `null` for a checkbox nobody has ever written, and the
 * two defaults point in OPPOSITE directions (`apps/web/globals/site.ts`:
 * `passwordProtect` false, `indexGalleries` true). So neither predicate
 * coerces the other's way: a fresh install's book is open and its galleries
 * are indexed, which is what the field declarations say.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository at one remove — one module owns how
 * the public settings are fetched, and no route sees a Payload document. The
 * two predicates are pure functions over the DTO it returns.
 *
 * INVARIANT — ONE ROUND TRIP PER REQUEST. Every public page of the diary asks
 * this question, and `generateMetadata` and the page component are two
 * invocations of the same request, so the read is wrapped in React's `cache`.
 * `bookAccess.integration.test.ts` pins the `select` and the count.
 * Depends on: `cache` (react), `getPayload` (./payload).
 */
import { cache } from 'react'
import { getPayload } from './payload'

/** What the public diary asks the `site` global, and nothing more. */
export interface PublicAccess {
  /** SCREENS.md §2.9's "password the whole book". */
  readonly passwordProtect: boolean
  /** SCREENS.md §2.9's "let search engines index galleries". */
  readonly indexGalleries: boolean
}

/**
 * The two public settings, read from the `site` global.
 *
 * `depth: 0` and a two-column `select` (CLAUDE.md §7): this is on the
 * critical path of every page of the book, so it does not pay for the
 * description, the analytics id or the reply-to address.
 *
 * Wrapped in React's `cache` so a route entry that asks in
 * `generateMetadata` AND in its component pays for one statement, not two.
 * @returns Both settings, with an unwritten column resolved to the default
 *   `apps/web/globals/site.ts` declares for it.
 * @throws From Payload, when the database is unreachable — which is a page
 *   this repository cannot draw either way.
 * @example
 * const access = await readPublicAccess()
 * if (bookIsGated(access)) unauthorized()
 */
export const readPublicAccess = cache(async (): Promise<PublicAccess> => {
  const payload = await getPayload()
  const site = await payload.findGlobal({
    slug: 'site',
    depth: 0,
    select: { passwordProtect: true, indexGalleries: true },
  })

  return {
    // `=== true` and `!== false` are the two DIFFERENT coercions the two
    // declared defaults require. See this module's header.
    passwordProtect: site.passwordProtect === true,
    indexGalleries: site.indexGalleries !== false,
  }
})

/**
 * Whether the whole book is closed to readers.
 *
 * @param access - What {@link readPublicAccess} answered.
 * @returns `true` when the author has passworded the whole book, in which
 *   case the route entry answers 401 and draws nothing.
 * @example
 * if (bookIsGated(await readPublicAccess())) unauthorized()
 */
export const bookIsGated = (access: Pick<PublicAccess, 'passwordProtect'>): boolean => access.passwordProtect

/**
 * Whether a crawler is invited to index the galleries.
 *
 * @param access - What {@link readPublicAccess} answered.
 * @returns `true` while the author allows it. `app/robots.ts` turns `false`
 *   into `Disallow: /gallery/`, and the gallery route into a `noindex`
 *   directive of its own — a `robots.txt` alone does not unindex a URL a
 *   crawler already knows, which is why `SECURITY.md` asks for both.
 * @example
 * const robots = galleriesAreIndexable(access) ? undefined : { index: false }
 */
export const galleriesAreIndexable = (access: Pick<PublicAccess, 'indexGalleries'>): boolean => access.indexGalleries
