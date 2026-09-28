/**
 * accountMutations — what SCREENS.md §2.11's four writes actually do to the
 * caller's own `users` row, and the Zod parses that stand between a `POST` and
 * them.
 *
 * ═══ WHY THE DECISIONS ARE HERE AND NOT IN `actions.ts` ═══
 *
 * `siteMutations.ts`'s reason, unchanged: a `'use server'` module is dispatched
 * under an opaque action id and carries a whole-file `c8 ignore`, so anything
 * decided there is decided where nothing measures it. The actions module is the
 * guard, the wiring and the cache hints; everything with a branch in it lives
 * here behind a `Payload` parameter.
 *
 * ═══ EVERY WRITE ADDRESSES THE ROW THE SCOPE RESOLVED, AND NO OTHER ═══
 *
 * `AdminScope` carries the account row `adminScope` looked up for the admitted
 * session, so `scope.user.id` is the only id any write here uses. There is no
 * id on any form, which means there is nothing for a caller to tamper with —
 * and `ownAccountOnly` (`apps/web/collections/users.ts`) is the second door:
 * it narrows a write to the caller's own row and refuses one aimed at anybody
 * else's. `accountMutations.integration.test.ts` asks the rule directly rather
 * than trusting that no future write will take an id from a form.
 *
 * ═══ THE PARTIAL UPDATE IS WHAT KEEPS THE CARDS APART ═══
 *
 * Each write is given only the columns it owns. The profile card posts three
 * text fields and touches no toggle; a notification toggle posts one column;
 * the OTP toggle posts one. A whole-object write would clear every column the
 * form did not carry — and on this row that includes `otpRequired`, which
 * `SECURITY.md` calls the only source of truth for the code step.
 *
 * ═══ VERIFYING THE CURRENT PASSWORD SPENDS A LOGIN ATTEMPT ═══
 *
 * See {@link changePassword}. It is stated there rather than only here because
 * it is the one consequence of this module that will surprise somebody.
 *
 * ═══ NO PASSWORD POLICY IS INVENTED, AND ONE VALUE IS STILL REFUSED ═══
 *
 * `setNewPassword.ts`'s decision, and this module makes the same one:
 * `SECURITY.md` states no policy, the handoff states none, and a minimum
 * length made up here would refuse a password the account could otherwise
 * have. The one value this module does refuse is the EMPTY string, and that is
 * not a policy — it is a measurement. `payload.update` with an empty password
 * RESOLVES, writes nothing and leaves the old password working, while
 * `payload.login` refuses the same value outright. Without the refusal an
 * author who cleared the box would be told their password had changed.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — the `users` row's shape stops here,
 * and the screen's actions speak in settings. Result type for
 * {@link changePassword}, whose refusals are things a reader causes by typing
 * and which the screen has to be able to say out loud. DTO for
 * {@link ProfileForm}, which is a card's three fields and not the row.
 *
 * INVARIANT — NOTHING HERE LOGS OR RETURNS A PASSWORD. Both exist only as
 * parameters passed straight to Payload, and the refusals are two fixed words
 * quoting neither (CLAUDE.md §7).
 * Depends on: zod, `Result` (@travel-diary/domain/result), `payload` (types),
 * `AdminScope` (./adminScope).
 */
import { type Result, err, ok } from '@travel-diary/domain/result'
import type { Payload } from 'payload'
import { z } from 'zod'
import type { AdminScope } from './adminScope'

/** The three fields SCREENS.md §2.11's "Who is keeping this" collects. */
export interface ProfileForm {
  /** Name on the cover. */
  readonly name: string
  /** Sign-off used on pages. */
  readonly signoff: string
  /** The IANA zone dates are written in. */
  readonly timeZone: string
}

/**
 * What §2.11's first card's three inputs must amount to.
 *
 * EVERY FIELD IS OPTIONAL AND DEFAULTS TO EMPTY, for `siteMutations.ts`'s
 * reason: a box the author cleared posts `''`, and all three columns are
 * nullable. Nothing here judges the zone — `readAccountScreen.ts` offers a
 * select of zones and labels one it cannot format, so a zone this runtime does
 * not know is drawn rather than refused.
 */
const PROFILE_FORM = z.object({
  name: z.string().trim().default(''),
  signoff: z.string().trim().default(''),
  timeZone: z.string().trim().default(''),
})

/** The two columns SCREENS.md §2.11's "Tell me when" writes. */
const NOTIFICATION_SETTINGS = ['notifyOnPublish', 'notifyWeekly'] as const

/** What one "Tell me when" toggle posts. */
export interface NotificationToggleForm {
  /** The `users` column it writes. */
  readonly setting: (typeof NOTIFICATION_SETTINGS)[number]
  /** What to write. */
  readonly on: boolean
}

/** What the "One-time code at sign-in" toggle posts. */
export interface OtpToggleForm {
  /** Whether the code step should run at the next sign-in. */
  readonly on: boolean
}

