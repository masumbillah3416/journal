/**
 * testDatabaseUrl.test.ts — the connection string the integration suite runs
 * against, derived in each of the three environments it actually runs in.
 *
 * ═══ WHY THIS FILE EXISTS ═══
 *
 * `vitest.integration.config.ts` hard-coded
 * `postgres://diary:diary@localhost:5433/diary_test`, and 5433 is one
 * developer's Docker port mapping. The first time this repository reached CI,
 * whose Postgres service listens on 5432, nothing was listening where that
 * string pointed: Payload never initialised and every integration test file
 * failed downstream. The three cases below are the three environments
 * the derivation has to be right in AT ONCE — this machine's 5433 mapping,
 * CI's `verify` job on `localhost:5432`, and CI's `browser` job, which runs
 * inside a container and addresses the service container as `postgres:5432`.
 *
 * A list of known hosts would satisfy those three and be the same defect with
 * more branches, so what is asserted is the RULE: only the database name
 * changes, and everything else the environment said is kept.
 *
 * Depends on: vitest, ./testDatabaseUrl.
 */
import { describe, expect, it } from 'vitest'
import { DEVELOPER_FALLBACK_DATABASE_URL, testDatabaseUrl } from './testDatabaseUrl'

/**
 * The message a call refuses with, so a case can assert about its text.
 * @param call - The call expected to throw.
 * @returns The refusal's message.
 * @throws If the call returned instead of refusing, so a case that stops
 *   refusing fails rather than asserting about an empty string.
 */
const refusalMessageFrom = (call: () => unknown): string => {
  try {
    call()
  } catch (refusal) {
    return refusal instanceof Error ? refusal.message : String(refusal)
  }
  throw new Error('the call was expected to refuse and did not')
}

describe('testDatabaseUrl', () => {
  it("keeps CI's verify job on the localhost port its Postgres service publishes", () => {
    expect(testDatabaseUrl('postgres://diary:diary@localhost:5432/diary')).toBe(
      'postgres://diary:diary@localhost:5432/diary_test',
    )
  })

  it("keeps CI's browser job addressing its Postgres by service name", () => {
    // That job runs INSIDE a container, so GitHub Actions puts it and its
    // services on one Docker network addressed by service name rather than
    // mapping the port onto the runner's own localhost.
    expect(testDatabaseUrl('postgres://diary:diary@postgres:5432/diary')).toBe(
      'postgres://diary:diary@postgres:5432/diary_test',
    )
  })

  it("keeps this developer's own 5433 port mapping", () => {
    expect(testDatabaseUrl('postgres://diary:diary@localhost:5433/diary')).toBe(
      'postgres://diary:diary@localhost:5433/diary_test',
    )
  })

  it('replaces only the database name, leaving credentials and query parameters alone', () => {
    expect(testDatabaseUrl('postgres://reader:s3cret@db.example.test:6543/production?sslmode=require')).toBe(
      'postgres://reader:s3cret@db.example.test:6543/diary_test?sslmode=require',
    )
  })

  it('is unchanged by being applied twice, so a DATABASE_URL already naming the test database is stable', () => {
    expect(testDatabaseUrl(testDatabaseUrl('postgres://diary:diary@localhost:5432/diary'))).toBe(
      'postgres://diary:diary@localhost:5432/diary_test',
    )
  })

  it('falls back to the local Docker mapping when nothing is set', () => {
    expect(testDatabaseUrl(undefined)).toBe(DEVELOPER_FALLBACK_DATABASE_URL)
  })

  it('falls back when the variable is present but empty', () => {
    expect(testDatabaseUrl('')).toBe(DEVELOPER_FALLBACK_DATABASE_URL)
  })

  it('refuses a DATABASE_URL that is not a URL at all, rather than falling back', () => {
    // Falling back here would point the suite at this machine's own mapping
    // while the environment's real setting was malformed - a green run against
    // the wrong server, which is the failure this whole module exists to end.
    expect(() => testDatabaseUrl('not a database url')).toThrow(/DATABASE_URL/u)
  })

  it('refuses without repeating the value, because a connection string carries a password', () => {
    const malformed = 'postgres://diary:s3cret@localhost:54 33/diary'

    const refusal = refusalMessageFrom(() => testDatabaseUrl(malformed))

    expect(refusal).not.toContain('s3cret')
  })
})
