import { describe, expect, it } from 'vitest'
import { err, isOk, ok } from './result.js'

describe('Result', () => {
  it('carries a value when the operation succeeded', () => {
    const result = ok(42)

    expect(isOk(result)).toBe(true)
    expect(result).toEqual({ ok: true, value: 42 })
  })

  it('carries an error when the operation failed', () => {
    const result = err('no such journey')

    expect(isOk(result)).toBe(false)
    expect(result).toEqual({ ok: false, error: 'no such journey' })
  })

  it('narrows to the success branch through the guard', () => {
    const result = ok('tokyo') as ReturnType<typeof ok<string>> | ReturnType<typeof err<string>>

    // The guard must narrow, or every caller needs a cast — which is banned.
    expect(isOk(result) ? result.value : null).toBe('tokyo')
  })
})
