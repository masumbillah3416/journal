/**
 * readAccountScreen — everything SCREENS.md §2.11's four cards draw, read
 * once.
 *
 * ═══ THE PROFILE COSTS NO QUERY, BECAUSE THE ROW IS ALREADY IN HAND ═══
 *
 * `adminScope` resolves the caller's whole `users` row once per request, and
 * every field the first three cards draw is on it: `displayName`,
 * `signoffDefault`, `timeZone`, the two notification columns, `otpRequired`
 * and the address. Reading it a second time here would be a second `users`
 * lookup per screen for a row the scope is already carrying — the shape
 * CLAUDE.md §6 forbids, arrived at by habit rather than by need. So
 * {@link QUERIES_PER_READ} is ONE, and that one is the session list.
 *
 * ═══ THE SESSION LIST COMES FROM THE SESSION SERVICE, NOT FROM PAYLOAD ═══
 *
 * `sessions.tokenHash` refuses `read` through the API
 * (`apps/web/collections/sessions.ts`), so a `find` under this scope cannot
 * see the column that decides which row the request came in on. The comparison
 * is `apps/web/lib/auth/sessions.ts`'s `listSessions`, which owns the only
 * definition of how an identifier is stored. THE CURRENT ROW IS THE ONE WHOSE
 * HASH MATCHES THE COOKIE, never the newest row: the two agree on every
 * account holding one session, and the cost of the wrong one is an author
 * pressing Revoke beside the device they are sitting at.
 *
 * ═══ `otpRequired` IS READ BY `signIn.ts`'s OWN RULE, NOT BY TRUTHINESS ═══
 *
 * `users.otp_required` is nullable, and `signIn.ts` treats anything that is
 * not literally `false` as required — "a second factor that switched itself
 * off for a row written before the default would do it silently". This screen
 * draws the same rule, because a toggle that said "off" while the code step
 * still ran would be the screen lying about the only setting `SECURITY.md`
 * calls authoritative.
 *
 * ═══ WHAT §2.11 ASKS FOR AND THIS DATA MODEL CANNOT ANSWER ═══
 *
 * The 132px avatar with Replace. `DATA_MODEL.md`'s `users` section declares
 * six fields and none of them is an image, so there is nothing to draw and
 * nothing for Replace to write. {@link AccountProfile.initial} is what the
 * card prints instead — the same monogram the rail's own profile block
 * already draws — and `docs/deviations.md` §106 carries the decision.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — one module owns how the Account
 * screen is fetched, and no card sees a Payload document or a `sessions` row.
 * DTO: {@link AccountView} is the screen, not a row.
 *
 * INVARIANT — nothing here reads a `users` row other than the caller's own.
 * The scope IS the row, so there is no id to get wrong.
 * Depends on: `SessionId` (@travel-diary/domain/ids), `payload` (types),
 * `createSessionService` (../auth/sessions), `AdminScope` (./adminScope).
 */
import { type SessionId, userId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import { createSessionService } from '../auth/sessions'
import type { AdminScope } from './adminScope'

/**
 * How many statements one read of this screen costs, whatever the account
 * holds.
 *
 * ONE: the session list. The profile, the notifications and the sign-in
 * address are all on the row `adminScope` already resolved. Pinned from BOTH
 * sides by `readAccountScreen.integration.test.ts` — a per-session query makes
 * the second reading longer than the first.
 */
export const QUERIES_PER_READ = 1

/**
 * The instant every time-zone option writes out as its example.
 *
 * FIXED RATHER THAN `Date.now()`, for two reasons. A label built from the
 * current moment changes between the render and the assertion, so the case
 * that pins the format would be comparing two clocks (standing orders §15);
 * and an option list that re-rendered differently every minute is a diff
 * nobody can read. The instant chosen is late enough in UTC that the zones
 * east of it write a DIFFERENT DAY, which is exactly what "how dates are
 * written" is asking the reader to see.
 */
export const TIME_ZONE_SAMPLE = Date.UTC(2026, 8, 28, 22, 5)

/**
 * The zones the select offers, before the account's own is folded in.
 *
 * A SHORT LIST RATHER THAN `Intl.supportedValuesOf('timeZone')`, which is
 * around 400 entries and would put 400 formatted examples into every render of
 * this screen. The account's stored zone is added to whatever is here
 * ({@link timeZoneOptions}), so the list being short cannot lose a zone
 * somebody is actually in — which is the failure the long list would be
 * guarding against.
 */
const OFFERED_TIME_ZONES: readonly string[] = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Atlantic/Reykjavik',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
]

