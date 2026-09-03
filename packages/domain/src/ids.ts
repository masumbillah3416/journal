/**
 * ids — branded identifiers for journeys, pages, media and photo slots.
 *
 * Value objects pattern: each id is a distinct nominal type over `string`, not
 * structurally interchangeable with the others, so passing a JourneyId where a
 * PageId is expected is a compile error rather than a runtime surprise. The
 * handoff records five separate defects caused by per-journey state held in one
 * global value (README "State" > "Admin") — distinct id types are the compile-time
 * half of the fix; keying every collection by id is the runtime half.
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
