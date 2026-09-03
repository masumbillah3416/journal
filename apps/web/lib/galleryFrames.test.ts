/**
 * galleryFrames.test.ts — behaviour spec for the one definition of a gallery
 * frame.
 *
 * Unit test (CLAUDE.md §2): every export of `./galleryFrames` is pure, so the
 * rule that decides what a reader is shown and what a reader can download is
 * gated by the pre-commit pass rather than only by a suite that needs Docker.
 * The three readers' own `*.integration.test.ts` files prove the same rule
 * against real Payload rows on top of this - `readGalleryBundle`'s that the
 * scrap leaves the grid, `readGalleryDownload`'s that its download address
 * dies with it, and `readBookBundle`'s that the census agrees with the grid.
 *
 * The cases below are PH1-002's own reproduction, reduced
 * (`docs/qa/2026-09-03-phase-1-closing-sweep.md`): a Notes page whose slots
 * are a hero and an ephemera scrap, which is exactly what the seed writes for
 * every one of the ten journeys.
 * Depends on: vitest, ./galleryFrames.
 */
import { describe, expect, it } from 'vitest'
import { GALLERY_FRAME_SORT, ephemeraMediaIds, galleryFrameWhere, journeyPagesQuery } from './galleryFrames'
import type { PageSlotSource } from './galleryFrames'

/** The seed's own Notes page: a hero photograph and the decorative scrap. */
const notesPage: PageSlotSource = {
  slots: [
    { role: 'hero', media: 11 },
    { role: 'ephemera', media: 20 },
  ],
}

/** A Frames page: three photographs, no scrap. */
const framesPage: PageSlotSource = {
  slots: [
    { role: 'frame', media: 12 },
    { role: 'frame', media: 13 },
    { role: 'frame', media: 14 },
  ],
}

describe('ephemeraMediaIds', () => {
  it('finds the scrap the Notes page prints, and nothing else on it', () => {
    expect(ephemeraMediaIds([notesPage])).toEqual([20])
  })

  it('leaves a hero and a frame alone, because both are photographs with a subject', () => {
    expect(ephemeraMediaIds([framesPage])).toEqual([])
  })

  it('reads every page it is given, so the book’s census gets all ten journeys’ scraps at once', () => {
    expect(ephemeraMediaIds([notesPage, framesPage, { slots: [{ role: 'ephemera', media: 44 }] }])).toEqual([20, 44])
  })

  it('finds nothing in a book with no pages at all', () => {
    expect(ephemeraMediaIds([])).toEqual([])
  })

  it('survives a page whose slots array is absent or explicitly null', () => {
    // Both are ordinary states: `slots` is not `required` in the schema, and a
    // Cover, Contents or About page carries none at all.
    expect(ephemeraMediaIds([{}, { slots: null }])).toEqual([])
  })

  it('reads a populated media relationship as well as a raw id, so depth cannot change the answer', () => {
    // Every caller queries at `depth: 0` and gets a number, but a signature
    // that only accepted one would break silently the day one did not.
    expect(ephemeraMediaIds([{ slots: [{ role: 'ephemera', media: { id: 20 } }] }])).toEqual([20])
  })

  it('ignores an ephemera slot with no photograph in it, which is the state an empty slot is in', () => {
    // `Notes.tsx` draws the ephemera box whether or not there is an image in
    // it (docs/deviations.md §13, and `Notes.test.tsx`), so an empty slot is
    // normal - and it excludes nothing, rather than excluding `undefined`.
    expect(ephemeraMediaIds([{ slots: [{ role: 'ephemera' }, { role: 'ephemera', media: null }] }])).toEqual([])
  })

  it('ignores a slot whose role an editor has never set, which the book reads as a frame', () => {
    // `readBookBundle`'s `slotsFor` defaults a null role to 'frame'; a
    // roleless slot is a photograph here too, not a scrap.
    expect(ephemeraMediaIds([{ slots: [{ media: 15 }, { role: null, media: 16 }] }])).toEqual([])
  })
})

describe('galleryFrameWhere', () => {
  it('admits the journey’s own media and withholds anything hidden', () => {
    // The `hidden` half is a security requirement, not a preference: all three
    // callers run through the Local API with no user, where the collection's
    // own reader rule is overridden - see the module header and SECURITY.md.
    expect(galleryFrameWhere([7], [])).toEqual({
      and: [{ journey: { in: [7] } }, { hidden: { not_equals: true } }],
    })
  })

  it('excludes the decorative scrap by id, which is what takes it out of the grid, the census and the download', () => {
    expect(galleryFrameWhere([7], [20])).toEqual({
      and: [{ journey: { in: [7] } }, { hidden: { not_equals: true } }, { id: { not_in: [20] } }],
    })
  })

  it('takes every journey in the book at once, so the census is one query rather than ten', () => {
    expect(galleryFrameWhere([7, 8, 9], [20, 44])).toEqual({
      and: [{ journey: { in: [7, 8, 9] } }, { hidden: { not_equals: true } }, { id: { not_in: [20, 44] } }],
    })
  })

  it('omits the exclusion entirely when there is no scrap, rather than passing an empty not_in', () => {
    // A journey with no ephemera should produce the query it always did, not a
    // clause whose behaviour on an empty list this module would have to know.
    expect(Object.values(galleryFrameWhere([7], [])).flat()).toHaveLength(2)
  })
})

describe('journeyPagesQuery', () => {
  it('asks for one journey’s pages with only the column the rule reads', () => {
    // CLAUDE.md §7: `depth` explicit on every query, and select only what is
    // read. `slots` is the whole of what this rule needs.
    expect(journeyPagesQuery(7)).toEqual({
      collection: 'pages',
      depth: 0,
      pagination: false,
      limit: 5000,
      where: { journey: { equals: 7 } },
      select: { slots: true },
    })
  })

  it('does not filter by status, so unpublishing a page cannot put its scrap back in the gallery', () => {
    expect(JSON.stringify(journeyPagesQuery(7))).not.toContain('_status')
  })
})

describe('GALLERY_FRAME_SORT', () => {
  it('breaks ties on id, so a frame’s number cannot change between two requests', () => {
    // `media.order` is an editor-facing integer nothing enforces the
    // uniqueness of, and the position IS the frame number the lightbox prints
    // and the download filename carries.
    expect(GALLERY_FRAME_SORT).toEqual(['order', 'id'])
  })
})
