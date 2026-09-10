/**
 * media/exif — the two facts read out of a photograph before it is stripped,
 * and the byte-level probe that certifies the stripping happened.
 *
 * SECURITY.md, "Strip EXIF", states the requirement both halves serve:
 * "Read EXIF once to capture `capturedAt` and orientation. Then strip all
 * metadata before storing or serving." The reason is not tidiness — travel
 * photographs carry GPS coordinates, so a file shot at home publishes a home
 * address and one shot at a hotel publishes where somebody was sleeping.
 *
 * ═══ WHY TWO FUNCTIONS THAT DO NOT SHARE A LINE OF CODE ═══
 *
 * {@link readExifFacts} walks JPEG segments and then TIFF directories, the
 * way a metadata reader does. {@link metadataMarkersIn} does not: it searches
 * the WHOLE buffer for three ASCII signatures, with no notion of a segment,
 * an offset table or a directory.
 *
 * That is deliberate, and it is the difference between the phase's exit
 * criterion and a test that proves nothing. `sharp` is what strips metadata
 * (Task 6's port re-encodes the image). If the thing that certified the
 * absence were `sharp` itself, or a reader sharing this module's own
 * structural assumptions, then a stripper that silently stopped stripping —
 * or one that left a segment somewhere the walk does not visit — would still
 * be reported clean. A whole-buffer byte search cannot be fooled that way:
 * either the signature's bytes are in the file or they are not. The exit
 * criterion's words are "verified by reading the stored bytes, not by
 * trusting the library", and the two functions below are those words written
 * as an architecture rather than as an intention.
 *
 * ═══ WHY THE READER IS HAND-WRITTEN AND SMALL ═══
 *
 * Two tags are needed and no more. An EXIF library is a parser for several
 * hundred tags this repository has no use for, reachable from an upload
 * endpoint — the wrong trade for two fields, which cost seventy lines of
 * our own code instead.
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * None of the seven, deliberately. This is two pure functions over a byte
 * array. A Strategy over metadata formats, or a parser abstraction, would be
 * an abstraction with a single caller, which §4 rejects.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **NEITHER FUNCTION MAY THROW, EVER.** Both are fed
 *     attacker-controlled bytes straight off an upload. A `RangeError` here
 *     is a 500 on an upload rather than a refusal, and it is the caller's
 *     transaction that dies with it. Every multi-byte read therefore goes
 *     through {@link uint16At} or {@link uint32At}, which bounds-check
 *     against the block's own length and answer `undefined` rather than
 *     letting `DataView` throw. `exif.test.ts` walks all 128 prefixes of a
 *     complete fixture to hold this.
 *   - **A surprise yields the facts read so far, never an exception and
 *     never a wrong value.** A file whose orientation is readable and whose
 *     capture time is not must still be rotated correctly.
 *   - **The reader answers a TAG, not bytes at an offset.** Both lookups
 *     match the tag number AND the field type, because a value stored under
 *     another type sits in another place — reading the first two bytes of a
 *     big-endian LONG as a SHORT answers a number the file never stated.
 *   - **The segment walk reads a file a camera or an encoder wrote, and
 *     nothing more exotic.** It does not skip the fill bytes (repeated
 *     `ff`) the format permits between segments, and it does not look past
 *     the start of the entropy-coded scan, where the byte after a cursor is
 *     no longer a marker. Stated because it is a real cost: such a file
 *     reads as having no EXIF rather than as an error - a false NEGATIVE,
 *     never a false positive, and never a throw. It is also why the
 *     stripping is certified by {@link metadataMarkersIn} and not by this
 *     walk: an EXIF segment this walk cannot reach is still a segment the
 *     whole-buffer probe finds, so a strip that left one behind fails the
 *     probe whatever the file's structure.
 *   - **{@link metadataMarkersIn} must stay unbounded.** Bounding the search
 *     to the head of a file is the one mutation that makes it certify
 *     absence while a metadata segment sits at byte 4,000, and it is the
 *     failure this whole module exists to make impossible.
 *
 * Depends on: nothing. Pure, and no `Result` — an unreadable EXIF block is
 * not an error, it is a photograph with no EXIF, and both facts are already
 * optional.
 */

