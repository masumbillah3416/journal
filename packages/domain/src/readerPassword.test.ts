import { describe, expect, it } from 'vitest'

import { MAX_READER_PASSWORD, readerPasswordProblem } from './readerPassword'

describe('what a reader password must look like', () => {
  it('refuses an empty submission, which is a missed keystroke and not a wrong password', () => {
    expect(readerPasswordProblem('')).toBe('empty')
  })

  it('refuses one that is only whitespace, because a space bar is not a password', () => {
    expect(readerPasswordProblem('   ')).toBe('empty')
  })

  it('refuses one past the cap, so a stranger cannot choose how much scrypt we run', () => {
    expect(readerPasswordProblem('x'.repeat(MAX_READER_PASSWORD + 1))).toBe('too-long')
  })

  it('accepts one exactly at the cap, so the boundary is not off by one', () => {
    expect(readerPasswordProblem('x'.repeat(MAX_READER_PASSWORD))).toBeNull()
  })

  it('accepts an ordinary one, and does not trim it — a trailing space is part of what was typed', () => {
    expect(readerPasswordProblem('tokyo 2019 ')).toBeNull()
  })
})
