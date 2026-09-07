/**
 * sessions — issues, authenticates and revokes the session rows every admin
 * request is checked against.
 *
 * This is `SECURITY.md`'s "Sessions and access", the half that touches
 * Postgres. The pure half — the cookie's attributes, the two lifetimes and
 * the state a row is in at an instant — is
 * `packages/domain/src/auth/session.ts`, gated at 100%. Nothing here decides
 * any of those facts a second time. The shape of the whole layer, and the
 * options rejected to arrive at it, are
 * `docs/adr/0017-session-store-and-rotation.md`.
 *
 * PATTERNS (CLAUDE.md §3.3). Repository: this is the only place a `sessions`
 * row is written or read by the application, so nothing above it learns what
 * the table looks like — the account screen reaches the same rows through
 * Payload's own access rules (`apps/web/collections/sessions.ts`), which is
 * asserted to meet this module on the same row rather than assumed to.
 * Result type: every operation returns a `Result`, so a caller cannot reach
 * an account id without handling the refusal. Value objects: `SessionId` and
 * `UserId` are branded, so an identifier cannot be passed where an account
 * belongs.
 *
 * THERE IS ONE WAY TO CREATE A SESSION AND IT ALWAYS ROTATES.
 * {@link SessionService.startSession} takes the identifier the browser
 * arrived with and supersedes it in the SAME STATEMENT that mints the new
 * one. There is deliberately no second entry point that issues a session
 * without doing so: `SECURITY.md` requires "Rotate the session identifier on
 * login; never reuse a pre-auth id", and a rotation that a caller has to
 * remember to perform is a rotation that a later screen will forget. The
 * revoke-and-insert is a single data-modifying CTE, so the two halves cannot
 * come apart — there is no instant at which the old identifier has been
 * superseded and the new one does not exist, or the reverse.
 *
 * A `previous` OF `null` REVOKES NOTHING, WITHOUT A BRANCH. It is bound
 * straight into the statement, and `token_hash = NULL` is NULL rather than
 * true, so the CTE simply matches no rows. That is why sign-in from a fresh
 * browser and sign-in from one already holding a session run exactly the same
 * SQL: there is no rotating path and non-rotating path to drift apart.
 *
 * SESSION FIXATION IS WHAT THAT ROTATION IS FOR. An attacker who can plant an
 * identifier in a victim's browser before they sign in — through a subdomain,
 * a stale cookie, a shared machine — holds a working session afterwards if
 * sign-in adopts the identifier it was handed. Rotation makes the planted
 * value worthless the moment it is used, and `sessions.integration.test.ts`
 * asserts the OLD identifier is refused rather than that a new one exists:
 * the second is true of an implementation that never rotates at all.
 *
 * THE STORED VALUE IS A HASH, AND IT IS SHA-256 RATHER THAN SCRYPT. The same
 * reasoning as `otpService.ts`'s `sessionHash` and for the same reason
 * (`docs/adr/0015-otp-challenge-hashing.md`): this is the LOOKUP KEY — it
 * must be deterministic and indexable — and a session identifier is 32 bytes
 * from the CSPRNG, so there is no dictionary to run against it. A six-digit
 * code needs scrypt because a million values fall to a laptop; 2^256 does
 * not.
 *
 * THE LIFETIME LIVES IN THE ROW, NEVER IN THE TOKEN, which is the whole of
 * "'Keep me signed in' is a longer-lived, revocable session row — not a
 * longer JWT". The identifier is opaque: it carries no account, no expiry and
 * no signature, so nothing about it can be believed without reading the row
 * it names. Shortening or revoking that row therefore takes effect on the
 * next request whatever the browser was told, and the integration suite pins
 * exactly that by ageing a remembered row's `expires_at` into the past and
 * watching the untouched thirty-day cookie stop working.
 *
 * AUTHENTICATION READS THE ROW AND LETS THE DOMAIN DECIDE, rather than
 * spelling the same conditions into the `WHERE` clause. `rateLimit.ts`'s
 * header states the reason and it holds here: a rule expressed in both SQL
 * and TypeScript is a rule neither test can break by itself. There is no
 * read-check-write race to defend against — nothing here increments a
 * counter — so the claim-then-explain shape `otpService.ts` needs is not
 * needed. A revocation that commits after this module has read the row lets
 * that one request through, which is not a violation of "immediately": at the
 * instant the row was read it was live, and the very next request is refused.
 *
 * NOTHING HERE LOGS. Not the identifier, not its hash, not an address, not an
 * account (CLAUDE.md §7). `location` is a place label for the account
 * screen's list — "Reykjavik, Iceland" — and must never be handed a raw IP:
 * the row already names the account, and `SECURITY.md`'s prohibition is on
 * the two appearing together.
 *
 * THE TABLE IS BOUNDED BY A SWEEP THAT RIDES ALONG WITH `startSession`. See
 * the comment on that statement; the policy and its one number are
 * `@travel-diary/domain/auth/retention`.
 *
 * Depends on: `payload` (the Local API instance, injected) and its Postgres
 * pool, `node:crypto`, and `@travel-diary/domain`'s `sessionState`,
 * `sessionCookie`, `sessionLifetimeMs`, `PRUNE_SWEEP_ROWS`, the branded ids
 * and `Result`.
 */
