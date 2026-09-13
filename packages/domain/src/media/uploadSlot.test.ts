/**
 * uploadSlot.test.ts — the pure slot plan: what a request for upload slots is
 * allowed to ask for, and what key each accepted file is staged under.
 *
 * Every case here is a decision `SECURITY.md`'s "Cap file size and the
 * per-request file count" names, or a `CLAUDE.md` §7 rule about keying by
 * journey. Both sides of every limit are pinned — the largest file accepted
 * and the smallest refused, the last count that passes and the first that does
 * not — because a one-sided boundary has cost this repository five defects.
 * Depends on: vitest, `journeyId` (../ids), the module under test.
 */
import { describe, expect, it } from 'vitest'
import { journeyId } from '../ids'
import type { RequestedUpload } from './uploadSlot'
import { MAX_FILES_PER_REQUEST, MAX_UPLOAD_BYTES, isStagingKeyFor, planUploadSlots } from './uploadSlot'

/**
 * Brands a journey id, throwing rather than returning, so a case reads
 * straight.
 * @param raw - The id to brand. The brand promises only a non-empty string,
 *   which is why the cases below can hand it one no Payload row ever carries.
 */
const aJourneyIdOf = (raw: string) => {
  const built = journeyId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** The journey id every case in this file that does not care uses. */
const aJourneyId = () => aJourneyIdOf('journey-7')

/**
 * A backslash, built from its code point rather than escaped in a literal.
 *
 * The case this exists for was committed as `'staging\journey-7\n…'` and
 * held no backslash at all. Building it removes the whole class of that
 * mistake from this file.
 */
const BACKSLASH = String.fromCharCode(92)

/** One requested upload, with overridable defaults. */
const aRequestedUpload = (overrides: Partial<RequestedUpload> = {}): RequestedUpload => ({
  filename: 'tokyo.jpg',
  declaredType: 'image/jpeg',
  byteLength: 2_000_000,
  ...overrides,
})

const plan = (files: readonly RequestedUpload[]) =>
  planUploadSlots({
    files,
    acceptedTypes: ['image/jpeg', 'image/png'],
    journey: aJourneyId(),
    nonce: (index) => `n${String(index)}`,
  })

describe('planUploadSlots', () => {
  it('keys the staging object by journey id, so nothing can be staged journey-less', () => {
    // CLAUDE.md section 7: key everything by journey id.
    expect(plan([aRequestedUpload()])).toEqual({
      ok: true,
      value: [{ stagingKey: 'staging/journey-7/n0-tokyo.jpg', declaredType: 'image/jpeg', filename: 'tokyo.jpg' }],
    })
  })

  it('gives each file in one request its own key, so two cannot overwrite each other', () => {
    const planned = plan([aRequestedUpload(), aRequestedUpload()])
    const keys = planned.ok ? planned.value.map((slot) => slot.stagingKey) : []

    expect(new Set(keys).size).toBe(2)
  })

  it('sanitises a filename down to what a storage key may hold', () => {
    const planned = plan([aRequestedUpload({ filename: '../../etc/pass wd?.JPG' })])

    expect(planned.ok ? planned.value[0]?.stagingKey : '').toBe('staging/journey-7/n0-etc-pass-wd.jpg')
  })

  it('reports the filename the client sent, not the sanitised one, so the admin sees what it uploaded', () => {
    const planned = plan([aRequestedUpload({ filename: '../../etc/pass wd?.JPG' })])

    expect(planned.ok ? planned.value[0]?.filename : '').toBe('../../etc/pass wd?.JPG')
  })

  it('refuses a request with no files at all', () => {
    expect(plan([])).toEqual({ ok: false, error: 'empty-request' })
  })

  it('refuses one file more than the per-request cap', () => {
    // SECURITY.md: cap file size AND the per-request file count.
    expect(plan(Array.from({ length: MAX_FILES_PER_REQUEST + 1 }, () => aRequestedUpload()))).toEqual({
      ok: false,
      error: 'too-many-files',
    })
  })

  it('accepts exactly the per-request cap', () => {
    expect(plan(Array.from({ length: MAX_FILES_PER_REQUEST }, () => aRequestedUpload())).ok).toBe(true)
  })

  it('accepts a file exactly at the size cap', () => {
    expect(plan([aRequestedUpload({ byteLength: MAX_UPLOAD_BYTES })]).ok).toBe(true)
  })

  it('refuses a file one byte over the size cap', () => {
    expect(plan([aRequestedUpload({ byteLength: MAX_UPLOAD_BYTES + 1 })])).toEqual({ ok: false, error: 'too-large' })
  })

  it('refuses a zero-byte file, which is never a photograph', () => {
    expect(plan([aRequestedUpload({ byteLength: 0 })])).toEqual({ ok: false, error: 'too-large' })
  })

  it('accepts a one-byte file, the smallest that is not empty', () => {
    // The mirror of the zero-byte case. A floor with no ceiling and a ceiling
    // with no floor are the same defect; both ends of both limits are pinned.
    expect(plan([aRequestedUpload({ byteLength: 1 })]).ok).toBe(true)
  })

  it('refuses a type the processor did not offer, so the cap and the policy cannot disagree', () => {
    // `acceptedTypes` comes from the bound MediaProcessor rather than a second
    // list written here, so under inline an mp4 has no slot to upload into.
    expect(plan([aRequestedUpload({ declaredType: 'video/mp4' })])).toEqual({ ok: false, error: 'type-not-offered' })
  })

  it('refuses a file whose name is entirely unusable rather than inventing one', () => {
    expect(plan([aRequestedUpload({ filename: '???' })])).toEqual({ ok: false, error: 'unnamed-file' })
  })

  it('refuses the whole request when one file fails, rather than partly succeeding', () => {
    // A caller handed three slots for four files would upload three and never
    // learn which one it lost.
    expect(plan([aRequestedUpload(), aRequestedUpload({ byteLength: MAX_UPLOAD_BYTES + 1 })])).toEqual({
      ok: false,
      error: 'too-large',
    })
  })

  it('keeps a file with no extension, since a browser sends one for a name with no dot', () => {
    // Measured in Task 2's review: `holiday` with no extension is a real thing
    // a browser posts. It is a usable name, so it gets a slot.
    const planned = plan([aRequestedUpload({ filename: 'holiday' })])

    expect(planned.ok ? planned.value[0]?.stagingKey : '').toBe('staging/journey-7/n0-holiday')
  })

  it('refuses a file the accepted list is empty for, so an unconfigured processor offers nothing', () => {
    const planned = planUploadSlots({
      files: [aRequestedUpload()],
      acceptedTypes: [],
      journey: aJourneyId(),
      nonce: (index) => `n${String(index)}`,
    })

    expect(planned).toEqual({ ok: false, error: 'type-not-offered' })
  })
})

describe('isStagingKeyFor', () => {
  /** Asks the question ingest asks, for the journey every case here uses. */
  const isStaged = (key: string): boolean => isStagingKeyFor({ key, journey: aJourneyId() })

  it('accepts a key the planner itself minted, so the check and the minting cannot drift apart', () => {
    // THE ONLY CASE HERE THAT TAKES ITS INPUT FROM THE PLANNER RATHER THAN
    // FROM A LITERAL, and the reason this pair is in one file: a predicate
    // spelling the key shape itself would keep passing keys the planner had
    // stopped producing.
    const planned = plan([aRequestedUpload()])

    expect(isStaged(planned.ok ? (planned.value[0]?.stagingKey ?? '') : '')).toBe(true)
  })

  it('accepts every key the planner mints for a whole request, not merely the first', () => {
    const planned = plan([aRequestedUpload(), aRequestedUpload({ filename: 'bergen.png' })])

    expect((planned.ok ? planned.value : []).map((slot) => isStaged(slot.stagingKey))).toEqual([true, true])
  })

  it('refuses a stored media filename, which is what makes finalising one unable to delete it', () => {
    expect(isStaged('tokyo-9.jpg')).toBe(false)
  })

  it('refuses a key staged under a different journey, so two fields of one request cannot disagree', () => {
    expect(isStaged('staging/journey-8/n0-tokyo.jpg')).toBe(false)
  })

  it('refuses a key whose journey segment merely begins with this journey', () => {
    expect(isStaged('staging/journey-77/n0-tokyo.jpg')).toBe(false)
  })

  it('refuses a traversal out of the journey directory, even spelled as the whole tail', () => {
    expect(isStaged('staging/journey-7/..')).toBe(false)
  })

  it('refuses a traversal spelled as a fourth segment', () => {
    expect(isStaged('staging/journey-7/../../secrets.jpg')).toBe(false)
  })

  it('refuses a backslash separator, which a Windows filesystem would resolve', () => {
    // `String.raw` BECAUSE THE ORDINARY LITERAL DID NOT HOLD A BACKSLASH.
    // `'staging\journey-7\n0-tokyo.jpg'` is `stagingjourney-7` then a NEWLINE
    // then `0-tokyo.jpg`: `\j` is `j` and `\n` is a newline, so the case named
    // for a separator passed a string with no separator in it and could never
    // fail (Task 8 fix review, N2). The escape-free spelling is the fix, and
    // `BACKSLASH` below is built from its code point so this file cannot make
    // the same mistake twice.
    expect(isStaged(String.raw`staging\journey-7\n0-tokyo.jpg`)).toBe(false)
  })

  it('refuses a traversal smuggled through the journey segment, which win32 resolves to the store root', () => {
    // THE HOLE THE CASE ABOVE WAS SUPPOSED TO COVER AND DID NOT. The journey
    // segment used to be `[^/]+`, which admits both `..` and a backslash - so
    // a client sending the same traversal in BOTH fields, which is all this
    // predicate compares, was answered `true`, and `path.win32.resolve` puts
    // that key at the store's own root where Payload keeps every stored file.
    // `validateStorageKey` at the port refused it, so there was never a live
    // hole; the defence was simply not the one this predicate's header claimed.
    const journey = `7${BACKSLASH}..${BACKSLASH}..`

    expect(isStagingKeyFor({ key: `staging/${journey}/live.jpg`, journey: aJourneyIdOf(journey) })).toBe(false)
  })

  it('refuses a journey segment that is itself a traversal', () => {
    expect(isStagingKeyFor({ key: 'staging/../live.jpg', journey: aJourneyIdOf('..') })).toBe(false)
  })

  it('refuses a journey segment carrying a separator of either kind', () => {
    expect(isStagingKeyFor({ key: 'staging/7/8/live.jpg', journey: aJourneyIdOf('7/8') })).toBe(false)
  })

  it('refuses another namespace of the same store', () => {
    expect(isStaged('uploads/journey-7/n0-tokyo.jpg')).toBe(false)
  })

  it('refuses a key with nothing after the journey', () => {
    expect(isStaged('staging/journey-7/')).toBe(false)
  })

  it('refuses a deeper key under the journey, since the planner mints exactly three segments', () => {
    expect(isStaged('staging/journey-7/nested/n0-tokyo.jpg')).toBe(false)
  })

  it('refuses a dotfile tail, which no sanitised name produces', () => {
    expect(isStaged('staging/journey-7/.env')).toBe(false)
  })

  it('refuses an empty key', () => {
    expect(isStaged('')).toBe(false)
  })
})
