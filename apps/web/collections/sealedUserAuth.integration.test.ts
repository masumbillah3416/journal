/**
 * sealedUserAuth.integration.test.ts — the second authentication surface
 * cannot be used to reach an account.
 *
 * Integration test (CLAUDE.md §2), against a real Payload and a real Postgres.
 * A mock would answer whatever it was told; the claim here is that Payload's
 * OWN dispatcher, given a REAL request carrying a REAL account's REAL
 * password, produces no session. Only a real Payload can be wrong about that.
 *
 * ═══ WHY EACH CASE IS DRIVEN THROUGH `handleEndpoints` ═══
 *
 * `apps/web/app/(payload)/api/[...slug]/route.ts` is six re-exports of
 * `REST_*` from `@payloadcms/next`, and every one of them is
 * `handleEndpoints({ config, path, request })`. Neither Vitest project can
 * execute a Next.js route file, so the honest place to stand is one layer
 * below it — at the function the route calls, with the same arguments the
 * route passes. Asserting on the config's `endpoints` array instead would be
 * asserting the shape of a list rather than what a request gets, and this
 * phase has already found seventeen tests that passed with their mechanism
 * deleted for exactly that reason.
 *
 * ═══ THE CASE THIS FILE EXISTS FOR ═══
 *
 * "refuses a login at `POST /api/users/login` for an account whose password is
 * correct". The trap is a case that submits a WRONG password: that passes
 * against a live login endpoint too, and would prove nothing at all. The
 * password below is the one the fixture account was created with, and the same
 * password is shown to open the bespoke sign-in surface's code step in the
 * next case — so the two together say the credential is good and the address
 * is shut, rather than that the credential is bad.
 *
 * Uses `getTestPayload()`, so every fixture is written to the isolated
 * `diary_test` database (see that module's header).
 * Depends on: vitest, payload, @payloadcms/next/routes, ./sealedUserAuth,
 * ../lib/auth/signInEndpoints, ../lib/testPayload.
 */
import { GRAPHQL_POST } from '@payloadcms/next/routes'
import type { Endpoint } from 'payload'
import { handleEndpoints } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handlePasswordStep } from '../lib/auth/signInEndpoints'
import { getTestPayload } from '../lib/testPayload'
import { OPEN_USER_AUTH_ENDPOINTS, SEALED_USER_AUTH_ENDPOINTS, sealedEndpointHandler } from './sealedUserAuth'

/** Every fixture address here belongs to this domain, so `afterAll` can find them. */
const FIXTURE_EMAIL_DOMAIN = 'sealed-user-auth-fixture.example'

/** The address the whole file signs in as. */
const FIXTURE_EMAIL = `author@${FIXTURE_EMAIL_DOMAIN}`

/**
 * The password the fixture account is created with, and the one every case
 * below submits.
 *
 * A correct password is the point: a case that submitted a wrong one would
 * pass against a fully open login endpoint.
 */
const FIXTURE_PASSWORD = 'the-one-this-account-was-created-with'

/** The origin the requests below are built against. Nothing reads the host. */
const ORIGIN = 'http://localhost:3000'

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/**
 * Sends one request through the same dispatcher the mounted REST route calls.
 *
 * @param path - The address, e.g. `/api/users/login`.
 * @param body - The JSON body to post.
 * @returns Payload's own `Response`.
 * @example
 * const answer = await restRequest('/api/users/login', { email, password })
 */
const restRequest = async (path: string, body: unknown): Promise<Response> =>
  handleEndpoints({
    config: payload.config,
    path,
    request: new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  })

/**
 * The endpoints one collection actually mounts, off the sanitised config.
 *
 * @param slug - The collection to read.
 * @returns Payload's own array, with the collection's declared entries first.
 * @throws When the collection declares no endpoints at all, which would make
 *   every assertion drawn from it vacuously true.
 */
const mountedEndpoints = (slug: 'journeys' | 'users'): readonly Endpoint[] => {
  const mounted = payload.collections[slug].config.endpoints
  if (mounted === false) throw new Error(`${slug} declares no endpoints`)
  return mounted
}

/**
 * The same endpoints as `"<method> <path>"` strings.
 * @param slug - The collection to read.
 * @returns One name per mounted endpoint, in mounted order.
 */
const mountedNames = (slug: 'journeys' | 'users'): readonly string[] =>
  mountedEndpoints(slug).map((endpoint) => `${endpoint.method} ${endpoint.path}`)

/** Deletes every row this file wrote. */
const removeFixtures = async (): Promise<void> => {
  const accounts = await payload.find({
    collection: 'users',
    where: { email: { like: FIXTURE_EMAIL_DOMAIN } },
    limit: 500,
    depth: 0,
  })
  for (const account of accounts.docs) {
    await payload.db.pool.query(`DELETE FROM sessions WHERE user_id = $1`, [account.id])
    await payload.db.pool.query(`DELETE FROM otp_challenges WHERE user_id = $1`, [account.id])
    await payload.delete({ collection: 'users', id: account.id })
  }
}

beforeAll(async () => {
  payload = await getTestPayload()
  await removeFixtures()
  await payload.create({ collection: 'users', data: { email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD } })
})

afterAll(removeFixtures)

