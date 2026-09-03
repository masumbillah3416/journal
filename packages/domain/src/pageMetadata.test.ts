import { describe, expect, it } from 'vitest'
import { deriveBookmarks, deriveContents, derivePages, type BookBundle, type BookPage } from './bookBundle'
import { addressedPageMetadata, pageMetadata } from './pageMetadata'
import { aBookChrome, anAboutContent, aJourney } from './testing/factories'

const pages = derivePages([aJourney()])
const context = { chrome: aBookChrome(), about: anAboutContent(), totalPages: pages.length }

/**
 * The one page of `pages` with the given kind. Addressing by kind rather than
 * by index keeps these cases readable and stops them from drifting if the
 * reading sequence ever gains a page.
 */
const pageOfKind = (kind: BookPage['kind']): BookPage => {
  const found = pages.find((page) => page.kind === kind)
  if (found === undefined) throw new Error(`no ${kind} page in the derived sequence`)
  return found
}

/** The six-page book `pages` describes, assembled the way a route receives it. */
const bundle: BookBundle = {
  pages,
  contents: deriveContents(pages),
  bookmarks: deriveBookmarks(pages),
  chrome: aBookChrome(),
  about: anAboutContent(),
}

describe('pageMetadata', () => {
  describe('the title', () => {
    it('titles the cover with the book’s own title, since the cover is the book', () => {
      expect(pageMetadata(pageOfKind('cover'), { ...context, pageNumber: 1 }).title).toBe('Wanderings')
    })

    it('titles a journey page with the page’s own label before the book’s title', () => {
      expect(pageMetadata(pageOfKind('notes'), { ...context, pageNumber: 3 }).title).toBe('Tokyo — Notes · Wanderings')
    })

    it('gives two pages of the same journey different titles, since each is its own deep link', () => {
      const framesI = pageMetadata(pageOfKind('frames-i'), { ...context, pageNumber: 4 }).title
      const framesII = pageMetadata(pageOfKind('frames-ii'), { ...context, pageNumber: 5 }).title

      expect(framesI).not.toBe(framesII)
    })

    it('falls back to the diary’s generic name when the editor has left the book untitled', () => {
      const untitled = { ...context, chrome: aBookChrome({ title: '' }) }

      expect(pageMetadata(pageOfKind('cover'), { ...untitled, pageNumber: 1 }).title).toBe('Travel Diary')
    })

    it('does not trail a separator when the book is untitled and the page is not the cover', () => {
      const untitled = { ...context, chrome: aBookChrome({ title: '' }) }

      expect(pageMetadata(pageOfKind('contents'), { ...untitled, pageNumber: 2 }).title).toBe('Contents')
    })
  })

  describe('the description', () => {
    it('describes the cover with the editor’s own subtitle and the name it is kept by', () => {
      const { description } = pageMetadata(pageOfKind('cover'), { ...context, pageNumber: 1 })

      expect(description).toBe('field notes, photographs and other scraps. Kept by M. Alvarez.')
    })

    it('does not double the full stop when the editor’s subtitle already ends in one', () => {
      const punctuated = { ...context, chrome: aBookChrome({ subtitle: 'field notes.' }) }

      expect(pageMetadata(pageOfKind('cover'), { ...punctuated, pageNumber: 1 }).description).toBe(
        'field notes. Kept by M. Alvarez.',
      )
    })

    it('names no keeper on the cover when the editor has not said who keeps the book', () => {
      const anonymous = { ...context, chrome: aBookChrome({ owner: '' }) }

      expect(pageMetadata(pageOfKind('cover'), { ...anonymous, pageNumber: 1 }).description).toBe(
        'field notes, photographs and other scraps.',
      )
    })

    it('describes the contents with the editor’s own note when there is one', () => {
      const { description } = pageMetadata(pageOfKind('contents'), { ...context, pageNumber: 2 })

      expect(description).toBe(
        'Each journey runs three pages — notes, then two spreads of frames. The rest lives in the galleries.',
      )
    })

    it('describes a notes page with the journey it is about and the note printed on it', () => {
      const { description } = pageMetadata(pageOfKind('notes'), { ...context, pageNumber: 3 })

      expect(description).toBe('Tokyo, Japan — 3–9 Mar 2025. Tokyo is loud in a way that never quite becomes noise.')
    })

    it('describes a frames page by what is on it, not by the note on a different page', () => {
      const { description } = pageMetadata(pageOfKind('frames-i'), { ...context, pageNumber: 4 })

      expect(description).toBe('Photographs from Tokyo, Japan — 3–9 Mar 2025.')
    })

    it('describes a notes page with no note by the journey alone, not by a dangling separator', () => {
      const quiet = derivePages([aJourney({ note: '' })])
      const notes = quiet.find((page) => page.kind === 'notes')
      if (notes === undefined) throw new Error('no notes page')

      expect(pageMetadata(notes, { ...context, totalPages: quiet.length, pageNumber: 3 }).description).toBe(
        'Tokyo, Japan — 3–9 Mar 2025.',
      )
    })

    it('describes the About page with its own first paragraph', () => {
      const { description } = pageMetadata(pageOfKind('about'), { ...context, pageNumber: 6 })

      expect(description).toBe('This is a paper habit that ended up on a screen.')
    })

    it('falls back to the page’s place in the book when the editor has written nothing', () => {
      const bare = { ...context, chrome: aBookChrome({ subtitle: '', owner: '', contentsNote: '' }) }

      expect(pageMetadata(pageOfKind('contents'), { ...bare, pageNumber: 2 }).description).toBe(
        'Page 2 of 6 of Wanderings.',
      )
    })

    it('falls back for the cover too when the editor has written no subtitle and named no keeper', () => {
      const bare = { ...context, chrome: aBookChrome({ subtitle: '', owner: '' }) }

      expect(pageMetadata(pageOfKind('cover'), { ...bare, pageNumber: 1 }).description).toBe(
        'Page 1 of 6 of Wanderings.',
      )
    })

    it('falls back for the About page too when the editor has written no paragraphs', () => {
      const bare = { ...context, about: anAboutContent({ paragraphs: [] }) }

      expect(pageMetadata(pageOfKind('about'), { ...bare, pageNumber: 6 }).description).toBe(
        'Page 6 of 6 of Wanderings.',
      )
    })

    it('falls back without a book title when the editor has left the book untitled too', () => {
      const bare = { ...context, chrome: aBookChrome({ title: '', subtitle: '', owner: '', contentsNote: '' }) }

      expect(pageMetadata(pageOfKind('contents'), { ...bare, pageNumber: 2 }).description).toBe('Page 2 of 6.')
    })

    it('keeps a long description inside the length a search result will print, cut at a word', () => {
      const longNote = `Tokyo again, ${'the same crossing and the same rain, '.repeat(20)}and then home`
      const wordy = derivePages([aJourney({ note: longNote })])
      const notes = wordy.find((page) => page.kind === 'notes')
      if (notes === undefined) throw new Error('no notes page')

      const { description } = pageMetadata(notes, { ...context, totalPages: wordy.length, pageNumber: 3 })

      expect(description.length).toBeLessThanOrEqual(160)
      expect(description.endsWith('…')).toBe(true)
      expect(description).not.toContain(' …')
    })

    it('leaves a description that already fits exactly as the editor wrote it', () => {
      const { description } = pageMetadata(pageOfKind('frames-ii'), { ...context, pageNumber: 5 })

      expect(description.endsWith('…')).toBe(false)
    })

    it('cuts a single unbroken word rather than returning nothing at all', () => {
      const unbroken = { ...context, about: anAboutContent({ paragraphs: ['x'.repeat(400)] }) }

      const { description } = pageMetadata(pageOfKind('about'), { ...unbroken, pageNumber: 6 })

      expect(description.length).toBe(160)
      expect(description.endsWith('…')).toBe(true)
    })

    it('describes a journey page whose place and dates the editor left blank by its name alone', () => {
      const nameless = derivePages([aJourney({ place: '', dates: '', note: '' })])
      const frames = nameless.find((page) => page.kind === 'frames-i')
      if (frames === undefined) throw new Error('no frames page')

      expect(pageMetadata(frames, { ...context, totalPages: nameless.length, pageNumber: 4 }).description).toBe(
        'Photographs from Tokyo.',
      )
    })

    it('describes a journey page with only dates on it by those dates alone', () => {
      const dated = derivePages([aJourney({ name: '', place: '', note: '' })])
      const frames = dated.find((page) => page.kind === 'frames-i')
      if (frames === undefined) throw new Error('no frames page')

      expect(pageMetadata(frames, { ...context, totalPages: dated.length, pageNumber: 4 }).description).toBe(
        'Photographs from 3–9 Mar 2025.',
      )
    })

    it('falls back for a journey page the editor has named nothing about at all', () => {
      const blank = derivePages([aJourney({ name: '', place: '', dates: '', note: '' })])
      const frames = blank.find((page) => page.kind === 'frames-ii')
      if (frames === undefined) throw new Error('no frames page')

      expect(pageMetadata(frames, { ...context, totalPages: blank.length, pageNumber: 5 }).description).toBe(
        'Page 5 of 6 of Wanderings.',
      )
    })
  })
})

describe('addressedPageMetadata', () => {
  it('describes the page the address names, and no other', () => {
    const found = addressedPageMetadata(bundle, '3')

    expect(found?.title).toBe(pageMetadata(pageOfKind('notes'), { ...context, pageNumber: 3 }).title)
  })

  it('numbers the page from the address rather than from the array it was found in', () => {
    expect(addressedPageMetadata(bundle, '2')?.description).toBe(
      pageMetadata(pageOfKind('contents'), { ...context, pageNumber: 2 }).description,
    )
  })

  it('points the canonical link at the address it was asked about', () => {
    expect(addressedPageMetadata(bundle, '4')?.canonical).toBe('/p/4')
  })

  it('reports nothing for an address the book has no page for', () => {
    expect(addressedPageMetadata(bundle, '999')).toBeNull()
  })

  it('reports nothing for an address that is not a page number at all', () => {
    expect(addressedPageMetadata(bundle, 'tokyo')).toBeNull()
  })
})