import { createHash, randomBytes } from 'node:crypto'
import { sessionCookie, sessionLifetimeMs, sessionState } from '@travel-diary/domain/auth/session'
import { PRUNE_SWEEP_ROWS } from '@travel-diary/domain/auth/retention'
import { type SessionId, type UserId, sessionId, userId } from '@travel-diary/domain/ids'
import { type Result, err, isOk, ok } from '@travel-diary/domain/result'
import type { Payload } from 'payload'

/**
 * How many random bytes a session identifier is drawn from.
 *
 * Thirty-two, matching the width of the SHA-256 the row stores it under:
 * anything narrower would make the hash the stronger half of the pair, which
 * is the wrong way round for a value an attacker guesses rather than inverts.
 */
const IDENTIFIER_BYTES = 32

/** Why {@link SessionService.startSession} refused to issue a session. */
export type StartFailure = 'unknown-account'

/**
 * Why {@link SessionService.authenticate} refused an identifier.
 *
 * `'unknown'` covers both an identifier that never named a row and one whose
 * row has been deleted outright. The three are distinguished rather than
 * collapsed because the holder of an identifier is either its owner or its
 * thief, and both already know they hold it — there is nothing here to
 * enumerate, unlike the OTP flow, where naming the refusal would say which
 * sessions hold a live challenge.
 */
export type SessionRefusal = 'unknown' | 'revoked' | 'expired'

/** Why {@link SessionService.revokeSession} had nothing to revoke. */
export type RevokeFailure = 'unknown'

/** What a freshly-started session hands back to whatever is answering the request. */
export interface IssuedSession {
  /** The opaque identifier the browser will present. Never stored as-is. */
  readonly session: SessionId
  /** The `Set-Cookie` value carrying it, under the admin cookie policy. */
  readonly cookie: string
  /** When the ROW stops authenticating, in epoch milliseconds. */
  readonly expiresAt: number
}

/** Who a live session belongs to. */
export interface AuthenticatedSession {
  /** The account the session was issued for. */
  readonly user: UserId
}

/** What {@link SessionService.startSession} is asked. */
export interface StartSessionRequest {
  /** The account that has just proved who it is. */
  readonly user: UserId
  /**
   * The identifier the browser arrived with, or `null` when it carried none.
   * It is superseded either way — see this module's header.
   */
  readonly previous: SessionId | null
  /** Whether the reader ticked "keep me signed in" (`SCREENS.md` §3.1). */
  readonly keepSignedIn: boolean
  /** The device label shown on the account screen's list, or `null`. */
  readonly device: string | null
  /** The place label shown beside it, or `null`. A place, never an address. */
  readonly location: string | null
}

/** What {@link SessionService.revokeSession} is asked. */
export interface RevokeSessionRequest {
  /** The session to revoke. */
  readonly session: SessionId
  /**
   * The account it must belong to. Not decoration: without it, anybody
   * holding an identifier could revoke it, and revocation is how a stolen
   * session is taken away from the thief rather than from the owner.
   */
  readonly owner: UserId
}

