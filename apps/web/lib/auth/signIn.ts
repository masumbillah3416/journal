/**
 * signIn — the password step: the one place the rate limiter, the credential
 * store, the one-time-code service and the session store meet.
 *
 * This module is where three separate mechanisms stop being mechanisms and
 * start being enforcement. `rateLimit.ts` had no caller outside its own
 * suite; `sessions.ts`'s `startSession` was built and unwired; and
 * `users.otpRequired` had never been read by anything. All three are read or
 * called here, on the request path, which is what makes them true rather than
 * merely present (phase ruling F45).
 *
 * PATTERNS (CLAUDE.md §3.3). Ports & Adapters at one remove: every
 * collaborator arrives injected — the limiter, the OTP service, the session
 * service and the clock — so this module composes them and owns none of them.
 * Result type: the outcome is a value a caller must unwrap, and the two
 * successes are a discriminated union, so a caller cannot reach a session
 * without having considered the code step. Repository: the one credential
 * read below is the only place this module learns what a `users` row looks
 * like.
 *
 * IT DOES NOT SET A COOKIE, AND THAT IS DELIBERATE. `startSession` returns
 * the whole `Set-Cookie` value; putting it on a response is the route
 * handler's job (Task 10). A function that both decides and responds cannot
 * be tested for the decision alone.
 *
 * ═══ THE MISS AND THE MISMATCH ARE MADE INDISTINGUISHABLE, TWICE ═══
 *
 * `SECURITY.md` §3: "Return the same response and timing for 'no such
 * account' and 'wrong password' — no user enumeration." Both halves need
 * their own work, and the second is the one that is easy to leave out.
 *
 * THE RESPONSE. Every credential refusal is the same value:
 * `err('invalid-credentials')`. An unknown address, a wrong password and a
 * LOCKED ACCOUNT all return it (phase ruling F44). The lockout is the least
 * obvious of the three and the most valuable: a distinguishable "too many
 * attempts" survives every other measure here, because an attacker who cannot
 * tell a wrong password from an unknown address can still enumerate by
 * spending five guesses per candidate and watching for the one whose answer
 * changes. `SCREENS.md` §3 specifies no lockout copy, so nothing in the
 * handoff is being overridden — but the cost is real and is not hidden: a
 * genuinely locked-out reader is told nothing about why.
 *
 * THE TIMING. Payload's local strategy derives a 512-byte PBKDF2-SHA256 key
 * over 25,000 iterations before it can refuse a wrong password — about 40ms.
 * It does no such work for an address that names no row, and none for a
 * locked account either: `checkLoginPermission` throws before the derivation.
 * So both of those branches would answer in about a millisecond, and the
 * response every one of them shares would be worth nothing. {@link burnAKey}
 * is what closes that: on any branch that does not reach Payload's own
 * comparison, an equivalent derivation is performed and its result discarded.
 * `signIn.integration.test.ts` measures both branches over twenty-five
 * interleaved samples and compares medians; deleting the call below was
 * measured to move that ratio from 0.90 to 0.14.
 *
 * THE LOCK IS READ HERE TO DECIDE HOW MUCH WORK TO DO, NEVER WHETHER TO
 * ADMIT. Payload remains the only authority on the lockout — it owns the
 * counter, the fifteen minutes and the refusal, and it re-checks both before
 * and after incrementing. What the `lock_until` column is read for below is
 * the single question Payload cannot be asked without already having taken
 * the fast path: will this call reach the key derivation? A stale read costs
 * an extra derivation or a refusal from Payload instead of from here, never
 * an admission.
 *
 * ═══ THE SECOND FACTOR IS DECIDED ON THE SERVER ═══
 *
 * `SECURITY.md`'s second prototype hole: the flag lived in
 * `localStorage['om-diary-otp']`, where anybody could set it to `0` and skip
 * the second factor. {@link SignInRequest} HAS NO SUCH FIELD — not a field
 * that is ignored, no field at all — and the value is read from the account's
 * own row on every call. A NULL column reads as required, because
 * `users.otp_required` is nullable and a second factor that switched itself
 * off for a row written before the default would do it silently.
 *
 * INVARIANT — NOTHING HERE LOGS OR RETURNS A CREDENTIAL. The password exists
 * only as a parameter and as an argument to Payload and to
 * {@link burnAKey}; the address is returned only in the masked form
 * `issueChallenge` produces; a refusal is one word (CLAUDE.md §7).
 *
 * Depends on: `payload` (the Local API instance, injected) and its Postgres
 * pool, `node:crypto`, the OTP service, the session service and the rate
 * limiter, and `@travel-diary/domain`'s branded ids and `Result`.
 */
