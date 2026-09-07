/**
 * otpProbes — read-side helpers for the OTP service's integration tests.
 *
 * Factories and probes with no shared mutable state (CLAUDE.md §2.3): every
 * helper here takes what it reads as a parameter, so nothing reaches for a
 * module-level outbox or a module-level Payload — the mutable singleton
 * §3.3 rejects. This module implements none of §3.3's seven named patterns;
 * it is three parameterised readers with no seam of their own, and naming a
 * pattern for them would be cargo cult.
 *
 * These read what the service persisted or printed; they never construct a
 * code, because a test that knows the code without reading it the way a
 * reader would is not testing the delivery path.
 *
 * NOTHING HERE EVER PRINTS OR RETURNS A CODE IN A FAILURE MESSAGE. The one
 * helper that touches a code returns it to the test and nothing else — its
 * two `throw`s deliberately describe the SHAPE of what was missing ("nothing
 * was sent", "no six-digit code in the message body") rather than echoing the
 * message they searched, since a helper that dumps the outbox on failure is a
 * helper that writes a live one-time code into CI output (CLAUDE.md §7).
 * Depends on: the test Payload instance (`../../testPayload`) and the branded
 * `UserId` (`@travel-diary/domain/ids`).
 */
import type { UserId } from '@travel-diary/domain/ids'
import { getTestPayload } from '../../testPayload'

/** The persisted facts about a challenge that a security assertion reads. */
export interface StoredChallenge {
  /** The stored hash of the code — asserted never to be the code itself. */
  readonly codeHash: string
  /** The stored hash of the session the challenge was bound to. */
  readonly sessionHash: string
  /**
   * How many wrong guesses have been spent against it, exactly as the column
   * holds it — `null`/`undefined` are NOT normalised to zero here. A probe
   * that tidied the stored value would hide the one thing an assertion on it
   * is for: that the service wrote a count at all.
   */
  readonly attempts: number | null | undefined
  /** Epoch milliseconds Payload stamped the row with. */
  readonly createdAt: number
  /**
   * Epoch milliseconds the row's `expires_at` column holds.
   *
   * READ BY NOTHING IN PRODUCTION, and this probe exists to prove exactly that:
   * `otpService.integration.test.ts` moves the stored value a year into the
   * future and still expects the challenge to be expired. The column is
   * `DATA_MODEL.md`'s and is written as `createdAt + EXPIRY_MS`; the sweep that
   * bounds the table keys on `created_at`, because a challenge outlives its own
   * usability in the hourly resend count. This comment called it a purge index,
   * which was ruling F14's invented justification (blocker B4).
   */
  readonly expiresAt: number
}

/**
 * The most recent challenge row for a user, read straight from the database.
 *
 * @param user - The user whose latest challenge to read.
 * @returns The row's persisted facts.
 * @throws If the user has no challenge row at all — a test that expected one
 *   and got none should fail here rather than on a confusing `undefined`.
 */
export const latestChallenge = async (user: UserId): Promise<StoredChallenge> => {
  const payload = await getTestPayload()
  const found = await payload.find({
    collection: 'otpChallenges',
    where: { user: { equals: Number(user) } },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
  })
  const row = found.docs[0]
  if (row === undefined) throw new Error('no challenge row for that user')
  return {
    codeHash: row.codeHash,
    sessionHash: row.sessionHash,
    attempts: row.attempts,
    createdAt: Date.parse(row.createdAt),
    expiresAt: Date.parse(row.expiresAt),
  }
}

/**
 * The six-digit code as a reader would receive it — out of the mailer's
 * outbox, never out of the database, so the delivery path is exercised.
 *
 * @param mailer - The mailer the service under test was given. Passed in
 *   rather than reached for: a helper reading a module-level outbox would be
 *   the shared mutable state CLAUDE.md §2.3 forbids, and two tests running
 *   against one outbox would read each other's codes.
 * @returns The six digits from the most recent message's body.
 * @throws If nothing was sent, or the last message's body holds no six-digit
 *   run. Neither message echoes the body it searched.
 */
export const readCodeFromOutbox = (mailer: { readonly sent: readonly { readonly text: string }[] }): string => {
  const last = mailer.sent.at(-1)
  if (last === undefined) throw new Error('nothing was sent')
  const match = /\b(\d{6})\b/.exec(last.text)
  const code = match?.[1]
  if (code === undefined) throw new Error('no six-digit code in the message body')
  return code
}

/**
 * How many challenge rows an account has been issued since a given instant.
 *
 * Counts ROWS rather than believing the service's own return values, which is
 * the whole point when the question is whether a ceiling actually held: a
 * count-then-insert that is not serialised reports refusals it never applied.
 * @param user - The account to count for.
 * @param sinceMs - Epoch milliseconds; rows created strictly after this count.
 * @returns How many challenges exist in that window.
 */
export const challengeCountSince = async (user: UserId, sinceMs: number): Promise<number> => {
  const payload = await getTestPayload()
  const found = await payload.find({
    collection: 'otpChallenges',
    where: { user: { equals: Number(user) }, createdAt: { greater_than: new Date(sinceMs).toISOString() } },
    limit: 0,
    depth: 0,
  })
  return found.totalDocs
}

/**
 * A pattern matching `code`'s digits in order, however they are separated.
 *
 * A bare `/\d{6}/` is a weaker leak detector than it reads: a body that
 * printed `1 2 3 4 5 6`, or `1-2-3-4-5-6`, or the code split across a line
 * break has leaked the whole code and matches no six-digit run. This matches
 * the issued code's own digits with anything non-numeric allowed between
 * them, so a re-encoded or interleaved leak is caught too.
 *
 * False positives are the safe direction for a leak detector, and here they
 * are impossible in practice: the fixture address this file uses is
 * deliberately free of digits (see `aSignInAccount`), so any digit at all in
 * a response or a log line came from the code.
 * @param code - The code actually issued, read from the outbox.
 * @returns The pattern.
 */
export const scatteredCodePattern = (code: string): RegExp =>
  // Inserted BETWEEN digits by a lookahead rather than by spreading or
  // splitting the string: `@typescript-eslint/no-misused-spread` bans both,
  // since either decomposes text by code point or code unit, and this needs
  // no branch to say "every digit but the last".
  new RegExp(code.replace(/([0-9])(?=[0-9])/gu, '$1[^0-9]*'), 'u')

/**
 * A code that is certainly wrong, whatever the service happened to issue.
 *
 * @param issued - The code actually issued, read from the outbox.
 * @returns A different six-digit string. Derived from `issued` rather than
 *   hard-coded, because a literal such as `'000000'` is a real code one run
 *   in a million will collide with — and a test that fails once a million
 *   runs is a test somebody eventually deletes.
 */
export const aDifferentCode = (issued: string): string => {
  const asNumber = Number.parseInt(issued, 10)
  return String((asNumber + 1) % 1_000_000).padStart(6, '0')
}
