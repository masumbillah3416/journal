/**
 * breakpoints.test.ts — behaviour spec for the five widths the admin surface
 * changes shape at.
 *
 * EVERY CONSTANT IS PINNED ON BOTH SIDES: the last width that keeps a control
 * and the first that drops it. A case that only pinned the hidden side would
 * pass for a constant set one pixel out, which is the shape of a boundary this
 * repository has found one-sided seven times.
 */
import { describe, expect, it } from 'vitest'
import { adminWidthMode, headerControls } from './breakpoints'

describe('adminWidthMode', () => {
  it('is wide at exactly 1180, because the spec says ≥', () => {
    expect(adminWidthMode(1180)).toBe('wide')
    expect(adminWidthMode(1179)).toBe('mid')
  })

  it('is mid at exactly 860, and narrow one pixel below', () => {
    expect(adminWidthMode(860)).toBe('mid')
    expect(adminWidthMode(859)).toBe('narrow')
  })
})

describe('headerControls', () => {
  it('hides each control at the width SCREENS.md gives it, and not one pixel early', () => {
    expect(headerControls(1040).savedChip).toBe(true)
    expect(headerControls(1039).savedChip).toBe(false)
    expect(headerControls(900).unpublishedChip).toBe(true)
    expect(headerControls(899).unpublishedChip).toBe(false)
    expect(headerControls(780).previewDraft).toBe(true)
    expect(headerControls(779).previewDraft).toBe(false)
  })
})
