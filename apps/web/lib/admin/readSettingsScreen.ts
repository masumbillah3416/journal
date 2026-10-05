/**
 * readSettingsScreen — everything SCREENS.md §2.9's three cards draw, read
 * once.
 *
 * ═══ THE TOGGLE LIST IS DERIVED FROM THE GLOBAL, NOT TYPED OUT ═══
 *
 * §2.9's Readers card is "five toggles: allow downloads, share buttons, let
 * search engines index galleries, password the whole book, keep the page-turn
 * on touch" — which is exactly the five `checkbox` fields
 * `apps/web/globals/site.ts` declares, in that order. So the list is READ OFF
 * the collection config rather than written here a second time: a sixth
 * checkbox added to the global appears on this screen the day it lands, with
 * its own name as its label until somebody writes one, instead of being a
 * setting no screen can reach. `ReadersCard.test.tsx` asserts the two agree
 * by extracting the same list from the config.
 *
 * {@link READER_COPY} is the label and hint for each, and it is a LOOKUP with
 * a fallback rather than an exhaustive map: an enumeration that had to be
 * complete would turn "a setting with no copy yet" into a type error at the
 * one moment the screen is the only way to reach it (standing orders, species
 * 6 — refuse what you do not recognise rather than recognising what to
 * refuse).
 *
 * ═══ THE STORAGE FIGURES ARE DERIVED, WHICH IS A DATA-MODEL RULE ═══
 *
 * `DATA_MODEL.md` lists "Storage quota — sum `filesize` grouped by `kind`"
 * under **Derived, not stored**. Nothing holds a total, so one read asks for
 * two columns of every media row and sums them here. That is one STATEMENT
 * whatever the library holds — not an N+1 — and it is the same shape
 * `readOverview.ts` uses for the frames it needs; the cost it does pay is one
 * ROW per file, of two small columns, which is stated here rather than
 * discovered later.
 *
 * `storageSegments` and `storageLine` (`@travel-diary/domain/admin/storageBar`)
 * turn the two sums into the bar and the line above it. Neither decision is
 * taken here.
 *
 * ═══ WHAT §2.9 ASKS FOR AND THIS DATA MODEL CANNOT ANSWER ═══
 *
 * The "last backup date". `DATA_MODEL.md` records no backup anywhere, so
 * there is no column to read and this view carries no field for one — a
 * property that is always `null` is a shape pretending to hold something.
 * `MaterialCard.tsx` prints what is true instead, and
 * `docs/deviations.md` §102 carries that and the two other §2.9 controls this
 * repository has nothing behind.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — one module owns how the Settings
 * screen is fetched, and no card sees a Payload document. DTO:
 * {@link SettingsView} is the screen, not a row.
 *
 * INVARIANT — `readers` is in the `site` global's own field order, and holds
 * one entry per `checkbox` field it declares. The screen's toggles and the
 * columns they write cannot disagree, because there is one list.
 * Depends on: `storageSegments`/`storageLine`/`STORAGE_QUOTA_BYTES`
 * (@travel-diary/domain/admin/storageBar), `payload` (types), `Site`
 * (../../globals/site), `AdminScope` (./adminScope).
 */
import {
  STORAGE_QUOTA_BYTES,
  storageLine,
  storageSegments,
  type StorageSegment,
} from '@travel-diary/domain/admin/storageBar'
import type { Payload } from 'payload'
import { Site } from '../../globals/site'
import type { AdminScope } from './adminScope'

/**
 * How many statements one read of this screen costs, whatever the diary holds.
 *
 * One `findGlobal` for the settings and one `find` over the media library for
 * the two sums. Pinned from BOTH sides by
 * `readSettingsScreen.integration.test.ts`: a per-row query makes the second
 * reading longer than the first.
 */
export const QUERIES_PER_READ = 2

/** SCREENS.md §2.9's "The site" card — four fields, each with an italic hint. */
export interface SiteIdentity {
  /** Site name. */
  readonly name: string
  /** Address — the domain the diary is served at. */
  readonly domain: string
  /** Description, the sentence a search result prints. */
  readonly description: string
  /** Reply-to address. */
  readonly replyTo: string
}

/** One of SCREENS.md §2.9's Readers toggles. */
export interface ReaderToggle {
  /** The `site` column it writes. Every row is addressed by this, never by position. */
  readonly setting: string
  /** What the toggle is called. */
  readonly label: string
  /** The line beneath it, saying what turning it on does. */
  readonly hint: string
  /** Whether it is on now. */
  readonly on: boolean
}