/** What {@link changePassword} is asked. */
export interface PasswordChange {
  /** The current password, as the author typed it. Never logged, never returned. */
  readonly current: string
  /** The password they want instead. */
  readonly next: string
}

/** Why {@link changePassword} refused. */
export type ChangePasswordRefusal =
  /**
   * The current password is not the account's — or the account is locked, for
   * {@link changePassword}'s reason. Both are the reader typing the wrong
   * thing, and the screen tells them the same thing either way.
   */
  | 'wrong-password'
  /**
   * The New password box was empty.
   *
   * REFUSED HERE BECAUSE PAYLOAD DOES NOT REFUSE IT. Measured against a real
   * Payload: `payload.update({ data: { password: '' } })` RESOLVES, writes
   * nothing, and leaves the old password signing in — while `payload.login`
   * refuses an empty password outright with a `ValidationError`. So an empty
   * box would otherwise be reported to the author as a password change that
   * happened and did not. It is not a password policy (this module invents
   * none): it is the one value the write silently discards.
   */
  | 'empty-password'

/**
 * A toggle's value, which arrives as the word it is switching TO.
 *
 * A toggle posts the value it is switching to rather than a checkbox's
 * presence, because a checkbox that is off posts nothing at all — a form built
 * that way could only ever switch a setting ON, which for the second factor is
 * the wrong direction to be able to move in.
 */
const TOGGLE_VALUE = z.enum(['true', 'false']).transform((value) => value === 'true')

/**
 * Reads SCREENS.md §2.11's profile card's form body.
 *
 * @param form - The posted body.
 * @returns The three fields, trimmed.
 * @example
 * await saveProfile(payload, scope, readProfileForm(form))
 */
export const readProfileForm = (form: FormData): ProfileForm => PROFILE_FORM.parse(Object.fromEntries(form))

/**
 * Reads one "Tell me when" toggle's form body.
 *
 * THE COLUMN IS CHECKED AGAINST THIS CARD'S OWN TWO, not against the row's
 * columns (standing orders, species 6: refuse what you do not recognise).
 * `otpRequired` is a real, writable column on the same row — by its own action,
 * which is the one place `SECURITY.md`'s authoritative setting is written — so
 * a notification toggle that accepted any column name would be a second way to
 * switch off the second factor.
 * @param form - The posted body.
 * @returns The column and the value.
 * @throws {z.ZodError} When the column is not one of this card's two.
 * @example
 * const { setting, on } = readNotificationToggle(form)
 */
export const readNotificationToggle = (form: FormData): NotificationToggleForm =>
  z.object({ setting: z.enum(NOTIFICATION_SETTINGS), on: TOGGLE_VALUE }).parse(Object.fromEntries(form))

/**
 * Reads the "One-time code at sign-in" toggle's form body.
 *
 * @param form - The posted body.
 * @returns What the toggle is switching to.
 * @throws {z.ZodError} When the value is neither word.
 * @example
 * await setOtpRequired(payload, scope, readOtpToggle(form))
 */
export const readOtpToggle = (form: FormData): OtpToggleForm =>
  z.object({ on: TOGGLE_VALUE }).parse(Object.fromEntries(form))

/**
 * Writes SCREENS.md §2.11's three profile fields, and nothing else.
 *
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}; its row is the one written.
 * @param input - What the card posted, already parsed.
 * @throws From Payload, when the write is refused by the access rules.
 * @example
 * await saveProfile(payload, scope, readProfileForm(form))
 */
export const saveProfile = async (payload: Payload, scope: AdminScope, input: ProfileForm): Promise<void> => {
  await payload.update({
    collection: 'users',
    id: scope.user.id,
    ...scope,
    depth: 0,
    data: { displayName: input.name, signoffDefault: input.signoff, timeZone: input.timeZone },
  })
}

/**
 * Writes one "Tell me when" toggle.
 *
 * ONE COLUMN PER PRESS, so two toggles cannot overwrite each other's value
 * from a page that was drawn before the other was pressed.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}; its row is the one written.
 * @param input - The column and the value, already parsed.
 * @throws From Payload, when the write is refused by the access rules.
 * @example
 * await saveNotifications(payload, scope, readNotificationToggle(form))
 */
export const saveNotifications = async (
  payload: Payload,
  scope: AdminScope,
  input: NotificationToggleForm,
): Promise<void> => {
  await payload.update({
    collection: 'users',
    id: scope.user.id,
    ...scope,
    depth: 0,
    data: { [input.setting]: input.on },
  })
}

/**
 * Writes the setting `SECURITY.md` calls the only source of truth for the code
 * step.
 *
 * THE ONE PLACE `users.otpRequired` IS WRITTEN. The prototype kept the flag in
 * `localStorage`, "and anyone can set it to `0` and skip the second factor
 * entirely"; `signIn.ts` reads the column on every call and `SignInRequest` has
 * no such field at all, so this write is the whole of how the code step is
 * turned off. `accountMutations.integration.test.ts` proves it through the
 * sign-in path in both directions rather than by reading the column back.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}; its row is the one written.
 * @param input - What the toggle is switching to, already parsed.
 * @throws From Payload, when the write is refused by the access rules.
 * @example
 * await setOtpRequired(payload, scope, readOtpToggle(form))
 */
