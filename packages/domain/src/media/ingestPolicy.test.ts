/**
 * ingestPolicy.test.ts — which files may be ingested at all, and the refusal
 * each rejected one is refused BY NAME with.
 *
 * The two describe blocks below feed `sniffed` directly, which is what keeps
 * this file about the policy rather than about the bytes. The third does not:
 * it puts `sniffMediaType` in front of `ingestDecision` and feeds it the
 * bytes of an SVG under the `Content-Type` a browser sends for a file called
 * `holiday.jpg`. That case is the one this whole task exists for — SECURITY.md
 * says the type comes from the magic bytes and "never the extension or the
 * client-declared mime type", and a case that fed a correctly-named `.svg`
 * would pass against an implementation that read the name.
 *
 * WHY THE REFUSAL'S NAME IS ASSERTED AND NOT JUST ITS FALSITY. An SVG
 * refused as `'declared-mismatch'` would be true and useless: the log line
 * and the admin's error would name a naming problem where the real one is a
 * stored-XSS attempt. So every case here asserts the whole Result, not
 * `.ok === false`.
 *
 * THE THIRD BLOCK IS ALSO WHERE THE BYPASSES ARE PROVED CLOSED. The Task 2
 * review defeated the first fix for the `ftyp`-in-markup class five ways and
 * measured what `ingestDecision` then answered: `{ ok: true, value:
 * 'video/mp4' }` for a document Chromium renders and whose script it runs.
 * A case in `sniff.test.ts` alone would pin the type; only a composed case
 * pins the ACCEPTANCE, which is the thing that was wrong.
 *
 * Depends on: vitest, ./ingestPolicy, ./sniff, ../testing/factories.
 */
import { describe, expect, it } from 'vitest'
import { acceptedIngestTypes, ingestDecision } from './ingestPolicy'
import { sniffMediaType } from './sniff'
import { aJpegHeader, anAvifHeader, anSvgDocument } from '../testing/factories'

describe('acceptedIngestTypes', () => {
  it('offers stills only under inline, because video is deferred', () => {
    expect(acceptedIngestTypes('inline')).toEqual(['image/jpeg', 'image/png'])
  })

  it('offers the two clip types as well under worker, which is the whole config switch', () => {
    expect(acceptedIngestTypes('worker')).toEqual(['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'])
  })

  it('never returns the same array twice, so no caller can edit the policy', () => {
    // A shared constant handed out to callers is a mutable singleton, which
    // CLAUDE.md §3.3 rejects by name - and the thing it would be mutating is
    // an allowlist.
    expect(acceptedIngestTypes('inline')).not.toBe(acceptedIngestTypes('inline'))
  })
})

describe('ingestDecision', () => {
  it('accepts a JPEG whose declared type agrees with its bytes', () => {
    expect(ingestDecision({ sniffed: 'image/jpeg', declared: 'image/jpeg', mode: 'inline' })).toEqual({
      ok: true,
      value: 'image/jpeg',
    })
  })

  it('accepts on the sniffed type when the declared type is missing entirely', () => {
    // The bytes decide. A client that declares nothing has declared nothing
    // wrong.
    expect(ingestDecision({ sniffed: 'image/png', declared: '', mode: 'inline' })).toEqual({
      ok: true,
      value: 'image/png',
    })
  })

  it('rejects an SVG declared as a JPEG as an SVG, not as a mismatch', () => {
    // The refusal has to name the danger. SECURITY.md: an SVG is an HTML
    // document, so one upload becomes stored XSS with the author's own
    // session attached - and that is true whatever the client called it.
    expect(ingestDecision({ sniffed: 'image/svg+xml', declared: 'image/jpeg', mode: 'inline' })).toEqual({
      ok: false,
      error: 'svg-rejected',
    })
  })

  it('rejects an SVG under worker as well, because no mode has a use for one', () => {
    expect(ingestDecision({ sniffed: 'image/svg+xml', declared: 'image/svg+xml', mode: 'worker' })).toEqual({
      ok: false,
      error: 'svg-rejected',
    })
  })

  it('defers an mp4 under inline even though the schema lists it', () => {
    // ADR 0004: the port enforces this, not a schema change - so enabling
    // clips stays one configuration change.
    expect(ingestDecision({ sniffed: 'video/mp4', declared: 'video/mp4', mode: 'inline' })).toEqual({
      ok: false,
      error: 'video-deferred',
    })
  })

  it('defers QuickTime under inline for the same reason', () => {
    expect(ingestDecision({ sniffed: 'video/quicktime', declared: 'video/quicktime', mode: 'inline' })).toEqual({
      ok: false,
      error: 'video-deferred',
    })
  })

  it('accepts an mp4 under worker, which is what the flag buys', () => {
    expect(ingestDecision({ sniffed: 'video/mp4', declared: 'video/mp4', mode: 'worker' })).toEqual({
      ok: true,
      value: 'video/mp4',
    })
  })

  it('refuses HEIC in both modes, because this sharp build cannot decode it', () => {
    // Measured: sharp 0.35.4's heif input file-suffix list is ['.avif'] and
    // its codec is aom, not HEVC. The schema keeps image/heic faithfully
    // from DATA_MODEL.md; the port is what refuses it.
    expect(ingestDecision({ sniffed: 'image/heic', declared: 'image/heic', mode: 'inline' })).toEqual({
      ok: false,
      error: 'heic-unsupported',
    })
    expect(ingestDecision({ sniffed: 'image/heic', declared: 'image/heic', mode: 'worker' })).toEqual({
      ok: false,
      error: 'heic-unsupported',
    })
  })

  it('refuses bytes it could not identify', () => {
    expect(ingestDecision({ sniffed: 'unknown', declared: 'image/jpeg', mode: 'inline' })).toEqual({
      ok: false,
      error: 'type-not-allowed',
    })
  })

  it('refuses a PNG declared as a JPEG, because the disagreement is itself a signal', () => {
    expect(ingestDecision({ sniffed: 'image/png', declared: 'image/jpeg', mode: 'inline' })).toEqual({
      ok: false,
      error: 'declared-mismatch',
    })
  })
})