/** What {@link SessionService.revokeAllSessions} is asked. */
export interface RevokeAllSessionsRequest {
  /** The account being signed out everywhere. */
  readonly owner: UserId
}

/** What {@link createSessionService} needs from the world outside this module. */
export interface SessionServiceDependencies {
  /** The Payload Local API instance the `sessions` rows live behind. */
  readonly payload: Payload
  /**
   * The current instant, in epoch milliseconds. Injected rather than read
   * from `Date.now()` inside the logic (CLAUDE.md §2.3), so a lifetime is
   * testable without waiting out thirty days.
   */
  readonly now: () => number
}

/** Issues, authenticates and revokes admin sessions. */
export interface SessionService {
  /**
   * Supersedes whatever identifier the browser arrived with and issues a new
   * one for `user`.
   *
   * @param request - See {@link StartSessionRequest}.
   * @returns `ok` with the identifier, its cookie and the row's expiry, or
   *   `err('unknown-account')` when `user` names no account. The previous
   *   identifier stops authenticating in the same statement that mints the
   *   new one.
   */
  startSession(request: StartSessionRequest): Promise<Result<IssuedSession, StartFailure>>

  /**
   * Names the account a live session belongs to, and stamps the row as seen.
   *
   * @param session - The identifier the browser presented.
   * @returns `ok` with the account, or `err` naming why the session was
   *   refused. A revoked or expired row is refused on the first request after
   *   it became so.
   */
  authenticate(session: SessionId): Promise<Result<AuthenticatedSession, SessionRefusal>>

  /**
   * Revokes one of an account's own sessions.
   *
   * @param request - See {@link RevokeSessionRequest}.
   * @returns `ok` when a live session of `owner`'s was revoked, or
   *   `err('unknown')` when there was none — which covers a session belonging
   *   to another account, one already revoked, and one that never existed.
   *   The three are one refusal because the caller can act on none of them
   *   differently.
   */
  revokeSession(request: RevokeSessionRequest): Promise<Result<void, RevokeFailure>>

  /**
   * Revokes every live session an account holds — "Sign out everywhere".
   *
   * The current session is included, deliberately: a reader who presses it
   * because a device was lost means every device, and leaving the one in
   * front of them signed in makes the count on the screen wrong.
   *
   * @param request - See {@link RevokeAllSessionsRequest}.
   * @returns How many sessions were revoked, for the confirmation the screen
   *   shows.
   */
  revokeAllSessions(request: RevokeAllSessionsRequest): Promise<{ revoked: number }>
}

/** The row a started session hands back. */
interface StartedSession {
  readonly id: number
}

/** The three facts an authentication reads off a session row. */
interface AuthenticatingSession {
  readonly id: number
  readonly user_id: number
  readonly expires_at: Date
  readonly revoked_at: Date | null
}

/**
 * SHA-256 of a session identifier, hex encoded.
 *
 * @param session - The identifier the browser holds.
 * @returns 64 hex characters — the value stored in and looked up by
 *   `sessions.tokenHash`.
 */
const hashIdentifier = (session: SessionId): string => createHash('sha256').update(session).digest('hex')

/**
 * A fresh session identifier, drawn from the CSPRNG.
 *
 * `base64url` rather than hex so the cookie value stays short, and because
 * every character it produces is already cookie-safe — no escaping, and
 * nothing for a later reader to strip.
 *
 * @returns The branded identifier.
 */
const newIdentifier = (): SessionId => {
  const branded = sessionId(randomBytes(IDENTIFIER_BYTES).toString('base64url'))
  /* c8 ignore start -- `sessionId` refuses only an empty or whitespace-only string, and base64url of 32 bytes is 43 characters of `[A-Za-z0-9_-]`. The guard exists because the constructor returns a Result that has to be unwrapped, not because an identifier can be empty. */
  if (!isOk(branded)) throw new Error('a generated session identifier is empty')
  /* c8 ignore stop */
  return branded.value
}

/**
 * The branded account id a session row belongs to.
 *
 * @param rawId - The row's `user_id` column.
 * @returns The branded {@link UserId}.
 */