export const setOtpRequired = async (payload: Payload, scope: AdminScope, input: OtpToggleForm): Promise<void> => {
  await payload.update({
    collection: 'users',
    id: scope.user.id,
    ...scope,
    depth: 0,
    data: { otpRequired: input.on },
  })
}

/**
 * Changes the account's password, once the current one has been offered.
 *
 * ═══ A WRONG CURRENT PASSWORD COUNTS TOWARD THE ACCOUNT'S LOCKOUT ═══
 *
 * The current password is verified by calling `payload.login` and discarding
 * whatever it returns — which is the SAME operation the sign-in screen calls,
 * and the one that owns `maxLoginAttempts: 5` and `lockTime` (fifteen minutes,
 * `apps/web/collections/users.ts`). So five wrong current passwords typed here
 * lock the account exactly as five wrong ones typed at the sign-in screen do.
 * That is correct behaviour — there is one credential and one counter, and a
 * verification that did not spend it would be a place to guess a password
 * without limit, behind a session that may itself have been stolen. It is
 * MEASURED rather than asserted in prose: the lockout case in
 * `accountMutations.integration.test.ts` spends five and then watches a
 * sign-in with the RIGHT password be refused.
 *
 * THE LOCK DOES NOT REACH THE SESSION THE AUTHOR IS ALREADY IN, which is the
 * half an author actually wants to know. Payload's lockout guards the
 * credential store; this repository's sessions are rows in `sessions` that
 * `authenticate` judges on their own expiry and revocation, and nothing
 * consults `users.lock_until` on that path. So locking yourself out here does
 * not sign you out of the screen you are on — you simply cannot change the
 * password again until the cooling-off period lifts. Measured by that case's
 * neighbour, which authenticates the live session afterwards.
 *
 * THE CHEAPER VERIFICATION WAS CONSIDERED AND REFUSED. Payload stores `hash`
 * and `salt` on the row, so this module could derive PBKDF2 itself and compare
 * without touching the counter. That means a second copy of a
 * security-critical primitive — the exact restatement `signIn.ts` documents
 * the cost of, and there it exists only to spend TIME, never to decide
 * anything. A comparison that decided admission would be a second credential
 * check to keep correct across every Payload release, and its first divergence
 * would be silent. Spending the counter is the smaller price, and it is the
 * behaviour a reader would expect anyway.
 *
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}; its row is the one written.
 * @param input - See {@link PasswordChange}.
 * @returns `ok` once the new password is the account's, or `err` naming which
 *   half was refused. A locked account is `'wrong-password'`, because the
 *   reader's next move is the same either way and the screen has one message.
 * @throws Nothing for a refusal; from Payload, when the WRITE is refused by the
 *   access rules, which is a bug in the guard rather than something typed.
 * @example
 * const changed = await changePassword(payload, scope, { current, next })
 * if (!changed.ok) return backToTheCard(changed.error)
 */
export const changePassword = async (
  payload: Payload,
  scope: AdminScope,
  input: PasswordChange,
): Promise<Result<void, ChangePasswordRefusal>> => {
  const email = scope.user.email

  // FIRST, AND BEFORE ANY LOGIN ATTEMPT IS SPENT. A form the author
  // mis-filled should not cost them one of five attempts toward a fifteen
  // minute lockout, and the value is refused whatever the current password
  // turns out to be. See {@link ChangePasswordRefusal} for why it is refused
  // at all.
  if (input.next === '') return err('empty-password')

  try {
    // THE RETURN VALUE IS DISCARDED, DELIBERATELY. `login` also mints a Payload
    // JWT; this project's sessions are revocable rows
    // (`docs/adr/0017-session-store-and-rotation.md`), and adopting a token
    // Payload created as a side effect of a check is exactly what
    // `setNewPassword.ts` refuses to do for the same reason.
    await payload.login({ collection: 'users', data: { email, password: input.current } })
  } catch {
    // EVERY THROW IS THE SAME ANSWER, and that is not the erasure CLAUDE.md
    // §3.1 warns about: unlike `signIn.ts`, the caller here has already been
    // authenticated, so there is no enumeration to defend against and no
    // operator decision to make — a wrong password, a locked account and a
    // store that cannot answer all leave the author on this card with the same
    // next move.
    return err('wrong-password')
  }

  // NOT WRAPPED IN A `try`, deliberately. The only value Payload's update
  // refuses is the empty one, which is refused above; anything else it throws
  // here is an access rule refusing this write, which is a bug in the guard
  // that admitted the session rather than something the author typed. Catching
  // it would draw a card telling them their password was wrong.
  await payload.update({
    collection: 'users',
    id: scope.user.id,
    ...scope,
    depth: 0,
    data: { password: input.next },
  })

  return ok(undefined)
}
