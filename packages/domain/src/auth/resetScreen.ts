/**
 * resetScreen — which state each of the two reset screens is in, decided from
 * what the address bar carries.
 *
 * SCREENS.md §3.3 draws the reset request in two states (pending and sent),
 * and the screen the mailed link lands on has two of its own (the form, and
 * the refusal). Four states, two route components, and neither component may
 * hold the decision: `apps/web/app/(admin)/admin/reset/page.tsx` cannot be run
 * by either Vitest project, and `.../reset/[token]/page.tsx` sits under a
 * bracketed directory where `@vitest/coverage-v8`'s ignore hints are known not
 * to hold (CLAUDE.md §2.1). A branch left in either file is a branch nothing
 * can measure. Both branches are here instead, in the package gated at
 * 100/100/100, exactly as `returningPagePath` and `pageIndexFromParam` keep
 * the diary's own route components decisionless.
 *
 * This module implements none of CLAUDE.md §3.3's named patterns: it is two
 * pure readers of one query value each, and naming a pattern for them would be
 * cargo cult.
 *
 * THE SENT STATE'S ADDRESS IS MASKED HERE, NOT TRUSTED. The reset endpoint
 * redirects with `maskEmail`'s own output, and masking that a second time
 * returns it unchanged - `maskEmail` keeps the first two characters and
 * replaces the rest of the local part with the same fixed bullets, so a value
 * that is already a mask is a fixed point of it. Passing every value through
 * it anyway is what makes a hand-typed `?sent=hello@wanderings.travel`
 * print `he•••@wanderings.travel` rather than a whole address (CLAUDE.md §7),
 * and a value that is not an address at all print bullets alone.
 * Depends on: ./mask.
 */
import { maskEmail } from './mask'

/** Which of SCREENS.md §3.3's two states the reset request screen draws. */
export type ResetRequestView =
  /** The form: an email field, "Send the link", and the promise under it. */
  | { readonly kind: 'pending' }
  /** The confirmation: the green block naming where the link went. */
  | { readonly kind: 'sent'; readonly maskedTo: string }

/**
 * Which state the reset request screen is in.
 *
 * @param sent - The `sent` query value: the masked address the reset endpoint
 *   redirected with, or `undefined` when the reader arrived at the form.
 * @returns The pending state, or the sent state carrying an address that has
 *   been masked whatever arrived.
 * @example
 * resetRequestView(undefined) // { kind: 'pending' }
 * resetRequestView('he•••@wanderings.travel')
 * // { kind: 'sent', maskedTo: 'he•••@wanderings.travel' }
 */
export const resetRequestView = (sent: string | undefined): ResetRequestView => {
  // `undefined` is the ONLY value that means "not sent". An empty `?sent=` is
  // still an answer to the question the reader asked, so it draws the
  // confirmation with bullets rather than silently returning them to the form
  // they have already filled in.
  if (sent === undefined) return { kind: 'pending' }
  return { kind: 'sent', maskedTo: maskEmail(sent) }
}

/** Whether the link a reader arrived on can still be spent. */
export type ResetLinkState =
  /** The token names an account and its hour is not up. */
  | 'live'
  /** Unknown, already spent, or older than an hour. */
  | 'spent'

/** Which state the screen the mailed link lands on draws. */
export type NewPasswordView =
  /** The form: one password field and "Set the new password". */
  | 'form'
  /** The link is spent or too old, so there is no form to draw. */
  | 'expired'
  /** The link is good and the password was refused; the form, with the reason. */
  | 'rejected'

/**
 * The `state` value the endpoint redirects with after refusing a password.
 *
 * EXPORTED, AND THE NAME IS NOT `PASSWORD_REFUSED_STATE`, for two reasons that
 * Phase 2's final review found together as seam S4.
 *
 * It was private, and `apps/web/lib/auth/newPasswordScreen.ts` — the endpoint
 * that WRITES this word — declared a private constant of its own holding the
 * same string. Producer and consumer were two unlinked literals across a
 * package boundary, so changing either one silently degraded `?state=rejected`
 * to `'form'`: the reset failure message would simply stop appearing, with no
 * test failing. The one thing that must not happen to a screen whose whole job
 * is to say a password was refused.
 *
 * And both were called `PASSWORD_REFUSED_STATE`, which is also the name
 * `./signInScreen.ts` exports for a DIFFERENT value (`'refused'`). One name,
 * three declarations, two values — the shape a reader cannot hold in their
 * head and a search cannot disambiguate. This one is named for its own screen.
 */
export const RESET_REFUSED_STATE = 'rejected'

/**
 * Which state the set-a-new-password screen is in.
 *
 * THE LINK IS ASKED FIRST, AND IT OVERRULES THE ADDRESS BAR. `state` is a
 * query value, so a reader can type anything into it; the link's own state is
 * a fact read from the database. A form drawn for a token that cannot work is
 * a password typed for nothing, and it is the one outcome this ordering makes
 * unreachable — every state that offers a form requires a live link.
 *
 * THERE IS DELIBERATELY NO `state=expired`. The endpoint that refuses a link
 * redirects back to the same address carrying nothing, and the read above
 * answers for it. A second way of arriving at the same screen is a second
 * thing that can disagree with the first.
 *
 * @param link - Whether the token still names a live reset.
 * @param state - The `state` query value the endpoint redirected with.
 * @returns The expired state for a link that cannot be spent, otherwise the
 *   form — carrying the refusal when the endpoint reported one.
 * @example
 * newPasswordView('live', undefined) // 'form'
 * newPasswordView('spent', 'rejected') // 'expired'
 */
export const newPasswordView = (link: ResetLinkState, state: string | undefined): NewPasswordView => {
  if (link === 'spent') return 'expired'
  return state === RESET_REFUSED_STATE ? 'rejected' : 'form'
}
