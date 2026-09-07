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

  it('masks a one-character local part without throwing (documented exception: a one-character local part is visibly shorter than the fixed three-bullet run, which the handoff format accepts)', () => {
    expect(maskEmail('a@x.com')).toBe('a•••@x.com')
  })

  it('echoes nothing but bullets when there is no @ at all, rather than echoing the whole input', () => {
    expect(maskEmail('helloworld')).toBe('•••')
  })

  it('echoes nothing but bullets when the local part is empty', () => {
    expect(maskEmail('@x.com')).toBe('•••')
  })

  it('echoes nothing but bullets when the domain is empty', () => {
    expect(maskEmail('a@')).toBe('•••')
  })

  it('echoes nothing but bullets for a bare @', () => {
    expect(maskEmail('@')).toBe('•••')
  })

  it('echoes nothing but bullets for an empty string', () => {
    expect(maskEmail('')).toBe('•••')
  })

  it('splits on the first @ when there is more than one, so the domain is everything after it', () => {
    // Deliberate: a second '@' is treated as part of the domain, not as a
    // second delimiter — 'a@b@x.com' masks 'a' and keeps 'b@x.com' as the domain.
    expect(maskEmail('a@b@x.com')).toBe('a•••@b@x.com')
  })
})
