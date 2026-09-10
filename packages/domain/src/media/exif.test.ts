/**
 * exif.test.ts — the two facts read out of a photograph, and the probe that
 * certifies metadata is gone.
 *
 * FOUR DESCRIBE BLOCKS, AND THEY ARE NOT INTERCHANGEABLE.
 *
 *   - `readExifFacts` on a file that has EXIF: the two values SECURITY.md
 *     says to capture before stripping, read out of a hand-assembled segment
 *     whose layout is evidenced in `../testing/bytes.ts`.
 *   - `readExifFacts` on files that do not, or no longer parse: a PNG, a
 *     JPEG with no APP1, an APP1 that is not EXIF, and a corrupt TIFF
 *     header. Every one asserts BOTH fields, because a reader that answered
 *     a fact it could not have read is the defect here, not a throw.
 *   - `readExifFacts` on every truncation: one loop over all 128 prefixes of
 *     a complete fixture. The invariant it pins is the one the module header
 *     names — these bytes are attacker-controlled and the reader must never
 *     throw — and it reaches every bounds check in the file at once, which a
 *     hand-picked list of lengths would not. It is guarded against being
 *     vacuous: the complete file's facts are asserted first, and the first
 *     length at which each fact appears is asserted to be a real prefix.
 *   - `metadataMarkersIn`: the probe. Its cases are deliberately about
 *     finding things — a probe whose "no" cannot be distinguished from a
 *     broken scanner is the failure the exit criterion guards against, so
 *     the positive cases outnumber the negative ones.
 *
 * Depends on: vitest, ./exif, ../testing/bytes.
 */
import { describe, expect, it } from 'vitest'
import { METADATA_MARKERS, metadataMarkersIn, readExifFacts } from './exif'
import { aJpegHeader, anExifJpeg, aPngHeader, EXIF_CANARY } from '../testing/bytes'

/** No facts at all — what every unreadable file must read as, on both fields. */
const NOTHING_READ = { capturedAt: undefined, orientation: undefined }

/**
 * The fixture with `replacement` written over it at `offset`, so a case can
 * corrupt one named field of a real EXIF layout without a second factory.
 */
const patched = (bytes: Uint8Array, offset: number, replacement: readonly number[]): Uint8Array => {
  const copy = Uint8Array.from(bytes)
  copy.set(replacement, offset)
  return copy
}

/** Where the TIFF header starts in `anExifJpeg`: SOI, APP1 marker, its length, then `Exif\0\0`. */
const TIFF_HEADER_AT = 12

describe('readExifFacts on a photograph that carries EXIF', () => {
  it('reads the capture time as an ISO instant, not as EXIF colons', () => {
    const facts = readExifFacts(anExifJpeg({ capturedAt: '2025:03:14 09:26:53' }))

    expect(facts.capturedAt).toBe('2025-03-14T09:26:53')
  })

  it('reads the orientation tag, which decides whether the photograph is on its side', () => {
    expect(readExifFacts(anExifJpeg({ orientation: 6 })).orientation).toBe(6)
  })

  it('reads both facts out of a little-endian TIFF block, which is what most cameras write', () => {
    const facts = readExifFacts(
      anExifJpeg({ byteOrder: 'little-endian', capturedAt: '2024:11:02 17:04:00', orientation: 8 }),
    )

    expect(facts).toEqual({ capturedAt: '2024-11-02T17:04:00', orientation: 8 })
  })

  it('reports undefined for an orientation outside the eight EXIF defines', () => {
    // A value of 0 or 9 is a corrupt tag, and rotating by it would be worse
    // than not rotating.
    expect(readExifFacts(anExifJpeg({ orientation: 9 })).orientation).toBeUndefined()
  })

  it('reports undefined for an orientation below the eight EXIF defines', () => {
    expect(readExifFacts(anExifJpeg({ orientation: 0 })).orientation).toBeUndefined()
  })

  it('reports undefined for a capture time EXIF could not have written', () => {
    expect(readExifFacts(anExifJpeg({ capturedAt: 'not a timestamp' })).capturedAt).toBeUndefined()
  })

  it('keeps reading the rest of the directory when the orientation tag is not there', () => {
    // The two bytes at offset 22 are IFD0's first entry's tag id. Rewritten
    // to ImageWidth, the file has no orientation but still has a capture
    // time - and asserting the capture time is what proves the walk carried
    // on rather than abandoning the directory at the first miss.
    const noOrientationTag = patched(anExifJpeg(), TIFF_HEADER_AT + 10, [0x01, 0x00])

    expect(readExifFacts(noOrientationTag)).toEqual({ capturedAt: '2025-03-14T09:26:53', orientation: undefined })
  })

  it('refuses an orientation entry whose type is not the SHORT the tag is defined as', () => {
    // Offset 24 is that same entry's type field. A LONG there means the two
    // bytes a SHORT would occupy are the high half of a four-byte value, so
    // reading them as the orientation would answer a number the file never
    // stated.
    const orientationAsLong = patched(anExifJpeg(), TIFF_HEADER_AT + 12, [0x00, 0x04])

    expect(readExifFacts(orientationAsLong)).toEqual({ capturedAt: '2025-03-14T09:26:53', orientation: undefined })
  })

  it('reads the EXIF segment rather than the first APP1, when another APP1 comes before it', () => {
    // THE CASE THE IDENTIFIER CHECK EXISTS FOR, and the only one that can
    // fail when it is removed. FlashPix travels in an APP1 too, and a
    // reader that took the first APP1 it saw would read the wrong block -
    // so the decoy here carries a VALID TIFF block stating a different
    // orientation. A reader that skipped the identifier would answer 3.
    const decoy = anExifJpeg({ orientation: 3 })
    decoy.set(new TextEncoder().encode('FPXR'), 6)
    const real = anExifJpeg({ orientation: 6 })
    const decoyFirst = new Uint8Array([...decoy.subarray(0, decoy.length - 2), ...real.subarray(2)])

    expect(readExifFacts(decoyFirst)).toEqual({ capturedAt: '2025-03-14T09:26:53', orientation: 6 })
  })
})

