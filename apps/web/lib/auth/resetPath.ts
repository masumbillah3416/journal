/**
 * resetPath — where the reset screens live, spelled once.
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
