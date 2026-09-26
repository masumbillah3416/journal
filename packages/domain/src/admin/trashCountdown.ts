/**
 * trashCountdown — SCREENS.md §2.10's "goes for good in 30 days", and the
 * window it counts down.
 *
 * ═══ THE CLOCK IS INJECTED (CLAUDE.md §2.3) ═══
 *
 * `now` is a parameter, never `Date.now()`, so a case can stand at any
 * instant of the window and the Trash screen renders the same answer on the
 * server as a test reads. `readTrashScreen` is what takes the reading.
 *
 * ═══ ROUNDED UP, NOT DOWN, AND THAT IS THE BOUNDARY THE SCREEN TURNS ON ═══
 *
 * A row thrown away a minute ago has 29 days, 23 hours and 59 minutes left.
 * Flooring that prints "29 days" on the day it was deleted; rounding up
 * prints the 30 the header promises. The same choice at the other end is what
 * keeps the last day readable: a row with one hour left still says "1 day",
 * and only an instant at or past the deadline says none. Both sides are
 * pinned by `trashCountdown.test.ts`.
 *
 * NOTHING HERE DELETES ANYTHING. The countdown is what the screen prints;
 * `deleteJourneyForGood` (`apps/web/lib/admin/journeyMutations.ts`) is the
 * only thing in this repository that removes a journey, and it runs because
 * an author pressed a button — there is no sweep. A row past the window is
 * therefore still listed, still restorable, and says so.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Two pure functions over an
 * instant and a clock.
 *
 * INVARIANT — the answer is never negative and never above
 * {@link TRASH_WINDOW_DAYS}. The screen prints it into a sentence, so a
 * negative would read "goes for good in -3 days".
 * Depends on: nothing.
 */

/** One day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1_000

/**
 * How long SCREENS.md §2.10 keeps a thrown-away journey.
 *
 * THE HEADER'S OWN NUMBER — "Kept for thirty days" — written once so the
 * heading, the row's line and this arithmetic cannot disagree. Every case
 * that pins the boundary is built from this constant rather than from a
 * literal thirty, so the boundary follows it if it ever moves.
 */
export const TRASH_WINDOW_DAYS = 30

/**
 * How many days a thrown-away journey has left.
 *
 * @param deletedAt - When it was thrown away, as an ISO instant — the
 *   `journeys.deletedAt` column.
 * @param now - The reading of the clock this screen is being drawn at.
 * @returns A whole number of days, rounded up, between 0 and
 *   {@link TRASH_WINDOW_DAYS}. Zero for a row at or past the window, and for
 *   a stamp that is not an instant at all.
 * @example
 * daysUntilGone('2026-09-01T09:00:00.000Z', Date.parse('2026-09-30T09:00:00.000Z')) // 1
 */
export const daysUntilGone = (deletedAt: string, now: number): number => {
  const thrownAway = Date.parse(deletedAt)
  // A STAMP THAT IS NOT AN INSTANT IS NOT A COUNTDOWN. `deletedAt` arrives
  // from Postgres through Payload, whose type for it is a plain string;
  // arithmetic on `NaN` produces `NaN`, and React renders that as the word
  // "NaN" beside a Delete for good button.
  if (Number.isNaN(thrownAway)) return 0

  const left = thrownAway + TRASH_WINDOW_DAYS * DAY_MS - now
  return Math.max(0, Math.min(TRASH_WINDOW_DAYS, Math.ceil(left / DAY_MS)))
}

/**
 * SCREENS.md §2.10's line beneath a row's name.
 *
 * @param days - What {@link daysUntilGone} answered.
 * @returns The line, singular on the last day.
 * @example
 * goesForGoodLine(30) // 'goes for good in 30 days'
 */
export const goesForGoodLine = (days: number): string => {
  // PAST THE WINDOW IS ITS OWN SENTENCE. Nothing sweeps the trash (see this
  // module's header), so "goes for good in 0 days" would be a promise this
  // repository does not keep.
  if (days <= 0) return 'goes for good on the next sweep'
  return `goes for good in ${String(days)} ${days === 1 ? 'day' : 'days'}`
}
