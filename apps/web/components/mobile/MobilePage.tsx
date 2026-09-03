/**
 * MobilePage — the one page renderer the mobile reading mode has, SCREENS.md §1.10.
 *
 * ONE GENERIC RENDERER FOR ALL FOUR KINDS, which is §1.10's own structure and
 * not a shortcut: "One generic page renderer handles all four kinds - Cover,
 * Contents, Journey, About". A journey's three pages share the third of those,
 * because on a phone Notes, Frames I and Frames II are the same page with
 * different photographs on it - the notes block is the one part gated by kind.
 * That is why this is four private renderers behind one exhaustive `switch`
 * rather than six components in six files: the book's `PageFace` dispatches to
 * six DESIGNED pages (§1.1-§1.6), and this surface has four.
 *
 * IT IS A SERVER COMPONENT, AND THAT IS THE POINT OF IT. `MobileDiary` is this
 * surface's `'use client'` boundary; anything it imported would be compiled
 * into the route's script bundle. Rendering the page here instead and passing
 * it down as `children` means the words, the captions, the alt text and the
 * links cross into the client as an already-rendered payload with no component
 * code behind it - the same seam, for the same measured reason, as
 * `docs/adr/0007-server-rendered-page-faces.md`. Do not add a hook, a handler
 * or a `'use client'` to this file: one of them pulls the whole page into the
 * browser.
 *
 * EVERY PAGE-CHANGING CONTROL ON THIS SURFACE IS A REAL LINK. "Start reading",
 * every Contents row, the gallery button and the bookmark tabs are all
 * `<a href>`, and the reason is stronger here than on the book: there is no
 * flip machine to anchor and no measured scale to preserve, so a page change
 * on this surface IS a navigation. The handoff's requirement that the deep
 * links be real, indexable paths ("In production use real paths (`/p/12`,
 * `/gallery/tokyo`) rather than hashes") and the simplest implementation are
 * the same thing, and the whole page works before any script has run.
 *
 * THE PHOTOGRAPHS ARE PLAIN `<img>`, NOT `<Photograph>`. That component reads
 * the image window `Book.tsx` publishes on a context (`docs/adr/0006-diary-image-window.md`),
 * and the window exists because the book puts thirty-three leaves in one
 * document. This surface renders ONE page, so every image on it is an image
 * the reader is looking at, and there is nothing to window. The focal point is
 * still applied, as `object-position`, exactly as `Photograph` applies it -
 * DATA_MODEL.md's picker is only real if it reaches rendering.
 *
 * EMPTY FIELDS PRINT NOTHING, not an empty label - the policy `Cover.tsx`,
 * `Notes.tsx` and `About.tsx` all apply, since no text field on the `book` or
 * `about` globals or on a journey is `required: true` in the schema.
 *
 * EVERY KIND RENDERS EXACTLY ONE `<h1>`, and on the Cover that takes a
 * conditional. The book's `Cover.tsx` omits its heading for an empty title and
 * relies on the Contents page's static one being in the same document to keep
 * axe's `page-has-heading-one` green - a document holding thirty-three pages
 * can afford that. This one holds one page, so an untitled book would leave a
 * mobile Cover with no level-one heading at all; the eyebrow, which is the
 * page's own printed name for the diary, becomes the heading instead. Nothing
 * about the drawn page changes: it keeps the eyebrow's class either way.
 * Depends on: react, `BookPage`/`BookChrome`/`AboutContent`/`ContentsEntry`/
 * `Slot`/`JourneyPage`/`WeatherGlyph` (@travel-diary/domain/bookBundle),
 * `fitMobileTitleSize` (@travel-diary/domain/coverTitle),
 * `pagePath`/`galleryPath` (@travel-diary/domain/pageAddress),
 * ./mobile.module.css.
 */
