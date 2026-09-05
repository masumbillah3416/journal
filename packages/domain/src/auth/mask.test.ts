import { describe, expect, it } from 'vitest'
import { maskEmail } from './mask'

describe('maskEmail', () => {
  it('keeps the first two characters and the domain', () => {
    expect(maskEmail('hello@wanderings.travel')).toBe('he•••@wanderings.travel')
  })

  it('does not reveal the local part length', () => {
    // Two addresses of different length must mask identically, or the mask
    // leaks how long the address is.
    expect(maskEmail('hello@x.com')).toBe(maskEmail('hellothere@x.com'))
  })

  it('masks a two-character local part without revealing all of it', () => {
    expect(maskEmail('ab@x.com')).toBe('ab•••@x.com')
  })

  it('masks a one-character local part without throwing', () => {
    expect(maskEmail('a@x.com')).toBe('a•••@x.com')
  })
})
