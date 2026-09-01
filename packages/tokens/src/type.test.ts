import { describe, expect, it } from 'vitest'
import { letterSpacing, minimumSize, typeScale } from './type'

describe('type tokens', () => {
  it('names the three handoff font families', () => {
    expect(typeScale.family).toEqual({
      caveat: "'Caveat', cursive",
      garamond: "'EB Garamond', serif",
      courier: "'Courier Prime', monospace",
    })
  })

  it('exposes the diary page scale from the handoff', () => {
    expect(typeScale.diary).toEqual({
      coverTitle: 124,
      journeyName: 66,
      contents: 70,
      sectionHead: 40,
      highlight: 30,
      photoCaption: { min: 23, max: 26 },
      note: { size: 18.5, lineHeight: 1.64 },
      tallyValue: 29,
      eyebrow: { min: 10, max: 11.5 },
    })
  })

  it('exposes the admin scale from the handoff', () => {
    expect(typeScale.admin).toEqual({
      screenTitle: 48,
      cardHeading: 32,
      journeyRowName: 30,
      body: { min: 16, max: 17 },
      label: { min: 9, max: 10.5 },
    })
  })

  it('exposes the Courier Prime label letter-spacing range', () => {
    expect(letterSpacing).toEqual({ min: '0.14em', max: '0.42em' })
  })

  it('exposes the handoff minimum sizes', () => {
    expect(minimumSize).toEqual({ adminLabel: 9, diaryBody: 15, hitTarget: 44, navButton: 52 })
  })
})
