/**
 * route.ts — `/admin/reset/request`: what SCREENS.md §3.3's "Send the link"
 * button posts to, and the address `RESERVED_RESET_SEGMENTS` was holding open
 * for it.
 *
 * IT TAKES NO DECISIONS AT ALL. Its whole body is two re-exports: asking for a
 * link and refusing a `GET` are both
 * `apps/web/lib/auth/resetRequestEndpoint.ts`'s, which
 * `resetRequestEndpoint.integration.test.ts` drives end to end with a real
 * `Request` and a real Payload. Its sibling `../set/route.ts` is the same
 * shape for the same reason.
 *
 * ═══ BOTH VERBS ARE EXPORTED, AND THE `GET` IS THE POINT ═══
 *
 * `[token]` sits beside this directory and matches ANY single segment, so
 * before ruling F56's reservation a `GET` of this address answered `200` with
 * "That link has expired". The reservation restored the `404`. Mounting a
 * route here takes the address away from `[token]` for good — and a `route.ts`
 * exporting only `POST` makes Next answer `405` to a `GET`, which is a
 * different answer from the one this address gave the day before. `GET` is
 * therefore exported too, and it answers `404`: there is nothing at this
 * address to fetch, it is a form's action.
 * Depends on: `handleResetRequest`/`readResetRequestRoute`
 * (../../../../../lib/auth/resetRequestEndpoint).
 */
/* c8 ignore start -- Framework passthrough with no authored logic whatsoever:
 * this file names two handlers and nothing else. Every decision is
 * `resetRequestEndpoint.ts`'s, which `resetRequestEndpoint.integration.test.ts`
 * drives with a real `Request` and a real Payload, and which
 * `vitest.integration.config.ts` gates. It cannot be measured by either Vitest
 * config (a route handler is only reached through Next's own routing), and
 * this file's path contains no `[...]` segment, so the ignore hint is read and
 * no config exclusion is needed. Wraps the import too, not just the exports: an
 * unimported file's imports are themselves uncovered lines. */
import { handleResetRequest, readResetRequestRoute } from '../../../../../lib/auth/resetRequestEndpoint'

/**
 * Answers a submission of the reset request form.
 *
 * Exported under the name Next.js requires for a `POST` route; the function
 * itself is the library's, so nothing about the handler is only reachable
 * through the framework.
 */
export const POST = handleResetRequest

/**
 * Answers a `GET` of this address with the application's own 404, exactly as
 * it answered before this route existed. See this module's header.
 */
export const GET = readResetRequestRoute
/* c8 ignore stop */
