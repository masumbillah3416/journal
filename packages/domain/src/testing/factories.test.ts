import { describe, expect, it } from 'vitest'
import {
  aBookChrome,
  aJpegHeader,
  anAvifHeader,
  anExifJpeg,
  EXIF_CANARY,
  anIsoBmffHeader,
  anSvgDocument,
  aPngHeader,
  aGalleryBundle,
  aGalleryFrame,
  anAboutContent,
  aPortrait,
  aJourney,
  galleryFrames,
} from './factories'

describe('aJourney', () => {
  it('builds a journey with sensible defaults when called with no overrides', () => {
    const journey = aJourney()

    expect(journey).toMatchObject({ slug: 'tokyo', name: 'Tokyo', hiddenFromBookmarks: false })
  })

  it('merges overrides shallowly over the defaults', () => {
    const journey = aJourney({ slug: 'lisbon', hiddenFromBookmarks: true })

    expect(journey).toMatchObject({ slug: 'lisbon', hiddenFromBookmarks: true, name: 'Tokyo' })
  })

  it('gives every call its own furniture object, never a shared reference', () => {
    // CLAUDE.md §2.3: fixtures are factories with overridable defaults, never
    // shared mutable objects. A factory that hoisted its nested defaults to a
    // module-level constant would fail this - two journeys would alias the
    // same `furniture` object, and mutating one's accent would silently mutate
    // the other's too.
    const first = aJourney()
    const second = aJourney()

    expect(first).not.toBe(second)
    expect(first.furniture).not.toBe(second.furniture)
    expect(first.furniture).toEqual(second.furniture)
  })
})

describe('aBookChrome', () => {
  it('builds the seeded book’s own chrome when called with no overrides', () => {
    const chrome = aBookChrome()

    expect(chrome).toMatchObject({ title: 'Wanderings', owner: 'M. Alvarez', showDecorations: true })
  })

  it('merges overrides shallowly over the defaults', () => {
    const chrome = aBookChrome({ title: '', showDecorations: false })

    expect(chrome).toMatchObject({ title: '', showDecorations: false, owner: 'M. Alvarez' })
  })
})

describe('aPortrait', () => {
  it('builds the About page’s portrait as a hero-role slot at the centre', () => {
    const portrait = aPortrait()

    expect(portrait).toMatchObject({ role: 'hero', focalX: 50, focalY: 50 })
  })

  it('merges overrides shallowly over the defaults', () => {
    const portrait = aPortrait({ focalX: 34, focalY: 22 })

    expect(portrait).toMatchObject({ focalX: 34, focalY: 22, role: 'hero' })
  })
})

describe('anAboutContent', () => {
  it('builds the seeded about global’s own content when called with no overrides', () => {
    const about = anAboutContent()

    expect(about).toMatchObject({ replyTo: 'hello@wanderings.travel' })
    expect(about.paragraphs).toHaveLength(2)
    expect(about.kit).toHaveLength(3)
  })

  it('merges overrides shallowly over the defaults', () => {
    const about = anAboutContent({ portrait: undefined, kit: [] })

    expect(about.portrait).toBeUndefined()
    expect(about.kit).toEqual([])
    expect(about.replyTo).toBe('hello@wanderings.travel')
  })

  it('gives every call its own portrait object, never a shared reference', () => {
    const first = anAboutContent()
    const second = anAboutContent()

    expect(first.portrait).not.toBe(second.portrait)
    expect(first.portrait).toEqual(second.portrait)
  })
})

describe('aGalleryFrame', () => {
  it('names the frame by the id the call site gave it', () => {
    expect(aGalleryFrame('market').id).toBe('market')
  })

  it('builds a still by default, since no clip can exist yet', () => {
    const frame = aGalleryFrame('market')

    expect(frame.kind).toBe('still')
    expect(frame.durationSec).toBeUndefined()
  })

  it('merges overrides shallowly over the defaults', () => {
    const frame = aGalleryFrame('reel', { kind: 'clip', durationSec: 18 })

    expect(frame).toMatchObject({ id: 'reel', kind: 'clip', durationSec: 18, downloadable: true })
  })
})

describe('aGalleryBundle', () => {
  it('builds the seeded journey’s own header values by default', () => {
    expect(aGalleryBundle().journey).toMatchObject({ slug: 'tokyo', name: 'Tokyo', place: 'Japan' })
  })

  it('merges overrides shallowly over the defaults', () => {
    const bundle = aGalleryBundle({ thumbSize: 300, frames: [] })

    expect(bundle.thumbSize).toBe(300)
    expect(bundle.frames).toEqual([])
    expect(bundle.journey.name).toBe('Tokyo')
  })

  it('gives every call its own journey object, never a shared reference', () => {
    const first = aGalleryBundle()
    const second = aGalleryBundle()

    expect(first.journey).not.toBe(second.journey)
    expect(first.journey).toEqual(second.journey)
  })
})

