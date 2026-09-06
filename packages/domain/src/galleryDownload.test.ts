/**
 * galleryDownload.test.ts — the download action's rules, asserted before they
 * exist.
 *
 * SECURITY.md's Uploads section is blunt about the one that matters: "the
 * gallery's download action must serve a derivative through your own handler,
 * not a bucket URL. Direct URLs invite enumeration of everything in the
 * bucket, including anything marked hidden." So the first case here is not
 * "the path is well formed" — it is that the path is OURS: root-relative, no
 * scheme, no host, nothing a reader could edit into a neighbouring object's
 * key.
 *
 * The second rule from the same section — "Set `Content-Disposition:
 * attachment` and a strict `Content-Type` on downloads" — is the
 * `downloadContentType` block: an allowlist that answers `err` for anything
 * it does not recognise, rather than echoing a client- or store-declared
 * type back out of our own origin.
 * Depends on: vitest, ./galleryDownload, ./ids.
 */
import { describe, expect, it } from 'vitest'
import {
  DOWNLOADABLE_CONTENT_TYPES,
  downloadContentType,
  downloadFilename,
  galleryDownloadPath,
} from './galleryDownload'
import { mediaId, type MediaId } from './ids'

/**
 * Brands a raw string as a {@link MediaId} for a fixture.
 * @param raw - The candidate id.
 * @returns The branded id.
 */
const anId = (raw: string): MediaId => {
  const branded = mediaId(raw)
  if (!branded.ok) throw new Error(branded.error)
  return branded.value
}

describe('galleryDownloadPath', () => {
  it('addresses a handler of ours, under the journey the frame belongs to', () => {
    expect(galleryDownloadPath('tokyo', anId('412'))).toBe('/gallery/tokyo/download/412')
  })

  it('is root-relative, so it can never resolve to a bucket origin', () => {
    const href = galleryDownloadPath('tokyo', anId('412'))

    expect(href.startsWith('/')).toBe(true)
    expect(href).not.toMatch(/^[a-z][a-z0-9+.-]*:/i)
    expect(href.startsWith('//')).toBe(false)
  })

  it('percent-encodes a slug, so a crafted journey name cannot climb out of the route', () => {
    expect(galleryDownloadPath('../../etc', anId('412'))).toBe('/gallery/..%2F..%2Fetc/download/412')
  })

  it('percent-encodes an id, for the same reason', () => {
    expect(galleryDownloadPath('tokyo', anId('../4'))).toBe('/gallery/tokyo/download/..%2F4')
  })
})

describe('downloadContentType', () => {
  it('serves a JPEG derivative as a JPEG', () => {
    expect(downloadContentType('image/jpeg')).toEqual({ ok: true, value: 'image/jpeg' })
  })

  it('serves a PNG derivative as a PNG', () => {
    expect(downloadContentType('image/png')).toEqual({ ok: true, value: 'image/png' })
  })

  it('serves a WebP derivative as a WebP', () => {
    expect(downloadContentType('image/webp')).toEqual({ ok: true, value: 'image/webp' })
  })

  it('refuses SVG outright, because an SVG is an HTML document', () => {
    expect(downloadContentType('image/svg+xml').ok).toBe(false)
  })

  it('refuses a type it does not recognise rather than echoing it back from our origin', () => {
    expect(downloadContentType('text/html').ok).toBe(false)
  })

  it('refuses a derivative whose stored type went missing', () => {
    expect(downloadContentType(undefined).ok).toBe(false)
  })

  it('refuses a type carrying parameters, so a charset cannot ride along', () => {
    expect(downloadContentType('image/png; charset=utf-8').ok).toBe(false)
  })

  it('recognises exactly the three still types the pipeline re-encodes to', () => {
    expect(DOWNLOADABLE_CONTENT_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp'])
  })
})

describe('downloadFilename', () => {
  it('names the file for the journey and the frame the reader was looking at', () => {
    expect(downloadFilename('tokyo', 6, 61, 'image/jpeg')).toBe('tokyo-007.jpg')
  })

  it('takes its extension from the type we serve, never from a stored filename', () => {
    expect(downloadFilename('tokyo', 6, 61, 'image/png')).toBe('tokyo-007.png')
  })

  it('uses the WebP extension for a WebP derivative', () => {
    expect(downloadFilename('tokyo', 0, 8, 'image/webp')).toBe('tokyo-001.webp')
  })

  it('reduces a slug to characters a filename can safely carry', () => {
    expect(downloadFilename('../tokyo 2024', 0, 8, 'image/png')).toBe('tokyo-2024-001.png')
  })

  it('falls back to a neutral stem when a slug reduces to nothing at all', () => {
    expect(downloadFilename('../..', 0, 8, 'image/png')).toBe('frame-001.png')
  })
})