/** The two facts SECURITY.md says to capture before the metadata is stripped. */
export interface ExifFacts {
  /**
   * When the photograph was taken, as an ISO 8601 local date and time with no
   * zone — EXIF records none, so none is invented here.
   */
  readonly capturedAt: string | undefined
  /** The EXIF orientation, 1 to 8, or `undefined` if the file states none this reader trusts. */
  readonly orientation: number | undefined
}

/** What a file with nothing readable in it reads as, on both fields. */
const NO_FACTS: ExifFacts = { capturedAt: undefined, orientation: undefined }

/** Which end of a multi-byte TIFF value holds its most significant byte. */
type ByteOrder = 'big-endian' | 'little-endian'

const JPEG_START_OF_IMAGE = 0xffd8
const MARKER_PREFIX = 0xff
const APP1_MARKER = 0xe1
/** The six bytes that make an APP1 segment an EXIF one rather than, say, an XMP one. */
const EXIF_IDENTIFIER = 'Exif\u0000\u0000'
const TIFF_LITTLE_ENDIAN_MARK = 0x4949
const TIFF_BIG_ENDIAN_MARK = 0x4d4d
const TIFF_MAGIC = 42
const TIFF_MAGIC_AT = 2
const IFD0_POINTER_AT = 4
const IFD_ENTRY_BYTES = 12
/** Where an IFD entry's four-byte value-or-offset field sits, within the entry. */
const ENTRY_VALUE_FIELD_AT = 8
const TAG_ORIENTATION = 0x0112
const TAG_EXIF_SUB_IFD = 0x8769
const TAG_DATE_TIME_ORIGINAL = 0x9003
const TYPE_ASCII = 2
const TYPE_SHORT = 3
const TYPE_LONG = 4
/** EXIF defines eight orientations. Rotating by anything else is worse than not rotating. */
const LOWEST_ORIENTATION = 1
const HIGHEST_ORIENTATION = 8
/** EXIF's own capture-time form: `2025:03:14 09:26:53`, and nothing else. */
const EXIF_DATE_TIME = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/
/** Everything from the first NUL onward: an ASCII TIFF value is NUL-terminated and may be padded after it. */
const FROM_FIRST_NUL = /\u0000[\s\S]*$/

const viewOf = (bytes: Uint8Array): DataView => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

const decodeAscii = (bytes: Uint8Array): string => new TextDecoder('ascii').decode(bytes)

/**
 * Reads two bytes, or answers `undefined` if the block does not hold them.
 * The bounds check is what keeps `DataView` from throwing on a truncated file.
 */
const uint16At = (block: DataView, at: number, order: ByteOrder): number | undefined =>
  at + 2 <= block.byteLength ? block.getUint16(at, order === 'little-endian') : undefined

/** Reads four bytes, or answers `undefined` if the block does not hold them. */
const uint32At = (block: DataView, at: number, order: ByteOrder): number | undefined =>
  at + 4 <= block.byteLength ? block.getUint32(at, order === 'little-endian') : undefined

/**
 * The TIFF block inside the file's EXIF APP1 segment, or `undefined`.
 *
 * The segment length is used to bound the payload but is NOT validated
 * against the file's length: `subarray` clamps to the buffer, so a truncated
 * segment yields a short block that the directory walk then bounds-checks
 * its own way. One place to get truncation right rather than two.
 */
const exifTiffBlockIn = (bytes: Uint8Array): Uint8Array | undefined => {
  const file = viewOf(bytes)
  if (uint16At(file, 0, 'big-endian') !== JPEG_START_OF_IMAGE) return undefined

  // Every segment is at least four bytes - marker, then a length that counts
  // itself - so a cursor with fewer than four bytes left is past the last one.
  let cursor = 2
  while (cursor + 4 <= bytes.length) {
    if (bytes[cursor] !== MARKER_PREFIX) return undefined
    const segmentLength = file.getUint16(cursor + 2)
    if (bytes[cursor + 1] === APP1_MARKER) {
      const payload = bytes.subarray(cursor + 4, cursor + 2 + segmentLength)
      if (decodeAscii(payload.subarray(0, EXIF_IDENTIFIER.length)) === EXIF_IDENTIFIER) {
        return payload.subarray(EXIF_IDENTIFIER.length)
      }
    }
    // The length counts itself, so the next marker is two bytes further on
    // than the segment's payload ends. It is at least 2, so the cursor
    // always advances and this loop always terminates.
    cursor += 2 + segmentLength
  }
  return undefined
}