/** The zone an account that has never chosen one writes its dates in. */
const DEFAULT_TIME_ZONE = 'UTC'

/** How the session list writes "{place} · {when}"'s second half. */
const WHEN = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** What a session row says when it recorded no device label. */
const UNRECORDED_DEVICE = 'An unnamed device'

/** What it says when it recorded no place. */
const UNRECORDED_PLACE = 'Somewhere unrecorded'

/** One entry of §2.11's "Time zone" select. */
export interface TimeZoneOption {
  /** The IANA zone the option writes. Every row is addressed by this. */
  readonly zone: string
  /** The zone and an example of a date written in it — see {@link TIME_ZONE_SAMPLE}. */
  readonly label: string
}

/** SCREENS.md §2.11's "Who is keeping this". */
export interface AccountProfile {
  /** Name on the cover, or the empty string when nobody has set one. */
  readonly name: string
  /** Sign-off used on pages, or the empty string. */
  readonly signoff: string
  /** The IANA zone dates are written in. */
  readonly timeZone: string
  /**
   * The letter the avatar draws.
   *
   * There is no stored image in this data model — see this module's header and
   * `docs/deviations.md` §106 — so the card prints a monogram, taken from the
   * name when there is one and from the address when there is not.
   */
  readonly initial: string
  /** What the Time zone select offers, the account's own zone included. */
  readonly timeZoneOptions: readonly TimeZoneOption[]
}

/** SCREENS.md §2.11's "Tell me when" — two toggles. */
export interface AccountNotifications {
  /** A note when a publish finishes (`users.notifyOnPublish`). */
  readonly onPublish: boolean
  /** The weekly reader summary (`users.notifyWeekly`). */
  readonly weekly: boolean
}

/** SCREENS.md §2.11's "Getting in", minus the two password boxes it does not prefill. */
export interface AccountGettingIn {
  /** The address the reader signs in with. */
  readonly email: string
  /**
   * Whether the code step runs at the next sign-in.
   *
   * `users.otpRequired` and nothing else: `SECURITY.md` calls it the only
   * source of truth, and this screen's toggle is the only thing that writes it.
   */
  readonly otpRequired: boolean
}

/** One row of SCREENS.md §2.11's "Where you are signed in". */
export interface AccountSession {
  /** The `sessions` row's id — how Revoke addresses it (CLAUDE.md §0.9). */
  readonly row: number
  /** The device label, or this repository's words for a row that recorded none. */
  readonly device: string
  /** "{place} · {when}", as §2.11 writes the line beneath the device. */
  readonly where: string
  /** Whether this is the session the request came in on. */
  readonly isCurrent: boolean
}

/** Everything SCREENS.md §2.11 draws. */
export interface AccountView {
  /** "Who is keeping this". */
  readonly profile: AccountProfile
  /** "Tell me when". */
  readonly notifications: AccountNotifications
  /** "Getting in". */
  readonly gettingIn: AccountGettingIn
  /** "Where you are signed in", newest first. */
  readonly sessions: readonly AccountSession[]
}

/**
 * A `users` column as a string, however Postgres returned it.
 * @param value - What the row held.
 * @returns The trimmed text, or the empty string for an unwritten column.
 */
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * A `users` checkbox column as a boolean.
 *
 * Postgres hands back `null` for a checkbox nobody has written, so the field's
 * own `defaultValue` is what an unwritten column means — and the three
 * checkboxes on `users` do not all default the same way.
 * @param value - What the row held.
 * @param fallback - The field's declared default.
 * @returns The setting's state.
 */
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

/**
 * What {@link TIME_ZONE_SAMPLE} looks like written in one zone, or `null` when
 * the runtime does not know the zone.
 *
 * `Intl.DateTimeFormat` THROWS A `RangeError` FOR A ZONE ITS ICU HAS NEVER
 * HEARD OF, and `users.timeZone` is a plain `text` column — whatever is in it
 * reaches here. Unguarded, one bad value takes the whole Account screen down
 * with a 500, on the one screen an author would go to in order to fix it. The
 * `catch` classifies rather than swallows (CLAUDE.md §3.1): the caller prints
 * a different label, and the zone is still offered so that saving the card
 * cannot silently move the author's dates.
 *
 * This was found rather than reasoned about — `Europe/Reykjavik` is not a
 * zone (`Atlantic/Reykjavik` is), and the first draft of this list held it.
 * @param zone - The IANA zone.
 * @returns The example, or `null`.
 */
