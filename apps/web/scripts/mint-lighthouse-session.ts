/**
 * mint-lighthouse-session — issues one live admin session and hands back the
 * `Cookie` header a collector should send, so a performance gate can measure a
 * screen that is behind the guard.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * `docs/testing.md` recorded that "`/admin` ITSELF HAS NO LIGHTHOUSE BUDGET",
 * and gave the reason: `/admin` is guarded, so a collector that sends no cookie
 * is answered with a redirect to `/admin/sign-in` and would measure that screen
 * twice under `/admin`'s name. It also named the fix — "a seeded account plus
 * an `extraHeaders` cookie in the collect settings" — and said it was Phase 4's.
 * This is that account and that cookie.
 *
 * ═══ WHERE THE CREDENTIAL GOES, WHICH IS NOT NOWHERE ═══
 *
 * This module writes the value to no file, and neither does
 * `run-mint-lighthouse-session.ts` (it prints one line) or
 * `scripts/run-lighthouse.mjs` (it captures that line and passes it as an
 * argument). Nothing is committed and nothing reaches a CI log.
 *
 * **LIGHTHOUSE ITSELF WRITES IT DOWN, and three headers here said otherwise
 * until the Task 3 review grepped it out of a report on disk.** Lighthouse
 * copies its own `configSettings` — `extraHeaders` among them — into every LHR
 * and every HTML report it saves, so `td-session=…` lands in `.lighthouseci/`
 * and `lhci-reports/` twice per run. Both directories are `.gitignore`d and
 * MUST STAY SO, and neither may be uploaded as a CI artifact — this repository
 * is public.
 *
 * WHAT MAKES THOSE COPIES HARMLESS IS {@link revokeLighthouseSessions}, not the
 * gitignore. `run-lighthouse.mjs` calls it once a configuration's runs are
 * done, so the value sitting in those files authenticates nothing; without it,
 * a full admin session for this account stays live for
 * `SESSION_LIFETIME_MS` — twelve hours.
 *
 * The account's password is drawn fresh from a CSPRNG on every call and is not
 * returned, printed or stored anywhere this process can read back — nothing
 * signs in as this account, because the session is minted directly.
 *
 * IT USES THIS REPOSITORY'S OWN SESSION SERVICE, exactly as
 * `e2e/support/adminSession.ts`'s `aSignedInSession` does, so there is one
 * definition of how a session is stored and this file holds none of it.
 *
 * THE PAYLOAD INSTANCE IS A PARAMETER, not something this module fetches. That
 * is what lets `mint-lighthouse-session.integration.test.ts` mint against the
 * isolated `diary_test` database while the collector mints against the real
 * one — the same split `seed.ts` and `run-seed.ts` already have.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One lookup, one create and one
 * service call.
 * Depends on: node:crypto, `payload` (types), `UserId`
 * (@travel-diary/domain/ids), `createSessionService` (../lib/auth/sessions),
 * `SESSION_COOKIE_NAME` (@travel-diary/domain/auth/session).
 */
import { SESSION_COOKIE_NAME } from '@travel-diary/domain/auth/session'
import { type UserId, userId } from '@travel-diary/domain/ids'
import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'
import { createSessionService } from '../lib/auth/sessions'

/**
 * The account the collector signs in as.
 *
 * `.invalid` is reserved by RFC 2606 and resolves nowhere, so this address can
 * never receive a real message — which matters because a password reset for it
 * would otherwise be deliverable.
 */
export const LIGHTHOUSE_ACCOUNT_EMAIL = 'lighthouse@collector.invalid'

/** How many random bytes the throwaway password is drawn from. */
const PASSWORD_BYTES = 24

/** What the session is labelled as on the account screen's device list. */
const DEVICE_LABEL = 'the performance collector'

/**
 * A row id as the branded account id the session service takes.
 *
 * Through the constructor rather than an `as`: it is the one place that can
 * say the value is not empty, and CLAUDE.md §3.1 wants the narrowing rather
 * than the assertion.
 * @param id - The row's primary key.
 * @returns The branded id.
 * @throws When the id is empty, which Postgres cannot produce for a key.
 */
