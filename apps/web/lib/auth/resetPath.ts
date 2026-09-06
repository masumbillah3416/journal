/**
 * resetPath — where the reset screens live, spelled once, and the segments
 * beneath that path which are routes rather than tokens.
 *
 * TWO SIDES OF THE CLIENT BOUNDARY NEED THIS ONE STRING, which is why it is a
 * module of its own rather than a constant on either of them.
 * `apps/web/lib/auth/passwordReset.ts` builds the emailed link from it and is
 * server-only - it pulls Payload and `node:crypto`, so importing it into a
 * browser bundle is not an option - while
 * `apps/web/components/admin/PasswordStep.tsx` is a client component that
 * needs the same path for its "Forgotten" link. A module that imports nothing
 * and exports one string is safe on both sides, and is the only shape that
 * lets the two agree by construction rather than by inspection.
 *
 * Until Task 9 they did not: the path was written out twice, and
 * `resetPath.test.ts` compared the two spellings by reading their source
 * text, because there was nothing else a single test could do. That file now
 * pins this constant and asserts a route is mounted at it instead.
 *
 * This module implements none of CLAUDE.md §3.3's named patterns. It is one
 * constant, one list and one membership test over that list; a Value object
 * would be the closest fit and would earn nothing here, because there is no
 * second kind of path this could be confused with.
 *
 * WHY `/admin/reset`. Phase ruling F41 settled that the bespoke sign-in
 * surface mounts under `/admin` (Payload's own admin having moved to `/cms`),
 * and the session cookie is scoped `Path=/admin` - RFC 6265 sends such a
 * cookie only to `/admin` and its descendants, so a reset screen outside it
 * could not read the session it is about to establish. The handoff names no
 * URL for this screen: recorded as a HANDOFF-DEVIATION in docs/deviations.md
 * §31, which is where the path already lived.
 * Depends on: nothing, deliberately.
 */

/**
 * Where the reset request screen is mounted, and the prefix the emailed link
 * is built on: the link is `<origin>${RESET_PATH}/<token>`.
 *
 * @example
 * `${adminOrigin}${RESET_PATH}/${token}` // https://diary.example/admin/reset/ab12…
 */
export const RESET_PATH = '/admin/reset'

/**
 * Every path segment directly under {@link RESET_PATH} that names a route
 * rather than a reset token.
 *
 * ═══ WHY THIS LIST EXISTS: RULING F56 ═══
 *
 * `app/(admin)/admin/reset/[token]/page.tsx` matches ANY single segment under
 * this path, including the addresses this surface's own forms post to. Adding
 * it turned `/admin/reset/request` - the action of SCREENS.md §3.3's "Send the
 * link" button - from a 404 into a 200 drawing "That link has expired", so
 * §3.3's primary action told the reader that a link they had never asked for
 * was dead. Next.js resolves a static segment before a dynamic one, which is
 * why `set` never had that problem, but that is a framework precedence rule
 * about routes that EXIST; `request` does not exist yet (Task 10 mounts it
 * with the cookie policy) and nothing protected it.
 *
 * INVARIANT: every word here must be one Payload could never mint. Payload
 * mints reset tokens as hexadecimal, so any word containing a letter past `f`
 * is safe, and `resetPath.test.ts` asserts that of every entry - a reserved
 * `deadbeef` would silently 404 somebody's real link.
 */
export const RESERVED_RESET_SEGMENTS: readonly string[] = ['request', 'set']

/**
 * Whether a segment under {@link RESET_PATH} names a sibling route rather than
 * a token, and must therefore be answered with a 404 instead of a screen.
 *
 * The match is exact. A token that merely begins with a reserved word is a
 * token, so a reader whose link happens to start `request…` still gets it.
 *
 * @param segment - The address's last path segment, exactly as it arrived.
 * @returns `true` when the segment is a route, not a token.
 * @example
 * isReservedResetSegment('request') // true — §3.3's form posts here
 * isReservedResetSegment('ab12cd…') // false — a token, however it reads
 */
export const isReservedResetSegment = (segment: string): boolean => RESERVED_RESET_SEGMENTS.includes(segment)