describe('readExifFacts on a file with no readable EXIF', () => {
  it('reports both facts as undefined for a JPEG with no EXIF segment at all', () => {
    expect(readExifFacts(aJpegHeader())).toEqual(NOTHING_READ)
  })

  it('reports both facts as undefined for a PNG, rather than reading a JPEG structure that is not there', () => {
    expect(readExifFacts(aPngHeader())).toEqual(NOTHING_READ)
  })

  it('reports both facts as undefined for an APP1 segment that is not EXIF', () => {
    // APP1 is shared: XMP travels in one too, introduced by its namespace URI
    // rather than by `Exif\0\0`. A reader that took the first APP1 it saw
    // would read a TIFF header out of an XML document.
    const xmpInApp1 = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe1,
      0x00,
      0x20,
      ...new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\u0000'),
      0xff,
      0xd9,
    ])

    expect(readExifFacts(xmpInApp1)).toEqual(NOTHING_READ)
  })

  it('reports both facts as undefined when the byte after the start-of-image marker is not a marker', () => {
    const desynchronised = new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x00, 0x00])

    expect(readExifFacts(desynchronised)).toEqual(NOTHING_READ)
  })

  it('reports both facts as undefined for a TIFF block whose byte order is neither II nor MM', () => {
    const noByteOrder = patched(anExifJpeg(), TIFF_HEADER_AT, [0x41, 0x41])

    expect(readExifFacts(noByteOrder)).toEqual(NOTHING_READ)
  })

  it('reports both facts as undefined for a TIFF block missing the 42 that identifies one', () => {
    const noMagic = patched(anExifJpeg(), TIFF_HEADER_AT + 2, [0x00, 0x2b])

    expect(readExifFacts(noMagic)).toEqual(NOTHING_READ)
  })

  it('reports undefined rather than throwing when the segment is truncated mid-IFD', () => {
    const truncated = anExifJpeg().slice(0, 24)

    expect(readExifFacts(truncated)).toEqual(NOTHING_READ)
  })
})