import { pbkdf2, randomBytes } from 'node:crypto'
import { type SessionId, type UserId, userId } from '@travel-diary/domain/ids'
import { type Result, err, isOk, ok } from '@travel-diary/domain/result'
import type { Payload } from 'payload'
import type { OtpService } from './otpService'
import type { SignInRateLimiter } from './rateLimit'
import type { IssuedSession, SessionService } from './sessions'

/**
 * Payload's own PBKDF2 parameters, restated so the miss path can spend the
 * same work the hit path spends.
 *
 * `payload/dist/auth/strategies/local/authenticate.js` derives
 * `pbkdf2(password, salt, 25000, 512, 'sha256')`, and there is no exported
 * way to ask it to do that for a password with no stored hash to compare
 * against. Restating three numbers is the smaller of the two evils — the
 * other is importing a `dist` subpath that is not part of Payload's public
 * API and would break on any release that moved the file.
 *
 * THEY CAN DRIFT, AND THE TIMING CASE IS WHAT CATCHES IT. If a Payload
 * upgrade changes any of the three, the two paths stop costing the same and
 * `signIn.integration.test.ts`'s median-ratio case leaves its band. That is
 * the guard; nothing else in this repository would notice.
 */
const PAYLOAD_PBKDF2 = { iterations: 25_000, keyBytes: 512, digest: 'sha256' } as const

/**
 * The salt {@link burnAKey} derives against.
 *
 * Drawn once per process from the CSPRNG rather than written as a literal:
 * the value is not a secret and nothing is ever compared against the key it
 * produces, but a fixed hex string sitting in an auth module reads like a
 * credential to every future reader of it, and one of them will eventually
 * treat it as one. PBKDF2's cost does not depend on the salt, so a fresh one
 * per process changes nothing about the timing this exists for.
 */
const DECOY_SALT = randomBytes(32)

/** Why {@link SignInService.signIn} refused. */
export type SignInRefusal =
  /**
   * The address, the password, or both. ALSO a locked account (phase ruling
   * F44) — see this module's header for why the three are one word.
   */
  | 'invalid-credentials'
  /** This requesting address, or this claimed address, is out of attempts. */
  | 'rate-limited'
  /**
   * The password was right and the code could not be sent — the resend
   * cooldown, the hourly ceiling, or a mailer that refused. Its own refusal
   * rather than `'invalid-credentials'`: telling a reader whose password was
   * correct that it was not sends them to reset a password that works.
   */
  | 'code-not-sent'

/** What {@link SignInService.signIn} is asked. */
export interface SignInRequest {
  /** The address as the reader typed it. Normalised here, once, before use. */
  readonly email: string
  /** The password as the reader typed it. Never logged, never returned. */
  readonly password: string
  /**
   * The identifier the browser is carrying: the pre-auth identifier for a
   * browser that has not signed in, or a live session's for one that has.
   *
   * It is superseded either way. On the code path the challenge is BOUND to
   * it, so a code issued for one browser cannot be redeemed in another; on
   * the direct path `startSession` revokes it in the same statement that
   * mints its replacement, which is `SECURITY.md`'s "never reuse a pre-auth
   * id".
   */
  readonly browserSession: SessionId
  /** Whether the reader ticked "keep me signed in" (`SCREENS.md` §3.1). */
  readonly keepSignedIn: boolean
  /** The requesting address, for the per-address window and the challenge row. */
  readonly ip: string
  /** The device label the account screen will show, or `null`. */
  readonly device: string | null
  /** The place label shown beside it, or `null`. A place, never an address. */
  readonly location: string | null
}

/** What a completed password step leaves the reader in front of. */
export type SignInOutcome =
  | {
      /** The account requires the code step; a code has been sent. */
      readonly status: 'otp-required'
      /** Where it went, masked — never the full address (`SCREENS.md` §3.2). */
      readonly maskedTo: string
    }
  | {
      /** The account does not require the code step; the session is live. */
      readonly status: 'signed-in'
      /** The identifier, its `Set-Cookie` value and the row's expiry. */
      readonly session: IssuedSession
    }