const branded = (id: number | string): UserId => {
  const built = userId(String(id))
  /* c8 ignore next -- `userId` refuses only an empty or whitespace-only string, and a Postgres primary key is neither. The guard exists because the constructor answers a Result that has to be unwrapped, not because a key can be empty. */
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/**
 * The collector's account, creating it on the first run.
 *
 * @param payload - The Local API instance to read and write through.
 * @returns The account's branded id.
 */
const collectorAccount = async (payload: Payload): Promise<UserId> => {
  const found = await payload.find({
    collection: 'users',
    where: { email: { equals: LIGHTHOUSE_ACCOUNT_EMAIL } },
    limit: 1,
    depth: 0,
  })

  const existing = found.docs[0]
  if (existing !== undefined) return branded(existing.id)

  const created = await payload.create({
    collection: 'users',
    // A password nothing keeps: this account is never signed in to through the
    // form, and the session below is minted directly. Drawn from a CSPRNG so
    // that the row cannot be signed in to by anybody either.
    data: { email: LIGHTHOUSE_ACCOUNT_EMAIL, password: randomBytes(PASSWORD_BYTES).toString('base64url') },
  })
  return branded(created.id)
}

/**
 * Takes every session the collector holds away again.
 *
 * Called by `scripts/run-lighthouse.mjs` once a configuration's runs are done.
 * It is what makes the copy Lighthouse writes into `.lighthouseci/` and
 * `lhci-reports/` worthless rather than merely gitignored — see this module's
 * header.
 *
 * IT REVOKES BY ACCOUNT, NOT BY IDENTIFIER, and that is deliberate: the caller
 * would otherwise have to hand the credential back on a command line, where it
 * is visible in a process listing, and a run that died before revoking would
 * leave its session behind forever. Asking for "everything this account holds"
 * needs no secret and cleans up after the crashed run too.
 *
 * @param payload - The Local API instance the rows live behind.
 * @returns How many sessions were revoked, so a caller can say whether there
 *   was anything to do. Zero is a normal answer — the account may hold none.
 * @example
 * const revoked = await revokeLighthouseSessions(await getPayload())
 */
export const revokeLighthouseSessions = async (payload: Payload): Promise<number> => {
  const found = await payload.find({
    collection: 'users',
    where: { email: { equals: LIGHTHOUSE_ACCOUNT_EMAIL } },
    limit: 1,
    depth: 0,
  })

  const account = found.docs[0]
  if (account === undefined) return 0

  const sessions = createSessionService({ payload, now: Date.now })
  const { revoked } = await sessions.revokeAllSessions({ owner: branded(account.id) })

  return revoked
}

/**
 * A live session for the collector, as a `Cookie` header.
 *
 * @param payload - The Local API instance the `users` and `sessions` rows live
 *   behind. The caller chooses it, which is how the test stays off the
 *   developer's own database.
 * @returns `td-session=<identifier>` — the header, not the bare value, so the
 *   caller passes it straight to `extraHeaders` without knowing the cookie's
 *   name and `readBrowserSession` can read it back with the production parser.
 * @throws When the session could not be issued, which no caller expects and
 *   which must not be turned into a collector that silently measures the
 *   sign-in screen instead.
 * @example
 * const header = await mintLighthouseSession(await getPayload())
 */
export const mintLighthouseSession = async (payload: Payload): Promise<string> => {
  const user = await collectorAccount(payload)
  const sessions = createSessionService({ payload, now: Date.now })

  const started = await sessions.startSession({
    user,
    previous: null,
    keepSignedIn: false,
    device: DEVICE_LABEL,
    location: null,
  })
  /* c8 ignore next -- `startSession` refuses only `'unknown-account'`, and the account was found or created three lines above inside the same process. The guard exists because the service answers a Result that has to be unwrapped, not because this arm is reachable — and it must stay a throw rather than a fallback, because a collector handed an empty cookie measures the sign-in screen under `/admin`'s name. */
  if (!started.ok) throw new Error(`the collector's session was not issued: ${started.error}`)

  return `${SESSION_COOKIE_NAME}=${started.value.session}`
}
