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
 * the table looks like. Result type: every operation returns a `Result`, so a caller cannot reach
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
 * ═══ SCREENS.md §2.11's LIST AND ITS REVOKE ARE BOTH HERE, AND HAVE TO BE ═══
 *
 * {@link SessionService.listSessions} and
 * {@link SessionService.revokeSessionRow} were added by Phase 4 Task 14, and
 * neither could live in the screen's own read module. `sessions.tokenHash`
 * refuses `read` AND every field refuses `update` through the API
 * (`apps/web/collections/sessions.ts`), so Payload's Local API can neither see
 * the column that decides which row is CURRENT nor write the column that
 * revokes one. What the screen holds is a row id; what the request carries is
 * an identifier; and {@link hashIdentifier} is the only thing in this
 * repository that turns the second into the first's stored form.
 *
 * THE CURRENT ROW IS THE ONE WHOSE HASH MATCHES THE COOKIE, NEVER THE NEWEST.
 * The two agree on every account holding one session, which is why a fixture
 * has to hold two to tell them apart, and the cost of the wrong one is that
 * the author presses Revoke beside the wrong device and signs themselves out.
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
import { type SessionId, type UserId, accountRowId, sessionId, userId } from '@travel-diary/domain/ids'
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

/** What {@link SessionService.listSessions} is asked. */
export interface ListSessionsRequest {
  /** The account whose sessions are being listed. */
  readonly owner: UserId
  /**
   * The identifier THIS request is carrying, or `null` when it carries none.
   *
   * It is what decides which row is marked current, and it is the reason this
   * listing lives in this module: the comparison is against the row's stored
   * hash, and {@link hashIdentifier} is the only place that hash is computed.
   */
  readonly carried: SessionId | null
}

/** One row of SCREENS.md 2.11's "Where you are signed in". */
export interface ListedSession {
  /** The row's own id - how the screen addresses it (CLAUDE.md 0.9). */
  readonly row: number
  /** The device label recorded when the session was minted, or `null`. */
  readonly device: string | null
  /** The place recorded beside it, or `null`. A place, never an address. */
  readonly location: string | null
  /** When the session was minted, in epoch milliseconds. */
  readonly startedAt: number
  /**
   * When it last authenticated, or `null` when nothing has yet.
   *
   * `null` RATHER THAN THE START TIME. `authenticate` stamps this column only
   * once a session is known live, so a row that has never been presented has
   * no last-seen - and printing its creation time instead would tell the
   * author a device was in use when it was not.
   */
  readonly lastSeenAt: number | null
  /**
   * Whether this is the row the request came in on.
   *
   * DECIDED BY THE HASH, NEVER BY "THE NEWEST ROW". The two agree on every
   * account holding one session and disagree the moment one holds two, and
   * the consequence of getting it wrong is that the author revokes the
   * session they are sitting in while believing they are revoking another
   * device's.
   */
  readonly isCurrent: boolean
}

/** What {@link SessionService.revokeSessionRow} is asked. */
export interface RevokeSessionRowRequest {
  /** The session ROW to revoke, as the screen addresses it. */
  readonly row: number
  /**
   * The account it must belong to. Not decoration, and more load-bearing here
   * than on {@link RevokeSessionRequest}: a row id is a small integer anybody
   * can type, where an identifier is 32 bytes of CSPRNG. This clause is the
   * whole of what stops one account revoking another's session.
   */
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
   * Every live session an account holds, newest first, with the one this
   * request came in on marked.
   *
   * IT IS HERE RATHER THAN IN THE SCREEN'S OWN READ MODULE for two reasons
   * that resolve to one: `sessions.tokenHash` refuses `read` through the API
   * (`apps/web/collections/sessions.ts`), so a Local API `find` cannot see the
   * column the comparison needs; and {@link hashIdentifier} is private to this
   * module, so a second reader would be a second definition of how a session
   * identifier is stored.
   *
   * @param request - See {@link ListSessionsRequest}.
   * @returns One entry per live row. An account id that names no row lists
   *   nothing, which is what an account with no sessions looks like - there is
   *   nothing for a screen to do differently.
   */
  listSessions(request: ListSessionsRequest): Promise<readonly ListedSession[]>

