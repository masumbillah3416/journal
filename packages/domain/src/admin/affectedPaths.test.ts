/**
 * affectedPaths.test.ts — the half of publishing that is easiest to write as a
 * no-op, and the property that makes it worth doing.
 *
 * THE NUMBER THE DEFECT MOVES IS WHICH PATHS COME BACK — not how many. A
 * function returning every path for every change satisfies any count-shaped
 * assertion and satisfies "at least as many as the book has pages" exactly;
 * what it cannot satisfy is a case naming a path it must NOT contain. So every
 * case below names paths on both sides where both sides exist, and the
 * whole-book case asserts that EVERY page path is present rather than that
 * enough of them are.
 *
 * THE BUNDLE IS ASSEMBLED BY `derivePages`, not written down. The book's page
 * order is the thing these paths are indices into; a hand-written page list
 * would be a fixture agreeing with a copy of the arithmetic instead of with the
 * arithmetic (standing orders, species 4).
 * Depends on: vitest, ../ids, ../pageAddress, ../testing/factories,
 * ./affectedPaths, ./pendingChange.
 */
import { describe, expect, it } from 'vitest'
import { journeyId, type JourneyId } from '../ids'
import { pagePath } from '../pageAddress'
import { aBookBundle, aJourney } from '../testing/factories'
import { affectedPaths } from './affectedPaths'
import { changeId, type ChangeKind, type PendingChange } from './pendingChange'

/**
 * A branded journey id for a test literal.
 * @param raw - The id as a row would spell it.
 * @returns The branded id.
 */
const anId = (raw: string): JourneyId => {
  const built = journeyId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

const TOKYO = anId('11')
const LISBON = anId('12')

/** The book both journeys are in, in the order `derivePages` puts them. */
const aBook = (): ReturnType<typeof aBookBundle> =>
  aBookBundle([
    aJourney({ id: TOKYO, slug: 'tokyo', name: 'Tokyo' }),
    aJourney({ id: LISBON, slug: 'lisbon', name: 'Lisbon' }),
  ])

/**
 * One pending change, as `readPendingChanges` produces one.
 * @param kind - Which collection the row is in.
 * @param journey - The journey it belongs to.
 * @param slug - That journey's gallery address.
 * @returns The change.
 */
const aChange = (kind: ChangeKind, journey: JourneyId, slug: string): PendingChange => ({
  id: changeId(kind, Number(journey)),
  kind,
  tone: 'edited',
  journey,
  slug,
  text: 'Note rewritten',
  location: `${slug} · notes`,
  at: '2h ago',
})

/**
 * Every `/p/<n>` the pages of one journey occupy.
 * @param journey - The journey's branded id.
 * @returns Its page paths, read off the book's own page list.
 */
const pathsOf = (journey: JourneyId): readonly string[] =>
  aBook()
    .pages.flatMap((page, index) => ('journeyId' in page && page.journeyId === journey ? [index] : []))
    .map(pagePath)

/** The path of the page the book's own list puts the Contents on. */
const contentsPath = (): string => pagePath(aBook().pages.findIndex((page) => page.kind === 'contents'))

describe('affectedPaths', () => {
  it('puts the Contents on /p/2, which is the leaf the book’s own page list gives it', () => {
    // PINNED TO THE LITERAL AS WELL AS DERIVED. Every case below names the
    // Contents through `contentsPath()`, which cannot fail if `derivePages`
    // moves it; this is the second half of the pin, and it is the address a
    // reader types.
    expect(contentsPath()).toBe('/p/2')
  })

  it('revalidates the pages a published journey occupies and the contents page that lists it, and no other journey’s', () => {
    const paths = affectedPaths([aChange('journey', TOKYO, 'tokyo')], aBook())

    expect(paths).toContain(contentsPath())
    expect(paths).toEqual(expect.arrayContaining([...pathsOf(TOKYO)]))
    // THE WHOLE OF "AFFECTED PATHS ONLY", and the only line here that a
    // revalidate-everything shortcut cannot satisfy.
    expect(paths.filter((path) => pathsOf(LISBON).includes(path))).toEqual([])
  })

  it('revalidates the gallery of the journey whose row changed, because the gallery prints its name and dates', () => {
    expect(affectedPaths([aChange('journey', TOKYO, 'tokyo')], aBook())).toContain('/gallery/tokyo')
  })

  it('leaves the other journey’s gallery alone', () => {
    expect(affectedPaths([aChange('journey', TOKYO, 'tokyo')], aBook())).not.toContain('/gallery/lisbon')
  })

  it('revalidates a page change against its own journey’s pages, not the book', () => {
    const paths = affectedPaths([aChange('page', LISBON, 'lisbon')], aBook())

    expect(paths).toEqual(expect.arrayContaining([...pathsOf(LISBON)]))
    expect(paths.filter((path) => pathsOf(TOKYO).includes(path))).toEqual([])
  })

  it('revalidates every page of the book when the journey is not in it yet, because publishing it renumbers the rest', () => {
    // A journey the book does not hold is one that has never been published:
    // `readBookBundle` reads published rows only. Publishing it INSERTS three
    // pages, so every `/p/<n>` after them addresses a different page than it
    // did — which is the one case where "everything" is the affected set
    // rather than a shortcut.
    const book = aBook()
    const paths = affectedPaths([aChange('journey', anId('99'), 'bergen')], book)

    // EVERY page path, not a count: a function answering `pages.length` copies
    // of `/` would satisfy any assertion about size.
    expect(paths).toEqual(expect.arrayContaining(book.pages.map((_page, index) => pagePath(index))))
  })

  it('returns no duplicates, so one path is not revalidated four times', () => {
    const paths = affectedPaths([aChange('journey', TOKYO, 'tokyo'), aChange('page', TOKYO, 'tokyo')], aBook())

    expect(paths.length).toBe(new Set(paths).size)
  })

  it('names the same paths for two changes to one journey as for one of them', () => {
    const once = affectedPaths([aChange('journey', TOKYO, 'tokyo')], aBook())
    const twice = affectedPaths([aChange('journey', TOKYO, 'tokyo'), aChange('page', TOKYO, 'tokyo')], aBook())

    expect(new Set(twice)).toEqual(new Set(once))
  })

  it('revalidates nothing at all for an empty selection, because nothing was published', () => {
    // THE CASE THAT STOPS A PUBLISH OF NOTHING SWEEPING THE WHOLE BOOK. An
    // implementation that started from "every path" and narrowed would answer
    // the whole book here.
    expect(affectedPaths([], aBook())).toEqual([])
  })
})