describe('the sniff and the policy together, on a file that lies about itself', () => {
  it('refuses SVG bytes uploaded under the type a .jpg filename produces', () => {
    // This is SECURITY.md's requirement end to end, and the only case in
    // this file where nothing is told the answer: a browser asked to upload
    // `holiday.jpg` sends `Content-Type: image/jpeg` because it reads the
    // EXTENSION, so `declared` here is exactly what the attacker's own
    // browser would send. The bytes are an SVG carrying a script element.
    const bytes = anSvgDocument()

    const decision = ingestDecision({ sniffed: sniffMediaType(bytes), declared: 'image/jpeg', mode: 'inline' })

    expect(decision).toEqual({ ok: false, error: 'svg-rejected' })
  })

  it('refuses an SVG whose padded comment spoofs an mp4 header, under worker and a lying client', () => {
    // THE REVIEW'S BYPASS, end to end and in the mode that accepted it.
    // `worker` is one environment variable away (ADR 0004) and the client
    // writes its own `Content-Type`, so neither inline mode nor the declared
    // type is a guard here - the sniff is. Before the fork was structural
    // this returned `{ ok: true, value: 'video/mp4' }` for a document served
    // as `image/svg+xml` that Chromium renders and whose script it executes.
    const bytes = anSvgDocument({ prologue: `<!--ftypisom${'.'.repeat(1100)}-->` })

    const decision = ingestDecision({ sniffed: sniffMediaType(bytes), declared: 'video/mp4', mode: 'worker' })

    expect(decision).toEqual({ ok: false, error: 'type-not-allowed' })
  })

  it('refuses one whose root element carries a namespace prefix by name, as an SVG', () => {
    // Fourteen bytes of prolog, no padding, and a root element a literal
    // scan for `<svg` never sees - and this one is refused under the name of
    // the danger rather than as an unrecognised file, because the prefixed
    // root is recognised.
    const bytes = anSvgDocument({ prologue: '<?x ftypisom?>', namespacePrefix: 's' })

    const decision = ingestDecision({ sniffed: sniffMediaType(bytes), declared: 'video/mp4', mode: 'worker' })

    expect(decision).toEqual({ ok: false, error: 'svg-rejected' })
  })

  it('refuses a real AVIF the way a browser uploads one, as a declared mismatch', () => {
    // Measured: Chromium sends `image/avif` for `pic.avif`, and the bytes
    // sniff `'video/mp4'` because `avif` is not a brand this table names. The
    // disagreement is what refuses it, which is why the mismatch check earns
    // its place even though the bytes are never trusted to the client's word.
    const decision = ingestDecision({ sniffed: sniffMediaType(anAvifHeader()), declared: 'image/avif', mode: 'worker' })

    expect(decision).toEqual({ ok: false, error: 'declared-mismatch' })
  })

  it('accepts a real AVIF from a client that declares it an mp4, which Phase 3 Task 6 owns', () => {
    // NOT ratified as good: recorded, with real bytes, because it is latent
    // otherwise. A client is not a browser and writes its own header, so
    // under `worker` an AVIF reaches the clip pipeline named `'video/mp4'`.
    // The refusal that catches it is the DECODER's, which is Task 6's to
    // build - and this case is what makes the invariant in `sniff.ts`'s
    // header ("never read 'video/mp4' as 'this decodes as video'") fail
    // loudly if Task 6 assumes otherwise.
    const decision = ingestDecision({ sniffed: sniffMediaType(anAvifHeader()), declared: 'video/mp4', mode: 'worker' })

    expect(decision).toEqual({ ok: true, value: 'video/mp4' })
  })

  it('accepts real JPEG bytes on the same path, so the refusal above is not a blanket one', () => {
    // Without this, a `sniffMediaType` that returned `'image/svg+xml'` for
    // everything would satisfy the case above and look like a working guard.
    const bytes = aJpegHeader()

    const decision = ingestDecision({ sniffed: sniffMediaType(bytes), declared: 'image/jpeg', mode: 'inline' })

    expect(decision).toEqual({ ok: true, value: 'image/jpeg' })
  })
})