  /**
   * Revokes one of an account's own sessions, addressed by its ROW.
   *
   * THE SCREEN CANNOT CALL {@link SessionService.revokeSession}, and that is a
   * property of the store rather than a convenience: only the identifier's
   * HASH is kept, so a screen that lists a reader's sessions holds a row id
   * and can never hold the identifier. Revoking by row is how SCREENS.md
   * 2.11's Revoke reaches the same row `authenticate` reads.
   *
   * @param request - See {@link RevokeSessionRowRequest}.
   * @returns `ok` when a live session of `owner`'s was revoked, or
   *   `err('unknown')` when there was none - which covers a row belonging to
   *   another account, one already revoked, and one that never existed, for
   *   {@link SessionService.revokeSession}'s reason.
   */
  revokeSessionRow(request: RevokeSessionRowRequest): Promise<Result<void, RevokeFailure>>

  /**
   * Revokes every live session an account holds — "Sign out everywhere".
   *
   * The current session is included, deliberately: a reader who presses it
   * because a device was lost means every device, and leaving the one in
   * front of them signed in makes the count on the screen wrong.
   *
   * @param request - See {@link RevokeAllSessionsRequest}.
   * @returns How many sessions were revoked. THE COUNT IS FOR A CALLER THAT
   *   OUTLIVES THE REVOCATION, which is the property rather than a census —
   *   and this sentence has now been wrong in both directions, so it says which
   *   caller that is. `revokeLighthouseSessions`
   *   (`apps/web/scripts/mint-lighthouse-session.ts`) reads it and hands it to
   *   `run-revoke-lighthouse-session.ts`, which prints
   *   `revoked N collector session(s)` for whoever ran the performance gate;
   *   that caller revokes somebody ELSE's sessions and is still running
   *   afterwards. SCREENS.md §2.11's "Sign out everywhere" is the other kind:
   *   it revokes the presser's own session too, so its next render is a
   *   redirect to the sign-in screen and there is nowhere to draw a number —
   *   `app/(admin)/admin/account/actions.ts` discards it for that reason. An
   *   earlier version of this line promised "the confirmation the screen
   *   shows" (there is none) and its correction claimed "nothing reads it
   *   today" (the script does).
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

/** The columns SCREENS.md 2.11's list is drawn from. */
interface ListableSession {
  readonly id: number
  readonly device: string | null
  readonly location: string | null
  readonly created_at: Date
  readonly last_seen_at: Date | null
  readonly is_current: boolean
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

  async listSessions({ owner, carried }) {
    const accountId = accountRowId(owner)
    if (accountId === undefined) return []

    // THE COMPARISON IS DONE BY POSTGRES, against a bound parameter, rather
    // than by reading `token_hash` out and comparing it here. The hash of a
    // live session is the nearest thing this table holds to a credential, and
    // a query that selected it would put every device's digest into a view
    // object one render away from a page - which is the same reason the
    // collection refuses `read` on that column. `IS NOT DISTINCT FROM` rather
    // than `=` so that a request carrying no identifier ($2 NULL) marks
    // nothing, instead of comparing to NULL and marking nothing by accident.
    //
    // LIVE MEANS WHAT `authenticate` MEANS BY IT - not revoked, not expired,
    // read from the same two columns `sessionState` judges. A row this list
    // showed but `authenticate` refused would be a device the author is told
    // they are signed in on and is not.
    const listed = await payload.db.pool.query<ListableSession>(
      `SELECT id, device, location, created_at, last_seen_at,
              (token_hash IS NOT DISTINCT FROM $2) AS is_current
         FROM sessions
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $3
        ORDER BY created_at DESC, id DESC`,
      [accountId, carried === null ? null : hashIdentifier(carried), new Date(now())],
    )

    return listed.rows.map((row) => ({
      row: row.id,
      device: row.device,
      location: row.location,
      startedAt: row.created_at.getTime(),
      lastSeenAt: row.last_seen_at === null ? null : row.last_seen_at.getTime(),
      isCurrent: row.is_current,
    }))
  },

  async revokeSessionRow({ row, owner }) {
    const accountId = accountRowId(owner)
    if (accountId === undefined) return err('unknown')

    // `user_id` IS IN THE `WHERE`, for `revokeSession`'s reason and with more
    // weight: the row id came off a form, so this clause is the whole of what
    // stops a typed integer revoking somebody else's session.
    const revoked = await payload.db.pool.query<{ id: number }>(
      `UPDATE sessions
          SET revoked_at = $3, updated_at = $3
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
      RETURNING id`,
      [row, accountId, new Date(now())],
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
