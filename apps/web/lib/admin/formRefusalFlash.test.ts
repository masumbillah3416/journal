/**
 * formRefusalFlash.test.ts — the carrier docs/deviations.md §104's refusal
 * travels in, and the two properties the whole mechanism rests on.
 *
 * `next/headers` IS STOOD IN FOR, which is the boundary rather than one of our
 * own modules (CLAUDE.md §2.3): `cookies()` throws outside a request, and what
 * the carrier has to be held to is what it ASKS the jar for — a value with
 * `maxAge: 0`, read back by name.
 *
 * WHAT THIS FILE CANNOT MEASURE, said here rather than implied: that a browser
 * honours `maxAge: 0`, and that Next makes the value readable by the render
 * that follows the action. Both were measured in Chromium against the running
 * app, and the half a user experiences is
 * `e2e/admin.spec.ts`'s four `tells the author why …` cases.
 * Depends on: vitest, ./formRefusalFlash.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Every `set` the carrier made, in order. */
const written: { name: string; value: string; options: Record<string, unknown> }[] = []

/** What the stood-in jar answers `get` with. */
let stored: string | undefined

vi.mock('next/headers', () => ({
  cookies: (): Promise<{
    set: (name: string, value: string, options: Record<string, unknown>) => void
    get: (name: string) => { value: string } | undefined
  }> =>
    Promise.resolve({
      set: (name, value, options) => {
        written.push({ name, value, options })
      },
      get: (name) => (name === 'td-form-refusal' && stored !== undefined ? { value: stored } : undefined),
    }),
}))

const { REFUSAL_COOKIE, handOffRefusal, readRefusal, refusalForThisRender } = await import('./formRefusalFlash')

beforeEach(() => {
  written.length = 0
  stored = undefined
})

describe('handOffRefusal', () => {
  it('writes the refusal under the carrier’s own name', async () => {
    await handOffRefusal({ refused: [{ field: 'replyTo', message: 'that is not an email address' }], kept: {} })

    expect(written).toHaveLength(1)
    expect(written[0]?.name).toBe(REFUSAL_COOKIE)
  })

  it('tells the browser to keep nothing, which is what makes it one-shot', async () => {
    // `maxAge: 0` IS THE MECHANISM. Without it the refusal is in the jar for
    // the next request, and the next screen the author opens draws a message
    // about a post they made somewhere else.
    await handOffRefusal({ refused: [], kept: {} })

    expect(written[0]?.options['maxAge']).toBe(0)
  })

  it('scopes it to the admin, and keeps it off the document’s scripts', async () => {
    await handOffRefusal({ refused: [], kept: {} })

    expect(written[0]?.options).toMatchObject({ path: '/admin', httpOnly: true, sameSite: 'lax' })
  })

  it('writes a value the reader takes back unchanged', async () => {
    const refusal = { refused: [{ field: 'slug', message: 'not a gallery address' }], kept: { slug: ['Not A Slug!'] } }
    await handOffRefusal(refusal)

    expect(readRefusal(written[0]?.value ?? '')).toEqual(refusal)
  })
})

describe('readRefusal', () => {
  it('answers null for a value that is not JSON', () => {
    // A `td-form-refusal` header is something a hand-built request can send.
    expect(readRefusal('not json at all')).toBeNull()
  })

  it('answers null for JSON that is not a refusal', () => {
    expect(readRefusal('{"refused":"everything"}')).toBeNull()
  })

  it('answers null for a refusal whose messages are not strings', () => {
    expect(readRefusal('{"refused":[{"field":"a","message":3}],"kept":{}}')).toBeNull()
  })
})

describe('refusalForThisRender', () => {
  it('answers the refusal the action left behind', async () => {
    stored = '{"refused":[{"field":"name","message":"where it went cannot be blank"}],"kept":{"name":["   "]}}'

    expect(await refusalForThisRender()).toEqual({
      refused: [{ field: 'name', message: 'where it went cannot be blank' }],
      kept: { name: ['   '] },
    })
  })

  it('answers null when no action left one', async () => {
    expect(await refusalForThisRender()).toBeNull()
  })

  it('answers null for an empty carrier value', async () => {
    stored = ''

    expect(await refusalForThisRender()).toBeNull()
  })

  it('answers null for a carrier value that is not a refusal', async () => {
    stored = 'not json at all'

    expect(await refusalForThisRender()).toBeNull()
  })
})
