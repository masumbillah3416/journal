/**
 * placeholder.test.ts — behaviour spec for the striped placeholder generator.
 *
 * Unit test (CLAUDE.md §2): pure function, no I/O, no database. Runs under
 * the `unit` Vitest project (see ../../../vitest.config.ts).
 */
import { describe, expect, it } from 'vitest'
import { stripedPlaceholder } from './placeholder'

describe('stripedPlaceholder', () => {
  it('names the slot it stands in for, so a missing photo is identifiable on the page', () => {
    const uri = stripedPlaceholder({ label: 'TOKYO A1', tint: '#3d817e', width: 800, height: 600 })

    expect(decodeURIComponent(uri)).toContain('TOKYO A1')
  })

  it('produces a data URI a browser will render directly', () => {
    const uri = stripedPlaceholder({ label: 'BERGEN HERO', tint: '#5a72a8', width: 400, height: 400 })

    expect(uri.startsWith('data:image/svg+xml,')).toBe(true)
  })

  it('uses the journey tint it was given', () => {
    const uri = stripedPlaceholder({ label: 'X', tint: '#a06b3e', width: 10, height: 10 })

    expect(decodeURIComponent(uri)).toContain('#a06b3e')
  })

  it('escapes a label containing markup characters', () => {
    // Labels come from seed data today, but this generator must not be the
    // thing that makes user-supplied text dangerous later.
    const uri = stripedPlaceholder({ label: '<script>', tint: '#736247', width: 10, height: 10 })

    expect(decodeURIComponent(uri)).not.toContain('<script>')
    expect(decodeURIComponent(uri)).toContain('&lt;script&gt;')
  })
})
