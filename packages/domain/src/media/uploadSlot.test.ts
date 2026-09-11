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
import { MAX_FILES_PER_REQUEST, MAX_UPLOAD_BYTES, planUploadSlots } from './uploadSlot'

/** A journey id for these tests. Throws rather than returning, so a case reads straight. */
const aJourneyId = () => {
  const built = journeyId('journey-7')
  if (!built.ok) throw new Error(built.error)
  return built.value
}

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
