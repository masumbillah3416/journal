/**
 * Notes — a journey's first page, SCREENS.md §1.3 transcribed.
 *
 * Presentational component (CLAUDE.md §3.3) over the already-assembled
 * {@link JourneyPage}. It derives nothing: the weather, mood, highlights,
 * note, tally, sign-off and stamp all arrive on the page from
 * `readBookBundle`, and so does the footer's gallery census. No hooks, no
 * handlers, no state — the whole page is one static subtree, and the diary
 * route pays no interactivity for it.
 *
 * EVERY MEASUREMENT IS ABSOLUTE inside the 1300x860 design box; see
 * `notes.module.css`'s header, which also carries the reason the left
 * column's flex distribution is the one rule in this page nobody may
 * "tidy up".
 *
 * THE FOCAL POINT IS THE POINT. The hero is the first slot in the diary that
 * carries one, and `focalX`/`focalY` are applied as `object-position` on the
 * image itself. SCREENS.md is blunt about why this matters: "If this is not
 * wired through to rendering, the admin's focal-point picker is decorative —
 * that is the whole point of it." It is set inline rather than in the
 * stylesheet because it is the one value on this page that depends on the
 * editor's choice for THIS placement, which no stylesheet can see;
 * `e2e/notes.spec.ts` proves the crop actually moves rather than that the
 * attribute is present.
 *
 * SLOTS ARE FOUND BY ROLE, NEVER BY POSITION (CLAUDE.md §7). A `pages` row's
 * `slots` array is editor-ordered and an editor can reorder it; `role` is a
 * fixed enum, so `slots[0]` would silently become the ephemera scrap the day
 * somebody dragged one above the other, and the hero mount would render a
 * texture.
 *
 * THE GALLERY BUTTON IS AN ANCHOR, not a button with a handler. The handoff's
 * own defect log records gallery buttons that "appeared dead while their
 * handlers were fine", and README.md requires the deep links to be real,
 * indexable paths ("In production use real paths (`/p/12`, `/gallery/tokyo`)
 * rather than hashes"). `/gallery/<slug>` is the path Task 14 builds; until
 * then the link is a real, inspectable target rather than a click that does
 * nothing, which is the failure mode this project has already paid for once.
 *
 * EMPTY FIELDS PRINT NOTHING, not an empty label — the same policy
 * `Cover.tsx` applies. None of the journey's Notes fields is `required: true`
 * in the schema, so a journey whose editor has not written a mood line yet is
 * an ordinary state: the badge is omitted outright rather than drawn as an
 * empty circle, and the highlights list, the note, the tally and the
 * sign-off each disappear the same way. The ephemera slot is the one
 * exception, and deliberately so: it is layout, not content, so it is drawn
 * whether or not there is a photograph in it.
 *
 * HIGHLIGHTS ARE CAPPED AT FOUR here as well as in the schema
 * (`journeys.highlights.maxRows`). SCREENS.md §1.3 sizes the list to its
 * content and gives the leftover height to the ephemera slot, so a fifth
 * line would eat the slot rather than reflow the page; the cap is applied at
 * the point the list is rendered so that a row which reached the database
 * before the schema cap did cannot break the layout.
 * Depends on: react, `JourneyPage`/`Slot` (@travel-diary/domain/bookBundle),
 * ./WeatherBadge, ./MoodBadge, ./TallyTicket, ./EphemeraSlot,
 * ./notes.module.css.
 */
import type { JourneyPage, Slot } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import { EphemeraSlot } from './EphemeraSlot'
import { MoodBadge } from './MoodBadge'
import { TallyTicket } from './TallyTicket'
import { WeatherBadge } from './WeatherBadge'
import styles from './notes.module.css'

/** What the Notes page needs to print itself. */
export interface NotesProps {
  /** The journey's notes page, from the bundle's reading sequence. */
  readonly page: JourneyPage
  /** The `book` global's decorations flag, gating the washi strips and the stamp. */
  readonly showDecorations: boolean
}

