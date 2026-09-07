/**
 * setNewPassword.integration.test.ts — the screen the mailed link lands on,
 * proved end to end: request a reset, take the link out of the outbox, spend
 * it, and sign in with what it set.
 *
 * Integration test (CLAUDE.md §2), against a real Payload and a real Postgres,
 * because every fact this file asserts is one Payload holds in a column:
 * whether the token is honoured, whether it survives being spent, and whether
 * the password it set is the one `login` now accepts.
 *
 * ═══ THE TOKEN IS READ OUT OF THE OUTBOX, NEVER OUT OF THE DATABASE ═══
 *
 * `readTokenFromOutbox` takes the link out of the message the mailer was
 * handed, exactly as `lib/auth/testing/otpProbes.ts`'s `readCodeFromOutbox`
 * takes a code out of one — and for the same reason. A test that read
 * `users.reset_password_token` off the row would pass with a link built from
 * the wrong origin, a link built from the wrong path, or no link in the body
 * at all. Reading the URL a reader would click is what makes this a test of
 * the journey rather than of the column.
 *
 * That is also why the first case is the whole journey rather than an
 * assertion about one step of it: the point is that the pieces MEET. Each
 * piece already has a case of its own — `passwordReset.integration.test.ts`
 * for the request, this file's later cases for each refusal — and none of them
 * would have noticed the gap ruling F47 closed, in which every mechanism was
 * green and the address the link named answered 404.
 *
 * NOTHING HERE PRINTS A TOKEN OR A PASSWORD. The helper's two `throw`s
 * describe the SHAPE of what was missing rather than echoing the body they
 * searched (CLAUDE.md §7), the same rule `otpProbes.ts` states.
 *
 * Uses `getTestPayload()`, not `getPayload()` directly, so this file connects
 * to the isolated `diary_test` database rather than a developer's own.
 * Depends on: vitest, ./setNewPassword, ./passwordReset, ./rateLimit,
 * ./resetPath, ../adapters/console-mailer, ../testPayload.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConsoleMailer } from '../adapters/console-mailer'
import { getTestPayload } from '../testPayload'
import { createPasswordResetService } from './passwordReset'
import { createSignInRateLimiter } from './rateLimit'
import { RESET_PATH } from './resetPath'
import { type NewPasswordService, createNewPasswordService, refusalFrom } from './setNewPassword'

/** Every fixture address here belongs to this domain, so `afterAll` can find them. */
const FIXTURE_EMAIL_DOMAIN = 'set-new-password-fixture.example'

/**
 * The requesting addresses this file spends limiter budget under.
 *
 * IPv6's documentation prefix (RFC 3849) rather than a fourth RFC 5737 /24,
 * because the three that exist are already one per suite and disjoint —
 * `signIn` has TEST-NET-1, `rateLimit` TEST-NET-2, `passwordReset` TEST-NET-3.
 * A block of its own is what keeps two files from spending each other's
 * window, which reads as a bug in the limiter rather than as a fixture clash.
 */
const FIXTURE_IP_PREFIX = '2001:db8::'

/** The password every fixture account is created with. */
const ORIGINAL_PASSWORD = 'the-one-this-account-was-created-with'

/** The password the mailed link sets instead. */
const REPLACEMENT_PASSWORD = 'the-one-the-mailed-link-set-instead'

/** The origin the reset service is told to build links against. */
const ADMIN_ORIGIN = 'https://diary.example'

/** A token of the right shape that names no account at all. */
const UNKNOWN_TOKEN = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

/** Distinguishes one fixture from the next within a single run. */
let fixtureCount = 0

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/** The service under test. */
let service: NewPasswordService

/** The reset service that mints the links this file follows. */
let requestReset: ReturnType<typeof createPasswordResetService>

/** The mailer those links are read back out of. */
let mailer: ReturnType<typeof createConsoleMailer>

/**
 * A digit-free label, derived from a counter.
 * @param count - The fixture's ordinal within this run.
 * @returns Two lowercase letters, unique for the first 676 fixtures.
 */
const alphabeticLabel = (count: number): string =>
  String.fromCharCode(97 + Math.floor(count / 26)) + String.fromCharCode(97 + (count % 26))

/**
 * A fresh account with a known password.
 * @returns The account's address.
 */
