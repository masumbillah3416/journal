/**
 * mask — hides most of a sign-in email address for display.
 *
 * Pure function (CLAUDE.md §3.2), used by the password step's footer and the
 * OTP step's "a six-digit code went to {masked}" line (SCREENS.md §3). The
 * password-reset "sent" confirmation reuses it for the same reason.
 *
 * WHY THREE BULLETS ALWAYS, REGARDLESS OF LOCAL-PART LENGTH. The screen this
 * renders on must never confirm whether an address exists or how long it is
 * — a variable bullet count would let an attacker distinguish "a@x.com" from
 * "alexandra@x.com" by counting dots, which is exactly the kind of leak an
 * account-enumeration check probes for. Fixing the count at three, rather
 * than one per hidden character, closes that off: this module always
 * produces `{first two}•••@{domain}`, no matter how long the local part is.
 * Depends on nothing.
 */

/** How many characters of bullets always replace the hidden part of the local part. */
const MASK_BULLET_COUNT = 3

/** The bullet character the handoff's mask format uses (SCREENS.md §3). */
const MASK_BULLET = '•'

/**
 * Masks an email address for display: the first two characters of the local
 * part, a fixed run of bullets, then the domain unchanged.
 *
 * @param address - A well-formed email address (validated at the boundary
 *   before this is called — this module trusts the shape, per CLAUDE.md §7).
 * @returns The masked address, e.g. `he•••@wanderings.travel`.
 * @example
 * maskEmail('hello@wanderings.travel') // 'he•••@wanderings.travel'
 * maskEmail('a@x.com') // 'a•••@x.com' — one-character local part, no throw
 */
export const maskEmail = (address: string): string => {
  const atIndex = address.indexOf('@')
  const localPart = address.slice(0, atIndex)
  const domain = address.slice(atIndex + 1)
  const visible = localPart.slice(0, 2)

  return `${visible}${MASK_BULLET.repeat(MASK_BULLET_COUNT)}@${domain}`
}
