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
 * ═══ THE TWO TERMS THIS CALLER SETS ARE PINNED BY REDEEMING THE URL ═══
 *
 * `offerUploadSlots` hands the port `UPLOAD_URL_TTL_SECONDS` and
 * `MAX_UPLOAD_BYTES`. The shared contract suite pins that an ADAPTER honours
 * whatever lifetime and cap it is handed, on both sides; nothing there can say
 * WHICH values this caller chose, and until Task 7's fix round nothing here
 * could either — substituting `86_400` for the lifetime, or `1` for the cap,
 * left all 58 cases in this directory green.
 *
 * They are pinned the only way that is not the constant agreeing with itself:
 * by making the upload the offered URL describes, through the same
 * `receiveLocalUpload` a browser reaches, and asking whether it was accepted.
 * The lifetime is BRACKETED for the reason the contract suite gives — the
 * adapter mints from its own clock, so `before + ttl` is inside the window and
 * `after + ttl + 1` is outside it whatever the minting cost. The cap is
 * exercised through the DECLARED `Content-Length`, which the receiver weighs
 * before reading a byte: that pins both sides of a fifty-megabyte limit without
 * moving fifty megabytes.
 *
 * Every assertion reads the imported constant, never a literal `900` or
 * `52_428_800`. A literal here would re-pin the number in a second place, and
 * the two would drift the first time the domain changed one.
 * Depends on: vitest; the probes (./testing/uploadProbes); `mediaProcessorFor`
 * (./services); `receiveLocalUpload` and `EXPECTED_UPLOAD_REQUEST`, for
 * redeeming an offered URL; `env` (../env) for the secret the offered token was
 * signed with — by reference, never by value; the module under test.
 */
import { MAX_FILES_PER_REQUEST, MAX_UPLOAD_BYTES, UPLOAD_URL_TTL_SECONDS } from '@travel-diary/domain/media/uploadSlot'
import type { PipelineMode } from '@travel-diary/domain/media/ingestPolicy'
import type { RequestedUpload } from '@travel-diary/domain/media/uploadSlot'
import type { JourneyId } from '@travel-diary/domain/ids'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '../env'
import { receiveLocalUpload } from './receiveLocalUpload'
import { mediaProcessorFor } from './services'
import type { UploadSlotResponse } from './uploadContract'
import { EXPECTED_UPLOAD_REQUEST } from './uploadContract'
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

/**
 * Attempts the upload an offered URL describes, and reports whether it was taken.
 *
 * The URL is used WHOLE rather than having its token picked apart: the terms
 * under test are inside a signature, so the only honest question is whether the
 * receiver accepts an upload on them. A fresh throwaway store per call, because
 * what is under test is the ACCEPTANCE and not where the bytes landed.
 * @param input - The offered URL, the instant to present it at, and the length
 *   to declare. The body is three bytes whatever the declared length says: a
 *   client whose header disagrees with its body is exactly what the receiver's
 *   pre-read check exists for, and it is what lets a fifty-megabyte cap be
 *   exercised without fifty megabytes.
 */
const redeem = async (input: {
  readonly url: string
  readonly at: number
  readonly declaredLength: number
}): Promise<boolean> => {
  const { storage } = await aTempStore()
  const received = await receiveLocalUpload(
    new Request(input.url, {
      method: EXPECTED_UPLOAD_REQUEST.method,
      headers: {
        'Content-Type': EXPECTED_UPLOAD_REQUEST.contentType,
        'Content-Length': String(input.declaredLength),
      },
      body: new Uint8Array([1, 2, 3]),
    }),
    { storage, now: () => input.at, secret: env.PAYLOAD_SECRET },
  )
  return received.ok
}

/**
 * The URL the one offered slot carries.
 *
 * Answers the empty string when no slot was offered, which makes `new Request`
 * throw rather than letting a refusal case pass for the wrong reason.
 * @param offered - What {@link offerUploadSlots} answered.
 */
const theOfferedUrl = (offered: UploadSlotResponse): string => (offered.ok ? (offered.value[0]?.uploadUrl ?? '') : '')

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

  it('offers a URL still live at UPLOAD_URL_TTL_SECONDS, the lifetime the domain sets', async () => {
    // Only the LOWER bracket is needed: expiresAt >= before + the lifetime, and
    // `verifyUploadToken` refuses only `now > expiresAt`, so the expiry instant
    // itself is inside the window.
    const before = Date.now()
    const offered = await planSlotsFor({ mode: 'inline', journey })

    expect(offered.ok).toBe(true)
    expect(
      await redeem({ url: theOfferedUrl(offered), at: before + UPLOAD_URL_TTL_SECONDS * 1000, declaredLength: 3 }),
    ).toBe(true)
  })

  it('offers a URL dead one millisecond past UPLOAD_URL_TTL_SECONDS, so the lifetime is that one and not a longer one', async () => {
    // The case that kills a longer lifetime substituted at the call site. Only
    // the UPPER bracket is needed, since expiresAt <= after + the lifetime.
    const offered = await planSlotsFor({ mode: 'inline', journey })
    const after = Date.now()

    expect(offered.ok).toBe(true)
    expect(
      await redeem({ url: theOfferedUrl(offered), at: after + UPLOAD_URL_TTL_SECONDS * 1000 + 1, declaredLength: 3 }),
    ).toBe(false)
  })

  it('offers a URL that takes a declared length of exactly MAX_UPLOAD_BYTES', async () => {
    const before = Date.now()
    const offered = await planSlotsFor({ mode: 'inline', journey })

    expect(offered.ok).toBe(true)
    expect(await redeem({ url: theOfferedUrl(offered), at: before, declaredLength: MAX_UPLOAD_BYTES })).toBe(true)
  })

  it('offers a URL that refuses a declared length one byte over MAX_UPLOAD_BYTES, so the cap is that one and not a larger one', async () => {
    const before = Date.now()
    const offered = await planSlotsFor({ mode: 'inline', journey })

    expect(offered.ok).toBe(true)
    expect(await redeem({ url: theOfferedUrl(offered), at: before, declaredLength: MAX_UPLOAD_BYTES + 1 })).toBe(false)
  })
})