describe('readExifFacts on every truncation of a file that does carry EXIF', () => {
  const complete = anExifJpeg({ capturedAt: '2025:03:14 09:26:53', orientation: 6 })
  const readingAtEveryLength = Array.from({ length: complete.length + 1 }, (_unused, length) =>
    readExifFacts(complete.slice(0, length)),
  )

  it('reads both facts from the complete file, so the truncation cases below are not vacuous', () => {
    expect(readingAtEveryLength[complete.length]).toEqual({ capturedAt: '2025-03-14T09:26:53', orientation: 6 })
  })

  it('never answers a fact the truncated bytes do not state, at any length', () => {
    const invented = readingAtEveryLength.filter(
      (facts) =>
        (facts.orientation !== undefined && facts.orientation !== 6) ||
        (facts.capturedAt !== undefined && facts.capturedAt !== '2025-03-14T09:26:53'),
    )

    expect(invented).toEqual([])
  })

  it('reads the orientation from the first prefix that contains its value field, and no earlier', () => {
    // 32 bytes: SOI, the APP1 header, `Exif\0\0`, the TIFF header, IFD0's
    // entry count, and the twelve bytes of its first entry - measured, and
    // asserted as a length shorter than the whole file so that this case is
    // about a real prefix rather than about the complete fixture.
    expect(readingAtEveryLength.findIndex((facts) => facts.orientation === 6)).toBe(32)
  })

  it('reads the capture time only once the whole ASCII value is present, which is the last thing in the block', () => {
    expect(readingAtEveryLength.findIndex((facts) => facts.capturedAt === '2025-03-14T09:26:53')).toBe(125)
  })

  it('reports the orientation with no capture time for the prefixes between the two', () => {
    // The partial answer is the point: SECURITY.md needs whichever facts the
    // file states, and a reader that threw away a readable orientation
    // because the capture time was unreadable would lose the rotation.
    expect(readingAtEveryLength[64]).toEqual({ capturedAt: undefined, orientation: 6 })
  })
})

describe('metadataMarkersIn', () => {
  it('names the three markers this repository considers metadata, in sorted order', () => {
    expect(METADATA_MARKERS).toEqual(['exif', 'iptc', 'xmp'])
  })

  it('finds the exif marker in a file that carries one', () => {
    expect(metadataMarkersIn(anExifJpeg())).toEqual(['exif'])
  })

  it('finds nothing in a JPEG carrying no metadata segment', () => {
    expect(metadataMarkersIn(aJpegHeader())).toEqual([])
  })

  it('finds the xmp marker by its namespace URI, which is plain ASCII in the file', () => {
    const withXmp = new Uint8Array([...aJpegHeader(), ...new TextEncoder().encode('http://ns.adobe.com/xap/1.0/')])

    expect(metadataMarkersIn(withXmp)).toEqual(['xmp'])
  })

  it('finds the iptc marker by the Photoshop resource header that carries it', () => {
    const withIptc = new Uint8Array([...aJpegHeader(), ...new TextEncoder().encode('Photoshop 3.0')])

    expect(metadataMarkersIn(withIptc)).toEqual(['iptc'])
  })

  it('returns the markers sorted, so an assertion reads as a set', () => {
    const both = new Uint8Array([...anExifJpeg(), ...new TextEncoder().encode('Photoshop 3.0')])

    expect(metadataMarkersIn(both)).toEqual(['exif', 'iptc'])
  })

  it('sorts a file carrying all three, rather than reporting them in the order they are searched for', () => {
    // The one case that can tell the sort apart from the declaration order
    // of the signature table, which is deliberately not alphabetical.
    const everything = new Uint8Array([
      ...anExifJpeg(),
      ...new TextEncoder().encode('http://ns.adobe.com/xap/1.0/'),
      ...new TextEncoder().encode('Photoshop 3.0'),
    ])

    expect(metadataMarkersIn(everything)).toEqual(['exif', 'iptc', 'xmp'])
  })
  it('finds a marker that sits at the very end of a long file, not only near its head', () => {
    // THE MUTATION THIS CASE EXISTS FOR. A scanner bounded to the head of
    // the file certifies EXIF absent while a segment sits at byte 4,000,
    // which is exactly the silent pass the exit criterion forbids.
    const deepInTheFile = new Uint8Array([
      ...aJpegHeader(),
      ...new Uint8Array(4000),
      ...new TextEncoder().encode('Photoshop 3.0'),
    ])

    expect(metadataMarkersIn(deepInTheFile)).toEqual(['iptc'])
  })

  it('does not find the canary string as a marker, because the canary is not a marker', () => {
    // The probe and the canary are two independent checks. If one silently
    // implied the other, the absence assertion would be one check wearing
    // two hats.
    expect(metadataMarkersIn(new TextEncoder().encode(EXIF_CANARY))).toEqual([])
  })

  it('does not find a marker in a buffer shorter than the signature being searched for', () => {
    expect(metadataMarkersIn(new Uint8Array([0xff]))).toEqual([])
  })
})
