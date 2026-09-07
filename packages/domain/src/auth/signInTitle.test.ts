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
 *
 * EVERY CLAMPED RESULT IS PINNED TO A LITERAL, never to the exported bound it
 * is supposed to produce. `expect(fitSignInTitleSize('Rio')).toBe(
 * SIGN_IN_TITLE_SIZE.max)` reads like an assertion and is not one: it moves
 * with the constant, so editing `max` from 84 to 8 leaves it green and the
 * clamp unguarded. The exported bounds are asserted separately, once each,
 * against the numbers the handoff prototype gives — which is the only place
 * either value is held still (review round 1, finding 4; the same defect this
 * phase has now found three times).
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
    // floor(300 / (3 * 0.4)) = 250, clamped to 84.
    expect(fitSignInTitleSize('Rio')).toBe(84)
  })

  it('holds a long title at the floor rather than shrinking it away', () => {
    // floor(300 / (80 * 0.4)) = 9, clamped up to 30.
    expect(fitSignInTitleSize('a'.repeat(80))).toBe(30)
  })

  it('gives a title with nothing in it the maximum, never a division by zero', () => {
    expect(fitSignInTitleSize('')).toBe(84)
  })

  it('publishes the cloth panel’s bounds as the prototype’s own numbers', () => {
    // The one place these two are held still. Every case above pins a
    // literal rather than reading them back, so a change to either fails
    // here AND wherever it changes a result.
    expect(SIGN_IN_TITLE_SIZE.min).toBe(30)
    expect(SIGN_IN_TITLE_SIZE.max).toBe(84)
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
    expect(fitSignInMastheadTitleSize('')).toBe(44)
  })
})