/** SCREENS.md §2.9's "Space used". */
export interface StorageUsed {
  /** The line above the bar — "41.2 GB of 100 GB". */
  readonly line: string
  /** The 7px bar's three widths, in the order it prints them. */
  readonly segments: readonly StorageSegment[]
}

/** Everything SCREENS.md §2.9 draws. */
export interface SettingsView {
  /** "The site". */
  readonly site: SiteIdentity
  /** "Readers" — one per `checkbox` the `site` global declares, in its order. */
  readonly readers: readonly ReaderToggle[]
  /** "Space used", inside "Your material". */
  readonly storage: StorageUsed
  /**
   * Whether the book is already closed to readers.
   *
   * The same `passwordProtect` one of the toggles writes, hoisted so the
   * "Careful now" block can say whether its one-press button has anything
   * left to do. Two readings of one column, never two columns.
   */
  readonly bookIsOffline: boolean
  /**
   * Whether a reader password is set — never what it is.
   *
   * A BOOLEAN, AND THAT IS THE WHOLE DESIGN. The screen has to say "a
   * password is set" and has to disable the toggle when none is, and neither
   * needs the hash. Carrying the hash into a view model would put it in a
   * render, in HTML, and in anything that ever serialises this object.
   */
  readonly hasReaderPassword: boolean
}

/** The column "Take the book offline" and the fourth toggle both write. */
export const OFFLINE_SETTING = 'passwordProtect'

/**
 * What each reader setting is called, and what its hint says.
 *
 * SCREENS.md §2.9's own five phrases, expanded into the hint the card prints
 * beneath each. A LOOKUP, not an exhaustive map — see this module's header.
 */
export const READER_COPY: Readonly<Record<string, { readonly label: string; readonly hint: string }>> = {
  allowDownloads: {
    label: 'Allow downloads',
    hint: 'a reader can save a photograph from the gallery, at the largest size it has',
  },
  allowShare: { label: 'Show the share buttons', hint: 'the small row under a gallery frame' },
  indexGalleries: {
    label: 'Let search engines index galleries',
    hint: 'off adds a Disallow to robots.txt and a noindex to every gallery page',
  },
  passwordProtect: {
    // THIS HINT IS A SECURITY CLAIM, AND IT IS CHECKED. It was false when it
    // was written: a closed book still served every photograph through
    // Payload's own REST, GraphQL and file routes. The first fix round closed
    // that at `apps/web/collections/media.ts`'s `read` rule;
    // `apps/web/lib/bookGateRegistration.test.ts` counts the surfaces and
    // `e2e/bookGate.spec.ts` asks a running server for each of them.
    //
    // THE HINT CHANGED WHEN THE READER PASSWORD LANDED, and the old one is
    // worth keeping in view: it read "nothing is served to a reader at all".
    // That was true of a book nobody could open, which is the defect
    // `docs/deviations.md` §100 records. It is false now — a reader who types
    // the password is served everything — and a stale security claim on a
    // security control is worse than no claim.
    //
    // THE LABEL IS STILL NOT SCREENS.md's. §2.9 words it "password the whole
    // book"; the toggle says what pressing it does, which is close the book
    // rather than set anything. `docs/deviations.md` §103 records the change
    // with the Site card's three hints.
    label: 'Close the whole book',
    hint: 'readers must type the password below — set one first, or there is no way back in',
  },
  touchPageTurn: {
    label: 'Keep the page-turn on touch',
    hint: 'a phone turns the page by swiping rather than scrolling',
  },
}

/**
 * What one reader setting is called and what its hint says.
 *
 * A FUNCTION RATHER THAN A LOOKUP AT THE CALL SITE, so the fallback arm is
 * reachable by a case that names a setting nobody has written copy for — which
 * is the arm that matters, because it is the one a sixth checkbox takes on the
 * day it lands. Inlined, it was a branch no fixture could reach and no
 * measurement could see.
 * @param setting - The `site` column's name.
 * @returns Its label and hint, falling back to the name itself.
 * @example
 * readerCopyFor('allowShare').label // 'Show the share buttons'
 */
export const readerCopyFor = (setting: string): { readonly label: string; readonly hint: string } =>
  READER_COPY[setting] ?? { label: setting, hint: 'no description has been written for this setting yet' }

