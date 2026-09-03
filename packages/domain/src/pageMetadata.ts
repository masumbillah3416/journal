/**
 * pageMetadata — the title and description one `/p/<n>` deep link carries.
 *
 * Derivation pattern (CLAUDE.md §7; mirrors `pageAddress.ts`,
 * `contentWindow.ts` and `bookBundle.ts`'s own derivations): a pure function
 * of the page and the book it sits in, computed per request rather than
 * stored, so nothing here can go stale against the content an editor changed.
 *
 * WHY IT IS A DOMAIN MODULE RATHER THAN THREE LINES IN `generateMetadata`.
 * The route that consumes it is a Next.js page component, which cannot be
 * executed without a request context — so any choice written inside it is a
 * choice no test can reach (the same reasoning that put `addressedPageIndex`
 * and `contentWindow` here). And these are real choices with real fallbacks:
 * every field it reads is optional in the schema, so "the editor left it
 * blank" is an ordinary state that must not produce `undefined · Wanderings`
 * or a description that is a lone full stop.
 *
 * WHY EVERY PAGE GETS ITS OWN, rather than the book getting one. The design
 * spec's §8 makes `/p/<n>` a real, indexable path precisely so a reader can
 * share the page they were reading; thirty-three deep links wearing the same
 * title and the same description are thirty-three results a search engine has
 * no way to tell apart, which throws away most of what real paths were for.
 * The title is the page's own label (`pageLabel`) before the book's, so a tab
 * strip and a search result both read page-first.
 *
 * THE DESCRIPTION IS THE EDITOR'S WORDS WHERE THERE ARE ANY. Nothing here
 * invents copy about a journey: the Notes page's description is the note
 * printed on it, the Contents' is the editor's own contents note, About's is
 * its own first paragraph. Only the frame — "Page 6 of 33 of Wanderings." —
 * is this module's, and it is used only when the editor has written nothing
 * at all, because an empty `<meta name="description">` is worse than a dull
 * one: a search engine substitutes a fragment of whatever is on the page.
 *
 * {@link DESCRIPTION_LIMIT} is a display bound, not a validation rule. A
 * description longer than it is cut at a word and closed with an ellipsis
 * rather than rejected, because the editor's note is not wrong for being
 * long — it is just longer than a search result prints.
 * Depends on: BookPage, BookChrome, AboutContent, pageLabel (./bookBundle).
 */
import type { AboutContent, BookChrome, BookPage } from './bookBundle'
import { pageLabel } from './bookBundle'

/**
 * How many characters of description a search result prints before cutting it
 * off itself. 160 is the long-standing practical ceiling; the exact number
 * matters less than having one, since past it the tail is invisible either
 * way and a cut this module controls reads better than one it does not.
 */
export const DESCRIPTION_LIMIT = 160

/** The title a book with no title of its own is called, so no page is untitled. */
const UNTITLED_BOOK = 'Travel Diary'

/** What the book itself needs to describe one of its pages to a crawler. */
export interface PageMetadataContext {
  /** The book global's printed chrome — the title, subtitle and keeper. */
  readonly chrome: BookChrome
  /** The About global's content, for the one page that is about the diarist. */
  readonly about: AboutContent
  /** The 1-based page number this metadata describes, as `/p/<n>` carries it. */
  readonly pageNumber: number
  /** How many pages the book currently has. */
  readonly totalPages: number
}

/** One page's `<title>` and `<meta name="description">`. */
export interface PageMetadata {
  /** The browser-tab title and the search result's headline. */
  readonly title: string
  /** The search result's snippet. Never empty. */
  readonly description: string
}

/** Terminal punctuation a sentence already carries, so this module adds none. */
const SENTENCE_END = /[.!?…]$/

/**
 * Closes a fragment with a full stop unless it already ends in punctuation of
 * its own — so an editor who wrote "field notes." does not get "field notes..".
 */
const asSentence = (text: string): string => (SENTENCE_END.test(text) ? text : `${text}.`)

