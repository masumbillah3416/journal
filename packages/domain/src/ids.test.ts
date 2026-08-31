import { describe, expect, it } from 'vitest'
import { journeyId, mediaId, pageId, slotKey } from './ids.js'
import type { JourneyId, PageId } from './ids.js'

describe('branded identifiers', () => {
  it('accepts a non-empty identifier', () => {
    const id = journeyId('tokyo-2025')

    expect(id).toEqual({ ok: true, value: 'tokyo-2025' })
  })

  it('rejects an empty identifier', () => {
    expect(journeyId('')).toEqual({ ok: false, error: 'JourneyId cannot be empty' })
  })

  it('rejects a whitespace-only identifier', () => {
    expect(pageId('   ')).toEqual({ ok: false, error: 'PageId cannot be empty' })
  })

  it('names the brand in its error, so the wrong constructor is obvious', () => {
    expect(mediaId('')).toEqual({ ok: false, error: 'MediaId cannot be empty' })
  })

  it('accepts a non-empty slot key', () => {
    expect(slotKey('hero')).toEqual({ ok: true, value: 'hero' })
  })

  it('rejects an empty slot key, naming its own brand', () => {
    expect(slotKey('')).toEqual({ ok: false, error: 'SlotKey cannot be empty' })
  })

  it('does not permit one brand where another is expected', () => {
    // @ts-expect-error - a JourneyId is not a PageId, which is the entire point
    const wrong: PageId = 'tokyo-2025' as JourneyId
    expect(wrong).toBe('tokyo-2025')
  })
})