const aReader = async (): Promise<string> => {
  fixtureCount += 1
  const email = `reader-${alphabeticLabel(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
  await payload.create({ collection: 'users', data: { email, password: ORIGINAL_PASSWORD } })
  return email
}

/**
 * A requesting address no other case in this run is using.
 *
 * Derived from the same counter the addresses are, so each case's request is
 * counted under a subject of its own and no case can spend another's window.
 * @returns An address unique within this run.
 */
const anIp = (): string => `${FIXTURE_IP_PREFIX}${alphabeticLabel(fixtureCount)}`

/**
 * The reset token out of the most recent message, taken from the link the way
 * a reader would — never from the database.
 * @returns The token.
 * @throws If nothing was sent, or the last message carries no reset link.
 *   Neither message echoes the body it searched.
 */
const readTokenFromOutbox = (): string => {
  const last = mailer.sent.at(-1)
  if (last === undefined) throw new Error('nothing was sent')
  const match = new RegExp(`${RESET_PATH}/([0-9a-f]+)\\b`, 'u').exec(last.text)
  const token = match?.[1]
  if (token === undefined) throw new Error('no reset link in the message body')
  return token
}

/**
 * Offers a password and reports whether Payload accepted it.
 * @param email - The account to sign in as.
 * @param password - The password to offer.
 * @returns Whether the login succeeded.
 */
const signInSucceeds = async (email: string, password: string): Promise<boolean> => {
  try {
    await payload.login({ collection: 'users', data: { email, password } })
    return true
  } catch {
    return false
  }
}

/** The two columns Payload's reset flow keeps on a `users` row. */
interface ResetColumns {
  /** The token the mailed link carries, or `null` if the row holds none. */
  readonly reset_password_token: string | null
  /** The instant the token stops matching, or `null`. */
  readonly reset_password_expiration: Date | null
}

/**
 * The reset columns of one account, read straight off the row.
 *
 * READ THROUGH THE POOL RATHER THAN THE LOCAL API on purpose: Payload marks
 * both columns hidden, and the question these two cases ask is what is AT REST
 * in the row, which is exactly the question a document-shaped read cannot
 * answer. Every other case in this file reads the token out of the outbox, for
 * the reason this file's header gives; these two are about the column itself.
 *
 * @param email - The account to read.
 * @returns Its reset token and expiration, as Postgres holds them.
 * @throws If the account is not there, so a missing row cannot read as an
 *   empty one.
 */
const resetColumnsOf = async (email: string): Promise<ResetColumns> => {
  const found = await payload.db.pool.query<ResetColumns>(
    `SELECT reset_password_token, reset_password_expiration FROM users WHERE email = $1`,
    [email],
  )
  const row = found.rows[0]
  if (row === undefined) throw new Error('no account at that address, so nothing below has read a column')
  return row
}

/** Deletes every row this file wrote. */
const removeFixtures = async (): Promise<void> => {
  await payload.db.pool.query(`DELETE FROM sign_in_attempts WHERE subject LIKE $1`, [`${FIXTURE_IP_PREFIX}%`])
  const accounts = await payload.find({
    collection: 'users',
    where: { email: { like: FIXTURE_EMAIL_DOMAIN } },
    limit: 500,
    depth: 0,
  })
  for (const account of accounts.docs) {
    await payload.delete({ collection: 'users', id: account.id })
  }
}

beforeAll(async () => {
  payload = await getTestPayload()
  mailer = createConsoleMailer({ isDevelopment: false })
  requestReset = createPasswordResetService({
    payload,
    mailer,
    limiter: createSignInRateLimiter({ payload }),
    adminOrigin: ADMIN_ORIGIN,
  })
  service = createNewPasswordService({ payload })
  await removeFixtures()
})

afterAll(async () => {
  await removeFixtures()
})

describe('the mailed link, followed end to end', () => {
  it('sets the password the reader typed and lets them sign in with it', async () => {
    const reader = await aReader()

    await requestReset.requestPasswordReset({ email: reader, ip: anIp() })
    const token = readTokenFromOutbox()
    const set = await service.setNewPassword({ token, password: REPLACEMENT_PASSWORD })

    expect(set).toEqual({ ok: true, value: undefined })
    expect(await signInSucceeds(reader, REPLACEMENT_PASSWORD)).toBe(true)
  })

  it('leaves the password the link replaced no longer working', async () => {
    // The half that separates "a new password was accepted" from "the old one
    // was actually replaced": a reset that added a second valid password would
    // pass the case above.
    const reader = await aReader()

    await requestReset.requestPasswordReset({ email: reader, ip: anIp() })
    await service.setNewPassword({ token: readTokenFromOutbox(), password: REPLACEMENT_PASSWORD })

    expect(await signInSucceeds(reader, ORIGINAL_PASSWORD)).toBe(false)
  })

  it('spends the link, so following it a second time is refused', async () => {
    // `SCREENS.md` §3.3: "The link works once and lasts an hour." This is the
    // once.
    const reader = await aReader()

    await requestReset.requestPasswordReset({ email: reader, ip: anIp() })
    const token = readTokenFromOutbox()
    await service.setNewPassword({ token, password: REPLACEMENT_PASSWORD })

    const second = await service.setNewPassword({ token, password: 'a-third-password-entirely' })

    expect(second).toEqual({ ok: false, error: 'invalid-token' })
  })

  it('spends the link by back-dating its expiry, and leaves the token string in the row', async () => {
    // WHAT ACTUALLY REFUSES THE SECOND USE, pinned instead of its outcome —
    // the eighth whole-branch review's finding 5. `passwordReset.ts` said
    // "`resetPassword` clears it on use", and Payload does no such thing:
    // `node_modules/payload/dist/auth/operations/resetPassword.js` names
    // `resetPasswordToken` at exactly one line, inside the lookup `where`, and
    // its only write to either reset column is
    // `user.resetPasswordExpiration = new Date().toISOString()`. So the link
    // dies because its expiry is back-dated to the instant it was spent, and
    // the lookup demands `resetPasswordExpiration greater_than now()`. The
    // spent token string stays in the row until the next `forgotPassword`
    // overwrites it — which is the fact a reader of that comment would have
    // got wrong, and the one CLAUDE.md §7 makes them care about.
    const reader = await aReader()

    await requestReset.requestPasswordReset({ email: reader, ip: anIp() })
    const token = readTokenFromOutbox()
    await service.setNewPassword({ token, password: REPLACEMENT_PASSWORD })

    const spent = await resetColumnsOf(reader)

    expect(spent.reset_password_token).toBe(token)
    expect(spent.reset_password_expiration?.getTime() ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(Date.now())
  })

  it('honours that same token again the moment its expiry is put back into the future', async () => {
    // THE CAUSAL HALF, and the reason the case above is worth having. It says
    // the token survives and the expiry is back-dated; this one says the
    // expiry is the ONLY thing refusing the second use, by putting it back and
    // watching the same spent token be accepted.
    //
    // NO APPLICATION PATH DOES THIS. The `UPDATE` below is the probe, not a
    // behaviour: Payload writes `resetPasswordExpiration` in exactly two
    // places — `forgotPassword`, which mints a NEW token in the same write,
    // and `resetPassword`, which back-dates it — so nothing in this repository
    // or in Payload can revive a spent token. That is what makes the residue
    // an at-rest fact rather than an exposure, and it is stated here because a
    // future edit that starts writing that column alone would turn it into
    // one.
    const reader = await aReader()

    await requestReset.requestPasswordReset({ email: reader, ip: anIp() })
    const token = readTokenFromOutbox()
    await service.setNewPassword({ token, password: REPLACEMENT_PASSWORD })
    await payload.db.pool.query(`UPDATE users SET reset_password_expiration = $1 WHERE email = $2`, [
      new Date(Date.now() + 3_600_000),
      reader,
    ])

    const revived = await service.setNewPassword({ token, password: 'a-third-password-entirely' })

    expect(revived).toEqual({ ok: true, value: undefined })
    expect(await signInSucceeds(reader, 'a-third-password-entirely')).toBe(true)
  })

  it('still signs in with the password the first use set, after the second was refused', async () => {
    // Without this, "the second use was refused" is true of an implementation
    // that had quietly cleared the account's password on the way to refusing.
    const reader = await aReader()

    await requestReset.requestPasswordReset({ email: reader, ip: anIp() })
    const token = readTokenFromOutbox()
    await service.setNewPassword({ token, password: REPLACEMENT_PASSWORD })
    await service.setNewPassword({ token, password: 'a-third-password-entirely' })

    expect(await signInSucceeds(reader, REPLACEMENT_PASSWORD)).toBe(true)
  })
})

describe('a link that cannot be honoured', () => {
  it('refuses a token that names nothing at all', async () => {
    const refused = await service.setNewPassword({ token: UNKNOWN_TOKEN, password: REPLACEMENT_PASSWORD })

    expect(refused).toEqual({ ok: false, error: 'invalid-token' })
  })

  it('refuses an empty token, which can name no link at all', async () => {
    const refused = await service.setNewPassword({ token: '', password: REPLACEMENT_PASSWORD })

    expect(refused).toEqual({ ok: false, error: 'invalid-token' })
  })

  it('names the password rather than the link when the password is the problem', async () => {
    // Two refusals, not one, because the screen says different things about
    // them: an expired link has no form left to draw, and a refused password
    // does. Collapsing them would tell a reader holding a perfectly good link
    // that it had expired.
    const reader = await aReader()

    await requestReset.requestPasswordReset({ email: reader, ip: anIp() })
    const refused = await service.setNewPassword({ token: readTokenFromOutbox(), password: '' })

    expect(refused).toEqual({ ok: false, error: 'rejected' })
  })

  it('leaves the account signing in with its original password after a refusal', async () => {
    const reader = await aReader()

    await requestReset.requestPasswordReset({ email: reader, ip: anIp() })
    await service.setNewPassword({ token: readTokenFromOutbox(), password: '' })

    expect(await signInSucceeds(reader, ORIGINAL_PASSWORD)).toBe(true)
  })

  it('returns nothing that echoes the token or the password it was given', async () => {
    // CLAUDE.md §7: a refusal that quoted what it refused would put a live
    // reset token wherever the answer is logged.
    const refused = await service.setNewPassword({ token: UNKNOWN_TOKEN, password: REPLACEMENT_PASSWORD })

    expect(JSON.stringify(refused)).not.toContain(UNKNOWN_TOKEN)
    expect(JSON.stringify(refused)).not.toContain(REPLACEMENT_PASSWORD)
  })
})

describe('reading a link before a form is drawn for it', () => {
  it('calls a link that has just been mailed live', async () => {
    const reader = await aReader()

    await requestReset.requestPasswordReset({ email: reader, ip: anIp() })

    expect(await service.linkState(readTokenFromOutbox())).toBe('live')
  })

  it('calls a link spent once it has been used', async () => {
    const reader = await aReader()

    await requestReset.requestPasswordReset({ email: reader, ip: anIp() })
    const token = readTokenFromOutbox()
    await service.setNewPassword({ token, password: REPLACEMENT_PASSWORD })

    expect(await service.linkState(token)).toBe('spent')
  })

  it('calls a token that names nothing spent', async () => {
    expect(await service.linkState(UNKNOWN_TOKEN)).toBe('spent')
  })

  it('calls an empty token spent rather than matching every account without one', async () => {
    // The query is `resetPasswordToken equals ''`, and a row that has never
    // asked for a reset holds NULL there rather than the empty string - so
    // this is a real answer about a real comparison, not an accident of
    // Payload dropping the condition.
    expect(await service.linkState('')).toBe('spent')
  })

  it('does not spend the link it was asked about', async () => {
    // A reader who opens the screen and reloads it must still be able to use
    // the link: a `linkState` that consumed the token would leave every
    // second visit on the expired screen.
    const reader = await aReader()

    await requestReset.requestPasswordReset({ email: reader, ip: anIp() })
    const token = readTokenFromOutbox()
    await service.linkState(token)
    await service.linkState(token)

    expect(await service.setNewPassword({ token, password: REPLACEMENT_PASSWORD })).toEqual({
      ok: true,
      value: undefined,
    })
  })
})

describe('reading what Payload threw', () => {
  // `refusalFrom` is exercised here for what it is - a translation of one
  // library's error shape - because the two failures a live Payload produces
  // reach only two of its arms, and the rest are what a rejected connection or
  // a future release would take.
  it('reads a 400 as a refusal of the password', () => {
    expect(refusalFrom({ status: 400 })).toBe('rejected')
  })

  it('reads Payload’s own 403 as a refusal of the link', () => {
    expect(refusalFrom({ status: 403 })).toBe('invalid-token')
  })

  it('reads an object with no status at all as a refusal of the link', () => {
    expect(refusalFrom(new Error('the connection went away'))).toBe('invalid-token')
  })

  it('reads a thrown string as a refusal of the link', () => {
    expect(refusalFrom('something threw a string')).toBe('invalid-token')
  })

  it('reads a thrown null as a refusal of the link', () => {
    expect(refusalFrom(null)).toBe('invalid-token')
  })
})
