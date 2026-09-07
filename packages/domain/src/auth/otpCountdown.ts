/**
 * otpCountdown — how long is left of a one-time code's window, and how
 * `SCREENS.md` §3.2 writes it down.
 *
 * This module implements none of CLAUDE.md §3.3's seven named patterns, and
 * that is the deliberate "none" case rather than an oversight (§0 rule 5):
 * two pure functions, no state, no seam, no second caller shape to abstract
 * over. Naming a pattern for `(instant, instant, duration) -> seconds` would
 * be cargo cult, the same call `mask.ts` makes for the same reason.
 *
 * WHY IT TAKES A WINDOW RATHER THAN READING ONE. `SCREENS.md` §3.2 puts two
 * countdowns on one screen: the code's own life ("It expires in {m:ss}") and
 * the resend's cooldown ("Send again in {n}s"). They are the same arithmetic
 * over two different durations — `EXPIRY_MS` and `RESEND_COOLDOWN_MS`, both
 * from `./otpChallenge`, which stays their single source. Importing either
 * constant here would fix this module to one of the two callers and force the
 * other to re-derive the subtraction; taking `windowMs` is what keeps the
 * arithmetic in one place and both durations in theirs. The pattern earns its
 * generality on the second real use, never the first (CLAUDE.md §3.3) — both
 * uses exist, in `apps/web/components/admin/CodeStep.tsx`.
 *
 * SECONDS ARE ROUNDED UP, NOT DOWN. A reader with 299.5 seconds left has, in
 * every sense they care about, five minutes left; rounding down would print
 * "4:59" while "5:00" was still true and would show "0:00" for the whole of
 * the final second, which reads as "expired" a second before it is. Rounding
 * up means the display reaches zero exactly when the window does — and the
 * display is only ever a courtesy: `challengeState` in `./otpChallenge` is
 * what actually decides whether a code still works, from the stored row and
 * the server's own clock.
 *
 * A CLOCK BEHIND THE START CLAMPS TO THE WHOLE WINDOW, and a start or a clock
 * that is not a real instant reports nothing left. Both follow
 * `./otpChallenge`'s own rulings for the same two inputs, and for its reasons:
 * ordinary skew of a few milliseconds between machines is a legitimate reader
 * whose window must not appear longer than it is, while a `NaN` or `Infinity`
 * is a bad date parse upstream — a bug, with no reader behind it — which must
 * not present as a live window.
 * Depends on nothing.
 */

/** How many seconds are in a minute, named so the arithmetic below reads as time. */
const SECONDS_PER_MINUTE = 60

/** How many milliseconds are in a second. */
const MS_PER_SECOND = 1_000

/** One window's start, the instant being judged, and how long the window lasts. */
export interface CountdownRequest {
  /** Epoch milliseconds when the window opened — when the code was issued. */
  readonly startedAt: number
  /** The instant being judged, in epoch milliseconds. Injected, never `Date.now()` here. */
  readonly now: number
  /**
   * How long the window lasts. `EXPIRY_MS` for the code's own life,
   * `RESEND_COOLDOWN_MS` for the resend button — both from `./otpChallenge`,
   * which owns the numbers.
   */
  readonly windowMs: number
}

/**
 * How many whole seconds of a window are left at a given instant.
 *
 * @param request - See {@link CountdownRequest}.
 * @returns Seconds remaining, rounded up, never below `0` and never above
 *   `windowMs` expressed in seconds. `0` when either instant is not finite.
 * @example
 * secondsRemaining({ startedAt: 0, now: 60_000, windowMs: 300_000 }) // 240
 * secondsRemaining({ startedAt: 0, now: 999_999, windowMs: 300_000 }) // 0
 */
export const secondsRemaining = ({ startedAt, now, windowMs }: CountdownRequest): number => {
  // Fails closed rather than falling through: every comparison against NaN is
  // false, so an unguarded subtraction would report a live window for a
  // timestamp that never parsed. See the module header.
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return 0

  const elapsedMs = now - startedAt
  const remainingMs = Math.min(Math.max(windowMs - elapsedMs, 0), windowMs)

  return Math.ceil(remainingMs / MS_PER_SECOND)
}

/**
 * Writes a number of seconds the way `SCREENS.md` §3.2 does: `{m:ss}`.
 *
 * @param seconds - Whole seconds remaining. Expected to be the finite,
 *   non-negative output of {@link secondsRemaining}; a negative or fractional
 *   value is floored to zero and truncated rather than printed as one, so a
 *   misuse degrades to `'0:00'` instead of to `'-1:-1'`. Guarded with
 *   `Math.max`/`Math.trunc` rather than an `if`, which keeps the guard honest
 *   without adding a branch no caller can reach.
 * @returns The countdown, e.g. `'5:00'`, `'0:59'`, `'59:59'`. Minutes are not
 *   padded and are not capped — the seconds always are.
 * @example
 * formatCountdown(300) // '5:00'
 * formatCountdown(61) // '1:01'
 */
export const formatCountdown = (seconds: number): string => {
  const whole = Math.max(0, Math.trunc(seconds))
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE)
  const remainder = whole % SECONDS_PER_MINUTE

  return `${String(minutes)}:${String(remainder).padStart(2, '0')}`
}
