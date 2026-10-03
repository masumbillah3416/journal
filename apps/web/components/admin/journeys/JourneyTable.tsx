/**
 * JourneyTable — SCREENS.md §2.2's table, in one card: a header row, one row
 * per journey, and the strip each `⋯` hides.
 *
 * A SERVER COMPONENT. Every cell — the 44px cover, the name over the place, the
 * four monospace data cells and the status pill — is rendered on the server and
 * costs no JavaScript. The one client island is `RowActions`, which holds the
 * disclosure's boolean and receives these cells as a prop; see that module's
 * header for why the strip is a sibling of the row rather than a child of the
 * actions cell.
 *
 * EVERY COLUMN IS IN THE DOM AT EVERY WIDTH, and `journeys.module.css` hides
 * four of them below the widths `packages/domain/src/admin/journeyColumns.ts`
 * gives. A server render has never seen a viewport, and dropping the cells
 * instead would slide every later cell one grid track left. The two spellings
 * of those four widths are pinned to each other by `JourneyTable.test.tsx`.
 *
 * EDIT AND GALLERY POINT AT ADDRESSES TASKS 5 AND 7 MOUNT. Until they land,
 * both answer Next's own not-found page, exactly as eight of the nine rail
 * buttons do (`packages/domain/src/admin/navigation.ts`'s header states the
 * same thing for the same reason). It is a task ordering rather than the defect
 * `PanelHome.tsx` records: the screen behind them is specified, named in
 * `ADMIN_NAV`, and reached from a row rather than offered as the panel's one
 * way forward.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. It is a list rendered, and the
 * shaping was `readJourneysScreen`'s.
 *
 * IT IS A TABLE TO A SCREEN READER, not only to a sighted one. The design uses
 * divs and so does this, so the markup is §2.2's — but a run of unlabelled text
 * per row is not, and axe is green either way because axe judges the markup
 * that is there rather than the markup that is missing. The ARIA roles change
 * no pixel: the card is a `table`, the header is a
 * `row` of `columnheader`s, and each journey is a `rowgroup` holding its row
 * and — when it is open — its strip, which is `RowActions`' half of the same
 * structure.
 *
 * INVARIANT — the headings and the cells are the same sequence,
 * `JOURNEY_COLUMNS`. A grid whose tracks outnumber its cells slides every row
 * one column left, which looks like a data defect and is a markup one.
 * Depends on: react, `JOURNEY_COLUMNS` (@travel-diary/domain/admin/journeyColumns),
 * `JourneyStatus` (@travel-diary/domain/admin/journeyStatus), `JourneyRow`
 * (../../../lib/admin/readJourneysScreen), ./RowActions, ./journeys.module.css.
 */
import { JOURNEY_COLUMNS, type JourneyColumn } from '@travel-diary/domain/admin/journeyColumns'
import type { JourneyStatus } from '@travel-diary/domain/admin/journeyStatus'
import type React from 'react'
import type { JourneyRow } from '../../../lib/admin/readJourneysScreen'
import { RowActions } from './RowActions'
import styles from './journeys.module.css'

/** What the table needs to draw itself and to let a row act. */
export interface JourneyTableProps {
  /** The rows, already shaped by `readJourneysScreen`. */
  readonly rows: readonly JourneyRow[]
  /** Copies a journey and its pages, always as drafts. */
  readonly duplicate: (form: FormData) => Promise<void>
  /** Puts a journey on the archive shelf, or takes it off. */
  readonly archive: (form: FormData) => Promise<void>
  /** Soft-deletes a journey. */
  readonly trash: (form: FormData) => Promise<void>
}

/**
 * The accessible name of a column whose heading prints nothing.
 *
 * The thumbnail's and the actions' headings are empty in the design and stay
 * empty on screen. They are still `columnheader`s, and a column header with no
 * accessible name leaves a screen-reader user with two cells per row they
 * cannot place (review round 1, finding 8).
 *
 * VISUALLY HIDDEN TEXT, NOT AN `aria-label`, and that was measured rather than
 * chosen: axe's `empty-table-header` rule runs `has-visible-text` over the
 * header's SUBTREE TEXT, so a label attribute leaves it reporting "Element does
 * not have text that is visible to screen readers". A clipped span is text.
 */
