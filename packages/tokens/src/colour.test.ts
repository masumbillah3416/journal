import { composite, contrastRatio } from '@travel-diary/domain/contrast'
import { describe, expect, it } from 'vitest'
import { colour } from './colour.js'

const WCAG_BODY_TEXT = 4.5

describe('colour tokens meet the handoff accessibility claims', () => {
  it('renders muted labels on paper above the body-text threshold', () => {
    // Handoff: ink-muted is "opaque - never an alpha of rgba(120,98,60,...)".
    // Measured 5.45:1. If this drops below 4.5, report it - do not lower the threshold.
    expect(contrastRatio(colour.inkMuted, colour.paper)).toBeGreaterThanOrEqual(WCAG_BODY_TEXT)
  })

  it('shows why the muted label must not be an alpha of the same brown', () => {
    // This is the mistake the handoff explicitly forbids. Measured 2.46:1.
    const asAlpha = composite('#78623c', 0.6, colour.paper)

    expect(contrastRatio(asAlpha, colour.paper)).toBeLessThan(WCAG_BODY_TEXT)
  })

  it('renders secondary sidebar text above the threshold at the lightest gradient stop', () => {
    // Handoff: cream-dim is "6.5:1 - do not lower". The sidebar is a gradient,
    // so the lightest stop is the worst case. Measured 6.09:1 there.
    const flattened = composite('#f3e7cd', 0.72, colour.sidebarFrom)

    expect(contrastRatio(flattened, colour.sidebarFrom)).toBeGreaterThanOrEqual(6)
  })

  it('renders body copy on paper above the body-text threshold', () => {
    expect(contrastRatio(colour.inkBody, colour.paper)).toBeGreaterThanOrEqual(WCAG_BODY_TEXT)
  })

  it('renders text on the accent fill above the body-text threshold', () => {
    expect(contrastRatio(colour.creamAlt, colour.accent)).toBeGreaterThanOrEqual(WCAG_BODY_TEXT)
  })
})
