/**
 * mask — hides most of a sign-in email address for display.
 *
 * This module implements none of CLAUDE.md §3.3's seven named patterns — it
 * is a single pure function with no state, no seam and no second caller-
 * shape to abstract over, and naming a pattern for it would be cargo cult
 * (§0 rule 5 asks the choice to be visible; this is the "deliberately none"
 * case, not an oversight).
 *
 * Used by the password step's footer and the OTP step's "a six-digit code
 * went to {masked}" line (SCREENS.md §3). The password-reset "sent"
 * confirmation reuses it for the same reason.
 *
 * WHY THREE BULLETS ALWAYS, REGARDLESS OF LOCAL-PART LENGTH. The screen this
 * renders on must never confirm how long an address's local part is — a
 * variable bullet count would let an attacker distinguish "a@x.com" from
 * "alexandra@x.com" by counting dots, which is exactly the kind of leak an
 * account-enumeration check probes for. Fixing the count at three, rather
 * than one per hidden character, closes that off: local parts of two
 * characters or more are indistinguishable by the length of their mask.
 *
 * THIS DOES NOT EXTEND TO THE VISIBLE PREFIX. SCREENS.md's format keeps the
 * first two characters of the local part verbatim, and no scheme that shows
 * two real characters can hide "this local part has at least two" — a
 * one-character local part (`'a@x.com'` → `'a•••@x.com'`) is visibly
 * shorter than a two-or-more-character one, and that is an accepted, tested
 * consequence of the specified format, not a gap this module closes.
 *
 * MALFORMED INPUT ECHOES NOTHING BUT BULLETS. `apps/web/lib/ports/mailer.ts`
 * (`maskEmailAddress`) already guards the no-`@`/empty-part cases the same
 * way, falling back to a fixed placeholder rather than echoing whatever it
 * was given — two masking functions in one repository disagreeing about the
 * malformed case is how the unguarded one ends up being the one that gets
 * called. This module's fallback is `'•••'` (three bullets, nothing else),
 * matching this module's own bullet character rather than borrowing the
 * mailer's `'***'`.
 * Depends on nothing.
 */

/** How many characters of bullets always replace the hidden part of the local part. */
const MASK_BULLET_COUNT = 3

/** The bullet character the handoff's mask format uses (SCREENS.md §3). */
const MASK_BULLET = '•'

/**
 * The fixed bullet run: `'•••'`. Used both as the hidden part of a
 * well-formed local part and, standing alone, as the fallback for malformed
 * input — either way, nothing but this fixed string is ever echoed.
 */
const MASK_BULLETS = MASK_BULLET.repeat(MASK_BULLET_COUNT)

/**
 * Masks an email address for display: the first two characters of the local
 * part, a fixed run of bullets, then the domain unchanged.
 *
 * @param address - A well-formed email address (validated at the boundary
 *   before this is called — this module trusts the shape, per CLAUDE.md §7).
 *   Malformed input (no `@`, or an empty local part or domain) is handled
 *   defensively rather than trusted, since a display-only fallback is cheap
 *   and echoing unmasked input never is.
 * @returns The masked address, e.g. `he•••@wanderings.travel`; `'•••'` alone
 *   when `address` has no `@`, or the local part or domain either side of
 *   the first `@` is empty — never a partial or unmasked echo of `address`.
 * @example
 * maskEmail('hello@wanderings.travel') // 'he•••@wanderings.travel'
 * maskEmail('a@x.com') // 'a•••@x.com' — one-character local part, no throw
 * maskEmail('not-an-email') // '•••' — no '@', so nothing is echoed
 */
export const maskEmail = (address: string): string => {
  const atIndex = address.indexOf('@')
  if (atIndex === -1) return MASK_BULLETS

  // Split on the FIRST '@' only — deliberate: a second '@' (`'a@b@x.com'`)
  // is treated as part of the domain, not as a second delimiter, so the
  // domain kept is everything after the first '@'.
  const localPart = address.slice(0, atIndex)
  const domain = address.slice(atIndex + 1)
  if (localPart.length === 0 || domain.length === 0) return MASK_BULLETS

  const visible = localPart.slice(0, 2)

  return `${visible}${MASK_BULLETS}@${domain}`
}