/** Joins the non-empty fragments of a description into one line of sentences. */
const sentences = (fragments: readonly string[]): string =>
  fragments
    .filter((fragment) => fragment !== '')
    .map(asSentence)
    .join(' ')

/**
 * Cuts a description to {@link DESCRIPTION_LIMIT}, at the last word boundary
 * that fits, and closes it with an ellipsis.
 *
 * The ellipsis is inside the budget, not added to it, and it replaces any
 * trailing space or punctuation so the result never reads " …".
 */
const clamped = (description: string): string => {
  if (description.length <= DESCRIPTION_LIMIT) return description

  const head = description.slice(0, DESCRIPTION_LIMIT - 1)
  const lastSpace = head.lastIndexOf(' ')
  // A single unbroken word longer than the budget has no space to cut at, and
  // returning nothing would be worse than cutting mid-word.
  const cut = lastSpace === -1 ? head : head.slice(0, lastSpace)

  return `${cut.replace(/[\s.,;:—-]+$/, '')}…`
}

/**
 * The journey a page belongs to, named as far as the editor has named it:
 * `'Tokyo, Japan — 3–9 Mar 2025'`, or as much of that as is filled in. None of
 * the three fields is `required` in the schema, so composing them by template
 * alone would print `', — '` for a journey an editor has only just created.
 */
const journeyLine = (page: { readonly name: string; readonly place: string; readonly dates: string }): string => {
  const where = [page.name, page.place].filter((field) => field !== '').join(', ')
  if (page.dates === '') return where
  return where === '' ? page.dates : `${where} — ${page.dates}`
}

/**
 * The page's own description before any fallback — empty when the editor has
 * written nothing this page could be described by.
 */
const editorialDescription = (page: BookPage, context: PageMetadataContext): string => {
  switch (page.kind) {
    case 'cover':
      return sentences([context.chrome.subtitle, context.chrome.owner === '' ? '' : `Kept by ${context.chrome.owner}`])
    case 'contents':
      return sentences([context.chrome.contentsNote])
    case 'about':
      return sentences([context.about.paragraphs[0] ?? ''])
    case 'notes':
      return sentences([journeyLine(page), page.note])
    case 'frames-i':
    case 'frames-ii': {
      const journey = journeyLine(page)
      return sentences([journey === '' ? '' : `Photographs from ${journey}`])
    }
  }
}

/**
 * Derives the title and description for one page of the book.
 *
 * @param page - The page the URL addresses, from `derivePages`.
 * @param context - The book's chrome and About content, and where this page
 *   sits in the book.
 * @returns A title naming the page before the book, and a description that is
 *   the editor's own words where there are any and the page's place in the
 *   book where there are not. Neither is ever empty.
 * @example
 * pageMetadata(notesPage, { chrome, about, pageNumber: 3, totalPages: 33 })
 * // { title: 'Tokyo — Notes · Wanderings', description: 'Tokyo, Japan — …' }
 */
export const pageMetadata = (page: BookPage, context: PageMetadataContext): PageMetadata => {
  const bookTitle = context.chrome.title
  const label = pageLabel(page)
  const title = page.kind === 'cover' ? (bookTitle === '' ? UNTITLED_BOOK : bookTitle) : sentenceTitle(label, bookTitle)

  const written = editorialDescription(page, context)
  const placeInBook = sentences([
    bookTitle === ''
      ? `Page ${String(context.pageNumber)} of ${String(context.totalPages)}`
      : `Page ${String(context.pageNumber)} of ${String(context.totalPages)} of ${bookTitle}`,
  ])

  return { title, description: clamped(written === '' ? placeInBook : written) }
}

/**
 * A page's title: its own label, then the book's, separated by a middot — or
 * the label alone when the book has no title to follow it with.
 */
const sentenceTitle = (label: string, bookTitle: string): string =>
  bookTitle === '' ? label : `${label} · ${bookTitle}`