describe("Payload's own REST auth endpoints on `users`", () => {
  it('refuses a login carrying the account’s correct password', async () => {
    const answer = await restRequest('/api/users/login', { email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD })

    expect(answer.status).toBe(404)
  })

  it('hands back no cookie and no token for that same correct password', async () => {
    // The status alone would be satisfied by an endpoint that answered 404
    // AFTER minting a session. These two are what a caller could actually
    // carry away.
    const answer = await restRequest('/api/users/login', { email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD })

    expect(answer.headers.get('set-cookie')).toBeNull()
    expect(await answer.text()).not.toContain('token')
  })

  it('leaves that same password opening the code step on the surface that has one', async () => {
    // WITHOUT THIS CASE THE FILE PROVES NOTHING. A sealed endpoint refusing a
    // password it would have refused anyway looks identical to one refusing a
    // password that works. This drives the bespoke handler with the same
    // credential and watches it reach `/admin/sign-in/code` — so the two cases
    // together say the credential is good and the second address is shut.
    const answer = await handlePasswordStep(
      new Request(`${ORIGIN}/admin/sign-in/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD }).toString(),
      }),
    )

    expect(answer.status).toBe(303)
    expect(answer.headers.get('location')).toBe('/admin/sign-in/code')
  })

  it('answers a sealed address exactly as it answers one that was never mounted', async () => {
    // A distinguishable refusal would say this deployment has a `users`
    // collection with an `auth` block — the enumeration the sign-in screen
    // spends a key derivation to withhold.
    const sealed = await restRequest('/api/users/login', { email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD })
    const neverMounted = await restRequest('/api/users/no-such-endpoint', {})

    expect(sealed.status).toBe(neverMounted.status)
    expect(JSON.parse(await sealed.text())).toEqual({ message: 'Route not found "/api/users/login"' })
    expect(JSON.parse(await neverMounted.text())).toEqual({
      message: 'Route not found "/api/users/no-such-endpoint"',
    })
  })

  it('refuses every other endpoint that takes a credential or mints one', async () => {
    const refused = await Promise.all(
      SEALED_USER_AUTH_ENDPOINTS.map(async ({ path }) => {
        // `/verify/:id` is a pattern; a real request carries a segment there.
        const address = `/api/users${path.replace(':id', '1')}`
        const answer = await restRequest(address, { email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD, token: 'x' })
        return { address, status: answer.status, cookie: answer.headers.get('set-cookie') }
      }),
    )

    expect(refused.filter((one) => one.status !== 404)).toEqual([])
    expect(refused.filter((one) => one.cookie !== null)).toEqual([])
  })

  it('leaves `GET /api/users/me` answering, so the stock admin shell still loads', async () => {
    // `e2e/smoke.spec.ts` asserts zero console errors on `/cms`, and Payload's
    // admin asks for this on load. Sealing it would have traded one gate for
    // another.
    const answer = await handleEndpoints({
      config: payload.config,
      path: '/api/users/me',
      request: new Request(`${ORIGIN}/api/users/me`),
    })

    expect(answer.status).toBe(200)
    expect(JSON.parse(await answer.text())).toMatchObject({ user: null })
  })

  it('classifies every endpoint Payload actually mounts, so an upgrade cannot add a new one silently', () => {
    // THE CASE THAT KEEPS THE OTHERS HONEST, and it has already earned its
    // place: the first version of it hand-listed Payload's CRUD paths and was
    // wrong about two of them.
    //
    // The auth surface is DERIVED rather than written down — it is whatever
    // `users` mounts that a collection with no `auth` block does not, so
    // `journeys` supplies the subtrahend. A Payload release that adds an
    // eleventh auth endpoint therefore lands in neither list and fails here,
    // rather than reopening the hole with nothing to say so.
    const crud = new Set(mountedNames('journeys'))
    const authSurface = [...new Set(mountedNames('users'))].filter((named) => !crud.has(named))
    const classified = [...SEALED_USER_AUTH_ENDPOINTS, ...OPEN_USER_AUTH_ENDPOINTS].map(
      (one) => `${one.method} ${one.path}`,
    )

    expect(
      authSurface.sort((left, right) => left.localeCompare(right)),
      'Payload mounts an endpoint on `users` that sealedUserAuth.ts classifies as neither sealed nor deliberately open',
    ).toEqual(classified.sort((left, right) => left.localeCompare(right)))
  })

  it('shadows each sealed endpoint rather than sitting behind Payload’s own', () => {
    // `handleEndpoints` takes the FIRST match, so the declared entries have to
    // come before Payload's. If sanitisation ever appended them instead, the
    // sealed handler would never run and the login endpoint would be live.
    const first = SEALED_USER_AUTH_ENDPOINTS.map(({ method, path }) =>
      mountedEndpoints('users').find((endpoint) => endpoint.method === method && endpoint.path === path),
    )

    expect(first.map((endpoint) => endpoint?.handler === sealedEndpointHandler)).toEqual(
      SEALED_USER_AUTH_ENDPOINTS.map(() => true),
    )
  })
})

describe("Payload's GraphQL surface", () => {
  it('exposes no login mutation to trade the same password for a token', async () => {
    const answer = await GRAPHQL_POST(payload.config)(
      new Request(`${ORIGIN}/api/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation { loginUser(email: "${FIXTURE_EMAIL}", password: "${FIXTURE_PASSWORD}") { token } }`,
        }),
      }),
    )
    const body = await answer.text()

    expect(body).not.toContain('"token"')
    expect(body).toContain('loginUser')
    // The schema rejects the field rather than the resolver refusing the
    // credential: the mutation is not there to be called.
    expect(body).toMatch(/Cannot query field|Unknown/u)
  })
})