const byteOrderOf = (block: DataView): ByteOrder | undefined => {
  const mark = uint16At(block, 0, 'big-endian')
  if (mark === TIFF_LITTLE_ENDIAN_MARK) return 'little-endian'
  if (mark === TIFF_BIG_ENDIAN_MARK) return 'big-endian'
  return undefined
}

/**
 * Where the entry for `tag` starts within `block`, or `undefined` if this
 * directory has no such entry of that type.
 */
const entryAt = (
  block: DataView,
  directory: { readonly at: number; readonly tag: number; readonly type: number; readonly order: ByteOrder },
): number | undefined => {
  const entryCount = uint16At(block, directory.at, directory.order)
  if (entryCount === undefined) return undefined

  for (let index = 0; index < entryCount; index += 1) {
    const at = directory.at + 2 + index * IFD_ENTRY_BYTES
    const tag = uint16At(block, at, directory.order)
    if (tag === undefined) return undefined
    const type = uint16At(block, at + 2, directory.order)
    if (type === undefined) return undefined
    if (tag === directory.tag && type === directory.type) return at
  }
  return undefined
}

const orientationIn = (block: DataView, ifd0At: number, order: ByteOrder): number | undefined => {
  const at = entryAt(block, { at: ifd0At, tag: TAG_ORIENTATION, type: TYPE_SHORT, order })
  if (at === undefined) return undefined
  const orientation = uint16At(block, at + ENTRY_VALUE_FIELD_AT, order)
  if (orientation === undefined) return undefined
  return orientation >= LOWEST_ORIENTATION && orientation <= HIGHEST_ORIENTATION ? orientation : undefined
}

/**
 * Reads `DateTimeOriginal` out of the Exif sub-IFD that IFD0 points at.
 *
 * The value is always read from an offset, never from the entry's own
 * four-byte field: the tag is twenty ASCII bytes in every file EXIF defines,
 * so it never fits inline. A file claiming a shorter count reads a nonsense
 * offset, and the shape check below is what turns that into `undefined`.
 */
const capturedAtIn = (block: DataView, ifd0At: number, order: ByteOrder): string | undefined => {
  const pointerAt = entryAt(block, { at: ifd0At, tag: TAG_EXIF_SUB_IFD, type: TYPE_LONG, order })
  if (pointerAt === undefined) return undefined
  const subIfdAt = uint32At(block, pointerAt + ENTRY_VALUE_FIELD_AT, order)
  if (subIfdAt === undefined) return undefined

  const at = entryAt(block, { at: subIfdAt, tag: TAG_DATE_TIME_ORIGINAL, type: TYPE_ASCII, order })
  if (at === undefined) return undefined
  const count = uint32At(block, at + 4, order)
  if (count === undefined) return undefined
  const valueAt = uint32At(block, at + ENTRY_VALUE_FIELD_AT, order)
  if (valueAt === undefined) return undefined
  if (valueAt + count > block.byteLength) return undefined

  const value = decodeAscii(new Uint8Array(block.buffer, block.byteOffset + valueAt, count)).replace(FROM_FIRST_NUL, '')
  if (!EXIF_DATE_TIME.test(value)) return undefined
  // Reshaped, not reinterpreted: EXIF records no zone, so none is added here.
  // Whether the calendar date is a real one is a question for the Zod schema
  // at the storage boundary, not for a byte reader.
  return value.replace(EXIF_DATE_TIME, '$1-$2-$3T$4')
}