const dateWrittenIn = (zone: string): string | null => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: zone,
    }).format(TIME_ZONE_SAMPLE)
  } catch {
    return null
  }
}

/**
 * One zone's option, with an example of a date written in it.
 *
 * @param zone - The IANA zone.
 * @returns The option §2.11's select draws.
 */
const timeZoneOption = (zone: string): TimeZoneOption => {
  const written = dateWrittenIn(zone)
  return { zone, label: written === null ? `${zone} — this system does not know that zone` : `${zone} — ${written}` }
}

/**
 * The select's options, with the account's own zone guaranteed to be among
 * them.
 *
 * A zone this repository does not list is still a zone the account is in, and
 * a select that omitted it would silently move the author's dates the first
 * time they saved the card.
 * @param stored - The zone on the account's row.
 * @returns The options, in the listed order with any stored outlier appended.
 * @example
 * timeZoneOptions('Pacific/Chatham').at(-1)?.zone // 'Pacific/Chatham'
 */
export const timeZoneOptions = (stored: string): readonly TimeZoneOption[] =>
  (OFFERED_TIME_ZONES.includes(stored) ? OFFERED_TIME_ZONES : [...OFFERED_TIME_ZONES, stored]).map(timeZoneOption)

/**
 * The letter the avatar draws.
 * @param name - The account's display name.
 * @param email - Its sign-in address, used when there is no name.
 * @returns One upper-case character.
 */
const monogram = (name: string, email: string): string => (name === '' ? email : name).slice(0, 1).toUpperCase()

/**
 * Everything SCREENS.md §2.11's Account screen draws.
 *
 * @param payload - The Local API instance the `sessions` rows live behind. A
 *   parameter so the query count is observable; see this module's header.
 * @param scope - The hoisted {@link AdminScope}. It carries the caller's own
 *   `users` row, which is where the first three cards come from.
 * @param carried - The identifier THIS request arrived with, read off the
 *   cookie by `readBrowserSession`, or `null` when it carried none. It decides
 *   which row is marked Current and nothing else.
 * @returns The four cards' data. See {@link AccountView}.
 * @throws From Payload, when the session read is refused — a bug in the guard
 *   that admitted the session, not a state a card can draw.
 * @example
 * const scope = await adminScope(session)
 * const view = await readAccountScreen(await getPayload(), scope, readBrowserSession(cookieHeader))
 */
export const readAccountScreen = async (
  payload: Payload,
  scope: AdminScope,
  carried: SessionId | null,
): Promise<AccountView> => {
  const row: Record<string, unknown> = { ...scope.user }
  const sessions = createSessionService({ payload, now: Date.now })

  // THE CALLER'S OWN ACCOUNT BY CONSTRUCTION, not by a lookup that could name
  // another: `AdminScope` carries the row `adminScope` resolved, and its `id`
  // is the primary key `accountRowId` unwraps on the way back in.
  const owner = userId(String(scope.user.id))
  /* c8 ignore next -- `userId` refuses only an empty or whitespace-only string, and `String` of a NOT NULL integer primary key is neither. The guard exists to unwrap the constructor's Result, not because an admitted account can be nameless. */
  if (!owner.ok) throw new Error('the admitted account has no row id')

  const listed = await sessions.listSessions({ owner: owner.value, carried })

  const name = text(row['displayName'])
  const email = text(row['email'])
  const timeZone = text(row['timeZone']) === '' ? DEFAULT_TIME_ZONE : text(row['timeZone'])

  return {
    profile: {
      name,
      signoff: text(row['signoffDefault']),
      timeZone,
      initial: monogram(name, email),
      timeZoneOptions: timeZoneOptions(timeZone),
    },
    notifications: {
      onPublish: flag(row['notifyOnPublish'], true),
      weekly: flag(row['notifyWeekly'], false),
    },
    gettingIn: {
      email,
      // NOT `flag(…, true)`: `signIn.ts` admits without a code step only when
      // the column is literally `false`, and this screen has to agree with it.
      otpRequired: row['otpRequired'] !== false,
    },
    sessions: listed.map((session) => ({
      row: session.row,
      device: session.device ?? UNRECORDED_DEVICE,
      where: `${session.location ?? UNRECORDED_PLACE} · ${WHEN.format(session.lastSeenAt ?? session.startedAt)}`,
      isCurrent: session.isCurrent,
    })),
  }
}