import type {
  AboutContent,
  BookChrome,
  BookPage,
  ContentsEntry,
  JourneyPage,
  Slot,
  WeatherGlyph,
} from '@travel-diary/domain/bookBundle'
import { fitMobileTitleSize } from '@travel-diary/domain/coverTitle'
import { galleryPath, pagePath } from '@travel-diary/domain/pageAddress'
import type React from 'react'
import styles from './mobile.module.css'

/** What one mobile page needs to render itself. */
export interface MobilePageProps {
  /** The page the reader is on, from the bundle's reading sequence. */
  readonly page: BookPage
  /** The book's Contents index, rendered only on the Contents page. */
  readonly contents: readonly ContentsEntry[]
  /** The `book` global's editor-supplied fields, printed by the Cover and Contents. */
  readonly chrome: BookChrome
  /** The `about` global's editor-supplied content, printed by the About page. */
  readonly about: AboutContent
  /** The 0-based leaf this page occupies, for the gallery link's return address. */
  readonly leafIndex: number
  /** How many pages the book has, which is what says whether "Start reading" has anywhere to go. */
  readonly totalPages: number
}

/**
 * The most highlights SCREENS.md §1.3 lets a Notes page hold - the schema's
 * `journeys.highlights.maxRows`, applied here as well for the reason
 * `Notes.tsx` records: a row that reached the database before the cap did
 * must not break the layout.
 */
const MAX_HIGHLIGHTS = 4

/**
 * The class each weather glyph is drawn with. A lookup rather than a
 * `styles[glyph]` index, so the three names a stylesheet reader greps for
 * appear literally in this file - the same shape `WeatherBadge.tsx` uses.
 */
const GLYPH_CLASS_NAME: Readonly<Record<WeatherGlyph, string | undefined>> = {
  sun: styles.sunGlyph,
  haze: styles.hazeGlyph,
  wind: styles.windGlyph,
}

/** The Contents row's ordinal, zero-padded the way the prototype prints it. */
const rowNumber = (position: number): string => String(position + 1).padStart(2, '0')

/**
 * One photograph in its paper mount: `aspect-ratio: 4/3`, a Caveat caption
 * under it, 18px to the next.
 */
const Mount = ({ slot }: { readonly slot: Slot }): React.JSX.Element => (
  <figure data-mount={slot.role} className={styles.mount}>
    <img
      className={styles.photo}
      data-photo={slot.role}
      src={slot.src}
      alt={slot.alt}
      decoding="async"
      // The slot's own focal point for THIS placement, which is the whole
      // point of the admin's picker (DATA_MODEL.md). Inline because it is
      // editor data, which no stylesheet can see.
      style={{ objectPosition: `${String(slot.focalX)}% ${String(slot.focalY)}%` }}
    />
    {slot.caption !== '' && <figcaption className={styles.caption}>{slot.caption}</figcaption>}
  </figure>
)

/** The Cover: the cloth block, then the way into the book. */
const MobileCover = ({
  chrome,
  leafIndex,
  totalPages,
}: {
  readonly chrome: BookChrome
  readonly leafIndex: number
  readonly totalPages: number
}): React.JSX.Element => {
  const titled = chrome.title !== ''

  return (
    <section data-mobile-page="cover">
      <div
        className={styles.cover}
        // The cloth colour is the one background an editor chooses, so it
        // cannot live in the stylesheet; the gradient stack still does.
        style={{ '--cover-cloth': chrome.coverCloth } as React.CSSProperties}
      >
        <div aria-hidden="true" className={styles.coverRule} />

        {/* See this file's header: the eyebrow carries the page's heading when
            the editor has given the book no title. */}
        {titled ? (
          <p className={styles.coverEyebrow}>Travel Diary</p>
        ) : (
          <h1 className={styles.coverEyebrow}>Travel Diary</h1>
        )}

        <div aria-hidden="true" className={styles.coverHairlineTop} />

        {titled && (
          <h1 className={styles.coverTitle} style={{ fontSize: `${String(fitMobileTitleSize(chrome.title))}px` }}>
            {chrome.title}
          </h1>
        )}

        {chrome.subtitle !== '' && <p className={styles.coverSubtitle}>{chrome.subtitle}</p>}

        <div aria-hidden="true" className={styles.coverHairlineBottom} />

        {chrome.owner !== '' && <p className={styles.coverKeptBy}>Kept by {chrome.owner}</p>}
      </div>

      {/* A book of one page has nowhere to start reading, and a link to a page
          that does not exist is a 404 the reader was invited to press. */}
      {leafIndex + 1 < totalPages && (
        <a data-start-reading="" className={styles.startReading} href={pagePath(leafIndex + 1)}>
          Start reading
        </a>
      )}

      <p className={styles.swipeHint}>Swipe left and right to turn the pages.</p>
    </section>
  )
}

