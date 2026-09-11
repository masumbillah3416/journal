/**
 * uploadSlots.integration.test.ts — what the admin's picker is offered when it
 * asks for somewhere to put its files.
 *
 * IT DRIVES THE SERVICE, NOT THE SERVER ACTION. `requestUploadSlots` in
 * `apps/web/app/(admin)/admin/media/actions.ts` is `guardedAction(...)` around
 * this function and nothing else, and a Server Action needs a request context
 * no test process has — so the action is one line and every decision it makes
 * is made here, where it can be executed.
 *
 * AN INTEGRATION TEST because it binds a REAL `MediaProcessor` per mode
 * (`sharp` and, under `worker`, the `ffmpeg` toolchain seam) and a REAL
 * `StoragePort` over a temporary directory. `acceptedTypes` comes off the
 * bound processor rather than from a list written here, which is what makes
 * the video cases a statement about the configuration switch ADR 0004 requires
 * rather than about a constant.
 * Depends on: vitest; the probes (./testing/uploadProbes); `mediaProcessorFor`
 * (./services); the module under test.
 */
import { MAX_FILES_PER_REQUEST, MAX_UPLOAD_BYTES } from '@travel-diary/domain/media/uploadSlot'
import type { PipelineMode } from '@travel-diary/domain/media/ingestPolicy'
import type { RequestedUpload } from '@travel-diary/domain/media/uploadSlot'
import type { JourneyId } from '@travel-diary/domain/ids'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mediaProcessorFor } from './services'
import type { UploadSlotResponse } from './uploadContract'
import { offerUploadSlots } from './uploadSlots'
import { aPublishedFixtureJourney, aTempStore, removeUploadFixtureJourneys } from './testing/uploadProbes'

/** One requested upload, with overridable defaults. */
const aRequestedUpload = (overrides: Partial<RequestedUpload> = {}): RequestedUpload => ({
  filename: 'tokyo.jpg',
  declaredType: 'image/jpeg',
  byteLength: 1_000,
  ...overrides,
})

/**
 * Asks for slots the way the Server Action does, with a processor bound for
 * one mode.
 * @param input - Which pipeline to bind, the journey to key by, and either the
 *   files to ask for or a single `declaredType` as shorthand for one file.
 */
const planSlotsFor = async (input: {
  readonly mode: PipelineMode
  readonly journey: JourneyId
  readonly files?: readonly RequestedUpload[]
  readonly declaredType?: string
}): Promise<UploadSlotResponse> => {
  const { storage } = await aTempStore()
  const files = input.files ?? [
    aRequestedUpload(input.declaredType === undefined ? {} : { declaredType: input.declaredType }),
  ]

  return offerUploadSlots(
    { journey: input.journey, files },
    { processor: mediaProcessorFor(input.mode), storage, nonce: (index) => `n${String(index)}` },
  )
}