/**
 * Every `checkbox` the `site` global declares, in the order it declares them.
 *
 * Read off the config so the screen and the columns cannot disagree. Exported
 * because `ReadersCard.test.tsx` builds the same list to compare against, and
 * two extractions of one thing are one thing.
 * @returns The field names.
 * @example
 * readerSettingNames() // ['allowDownloads', 'allowShare', …]
 */
export const readerSettingNames = (): readonly string[] =>
  Site.fields.flatMap((field) => ('type' in field && field.type === 'checkbox' && 'name' in field ? [field.name] : []))

/**
 * A `site` column's value, as a boolean.
 *
 * Postgres hands back `null` for a checkbox nobody has written, so the field's
 * own `defaultValue` is what an unwritten column means — and the five do not
 * all default the same way.
 * @param value - What Payload returned for the column.
 * @param fallback - The field's declared default.
 * @returns The setting's state.
 */
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

/**
 * The declared default of one `checkbox` field.
 * @param name - The field's name.
 * @returns Its `defaultValue`, or `false` for a field that declares none.
 */
const declaredDefault = (name: string): boolean =>
  Site.fields.some(
    (field) => 'name' in field && field.name === name && 'defaultValue' in field && field.defaultValue === true,
  )

/** What a `media` row contributes to the two sums. */
interface SizedRow {
  readonly kind?: string | null
  readonly filesize?: number | null
}

/**
 * The library's bytes, by kind.
 *
 * `kind not_equals 'clip'` rather than `kind equals 'still'` is
 * `readOverview.ts`'s inversion, for its reason: `media.kind` is written by
 * the ingest pipeline, so a row it has not reached has no kind at all and
 * would otherwise be counted in neither column while occupying real bytes.
 * @param rows - Every media row, with its two columns.
 * @returns The two sums.
 */
const bytesByKind = (rows: readonly SizedRow[]): { readonly stills: number; readonly clips: number } => {
  let stills = 0
  let clips = 0
  for (const row of rows) {
    /* c8 ignore next -- the refusing arm is unreachable through any writer this repository has: `media` is an upload collection, Payload refuses a `create` with no file (`ValidationError: The following field is invalid: filename`, measured), and it is Payload's own upload handler that writes `filesize`. The arm exists because the generated TYPE allows `number | null | undefined`. */
    const size = typeof row.filesize === 'number' ? row.filesize : 0
    if (row.kind === 'clip') clips += size
    else stills += size
  }
  return { stills, clips }
}

/**
 * Everything SCREENS.md §2.9's Settings screen draws.
 *
 * @param payload - The Local API instance the rows live behind. A parameter so
 *   the query count is observable; see this module's header.
 * @param scope - The hoisted {@link AdminScope}, spread into both queries.
 * @returns The three cards' data. See {@link SettingsView}.
 * @throws From Payload, when a read is refused by the access rules the scope
 *   switches on — a bug in the guard that admitted the session, not a state a
 *   card can draw.
 * @example
 * const scope = await adminScope(session)
 * const view = await readSettingsScreen(await getPayload(), scope)
 */
export const readSettingsScreen = async (payload: Payload, scope: AdminScope): Promise<SettingsView> => {
  const [site, media] = await Promise.all([
    payload.findGlobal({ slug: 'site', ...scope, depth: 0 }),
    payload.find({
      collection: 'media',
      ...scope,
      depth: 0,
      pagination: false,
      // TWO COLUMNS, and `filesize` is the one DATA_MODEL.md names. A read
      // that paid for the whole row would put every caption, every alt text
      // and every derivative manifest on the wire to add up two numbers.
      select: { kind: true, filesize: true },
    }),
  ])

  const settings: Record<string, unknown> = { ...site }
  const readers = readerSettingNames().map((setting) => ({
    setting,
    // THE NAME IS THE FALLBACK LABEL, so a checkbox added to the global
    // reaches this screen even before anybody writes copy for it.
    ...readerCopyFor(setting),
    on: flag(settings[setting], declaredDefault(setting)),
  }))

  const used = bytesByKind(media.docs)

  return {
    site: {
      name: site.name ?? '',
      domain: site.domain ?? '',
      description: site.description ?? '',
      replyTo: site.replyTo ?? '',
    },
    readers,
    storage: {
      line: storageLine(used.stills + used.clips, STORAGE_QUOTA_BYTES),
      segments: storageSegments(used, STORAGE_QUOTA_BYTES),
    },
    bookIsOffline: flag(settings[OFFLINE_SETTING], declaredDefault(OFFLINE_SETTING)),
    hasReaderPassword: typeof site.readerPasswordHash === 'string' && site.readerPasswordHash !== '',
  }
}