/** What {@link createSignInService} needs from the world outside this module. */
export interface SignInServiceDependencies {
  /** The Payload Local API instance the `users` rows live behind. */
  readonly payload: Payload
  /** Issues the one-time code when the account's stored flag asks for one. */
  readonly otp: OtpService
  /** Issues the session, and supersedes the identifier the browser arrived with. */
  readonly sessions: SessionService
  /** Records and judges the attempt, in both of the password endpoint's windows. */
  readonly limiter: SignInRateLimiter
  /**
   * The current instant, in epoch milliseconds. Injected rather than read
   * from `Date.now()` inside the logic (CLAUDE.md §2.3) — it decides only
   * whether a lock has lifted, and that is worth being able to move.
   */
  readonly now: () => number
}

/** Runs the password step. */
export interface SignInService {
  /**
   * Judges one password attempt and either sends a code or issues a session.
   *
   * @param request - See {@link SignInRequest}. It carries no `otpRequired`:
   *   that is read from the account's row, here, on every call.
   * @returns `ok` with `'otp-required'` and the masked address the code went
   *   to, or `ok` with `'signed-in'` and the issued session — the cookie is
   *   returned, never set, which is Task 10's. Otherwise `err` naming the
   *   refusal; an unknown address, a wrong password and a locked account are
   *   the SAME refusal, reached in the same time.
   * @example
   * const outcome = await signIn.signIn({ email, password, browserSession, keepSignedIn, ip, device, location })
   */
  signIn(request: SignInRequest): Promise<Result<SignInOutcome, SignInRefusal>>
}

/** The three facts the credential read needs off a `users` row. */
interface CredentialAccount {
  readonly id: number
  readonly otp_required: boolean | null
  readonly lock_until: Date | null
}

/**
 * The address as Payload's own login operation will spell it.
 *
 * `loginOperation` does `email.toLowerCase().trim()` and then looks the row
 * up by EXACT equality, so this is not a choice — it is the spelling under
 * which an account can be found at all, and anything else here would find
 * rows Payload then refuses to authenticate. The same value keys the
 * per-address rate-limit window, so two spellings cannot hold two budgets.
 *
 * @param address - The address as the reader typed it.
 * @returns The normalised form.
 */
const normaliseAddress = (address: string): string => address.toLowerCase().trim()

/**
 * Spends the same key derivation Payload's password comparison spends, and
 * discards it.
 *
 * THIS IS NOT A HASH OF ANYTHING. Nothing is stored, nothing is compared, and
 * the derived key is dropped. Its entire purpose is that the branch which
 * cannot reach Payload's comparison — an address naming no row, or an account
 * already locked — costs the same as the branch that does. Without it the
 * two answer in a millisecond against forty, and the identical response above
 * is worth nothing.
 *
 * The password itself is passed rather than a constant, so the work is
 * exactly the work the real path would have done on this input.
 *
 * @param password - The password that was offered.
 * @returns Once the derivation has finished.
 */
const burnAKey = (password: string): Promise<void> =>
  new Promise((resolve, reject) => {
    pbkdf2(password, DECOY_SALT, PAYLOAD_PBKDF2.iterations, PAYLOAD_PBKDF2.keyBytes, PAYLOAD_PBKDF2.digest, (error) => {
      /* c8 ignore start -- the same arm, for the same reason, as `otpService.ts`'s `deriveKey`: `@types/node` declares no `pbkdf2.__promisify__`, and `pbkdf2` fails only for parameters it rejects, all of which are module constants here. No value a caller supplies can reach it, and forcing it would mean mocking `node:crypto` to prove a mock. */
      if (error !== null) {
        reject(error)
        return
      }
      /* c8 ignore stop */
      resolve()
    })
  })

/**
 * The branded account id a `users` row belongs to.
 *
 * @param rawId - The row's `id` column.
 * @returns The branded {@link UserId}.
 */
const accountOf = (rawId: number): UserId => {
  const branded = userId(String(rawId))
  /* c8 ignore start -- `userId` refuses only an empty or whitespace-only string, and `String` of a `NOT NULL` integer primary key is neither. The guard exists to unwrap the constructor's Result, not because a row can be nameless. */
  if (!isOk(branded)) throw new Error('a users row has no id')
  /* c8 ignore stop */
  return branded.value
}