const accountOf = (rawId: number): UserId => {
  const branded = userId(String(rawId))
  /* c8 ignore start -- `userId` refuses only an empty or whitespace-only string and `String` of a number is neither. The only input reaching it is `user_id`, a `NOT NULL integer` column; the guard exists to unwrap the constructor's Result, not because a row can be nameless. */
  if (!isOk(branded)) throw new Error('a sessions row has no account id')
  /* c8 ignore stop */
  return branded.value
}

/**
 * The Payload row id an account's branded {@link UserId} names.
 *
 * @param user - The branded id.
 * @returns The numeric row id, or `undefined` when `user` is not one. The
 *   brand only promises a non-empty string, so a caller *can* hand over
 *   something that is not a Payload id — and the alternative to answering
 *   `undefined` here is `Number('nonsense')` reaching the driver as `NaN` and
 *   escaping as a raw `Failed query: … params: NaN`, past the `Result`
 *   contract and into whatever surfaces it. The same guard, for the same
 *   reason, as `otpService.ts`'s.
 */
const accountRowId = (user: UserId): number | undefined => {
  const parsed = Number(user)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * Builds the session service over an injected Payload and clock.
 *
 * @param dependencies - See {@link SessionServiceDependencies}.
 * @returns The service. A factory rather than module-level functions so
 *   nothing here holds state between calls — the state is the table
 *   (CLAUDE.md §3.3 rejects singletons that hold mutable state) — and so the
 *   clock is the caller's choice rather than this module's.
 * @example
 * const sessions = createSessionService({ payload, now: Date.now })
 * const issued = await sessions.startSession({ user, previous, keepSignedIn: false, device, location })
 */
export const createSessionService = ({ payload, now }: SessionServiceDependencies): SessionService => ({
  async startSession({ user, previous, keepSignedIn, device, location }) {
    const startedAt = now()

    const accountId = accountRowId(user)
    if (accountId === undefined) return err('unknown-account')

    const accounts = await payload.find({
      collection: 'users',
      where: { id: { equals: accountId } },
      limit: 1,
      depth: 0,
    })
    if (accounts.docs[0] === undefined) return err('unknown-account')

    const lifetimeMs = sessionLifetimeMs({ keepSignedIn })
    const expiresAt = startedAt + lifetimeMs
    const session = newIdentifier()

    // ONE STATEMENT, THREE EFFECTS, and the atomicity of the first two is the
    // point. The `superseded` CTE revokes the identifier the browser arrived
    // with; the `INSERT` mints its replacement. A data-modifying CTE cannot
    // see another's rows, so the revoke can never reach the row being written
    // even in the (impossible) event that the CSPRNG returned the previous
    // identifier.
    //
    // THE THIRD EFFECT IS WHAT BOUNDS THE TABLE. `sessions` had no cleanup at
    // all — blocker B4 of Phase 2's final review, and the same condition
    // ruling F33 declared unacceptable for `sign_in_attempts` in this same
    // phase. Every start now also deletes a bounded batch of rows that can no
    // longer authenticate anybody, from ANY account, oldest first: the same
    // cross-key sweep and the same one number
    // (`PRUNE_SWEEP_ROWS`, @travel-diary/domain/auth/retention). A key-scoped
    // prune would bound this table by the number of accounts ever seen rather
    // than by anything.
    //
    // A ROW IS DEAD WHEN `authenticate` CAN NO LONGER ADMIT IT — expired, or
    // revoked. That is the same pair of conditions `sessionState` refuses on,
    // read from the same two columns, so nothing that could have authenticated
    // is removed. The one thing it costs is that a dead row's refusal becomes
    // `'unknown'` rather than `'expired'` or `'revoked'` once it is swept, and
    // `guard.ts` records that nothing acts on the difference.
    //
    // THE ROW BEING SUPERSEDED IS EXCLUDED FROM THE SWEEP, deliberately: an
    // arriving identifier that is already revoked would otherwise be matched
    // by both the `UPDATE` and the `DELETE` in one statement, which is a race
    // between two commands over one row rather than a behaviour anybody chose.
    // `IS DISTINCT FROM` rather than `<>` so that a browser arriving with no
    // identifier at all ($5 NULL) still sweeps, instead of comparing to NULL
    // and excluding every row.
    //
    // `previous` IS BOUND, NOT BRANCHED ON: `token_hash = NULL` evaluates to
    // NULL rather than true, so a browser arriving with no identifier
    // supersedes nothing while running exactly the same SQL as one arriving
    // with a live session. There is no non-rotating path for a later change
    // to take by accident.
    const started = await payload.db.pool.query<StartedSession>(
      `WITH superseded AS (
         UPDATE sessions
            SET revoked_at = $6, updated_at = $6
          WHERE token_hash = $5 AND revoked_at IS NULL
       ),
       dead AS (
         SELECT id FROM sessions
          WHERE (expires_at <= $6 OR revoked_at IS NOT NULL)
            AND (token_hash IS DISTINCT FROM $5)
          ORDER BY id
          LIMIT $8
       ),
       swept AS (
         DELETE FROM sessions WHERE id IN (SELECT id FROM dead)
       )
       INSERT INTO sessions
         (user_id, token_hash, expires_at, device, location, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $7, $6, $6)
       RETURNING id`,
      [
        accountId,
        hashIdentifier(session),
        new Date(expiresAt),
        device,
        previous === null ? null : hashIdentifier(previous),
        new Date(startedAt),
        location,
        PRUNE_SWEEP_ROWS,
      ],
    )
    // An `INSERT ... RETURNING` of one row returns exactly one row or throws,
    // but `noUncheckedIndexedAccess` cannot know that. Folding over the rows
    // says so without a defensive arm no test could ever take - the same
    // shape `rateLimit.ts` uses for its own single-row result.
    const issued = started.rows.reduce((highest, row) => Math.max(highest, row.id), 0)
    /* c8 ignore next -- the fold's zero can only be reached by an INSERT that returned no row, which throws instead; the expression is here so the id is read rather than discarded */
    if (issued === 0) return err('unknown-account')

    return ok({ session, cookie: sessionCookie({ token: session, lifetimeMs }), expiresAt })
  },

  async authenticate(session) {
    const checkedAt = now()

    const found = await payload.db.pool.query<AuthenticatingSession>(
      `SELECT id, user_id, expires_at, revoked_at FROM sessions WHERE token_hash = $1 LIMIT 1`,
      [hashIdentifier(session)],
    )
    const row = found.rows[0]
    if (row === undefined) return err('unknown')

    // The domain decides, and it decides ALONE - the conditions are
    // deliberately absent from the query above. See this module's header, and
    // `rateLimit.ts`'s, for why a rule expressed in both SQL and TypeScript is
    // a rule that neither test can break by itself.
    const state = sessionState(
      { expiresAt: row.expires_at.getTime(), revokedAt: row.revoked_at === null ? null : row.revoked_at.getTime() },
      checkedAt,
    )
    if (state !== 'active') return err(state)

    // Stamped only once the session is known live, so a refused attempt never
    // moves the "last seen" the account screen shows beside a device the
    // reader has already signed out.
    await payload.db.pool.query(`UPDATE sessions SET last_seen_at = $2, updated_at = $2 WHERE id = $1`, [
      row.id,
      new Date(checkedAt),
    ])

    return ok({ user: accountOf(row.user_id) })
  },

  async revokeSession({ session, owner }) {
    const accountId = accountRowId(owner)
    if (accountId === undefined) return err('unknown')

    // `user_id` IS IN THE `WHERE`, not checked afterwards: the row is only
    // revoked if it is the caller's, so there is no window in which somebody
    // else's session has been revoked and the check has not yet run.
    const revoked = await payload.db.pool.query<{ id: number }>(
      `UPDATE sessions
          SET revoked_at = $3, updated_at = $3
        WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL
      RETURNING id`,
      [hashIdentifier(session), accountId, new Date(now())],
    )

    return revoked.rows.length === 0 ? err('unknown') : ok(undefined)
  },

  async revokeAllSessions({ owner }) {
    const accountId = accountRowId(owner)
    if (accountId === undefined) return { revoked: 0 }

    const revoked = await payload.db.pool.query<{ id: number }>(
      `UPDATE sessions
          SET revoked_at = $2, updated_at = $2
        WHERE user_id = $1 AND revoked_at IS NULL
      RETURNING id`,
      [accountId, new Date(now())],
    )

    return { revoked: revoked.rows.length }
  },
})
