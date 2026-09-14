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
 * ONE CASE HERE READS `collections/media.ts` as well, and it is the only
 * reason this file is not pure of everything but its subject: the collection's
 * reader rule and `galleryFrameWhere` spell the same unfinished-row filter
 * twice, and nothing but that case makes them agree. The collection module
 * itself runs nothing at import beyond resolving one absolute path, so it does
 * not drag Payload into the Docker-free pass.
 * Depends on: vitest, ./galleryFrames, ../collections/media (one case), and
 * `Where` from payload, type-only.
 */
import { describe, expect, it } from 'vitest'
import type { Where } from 'payload'
import { Media } from '../collections/media'
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

/**
 * The `where` `Media.access.read` answers an unauthenticated reader with.
 *
 * @returns The constraint Payload applies to `/api/media/file/<name>` and to
 *   every access-controlled listing.
 * @throws When the collection defines no `read` rule, or answers a signed-out
 *   reader with something that is not a `Where` — either of which would mean
 *   the parity case below was comparing against nothing.
 */
const signedOutReadWhere = (): Where => {
  const read = Media.access?.read
  if (read === undefined) throw new Error('the media collection defines no read access rule')
  // The rule reads `req.user` and nothing else - that is the whole of its body -
  // so a real `PayloadRequest` is neither available in a pure test nor needed.
  // Cast to the parameter type of the function actually being called, so a
  // signature change breaks this line rather than widening past it silently
  // (CLAUDE.md §3.1: a cast carries its justification).
  const answered = read({ req: { user: null } } as unknown as Parameters<typeof read>[0])
  if (typeof answered === 'boolean' || answered instanceof Promise) {
    throw new Error('the media collection answered a signed-out reader with something that is not a Where')
  }
  return answered
}

/**
 * The clauses of `where` that mention `state`.
 *
 * Selected by what they SAY rather than by position, so a clause moving within
 * the `and` does not make the parity case below fail for the wrong reason.
 * @param where - Either filter's output.
 * @returns Every clause naming the column, in order.
 */
const stateClausesOf = (where: Where): readonly unknown[] =>
  (where.and ?? []).filter((clause) => JSON.stringify(clause).includes('"state"'))

describe('the two places the unfinished-row filter is spelled', () => {
  it('spell it identically, since nothing but this case makes them agree', () => {
    // ═══ A COMMENT IS NOT A GUARD ═══
    //
    // `collections/media.ts`'s reader rule gates the access-controlled read -
    // `/api/media/file/<name>` and every derivative. `galleryFrameWhere` gates
    // the three readers that override access - the grid, the census and the
    // download handler. Between them they are the public doors, and they only
    // close the same door if they say the same thing. The two spellings each
    // name the other in a comment, which is what they had until this case.
    //
    // The constant is NOT shared, and the reason is a dependency direction
    // rather than a type: `apps/web/lib/*` imports `collections/media.ts` (for
    // `MEDIA_DIR`), and `payload.config.ts` loads every collection at boot, so
    // pointing a collection at `lib/` would pull this module into the config's
    // own graph. Two spellings pinned by a case is the trade `.prettierignore`
    // and `eslint.config.js` already make in this repository.
    //
    // `notEmpty` is the positive control: without it, a future edit that
    // removed the clause from BOTH would leave two empty lists, and this case
    // would pass while the filter it exists for had gone.
    const fromCollection = stateClausesOf(signedOutReadWhere())
    const fromGallery = stateClausesOf(galleryFrameWhere([7], []))

    expect({ clauses: fromGallery, notEmpty: fromGallery.length > 0 }).toEqual({
      clauses: fromCollection,
      notEmpty: true,
    })
  })
})

describe('galleryFrameWhere', () => {
  /** The state clause, spelled once so each case below reads as one idea. */
  const FINISHED = { or: [{ state: { equals: 'ready' } }, { state: { exists: false } }] }

  it('admits the journey’s own media and withholds anything hidden', () => {
    // The `hidden` half is a security requirement, not a preference: all three
    // callers run through the Local API with no user, where the collection's
    // own reader rule is overridden - see the module header and SECURITY.md.
    expect(galleryFrameWhere([7], [])).toEqual({
      and: [{ journey: { in: [7] } }, { hidden: { not_equals: true } }, FINISHED],
    })
  })

  it('withholds a row the pipeline has not finished, since its bytes may be an unstripped original', () => {
    // THE SAME KIND OF REQUIREMENT AS `hidden`, and it arrived late for the
    // same reason: `collections/media.ts` gates `state` for an
    // access-controlled read, and all three of this module's callers override
    // access - so without this clause a `processing` row is listed in the grid,
    // counted in the census and downloadable through our own handler.
    expect(galleryFrameWhere([7], []).and).toContainEqual(FINISHED)
  })

  it('admits a row with no state at all, which is what every row written before the column means', () => {
    // `docs/deviations.md` §48's migration deliberately did not backfill.
    // Withholding those would take the public diary dark to close a hole they
    // cannot be in - the same bound the collection rule draws.
    expect(FINISHED.or).toContainEqual({ state: { exists: false } })
  })

  it('excludes the decorative scrap by id, which is what takes it out of the grid, the census and the download', () => {
    expect(galleryFrameWhere([7], [20])).toEqual({
      and: [{ journey: { in: [7] } }, { hidden: { not_equals: true } }, FINISHED, { id: { not_in: [20] } }],
    })
  })

  it('takes every journey in the book at once, so the census is one query rather than ten', () => {
    expect(galleryFrameWhere([7, 8, 9], [20, 44])).toEqual({
      and: [{ journey: { in: [7, 8, 9] } }, { hidden: { not_equals: true } }, FINISHED, { id: { not_in: [20, 44] } }],
    })
  })

  it('omits the exclusion entirely when there is no scrap, rather than passing an empty not_in', () => {
    // A journey with no ephemera should produce the query it always did, not a
    // clause whose behaviour on an empty list this module would have to know.
    expect(Object.values(galleryFrameWhere([7], [])).flat()).toHaveLength(3)
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
