/**
 * ids — branded identifiers for journeys, pages, media, photo slots, users
 * and sign-in sessions.
 *
 * Value objects pattern: each id is a distinct nominal type over `string`, not
 * structurally interchangeable with the others, so passing a JourneyId where a
 * PageId is expected is a compile error rather than a runtime surprise. The
 * handoff records five separate defects caused by per-journey state held in one
 * global value (README "State" > "Admin") — distinct id types are the compile-time
 * half of the fix; keying every collection by id is the runtime half.
 *
 * Phase 2 (`SECURITY.md`) adds `UserId` and `SessionId` on the same pattern:
 * a session id passed where a user id belongs is exactly the confusion
 * branding exists to prevent, and here it is a security-relevant confusion —
 * an OTP challenge is bound to the session that requested it, not to a user —
 * rather than a cosmetic one.
 *
 * {@link accountRowId} is the one place a brand is converted BACK, to the
 * integer Payload's Postgres adapter wants. It lives here rather than beside
 * any one caller because three of them now need it, and three copies of a
 * guard are three chances for one of them to drift.
 * Depends on: Result, from ./result.
 */
import type { Result } from './result'
import { err, ok } from './result'

/** Opaque brand carried by every identifier type, never present at runtime. */
type Brand<Name extends string> = { readonly __brand: Name }

/** Identifies one journey (a trip, holding its own pages and media). */
export type JourneyId = string & Brand<'JourneyId'>

/** Identifies one page within a journey (notes, frames I, frames II, etc). */
export type PageId = string & Brand<'PageId'>

/** Identifies one media item (a still or clip) in the library. */
export type MediaId = string & Brand<'MediaId'>

/** Identifies one photo slot within a page layout (e.g. `hero`, `frame-2`). */
export type SlotKey = string & Brand<'SlotKey'>

/**
 * Identifies one signed-in user. Phase 2 (`SECURITY.md`) binds an OTP
 * challenge to the {@link SessionId} that requested it, never to the
 * eventual `UserId` — a distinct brand for each is what makes passing one
 * where the other belongs a compile error, not a runtime confusion that
 * would let a challenge issued for one session be redeemed by another.
 */
export type UserId = string & Brand<'UserId'>

/**
 * Identifies one sign-in session — the thing an OTP challenge is bound to.
 * See {@link UserId} for why this is a separate brand rather than the same
 * string doing both jobs.
 */
export type SessionId = string & Brand<'SessionId'>

/**
 * Builds a constructor for one branded id type. Shared so each brand's public
 * constructor is one line, and every brand rejects the same way: empty or
 * whitespace-only input, with an error message naming the brand it belongs to.
 * @param name - The brand name, used as both the TypeScript brand and the error text.
 */
const brandedId =
  <Name extends string>(name: Name) =>
  (raw: string): Result<string & Brand<Name>, string> =>
    raw.trim().length === 0 ? err(`${name} cannot be empty`) : ok(raw as string & Brand<Name>)

/**
 * Validates and brands a raw string as a {@link JourneyId}.
 * @param raw - The candidate identifier.
 * @returns `ok` with the branded id, or `err` when `raw` is empty or whitespace-only.
 */
export const journeyId = brandedId('JourneyId')

/**
 * Validates and brands a raw string as a {@link PageId}.
 * @param raw - The candidate identifier.
 * @returns `ok` with the branded id, or `err` when `raw` is empty or whitespace-only.
 */
export const pageId = brandedId('PageId')

/**
 * Validates and brands a raw string as a {@link MediaId}.
 * @param raw - The candidate identifier.
 * @returns `ok` with the branded id, or `err` when `raw` is empty or whitespace-only.
 */
export const mediaId = brandedId('MediaId')

/**
 * Validates and brands a raw string as a {@link SlotKey}.
 * @param raw - The candidate identifier.
 * @returns `ok` with the branded id, or `err` when `raw` is empty or whitespace-only.
 */
export const slotKey = brandedId('SlotKey')

/**
 * Validates and brands a raw string as a {@link UserId}.
 * @param raw - The candidate identifier.
 * @returns `ok` with the branded id, or `err` when `raw` is empty or whitespace-only.
 */
export const userId = brandedId('UserId')

/**
 * Validates and brands a raw string as a {@link SessionId}.
 * @param raw - The candidate identifier.
 * @returns `ok` with the branded id, or `err` when `raw` is empty or whitespace-only.
 */
export const sessionId = brandedId('SessionId')

/**
 * The numeric row id a branded account id names, or `undefined`.
 *
 * The brand only promises a non-empty string, so a caller can hand over
 * something that is not a Payload id; answering `undefined` keeps
 * `Number('nonsense')` from reaching the driver as `NaN` and escaping as a raw
 * `Failed query` past whatever `Result` contract is above it.
 *
 * `isSafeInteger` rather than `isInteger`: past 2^53 `Number` stops telling
 * one integer from the next, so a larger id would name a DIFFERENT row rather
 * than fail.
 *
 * @param user - The branded account id.
 * @returns The row id, or `undefined` when the brand does not name one.
 * @example
 * const built = userId('104')
 * if (built.ok) accountRowId(built.value) // 104
 */
export const accountRowId = (user: UserId): number | undefined => {
  const parsed = Number(user)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}