/**
 * The capture time and orientation a file states, as far as its bytes can be
 * trusted.
 *
 * Never throws, whatever the bytes are — see this module's invariants. A file
 * that is not a JPEG, has no EXIF segment, or is truncated anywhere reads as
 * `undefined` on both fields rather than as an error, because a photograph
 * with no EXIF is an ordinary photograph and not a failure.
 * @param bytes - The whole file, as uploaded. Nothing else is consulted: no
 *   filename, no declared content type.
 * @returns Whichever of the two facts the bytes state.
 * @example
 * readExifFacts(uploaded) // { capturedAt: '2025-03-14T09:26:53', orientation: 6 }
 */
export const readExifFacts = (bytes: Uint8Array): ExifFacts => {
  const tiff = exifTiffBlockIn(bytes)
  if (tiff === undefined) return NO_FACTS

  const block = viewOf(tiff)
  const order = byteOrderOf(block)
  if (order === undefined) return NO_FACTS
  if (uint16At(block, TIFF_MAGIC_AT, order) !== TIFF_MAGIC) return NO_FACTS
  const ifd0At = uint32At(block, IFD0_POINTER_AT, order)
  if (ifd0At === undefined) return NO_FACTS

  return { capturedAt: capturedAtIn(block, ifd0At, order), orientation: orientationIn(block, ifd0At, order) }
}

/**
 * The ASCII signature that identifies each metadata kind, wherever in a file
 * it appears. `Exif\0\0` introduces an EXIF APP1 segment, `Photoshop 3.0` the
 * resource block IPTC travels in, and the namespace URI an XMP packet.
 *
 * Declared in the order a photograph is likely to carry them rather than in
 * the order they are reported: the sort in {@link metadataMarkersIn} is what
 * makes the answer a set, and declaring this list pre-sorted would make that
 * sort look load-bearing while proving nothing.
 */
const MARKER_SIGNATURES: readonly { readonly marker: string; readonly signature: string }[] = [
  { marker: 'exif', signature: EXIF_IDENTIFIER },
  { marker: 'xmp', signature: 'http://ns.adobe.com/xap/1.0/' },
  { marker: 'iptc', signature: 'Photoshop 3.0' },
]

/**
 * The names of the metadata kinds {@link metadataMarkersIn} can find, sorted.
 *
 * DERIVED from the table above rather than written out beside it. A second
 * hand-maintained list would drift the moment a fourth signature is added - the
 * probe would start reporting a marker this constant does not name, and every
 * assertion written against the constant would still pass.
 */
export const METADATA_MARKERS: readonly string[] = MARKER_SIGNATURES.map(({ marker }) => marker).sort()

const containsAt = (haystack: Uint8Array, needle: Uint8Array, start: number): boolean =>
  needle.every((byte, index) => haystack[start + index] === byte)

const contains = (haystack: Uint8Array, needle: Uint8Array): boolean => {
  const lastStart = haystack.length - needle.length
  for (let start = 0; start <= lastStart; start += 1) {
    if (containsAt(haystack, needle, start)) return true
  }
  return false
}

/**
 * Which metadata markers a file's bytes still carry — the probe the phase's
 * "EXIF verifiably absent" criterion is measured with.
 *
 * It searches the WHOLE buffer and understands no structure at all, which is
 * the whole of its value: see this module's header. A caller asserting
 * absence must first assert PRESENCE in the unprocessed bytes, because an
 * empty answer is also what this returns for an empty file and for one that
 * failed to encode.
 * @param bytes - The stored bytes, exactly as they would be served.
 * @returns The subset of {@link METADATA_MARKERS} found, sorted, so an
 *   assertion reads as a set.
 * @example
 * expect(metadataMarkersIn(original)).toEqual(['exif']) // the positive control
 * expect(metadataMarkersIn(stored)).toEqual([]) // ... and only then, the absence
 */
export const metadataMarkersIn = (bytes: Uint8Array): readonly string[] => {
  const encoder = new TextEncoder()
  return MARKER_SIGNATURES.filter(({ signature }) => contains(bytes, encoder.encode(signature)))
    .map(({ marker }) => marker)
    .sort()
}