const UNPRINTED_HEADINGS: Readonly<Partial<Record<JourneyColumn, string>>> = {
  thumb: 'Cover',
  actions: 'Actions',
}

/**
 * What each column's heading says.
 *
 * The thumbnail and the actions get an empty heading, which is the design's
 * own: `Travel Diary Admin.dc.html`'s header row opens and closes with an empty
 * cell. They are still KEYS here rather than omitted, because the headings and
 * the cells have to be the same sequence for the grid to line up.
 */
const HEADINGS: Readonly<Record<JourneyColumn, string>> = {
  thumb: '',
  name: 'Journey',
  dates: 'Dates',
  pages: 'Pages',
  media: 'Media',
  status: 'Status',
  edited: 'Edited',
  actions: '',
}

/**
 * The word each status pill prints.
 *
 * Capitalised here rather than upper-cased in TypeScript: the stylesheet does
 * `text-transform: uppercase`, so the accessible name a screen reader announces
 * stays "Edited" rather than "EDITED".
 */
const PILL_LABEL: Readonly<Record<JourneyStatus, string>> = {
  draft: 'Draft',
  published: 'Published',
  edited: 'Edited',
  archived: 'Archived',
}

/**
 * The ink each status pill takes, transcribed from the design's `pillStyle`.
 *
 * ARCHIVED SHARES DRAFT'S COLOUR, and that is the design's own answer rather
 * than an omission: `pillStyle` maps three statuses and falls through to
 * `#6b5d46` for everything else, which in a five-chip screen is Archived. The
 * pill is not the only thing that distinguishes the two — the row's strip says
 * Unarchive, and the Archived chip selects them — so the colour is not carrying
 * the difference alone.
 */
const PILL_INK: Readonly<Record<JourneyStatus, string>> = {
  draft: '#6b5d46',
  published: '#2f6b68',
  edited: '#845825',
  archived: '#6b5d46',
}

/** The two custom properties one pill is painted with. */
interface PillStyle extends React.CSSProperties {
  /** The word's colour. */
  readonly '--pill-ink': string
  /** The same colour at the design's `55` alpha, for the 1px inset ring. */
  readonly '--pill-ring': string
}

/**
 * One pill's inline style.
 *
 * A named function rather than a literal at the call site, for the reason
 * `NavRail.tsx` gives: an object literal passed straight to `style` is
 * excess-property-checked against `React.CSSProperties`, which knows no custom
 * properties and rejects it.
 * @param status - The word the pill prints.
 * @returns The style carrying its two colours.
 */
const pillStyle = (status: JourneyStatus): PillStyle => ({
  '--pill-ink': PILL_INK[status],
  // `#rrggbb55` — the design writes the ring as the ink plus an alpha byte.
  '--pill-ring': `${PILL_INK[status]}55`,
})

/** The custom property the cover square's background image arrives on. */
interface ThumbStyle extends React.CSSProperties {
  /** A CSS `url(...)`, or `none` for a journey with no cover. */
  readonly '--cover': string
}

/**
 * One cover square's inline style.
 * @param coverSrc - The `thumb` derivative's URL, or `null`.
 * @returns The style carrying the image, or `none`.
 */
const thumbStyle = (coverSrc: string | null): ThumbStyle => ({
  '--cover': coverSrc === null ? 'none' : `url("${coverSrc}")`,
})

/**
 * What the crumb above the screen's title says about what is on it.
 *
 * It describes the rows DRAWN, not the library: with a chip pressed or a search
 * typed, "3 entries · 9 pages" is a true sentence about the table underneath it
 * and a false one about the diary. Exported so `JourneyTable.test.tsx` can
 * assert it and the screen can print it without a second count query.
 * @param rows - The rows the table is about to draw.
 * @returns The crumb, singular where the number is one.
 * @example
 * journeysSummary(rows) // '2 entries · 7 pages'
 */