/**
 * The most highlights SCREENS.md §1.3 lets the left column hold. Matches
 * `journeys.highlights.maxRows`; see this module's header for why it is
 * enforced twice.
 */
const MAX_HIGHLIGHTS = 4

/**
 * Finds a page's slot by the role it plays, never by its position in the
 * editor-ordered array (CLAUDE.md §7).
 * @param slots - The page's resolved slots, absent when none could be matched.
 * @param role - The role to look for.
 * @returns The slot playing that role, or `undefined` when the journey has none.
 */
const slotForRole = (slots: readonly Slot[] | undefined, role: Slot['role']): Slot | undefined =>
  slots?.find((slot) => slot.role === role)

/**
 * Renders a journey's notes page: the header with its two badges, the
 * two-column body, and the footer's gallery link, count and sign-off.
 *
 * @param props - The journey's notes page and the book's decorations flag.
 * @returns The Notes page.
 * @example
 * <Notes page={page} showDecorations={bundle.chrome.showDecorations} />
 */
export const Notes = ({ page, showDecorations }: NotesProps): React.JSX.Element => {
  const hero = slotForRole(page.slots, 'hero')
  const ephemera = slotForRole(page.slots, 'ephemera')
  const highlights = page.highlights.slice(0, MAX_HIGHLIGHTS)

  return (
    <section data-page="notes" className={styles.notes}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          {page.dates !== '' && <p className={styles.dates}>{page.dates}</p>}
          <h1 className={styles.name}>{page.name}</h1>
          {page.place !== '' && <p className={styles.place}>{page.place}</p>}
        </div>

        <div className={styles.badges}>
          {page.weather !== '' && <WeatherBadge label={page.weather} glyph={page.weatherGlyph} />}
          {page.mood !== '' && <MoodBadge label={page.mood} />}
        </div>
      </header>

      <div data-notes-body="" className={styles.body}>
        <div className={styles.leftColumn}>
          <p className={styles.eyebrow}>Highlights</p>

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

          {page.note !== '' && (
            <div className={styles.noteBlock}>
              <div aria-hidden="true" className={styles.noteRule} />
              <p className={styles.note}>{page.note}</p>
            </div>
          )}

          {page.tally.length > 0 && <TallyTicket cells={page.tally} />}

          <EphemeraSlot slot={ephemera} showDecorations={showDecorations} />
        </div>

        <div className={styles.rightColumn}>
          {hero !== undefined && (
            <figure className={styles.mount}>
              <img
                data-hero=""
                className={styles.heroPhoto}
                src={hero.src}
                alt={hero.alt}
                // See this module's header: lazy and low priority because
                // every leaf of the book is in the document at once, and the
                // hero of a page the reader is not on must never compete with
                // the one they are.
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                style={{ objectPosition: `${String(hero.focalX)}% ${String(hero.focalY)}%` }}
              />
              {hero.caption !== '' && <figcaption className={styles.heroCaption}>{hero.caption}</figcaption>}
              {showDecorations && <span data-decoration="washi" aria-hidden="true" className={styles.heroWashi} />}
            </figure>
          )}

          {showDecorations && (
            <div data-decoration="stamp" aria-hidden="true" className={styles.stampMount}>
              <div
                className={styles.stampFace}
                // The journey's own accent tint, so it cannot live in the
                // stylesheet; the gradient it feeds still does.
                style={{ '--stamp-accent': page.accent } as React.CSSProperties}
              >
                <span className={styles.stampCountry}>{page.stampCountry}</span>
                <span className={styles.stampValue}>{page.stampValue}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        <a className={styles.galleryButton} href={`/gallery/${page.slug}`}>
          See full gallery
          <span aria-hidden="true" className={styles.galleryArrow}>
            &#8594;
          </span>
        </a>

        <p className={styles.count}>
          {page.gallery.photographs} photographs and {page.gallery.clips} clips in the gallery
        </p>

        {page.signoff !== '' && <p className={styles.signoff}>{page.signoff}</p>}
      </footer>
    </section>
  )
}