/**
 * Whether Payload accepts `password` for the account at `address`.
 *
 * PAYLOAD IS THE CREDENTIAL STORE AND THE LOCKOUT, AND NOTHING ELSE.
 * `loginOperation` is what derives the key, compares it in constant time,
 * increments `login_attempts` and applies `maxLoginAttempts` / `lockTime`
 * (`apps/web/collections/users.ts`) — so calling it is how
 * `SECURITY.md`'s "account lockout with a cooling-off period" stays one
 * mechanism rather than two. The JWT it also mints is discarded: sessions
 * here are revocable rows, not tokens (`docs/adr/0017-session-store-and-rotation.md`).
 *
 * @param payload - The Local API instance.
 * @param address - The already-normalised sign-in address.
 * @param password - The password that was offered.
 * @returns Whether the login succeeded. A rejection is an ANSWER, not an
 *   error: Payload signals a wrong password, and an account locked by a
 *   request racing this one, by throwing. Both are the same refusal here, so
 *   there is nothing to distinguish and nothing to rethrow.
 */
const passwordAccepted = async (payload: Payload, address: string, password: string): Promise<boolean> => {
  try {
    await payload.login({ collection: 'users', data: { email: address, password } })
    return true
  } catch {
    return false
  }
}

/**
 * Builds the sign-in service over its injected collaborators.
 *
 * @param dependencies - See {@link SignInServiceDependencies}.
 * @returns The service. A factory rather than module-level functions so
 *   nothing here holds state between calls (CLAUDE.md §3.3 rejects singletons
 *   that do) and so the clock and every collaborator are the caller's choice.
 * @example
 * const signIn = createSignInService({ payload, otp, sessions, limiter, now: Date.now })
 */
export const createSignInService = ({
  payload,
  otp,
  sessions,
  limiter,
  now,
}: SignInServiceDependencies): SignInService => ({
  async signIn({ email, password, browserSession, keepSignedIn, ip, device, location }) {
    const address = normaliseAddress(email)

    // FIRST, AND FOR BOTH WINDOWS, whatever the address turns out to name.
    // The limiter keys its second dimension on a hash of this address rather
    // than on an account id precisely so that this call does the same work
    // for an address that names nothing (phase ruling F43) — a limiter that
    // skipped a dimension on the miss path would be an enumeration oracle
    // sitting inside the defence against enumeration.
    const admitted = await limiter.admitPasswordAttempt({ ip, email: address })
    if (!admitted.ok) return err('rate-limited')

    // Read rather than found through the Local API: `lockUntil` is one of
    // Payload's auth-internal fields and does not come back from an ordinary
    // `find`, and the whole reason for reading it is below. Three columns,
    // one indexed lookup, no `depth` to set.
    const found = await payload.db.pool.query<CredentialAccount>(
      `SELECT id, otp_required, lock_until FROM users WHERE email = $1 LIMIT 1`,
      [address],
    )
    const account = found.rows[0]

    // THE TWO BRANCHES PAYLOAD ANSWERS WITHOUT HASHING, MADE TO COST WHAT
    // HASHING COSTS. `checkLoginPermission` throws for a missing row and for
    // a locked one before `authenticateLocalStrategy` is ever reached, so
    // both would otherwise be an order of magnitude faster than a wrong
    // password. The lock is read here to decide the WORK, never the outcome:
    // Payload still owns the counter, the cooling-off period and the refusal.
    if (account === undefined || (account.lock_until !== null && account.lock_until.getTime() > now())) {
      await burnAKey(password)
      return err('invalid-credentials')
    }

    if (!(await passwordAccepted(payload, address, password))) return err('invalid-credentials')

    // THE SERVER DECIDES, AND IT DECIDES FROM THE ROW IT JUST READ. NULL is
    // required, not optional: the column is nullable, and a second factor
    // that switched itself off for a row written before the default would do
    // it silently. Prototype hole #2 is closed by there being no other value
    // to read — `SignInRequest` has no `otpRequired` field at all.
    if (account.otp_required !== false) {
      const issued = await otp.issueChallenge(accountOf(account.id), browserSession, ip)
      if (!issued.ok) return err('code-not-sent')
      return ok({ status: 'otp-required', maskedTo: issued.value.maskedTo })
    }

    const started = await sessions.startSession({
      user: accountOf(account.id),
      // The identifier the browser arrived with, superseded in the same
      // statement that mints its replacement. Passing `null` here would issue
      // a working session and leave the pre-auth one working too, which is
      // the fixation `SECURITY.md` names.
      previous: browserSession,
      keepSignedIn,
      device,
      location,
    })
    /* c8 ignore next -- `startSession` refuses only `'unknown-account'`, and the row was read two statements earlier; the arm is the fail-closed answer to the account being deleted in between, and exists because the Result must be unwrapped */
    if (!started.ok) return err('invalid-credentials')

    return ok({ status: 'signed-in', session: started.value })
  },
})
