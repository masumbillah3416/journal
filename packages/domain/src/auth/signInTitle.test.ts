/**
 * signInTitle.test.ts — the two clamps the sign-in screen sizes the book's
 * name with.
 *
 * Both functions are the handoff prototype's own arithmetic
 * (`handoff/design_handoff_travel_diary/Travel Diary Login.dc.html`,
 * `titleStyle` and `mastTitle`), so the cases below assert the prototype's
 * results rather than a rounding this file invented: the seeded title at its
 * designed size, a short title held at the maximum, a long one held at the
 * floor, and the empty string, whose division is `Infinity` and must resolve
 * to the maximum rather than `NaN`.
 *
 * The masthead's bounds are the one pair SCREENS.md §3 states in prose —
 * "fitted title (28-44px)" — so they are asserted as the boundary values
 * they are, not merely as "some number".
 * Depends on: vitest, ./signInTitle.
 */
import { describe, expect, it } from 'vitest'
import {
  SIGN_IN_MASTHEAD_TITLE_SIZE,
  SIGN_IN_TITLE_SIZE,
  fitSignInMastheadTitleSize,
  fitSignInTitleSize,
} from './signInTitle'

describe('fitSignInTitleSize', () => {
  it('sizes the seeded title the way the handoff prototype sizes it', () => {
    // floor(300 / (10 * 0.4)) = 75, inside [30, 84].
    expect(fitSignInTitleSize('Wanderings')).toBe(75)
  })

  it('holds a short title at the cloth panel’s maximum rather than growing past it', () => {
    expect(fitSignInTitleSize('Rio')).toBe(SIGN_IN_TITLE_SIZE.max)
  })

  it('holds a long title at the floor rather than shrinking it away', () => {
    expect(fitSignInTitleSize('a'.repeat(80))).toBe(SIGN_IN_TITLE_SIZE.min)
  })

  it('gives a title with nothing in it the maximum, never a division by zero', () => {
    expect(fitSignInTitleSize('')).toBe(SIGN_IN_TITLE_SIZE.max)
  })
})

describe('fitSignInMastheadTitleSize', () => {
  it('sizes the seeded title the way the handoff prototype sizes the narrow masthead', () => {
    // floor(190 / (10 * 0.4)) = 47, clamped to the masthead's 44px maximum.
    expect(fitSignInMastheadTitleSize('Wanderings')).toBe(44)
  })

  it('keeps the masthead within SCREENS.md §3’s stated 28-44px band at its top', () => {
    expect(SIGN_IN_MASTHEAD_TITLE_SIZE.max).toBe(44)
    expect(fitSignInMastheadTitleSize('Rio')).toBe(44)
  })

  it('keeps the masthead within SCREENS.md §3’s stated 28-44px band at its floor', () => {
    expect(SIGN_IN_MASTHEAD_TITLE_SIZE.min).toBe(28)
    expect(fitSignInMastheadTitleSize('a'.repeat(80))).toBe(28)
  })

  it('sizes a title between the bounds by the prototype’s own estimate', () => {
    // floor(190 / (14 * 0.4)) = 33, inside [28, 44] - the one case here that
    // exercises the estimate rather than a clamp.
    expect(fitSignInMastheadTitleSize('Fourteen chars')).toBe(33)
  })

  it('gives a title with nothing in it the maximum, never a division by zero', () => {
    expect(fitSignInMastheadTitleSize('')).toBe(SIGN_IN_MASTHEAD_TITLE_SIZE.max)
  })
})