describe('galleryFrames', () => {
  it('builds as many frames as the case asks for', () => {
    expect(galleryFrames(61)).toHaveLength(61)
  })

  it('gives every frame an id of its own, so an assertion can tell them apart', () => {
    const ids = galleryFrames(61).map((frame) => frame.id)

    expect(new Set(ids).size).toBe(61)
  })
})

describe('aJpegHeader', () => {
  it('opens with the start-of-image marker a JPEG is identified by', () => {
    const header = aJpegHeader()

    expect([...header.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe0])
  })

  it('spells JFIF in its APP0 segment, as a camera-written file does', () => {
    // Not decoration: the segment is what makes these bytes a real file's
    // rather than a two-byte marker with padding behind it.
    const header = aJpegHeader()

    expect(new TextDecoder().decode(header.subarray(6, 10))).toBe('JFIF')
  })

  it('gives every call its own array, never a shared buffer', () => {
    expect(aJpegHeader()).not.toBe(aJpegHeader())
  })
})

describe('aPngHeader', () => {
  it('is exactly the eight bytes this factory is documented to hold', () => {
    // NAMED AS THE SELF-CONSISTENCY CHECK IT IS. That these bytes are a real
    // PNG's was measured twice and the evidence lives in the factory's
    // docstring; this assertion compares the fixture with literals and
    // cannot confirm it. Nor can a test read a real file: the only PNG in
    // the tree is the seeded `apps/web/media/bergen-b4-28.png`, which
    // `.gitignore` keeps out of git, so a fresh clone has none.
    expect([...aPngHeader()]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })
})

describe('anIsoBmffHeader', () => {
  it('writes ftyp at offset four, the offset the sniff reads the tag from', () => {
    // Self-consistency again, and the same division of labour: that offset 4
    // is where a real file carries the tag is measured by `anAvifHeader`,
    // whose bytes ARE a real file's, and `sniff.ts` reads it there.
    const header = anIsoBmffHeader()

    expect(new TextDecoder().decode(header.subarray(4, 8))).toBe('ftyp')
  })

  it('defaults to the isom brand, which is MP4’s own', () => {
    expect(new TextDecoder().decode(anIsoBmffHeader().subarray(8, 12))).toBe('isom')
  })

  it('writes the brand the call site named, at offset eight', () => {
    expect(new TextDecoder().decode(anIsoBmffHeader({ brand: 'heic' }).subarray(8, 12))).toBe('heic')
  })

  it('pads a short brand to the four bytes the field is wide', () => {
    // QuickTime's brand is two characters and the field is four, so a file
    // that carries it carries `qt  `. A fixture that wrote `qt` alone would
    // put the next field two bytes early and stop being a real header.
    expect(new TextDecoder().decode(anIsoBmffHeader({ brand: 'qt' }).subarray(8, 12))).toBe('qt  ')
  })

  it('truncates a brand longer than the field rather than overflowing it', () => {
    expect(new TextDecoder().decode(anIsoBmffHeader({ brand: 'quicktime' }).subarray(8, 12))).toBe('quic')
  })
})

describe('anAvifHeader', () => {
  it('is the twenty-eight bytes this machine’s sharp wrote, in that order', () => {
    // A literal, because the fixture is a transcription: an expectation
    // derived from the fixture would agree with a typo in it.
    expect([...anAvifHeader()]).toEqual([
      0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00, 0x6d, 0x69, 0x66,
      0x31, 0x61, 0x76, 0x69, 0x66, 0x6d, 0x69, 0x61, 0x66,
    ])
  })

  it('carries ftyp at offset four and the avif brand at offset eight', () => {
    const header = anAvifHeader()

    expect(new TextDecoder().decode(header.subarray(4, 12))).toBe('ftypavif')
  })

  it('gives every call its own array, never a shared buffer', () => {
    expect(anAvifHeader()).not.toBe(anAvifHeader())
  })
})

describe('anSvgDocument', () => {
  it('opens with the root element, which is the only thing that identifies an SVG', () => {
    expect(new TextDecoder().decode(anSvgDocument()).startsWith('<svg')).toBe(true)
  })

  it('carries the script tag that makes an uploaded SVG stored XSS', () => {
    // The fixture has to hold the payload a rejection exists to stop; an SVG
    // with no script in it would let a broken rejection look harmless.
    expect(new TextDecoder().decode(anSvgDocument())).toContain('<script>')
  })

  it('puts the caller’s prologue between that whitespace and the root element', () => {
    const document = new TextDecoder().decode(anSvgDocument({ leadingWhitespace: '\n', prologue: '<!--p-->' }))

    expect(document.startsWith('\n<!--p--><svg')).toBe(true)
  })

  it('qualifies the root element and the script with the namespace prefix the caller named', () => {
    // Both elements, not just the root: a document whose root is `<s:svg>`
    // and whose script is `<script>` is not the document a browser runs,
    // because the unprefixed element is in no namespace there.
    const document = new TextDecoder().decode(anSvgDocument({ namespacePrefix: 's' }))

    expect(document).toBe(
      '<s:svg xmlns:s="http://www.w3.org/2000/svg">' +
        '<s:script>fetch("/admin/sign-out",{method:"POST"})</s:script></s:svg>',
    )
  })

  it('puts the caller’s leading whitespace before the root element', () => {
    const document = new TextDecoder().decode(anSvgDocument({ leadingWhitespace: '\n  ' }))

    expect(document.startsWith('\n  <svg')).toBe(true)
  })
})

describe('anExifJpeg', () => {
  /** The fixture's bytes as latin1 text, which is how an ASCII value inside a binary file is searched for. */
  const asText = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes)
  const uint16At = (bytes: Uint8Array, at: number): number =>
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(at)

  it('is a complete JPEG, from the start-of-image marker to the end-of-image one', () => {
    const jpeg = anExifJpeg()

    expect([...jpeg.subarray(0, 2), ...jpeg.subarray(jpeg.length - 2)]).toEqual([0xff, 0xd8, 0xff, 0xd9])
  })

  it('is exactly as long as its documented layout says, in both the file and the segment', () => {
    // NOT a tautology, deliberately: both numbers are the layout table in
    // the docstring, added up by hand. A segment length taken from the
    // fixture itself would agree with a fixture that padded or truncated
    // its own segment, and an overstated length is how a real file ends up
    // with a parser reading past the end of its directory. The TIFF block
    // is 113 bytes - 50 of header and IFD0, a 25-byte canary, 18 of
    // sub-IFD, a 20-byte capture time - and the segment adds its own
    // two-byte length field and the six identifier bytes.
    const jpeg = anExifJpeg()

    expect([uint16At(jpeg, 4), jpeg.length]).toEqual([2 + 6 + 113, 2 + 2 + (2 + 6 + 113) + 2])
  })
  it('introduces the segment with the six bytes that make an APP1 an EXIF one', () => {
    expect(asText(anExifJpeg().subarray(6, 12))).toBe('Exif\u0000\u0000')
  })

  it('really contains the canary, which is what every absence assertion downstream rests on', () => {
    // THE POSITIVE CONTROL. `expect(stored).not.toContain(canary)` is
    // trivially true of a fixture that never carried it, so the presence is
    // asserted here, once, in the file that builds it.
    expect(asText(anExifJpeg())).toContain(EXIF_CANARY)
  })

  it('really contains the capture time as ASCII, for the same reason', () => {
    expect(asText(anExifJpeg({ capturedAt: '2019:07:01 06:00:00' }))).toContain('2019:07:01 06:00:00')
  })

  it('writes a big-endian TIFF block by default and a little-endian one on request', () => {
    expect([
      asText(anExifJpeg().subarray(12, 14)),
      asText(anExifJpeg({ byteOrder: 'little-endian' }).subarray(12, 14)),
    ]).toEqual(['MM', 'II'])
  })

  it('declares three entries in IFD0, in the ascending tag order TIFF requires', () => {
    // SELF-CONSISTENCY, NAMED AS SUCH: this reads the layout back at the
    // offsets the factory wrote it at, so it cannot confirm that the layout
    // is a real file's. What confirms that is in the factory's docstring -
    // `sharp` was handed this segment and read the orientation and the
    // canary out of it - and a test cannot do it here, because the domain
    // package has no encoder to compare against.
    const jpeg = anExifJpeg()

    expect([uint16At(jpeg, 20), uint16At(jpeg, 22), uint16At(jpeg, 34), uint16At(jpeg, 46)]).toEqual([
      3, 0x0112, 0x8298, 0x8769,
    ])
  })

  it('writes the orientation the caller asked for into the entry’s own value field', () => {
    expect(uint16At(anExifJpeg({ orientation: 7 }), 30)).toBe(7)
  })

  it('writes an orientation of zero rather than substituting the default for it', () => {
    // `?? 1` and `|| 1` differ here, and the case that tells them apart is
    // the corrupt-tag case `exif.test.ts` needs.
    expect(uint16At(anExifJpeg({ orientation: 0 }), 30)).toBe(0)
  })

  it('gives every call its own array, never a shared buffer', () => {
    expect(anExifJpeg()).not.toBe(anExifJpeg())
  })
})