/** The Contents: the index as rows a thumb can hit. */
const MobileContents = ({
  entries,
  note,
}: {
  readonly entries: readonly ContentsEntry[]
  readonly note: string
}): React.JSX.Element => (
  <section data-mobile-page="contents">
    <p className={styles.eyebrow}>Index</p>
    <h1 className={styles.heading}>Contents</h1>
    {note !== '' && (
      <p data-contents-note="" className={styles.contentsNote}>
        {note}
      </p>
    )}

    <ol data-contents-list="" className={styles.contentsList}>
      {entries.map((entry, position) => (
        // Keyed by journey id, never by array position (CLAUDE.md §7).
        <li key={entry.journeyId}>
          <a data-contents-row="" className={styles.contentsRow} href={pagePath(entry.pageNumber - 1)}>
            <span className={styles.contentsNumber}>{rowNumber(position)}</span>
            <span className={styles.contentsEntry}>
              <span className={styles.contentsName}>{entry.name}</span>
              <span className={styles.contentsMeta}>
                {entry.place} · {entry.dates}
              </span>
            </span>
            <span className={styles.contentsPage}>p. {entry.pageNumber}</span>
          </a>
        </li>
      ))}
    </ol>
  </section>
)

/** The notes block: the highlights, the note and the tally card. Notes pages only. */
const NotesBlock = ({ page }: { readonly page: JourneyPage }): React.JSX.Element | null => {
  const highlights = page.highlights.slice(0, MAX_HIGHLIGHTS)
  if (highlights.length === 0 && page.note === '' && page.tally.length === 0) return null

  return (
    <>
      <div aria-hidden="true" className={styles.rule} />

      {highlights.length > 0 && (
        <>
          <p className={styles.highlightsEyebrow}>Highlights</p>
          <ul data-highlights="" className={styles.highlights}>
            {highlights.map((highlight) => (
              // Keyed by the line itself: a highlight has no id of its own,
              // and its text is what identifies it to a reader.
              <li data-highlight="" key={highlight} className={styles.highlight}>
                <span aria-hidden="true" className={styles.highlightMark} />
                <span className={styles.highlightText}>{highlight}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {page.note !== '' && <p className={styles.note}>{page.note}</p>}

      {page.tally.length > 0 && (
        <dl data-tally="" className={styles.tally}>
          {page.tally.map((cell) => (
            <div data-tally-cell="" key={cell.key}>
              <dt className={styles.tallyKey}>{cell.key}</dt>
              <dd className={styles.tallyValue}>{cell.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  )
}

/**
 * A journey page: its heading, its two badge bars, the notes block where the
 * page is a Notes page, and its photographs.
 */
const MobileJourney = ({
  page,
  leafIndex,
}: {
  readonly page: JourneyPage
  readonly leafIndex: number
}): React.JSX.Element => {
  // The ephemera scrap is the Notes page's own layout furniture inside the
  // design box (SCREENS.md §1.3) and has no place in a column of 4:3 mounts,
  // so this surface prints the hero and the frames. Found by ROLE, never by
  // position: a `pages` row's slots are editor-ordered (CLAUDE.md §7).
  const photos = (page.slots ?? []).filter((slot) => slot.role !== 'ephemera')

  return (
    <section data-mobile-page={page.kind}>
      {page.dates !== '' && <p className={styles.journeyDates}>{page.dates}</p>}
      <h1 className={styles.journeyName}>{page.name}</h1>
      {page.place !== '' && <p className={styles.journeyPlace}>{page.place}</p>}

      {(page.weather !== '' || page.mood !== '') && (
        <div className={styles.badges}>
          {page.weather !== '' && (
            <div data-badge="weather" className={[styles.badge, styles.weatherBadge].join(' ')}>
              <span
                aria-hidden="true"
                data-weather-glyph={page.weatherGlyph}
                className={GLYPH_CLASS_NAME[page.weatherGlyph]}
              />
              <span className={styles.badgeLabel}>{page.weather}</span>
            </div>
          )}

          {page.mood !== '' && (
            <div data-badge="mood" className={[styles.badge, styles.moodBadge].join(' ')}>
              <span aria-hidden="true" className={styles.moodGlyph} />
              <span className={styles.badgeLabel}>{page.mood}</span>
            </div>
          )}
        </div>
      )}

      {page.kind === 'notes' && <NotesBlock page={page} />}

      <div aria-hidden="true" className={styles.ruleWide} />

      {photos.map((slot) => (
        // Keyed by the derivative it shows: a slot has no id of its own on
        // the bundle, and two mounts on one page never share a photograph.
        <Mount key={slot.src} slot={slot} />
      ))}

      <a data-gallery-link="" className={styles.galleryButton} href={galleryPath(page.slug, leafIndex)}>
        See full gallery
        <span aria-hidden="true" className={styles.galleryArrow}>
          &#8594;
        </span>
      </a>

      <p data-gallery-count="" className={styles.galleryCount}>
        {page.gallery.photographs} photographs and {page.gallery.clips} clips in the gallery
      </p>
    </section>
  )
}

/** The About page: the portrait, the biography and the reply-to address. */
const MobileAbout = ({ content }: { readonly content: AboutContent }): React.JSX.Element => (
  <section data-mobile-page="about">
    <p className={styles.eyebrow}>Colophon</p>
    <h1 className={styles.heading}>About</h1>

    {content.portrait !== undefined && (
      <div className={styles.portraitMount}>
        <Mount slot={content.portrait} />
      </div>
    )}

    {content.paragraphs.map((paragraph) => (
      // Keyed by the paragraph itself: it has no id, and its text is what
      // identifies it - the same key `About.tsx` uses.
      <p data-about-paragraph="" key={paragraph} className={styles.aboutParagraph}>
        {paragraph}
      </p>
    ))}

    {content.replyTo !== '' && (
      <>
        <p className={styles.replyEyebrow}>Write to me</p>
        <p data-reply-to="" className={styles.replyTo}>
          {content.replyTo}
        </p>
      </>
    )}
  </section>
)

/**
 * Renders whichever of the four mobile page kinds this page is.
 *
 * @param props - The page, the book's index, chrome and About content, the
 *   leaf it occupies and the book's length.
 * @returns The page, as a scrolling column. The `switch` is exhaustive over
 *   {@link BookPage}'s six kinds and returns from every arm, so a seventh kind
 *   added to the domain fails to compile here rather than rendering nothing.
 * @example
 * <MobilePage page={page} contents={bundle.contents} chrome={bundle.chrome} about={bundle.about} leafIndex={2} totalPages={33} />
 */
export const MobilePage = ({
  page,
  contents,
  chrome,
  about,
  leafIndex,
  totalPages,
}: MobilePageProps): React.JSX.Element => {
  switch (page.kind) {
    case 'cover':
      return <MobileCover chrome={chrome} leafIndex={leafIndex} totalPages={totalPages} />
    case 'contents':
      return <MobileContents entries={contents} note={chrome.contentsNote} />
    case 'about':
      return <MobileAbout content={about} />
    case 'notes':
    case 'frames-i':
    case 'frames-ii':
      return <MobileJourney page={page} leafIndex={leafIndex} />
  }
}