export const journeysSummary = (rows: readonly JourneyRow[]): string => {
  if (rows.length === 0) return 'No entries'
  const pages = rows.reduce((total, row) => total + row.pages, 0)
  const entryWord = rows.length === 1 ? 'entry' : 'entries'
  const pageWord = pages === 1 ? 'page' : 'pages'
  return `${String(rows.length)} ${entryWord} · ${String(pages)} ${pageWord}`
}

/**
 * The seven cells a row draws on the server; the eighth is `RowActions`'.
 * @param row - The journey.
 * @returns The cells, in `JOURNEY_COLUMNS` order.
 */
const cellsFor = (row: JourneyRow): React.JSX.Element => (
  <>
    <div role="cell" data-cell="thumb" className={styles.thumb} style={thumbStyle(row.coverSrc)} />

    <div role="cell" data-cell="name" className={styles.nameCell}>
      <div className={styles.name}>{row.name}</div>
      <div className={styles.place}>{row.place}</div>
    </div>

    <div role="cell" data-cell="dates" className={[styles.dataCell, styles.dates].join(' ')}>
      {row.dates}
    </div>
    <div role="cell" data-cell="pages" className={[styles.dataCell, styles.pagesCell, styles.pages].join(' ')}>
      {row.pages}
    </div>
    <div role="cell" data-cell="media" className={[styles.dataCell, styles.media].join(' ')}>
      {row.media}
    </div>

    <div role="cell" data-cell="status">
      <span className={styles.pill} style={pillStyle(row.status)}>
        {PILL_LABEL[row.status]}
      </span>
    </div>

    <div role="cell" data-cell="edited" className={[styles.dataCell, styles.editedCell, styles.edited].join(' ')}>
      {row.editedAt}
    </div>
  </>
)

/**
 * Renders the table.
 *
 * @param props - See {@link JourneyTableProps}.
 * @returns The card: the header row, then one row per journey, or the line that
 *   says the filter matched nothing.
 * @example
 * <JourneyTable rows={rows} duplicate={duplicateJourney} archive={archiveJourney} trash={trashJourney} />
 */
export const JourneyTable = ({ rows, duplicate, archive, trash }: JourneyTableProps): React.JSX.Element =>
  // AN EMPTY RESULT IS NOT A TABLE, so it is not given the roles of one. The
  // first version put `role="table"` on the card whatever was in it, and in the
  // empty state that table owned a bare `<p>` — which an ARIA table does not
  // own, and which axe passed, because axe judges the markup that is there
  // rather than the markup that is missing. That is this module's own argument
  // for having the roles at all, pointed back at it (fix round 2, finding 4).
  // A reader filtering to Archived with nothing archived heard "table, 1 row"
  // and, on some assistive technology, nothing else — the one piece of
  // information on the screen.
  rows.length === 0 ? (
    <div className={styles.card}>
      <p data-journeys-empty className={styles.empty}>
        No journeys match that.
      </p>
    </div>
  ) : (
    <div className={styles.card} role="table" aria-label="Journeys">
      <div className={styles.head} role="row">
        {JOURNEY_COLUMNS.map((column) => (
          <div
            key={column}
            role="columnheader"
            data-heading={column}
            className={
              column === 'dates' || column === 'pages' || column === 'media' || column === 'edited'
                ? styles[column]
                : undefined
            }
          >
            {HEADINGS[column]}
            {UNPRINTED_HEADINGS[column] === undefined ? null : (
              <span className={styles.hiddenLabel}>{UNPRINTED_HEADINGS[column]}</span>
            )}
          </div>
        ))}
      </div>

      {rows.map((row) => (
        <RowActions
          key={row.id}
          journey={row.id}
          name={row.name}
          archived={row.status === 'archived'}
          editHref={`/admin/journeys/${row.id}`}
          galleryHref={`/admin/galleries?journey=${row.id}`}
          cells={cellsFor(row)}
          duplicate={duplicate}
          archive={archive}
          trash={trash}
        />
      ))}
    </div>
  )
