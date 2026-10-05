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
 * the obvious home.
 *
 * THIS HEADER SAID IT "CANNOT BE, BECAUSE THE MIDDLEWARE RUNS IN THE EDGE
 * RUNTIME, WHERE `pg` AND PAYLOAD DO NOT EXIST". That was measured false by
 * the Task 13 review: on Next 16.3.3 the middleware runs on the Node runtime
 * when it asks to, and `apps/web/middleware.ts` now reads Postgres from there
 * for one header (`docs/deviations.md` §101). A reason that is not true is
 * worse than no reason, so it is struck.
 *
 * THE GATE IS STILL NOT THERE, and the true reason is a smaller one: a
 * middleware in front of every address is the wrong shape for a rule that
 * three of Payload's own routes also have to obey. The gap this gate actually
 * had was those three — REST, GraphQL and `/api/media/file/<name>` — and it
 * was closed at `apps/web/collections/media.ts`'s `read` rule, one predicate
 * behind all three, rather than by an interceptor in front of them. Moving an
 * authorization boundary onto another runtime is not a thing to do because it
 * became possible.
 *
 * ═══ THE REFUSAL IS A REDIRECT NOW, AND THIS SECTION IS ITS HISTORY ═══
 *
 * The route entries no longer spend {@link bookIsGated} directly. They spend
 * `readerMustUnlock` (`apps/web/lib/readerSession.ts`), which asks this
 * module whether the book is closed AND whether the request carries the
 * cookie a reader is handed for typing the password, and they REDIRECT a
 * stranger to `/unlock`. The gallery download route still answers 401,
 * because its body is meant to be a photograph and a browser following a
 * redirect there would save the unlock page as a file.
 *
 * WHAT THIS SECTION USED TO SAY, AND WHY IT IS WORTH KEEPING. It recorded two
 * measurements behind sending no `WWW-Authenticate` challenge: a Next.js page
 * component cannot set a response header at all (`next/headers`' `headers()`
 * is read-only, `next/server` exports no header API to a page, and
 * `metadata.robots` emits a `<meta>` tag and no `X-Robots-Tag` — measured
 * against this app on Next 16.3.3); and, independently, `DATA_MODEL.md`
 * stored no book password and `SCREENS.md` §2.9 offered no field to set one,
 * so a Basic challenge would have prompted for a credential that could not
 * exist. **The second measurement is no longer true.** A password exists, and
 * the answer is a page that asks for it rather than a header that cannot be
 * sent. The first still holds and is why the answer is a page.
 *
 * `docs/deviations.md` §100 carries that history and is now CLOSED; §123
 * carries what one column can and cannot mean after the change.
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
  /**
   * `site.readerPasswordHash`, or `null` when no password is set.
   *
   * CARRIED ON THE CRITICAL PATH DELIBERATELY. A closed book has to decide
   * per request whether THIS reader has typed the password, and that needs
   * the stored hash in the same read that answers whether it is closed at
   * all. It is a hash, never a password, and nothing renders it.
   */
  readonly readerPasswordHash: string | null
}

/**
 * The two public settings and the reader password's hash, from the `site` global.
 *
 * `depth: 0` and a three-column `select` (CLAUDE.md §7): this is on the
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
 * if (readerMustUnlock(access, cookieHeader)) redirect(UNLOCK_PATH)
 */
export const readPublicAccess = cache(async (): Promise<PublicAccess> => {
  const payload = await getPayload()
  const site = await payload.findGlobal({
    slug: 'site',
    depth: 0,
    select: { passwordProtect: true, indexGalleries: true, readerPasswordHash: true },
  })

  return {
    // `=== true` and `!== false` are the two DIFFERENT coercions the two
    // declared defaults require. See this module's header.
    passwordProtect: site.passwordProtect === true,
    indexGalleries: site.indexGalleries !== false,
    readerPasswordHash: typeof site.readerPasswordHash === 'string' ? site.readerPasswordHash : null,
  }
})

/**
 * Whether the whole book is closed to readers.
 *
 * @param access - What {@link readPublicAccess} answered.
 * @returns `true` when the author has passworded the whole book, in which
 *   case the route entry answers 401 and draws nothing.
 * @example
 * if (readerMustUnlock(await readPublicAccess(), cookieHeader)) redirect(UNLOCK_PATH)
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
