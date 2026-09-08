/**
 * sniff.test.ts — what a file actually is, decided before anything decodes it.
 *
 * SECURITY.md, "Never serve uploads from the admin's origin", is the binding
 * requirement and it names the source of truth: "Sniff the real type from
 * magic bytes; never trust the extension or the client-declared mime type."
 * So the case that carries this file is not the one that feeds a `.svg` named
 * `.svg` - a name proves nothing here, and a test built on one would pass
 * against an implementation that read the name. It is the one that feeds SVG
 * BYTES and expects `'image/svg+xml'` back regardless of what anything is
 * called, which `ingestPolicy.test.ts` then refuses.
 *
 * WHY THE FIXTURES LIVE IN `../testing/factories`. Each of the four carries a
 * paragraph recording how its bytes are known to be a real file's - two of
 * them measured against files this machine produced. A fixture that guessed
 * at the bytes would make every case below agree with the implementation
 * rather than with an upload, which is the defect species this repository has
 * shipped twice.
 *
 * Depends on: vitest, ./sniff, ../testing/factories.
 */
import { describe, expect, it } from 'vitest'
import { sniffMediaType } from './sniff'
import { aJpegHeader, anIsoBmffHeader, anSvgDocument, aPngHeader } from '../testing/factories'

describe('sniffMediaType', () => {
  it('names a JPEG from its start-of-image marker', () => {
    expect(sniffMediaType(aJpegHeader())).toBe('image/jpeg')
  })

  it('names a JPEG whose fourth byte opens a quantisation table, not a JFIF segment', () => {
    // MEASURED, not imagined: `sharp` 0.35.4 on this machine encodes a JPEG
    // that opens `ff d8 ff db` - SOI then DQT - where a camera writes
    // `ff d8 ff e0`. Both are JPEGs. A four-byte signature would refuse
    // every derivative this repository's own pipeline writes, so this case
    // is what pins the match to the three bytes they share.
    expect(sniffMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00]))).toBe('image/jpeg')
  })

  it('names a PNG from its eight-byte signature', () => {
    expect(sniffMediaType(aPngHeader())).toBe('image/png')
  })

  it('separates HEIC from MP4 by the ftyp brand, not by the box header they share', () => {
    expect(sniffMediaType(anIsoBmffHeader({ brand: 'heic' }))).toBe('image/heic')
    expect(sniffMediaType(anIsoBmffHeader({ brand: 'isom' }))).toBe('video/mp4')
  })

  it('names every HEIC and HEIF brand a still can arrive under', () => {
    // All five refuse identically downstream, so all five have to arrive at
    // the same answer here rather than three of them falling through to
    // `'video/mp4'` and being handed to a video pipeline.
    const brands = ['heic', 'heix', 'hevc', 'mif1', 'msf1']

    expect(brands.map((brand) => sniffMediaType(anIsoBmffHeader({ brand })))).toEqual(brands.map(() => 'image/heic'))
  })

  it('names QuickTime from the qt brand', () => {
    expect(sniffMediaType(anIsoBmffHeader({ brand: 'qt' }))).toBe('video/quicktime')
  })

  it('names an SVG, which no byte signature announces, from its root element', () => {
    expect(sniffMediaType(anSvgDocument())).toBe('image/svg+xml')
  })

  it('names an SVG that leads with whitespace and a byte-order mark', () => {
    // A rejection that only catches a file starting exactly at the angle
    // bracket is a rejection an uploader gets past by pressing return.
    expect(sniffMediaType(anSvgDocument({ leadingWhitespace: '\ufeff\n  ' }))).toBe('image/svg+xml')
  })

  it('names an SVG wrapped in an XML declaration', () => {
    const declared = new TextEncoder().encode(
      `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"/>`,
    )

    expect(sniffMediaType(declared)).toBe('image/svg+xml')
  })

  it('names an SVG whose leading comment spoofs an ftyp box header', () => {
    // FOUND BY SELF-REVIEW, not by the brief. An XML comment before the root
    // element is legal in an SVG a browser renders, and `<!--` is four bytes
    // - so a comment opening with `ftyp` puts that tag exactly where an ISO
    // base media file carries it. Any signature read at an OFFSET can be
    // spoofed this way by a document that is markup all the way down, which
    // is why the markup scan is asked FIRST rather than last: no JPEG, PNG,
    // HEIC, MP4 or QuickTime file begins with `<`, so nothing real is
    // misread by asking, while an SVG that reached the ftyp branch came back
    // `'video/mp4'` and was ACCEPTED under worker mode.
    const spoof = new TextEncoder().encode(
      '<!--ftyp--><svg xmlns="http://www.w3.org/2000/svg"><script>0</script></svg>',
    )

    expect(sniffMediaType(spoof)).toBe('image/svg+xml')
  })

  it('reports unknown for markup that is not an SVG, rather than refusing all markup as one', () => {
    const html = new TextEncoder().encode('<!doctype html><html><body>not a drawing</body></html>')

    expect(sniffMediaType(html)).toBe('unknown')
  })

  it('stops looking for a root element after the first kilobyte', () => {
    // The scan is bounded because the uploader controls the length, and a
    // full pass over a 50MiB file is work an attacker chooses for us. A
    // document that only says `<svg` past the bound is not a document any
    // renderer treats as an SVG either.
    const padded = new TextEncoder().encode(`<!--${'.'.repeat(1200)}--><svg xmlns="http://www.w3.org/2000/svg"/>`)

    expect(sniffMediaType(padded)).toBe('unknown')
  })

  it('reports unknown rather than guessing, for bytes it does not recognise', () => {
    expect(sniffMediaType(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('unknown')
  })

  it('reports unknown for an empty upload rather than throwing', () => {
    expect(sniffMediaType(new Uint8Array())).toBe('unknown')
  })

  it('reports unknown for a file too short to carry any signature', () => {
    expect(sniffMediaType(new Uint8Array([0xff]))).toBe('unknown')
  })

  it('reports unknown for an ftyp box cut off before its brand', () => {
    // A truncated upload must not fall through to the `'video/mp4'` default:
    // the brand is what the answer rests on, and eight bytes carry none.
    expect(sniffMediaType(new Uint8Array([0x00, 0x00, 0x00, 0x10, 0x66, 0x74, 0x79, 0x70]))).toBe('unknown')
  })
})