describe('offerUploadSlots', () => {
  let journey: JourneyId

  beforeAll(async () => {
    journey = await aPublishedFixtureJourney()
  })

  afterAll(removeUploadFixtureJourneys)

  it('offers one upload URL per planned slot, each carrying its own token', async () => {
    const offered = await planSlotsFor({
      mode: 'inline',
      journey,
      files: [aRequestedUpload({ filename: 'a.jpg' }), aRequestedUpload({ filename: 'b.jpg' })],
    })

    const urls = offered.ok ? offered.value.map((slot) => slot.uploadUrl) : []
    expect(urls).toHaveLength(2)
    // Distinct, because each token signs its own key: one URL that worked for
    // both slots would let a second upload overwrite the first.
    expect(new Set(urls).size).toBe(2)
  })

  it('keys every offered slot by the journey, so nothing can be staged journey-less', async () => {
    const offered = await planSlotsFor({ mode: 'inline', journey })

    expect(offered.ok ? offered.value[0]?.stagingKey : '').toBe(`staging/${journey}/n0-tokyo.jpg`)
  })

  it('offers a URL that carries the staging key inside its own token', async () => {
    // The key is not a query parameter the client could edit - it is signed
    // into the capability, which is what stops one slot's URL writing another
    // slot's object.
    const offered = await planSlotsFor({ mode: 'inline', journey })
    const slot = offered.ok ? offered.value[0] : undefined

    expect(slot?.uploadUrl).toContain(encodeURIComponent(slot?.stagingKey ?? 'no key was planned'))
  })

  it('offers no video slot under inline, so the picker cannot ask for one', async () => {
    // Exit criterion 5, at the slot layer: enabling clips must be a config
    // switch. Under inline there is nowhere to put an mp4.
    const offered = await planSlotsFor({ mode: 'inline', journey, declaredType: 'video/mp4' })

    expect(offered).toEqual({ ok: false, error: 'type-not-offered' })
  })

  it('offers a video slot under worker', async () => {
    expect((await planSlotsFor({ mode: 'worker', journey, declaredType: 'video/mp4' })).ok).toBe(true)
  })

  it('offers a still slot under both modes, so the switch adds a type rather than swapping one', async () => {
    expect((await planSlotsFor({ mode: 'inline', journey })).ok).toBe(true)
    expect((await planSlotsFor({ mode: 'worker', journey })).ok).toBe(true)
  })

  it('passes the domain’s per-request cap through rather than re-deciding it', async () => {
    const offered = await planSlotsFor({
      mode: 'inline',
      journey,
      files: Array.from({ length: MAX_FILES_PER_REQUEST + 1 }, () => aRequestedUpload()),
    })

    expect(offered).toEqual({ ok: false, error: 'too-many-files' })
  })

  it('offers a slot for exactly the per-request cap, the last count that passes', async () => {
    const offered = await planSlotsFor({
      mode: 'inline',
      journey,
      files: Array.from({ length: MAX_FILES_PER_REQUEST }, (_unused, index) =>
        aRequestedUpload({ filename: `f${String(index)}.jpg` }),
      ),
    })

    expect(offered.ok ? offered.value.length : 0).toBe(MAX_FILES_PER_REQUEST)
  })

  it('passes the domain’s size cap through, refusing one byte over it', async () => {
    const offered = await planSlotsFor({
      mode: 'inline',
      journey,
      files: [aRequestedUpload({ byteLength: MAX_UPLOAD_BYTES + 1 })],
    })

    expect(offered).toEqual({ ok: false, error: 'too-large' })
  })

  it('refuses a request naming no journey at all, rather than staging under an empty key', async () => {
    const { storage } = await aTempStore()

    const offered = await offerUploadSlots(
      { journey: '   ', files: [aRequestedUpload()] },
      { processor: mediaProcessorFor('inline'), storage, nonce: () => 'n0' },
    )

    expect(offered).toEqual({ ok: false, error: 'invalid-journey' })
  })

  it('trims a journey id before keying by it, so two spellings of one journey are one prefix', async () => {
    // `journeyId` refuses a blank id but does NOT trim the one it brands, so
    // without the trim here a padded id would key its own staging prefix and
    // the journey would have two. The blank case above cannot show this: it is
    // refused either way.
    const { storage } = await aTempStore()

    const offered = await offerUploadSlots(
      { journey: `  ${journey}  `, files: [aRequestedUpload()] },
      { processor: mediaProcessorFor('inline'), storage, nonce: () => 'n0' },
    )

    expect(offered.ok ? offered.value[0]?.stagingKey : '').toBe(`staging/${journey}/n0-tokyo.jpg`)
  })

  it('refuses when the store will mint no URL for a planned key', async () => {
    // A nonce carrying a traversal segment is the only way to make a planned
    // key the port refuses, and it proves the refusal is not swallowed into a
    // slot with an empty URL.
    const { storage } = await aTempStore()

    const offered = await offerUploadSlots(
      { journey, files: [aRequestedUpload()] },
      { processor: mediaProcessorFor('inline'), storage, nonce: () => '../..' },
    )

    expect(offered).toEqual({ ok: false, error: 'no-upload-url' })
  })
})
