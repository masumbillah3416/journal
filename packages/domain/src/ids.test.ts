import { describe, expect, it } from 'vitest'
import { accountRowId, isRowId, journeyId, mediaId, pageId, rowId, sessionId, slotKey, userId } from './ids'
import type { JourneyId, PageId, SessionId, UserId } from './ids'

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

  it('accepts a non-empty user id', () => {
    expect(userId('reader-1')).toEqual({ ok: true, value: 'reader-1' })
  })

  it('rejects an empty user id, naming its own brand', () => {
    expect(userId('')).toEqual({ ok: false, error: 'UserId cannot be empty' })
  })

  it('accepts a non-empty session id', () => {
    expect(sessionId('sess-1')).toEqual({ ok: true, value: 'sess-1' })
  })

  it('rejects an empty session id, naming its own brand', () => {
    expect(sessionId('')).toEqual({ ok: false, error: 'SessionId cannot be empty' })
  })

  it('does not permit a SessionId where a UserId is expected', () => {
    // @ts-expect-error - a SessionId is not a UserId: an OTP challenge is bound
    // to a session, and confusing the two here is a security bug, not a
    // cosmetic one.
    const wrong: UserId = 'sess-1' as SessionId
    expect(wrong).toBe('sess-1')
  })
})

/**
 * A branded account id, unwrapped.
 *
 * `userId` answers a `Result`, so without this every case below would repeat
 * the same unwrap to reach the brand `accountRowId` takes.
 * @param raw - The candidate identifier.
 * @returns The branded id.
 * @throws When `raw` is empty or whitespace-only, which no case here passes.
 */
const anAccount = (raw: string): UserId => {
  const built = userId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

describe('rowId', () => {
  it('takes any brand, not only an account’s — which is why it stopped being `accountRowId`', () => {
    const journey = journeyId('42')
    const page = pageId('7')
    if (!journey.ok || !page.ok) throw new Error('a non-empty literal was refused')

    expect(rowId(journey.value)).toBe(42)
    expect(rowId(page.value)).toBe(7)
  })

  it('answers undefined for a brand that names no row, whatever the brand', () => {
    const journey = journeyId('nonsense')
    if (!journey.ok) throw new Error('a non-empty literal was refused')

    expect(rowId(journey.value)).toBeUndefined()
  })
})

describe('accountRowId', () => {
  it('returns the row id for a branded id that names one', () => {
    expect(accountRowId(anAccount('104'))).toBe(104)
  })

  it('returns undefined rather than NaN for a brand that is not a row id', () => {
    // `Number('nonsense')` reaching the driver escapes as a raw
    // `Failed query: … params: NaN`, past every Result contract above it.
    expect(accountRowId(anAccount('nonsense'))).toBeUndefined()
  })

  it('returns undefined for a row id no table can hold', () => {
    expect(accountRowId(anAccount('0'))).toBeUndefined()
    expect(accountRowId(anAccount('-3'))).toBeUndefined()
  })

  it('accepts the first row id a table can hold, so the refusal above is a boundary', () => {
    // Both sides of `> 0`. Without this, `>= 0` — or a guard refusing every
    // small id — would leave the case above green and say nothing.
    expect(accountRowId(anAccount('1'))).toBe(1)
  })

  it('refuses the first integer JavaScript can no longer tell from its neighbour', () => {
    // Both sides of `Number.isSafeInteger`. `Number('9007199254740993')` is
    // 9007199254740992, so an id that survived here would be the WRONG row —
    // which is why the guard is `isSafeInteger` and not `isInteger`.
    expect(accountRowId(anAccount('9007199254740991'))).toBe(9007199254740991)
    expect(accountRowId(anAccount('9007199254740993'))).toBeUndefined()
  })
})

describe('isRowId', () => {
  it('admits a positive safe integer, which is what a row id is', () => {
    expect(isRowId(42)).toBe(true)
    expect(isRowId(1)).toBe(true)
    expect(isRowId(9007199254740991)).toBe(true)
  })

  it('refuses the hole Payload leaves where a version has no page behind it', () => {
    // `docs/qa/2026-09-19-journey-editor-sweep.md`, EDITOR-001: a version row
    // whose parent is gone comes back as `id: null`, and the brand cannot refuse
    // it because `String(null)` is a non-empty string.
    expect(isRowId(null)).toBe(false)
    expect(isRowId(undefined)).toBe(false)
    expect(isRowId('42')).toBe(false)
  })

  it('refuses a number that is not a row id, on both sides of every bound', () => {
    expect(isRowId(0)).toBe(false)
    expect(isRowId(-3)).toBe(false)
    expect(isRowId(1.5)).toBe(false)
    expect(isRowId(Number.NaN)).toBe(false)
    expect(isRowId(9007199254740993)).toBe(false)
  })
})
