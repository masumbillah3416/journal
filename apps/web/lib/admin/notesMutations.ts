/**
 * notesMutations — what SCREENS.md §2.3's Notes pane saves, and the Zod parse
 * that stands between a `POST` and the row.
 *
 * ═══ WHY THE DECISIONS ARE HERE AND NOT IN `actions.ts` ═══
 *
 * `pageMutations.ts`'s reason, unchanged: a `'use server'` module is dispatched
 * by Next.js under an opaque action id and needs a request context no Vitest
 * project has, so it carries a whole-file `c8 ignore` — and anything DECIDED
 * behind one is decided where nothing measures it. Zod schemas cannot sit at
 * the top level of a `'use server'` module either
 * (`eslint-rules/guarded-server-actions.js` rule 4), which is the same
 * conclusion from the other direction. So the action is the guard and the
 * wiring, and every branch lives here behind a `Payload` parameter, executed by
 * `notesMutations.integration.test.ts`.
 *
 * ═══ SAVE DRAFT IS A DRAFT WRITE, AND THAT IS THE WHOLE ANSWER TO THE TRAP ═══
 *
 * `journeys` is versioned, and Payload's `updateByID` merges into the NEWEST
 * VERSION whatever `draft` says — the defect Task 4 paid two review rounds for
 * on this collection, where one press of Archive published the author's
 * unfinished rewrite. {@link writeNotesDraft} is the other side of that coin:
 * because it writes with `draft: true`, the merge source being the newest
 * version is exactly what is wanted (the author's earlier unpublished edits are
 * carried through rather than reverted), and the live row is not written at
 * all, so a reader keeps seeing the published book until Publish.
 *
 * That is why this is ONE write where `pageMutations.ts`'s `writePageFields` is
 * two: `order` and `layout` are structural and apply with no Save, so they have
 * to reach the live row without publishing anything. Notes are content, and
 * SCREENS.md §2.3's button is called Save draft.
 *
 * ═══ THE WHOLE PANE IS ONE FORM, WHICH IS WHY THE OPERATIONS ARE HERE ═══
 *
 * The editor ships no client JavaScript (`shellShipsNoClientJs.test.ts`), so
 * "Add highlight", the `×` and the two halves of the `::` grip are submit
 * buttons in the SAME form as the fields. Each posts an `op`, and this module
 * applies it to the list the author has in front of them — so pressing one
 * keeps everything they had typed and has not saved, which a button that posted
 * only its own instruction could not do.
 *
 * `@travel-diary/domain/admin/highlights` owns what each operation MEANS,
 * including the cap: the pane can draw "Add highlight" unconditionally because
 * a fifth is refused here, on the server, where a `POST` cannot walk past it.
 *
 * ═══ EVERY PARSE IS AN INVERSION ═══
 *
 * Not one of the refusals below lists what is bad. The glyph must BE one of
 * `WEATHER_GLYPHS`, the operation must BE one of four verbs, the accent must BE
 * a six-digit hex colour and the gallery address must BE a slug — so a value
 * nobody predicted is refused rather than passed through
 * (`eslint-rules/guarded-server-actions.js` is this repository's worked example
 * of why).
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — the collection's shape stops here and
 * the screen's action speaks in {@link JourneyNotes}. DTO for that interface,
 * which is the pane's own shape and is what `readJourneyEditor.ts` fills for the
 * same pane to render.
 *
 * INVARIANT — {@link readNotes} never answers more than `MAX_HIGHLIGHTS`
 * highlights or other than `TALLY_ROWS` tally cells, which are the two numbers
 * `apps/web/collections/journeys.ts` enforces. A save that reached Payload
 * outside either would be refused there, with an error naming a row index
 * rather than a field.
 * Depends on: zod, `payload` (types), `Highlight`/`MAX_HIGHLIGHTS` and the three
 * list operations (@travel-diary/domain/admin/highlights), `TallyCell`/
 * `TALLY_ROWS`/`WeatherGlyph`/`WEATHER_GLYPHS` (@travel-diary/domain/bookBundle),
 * `isRowId` (@travel-diary/domain/ids), `AdminScope` (./adminScope).
 */
import { addHighlight, moveHighlight, removeHighlight, type Highlight } from '@travel-diary/domain/admin/highlights'
import { TALLY_ROWS, WEATHER_GLYPHS, type TallyCell, type WeatherGlyph } from '@travel-diary/domain/bookBundle'
import { isRowId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import { z } from 'zod'
import type { AdminScope } from './adminScope'

/**
 * Everything SCREENS.md §2.3's Notes pane holds, in the shape the journey row
 * stores it.
 *
 * ONE SHAPE FOR BOTH DIRECTIONS. `readJourneyEditor.ts` fills this from the
 * database for the pane to render, and {@link readNotes} builds it back out of
 * what the pane posted. A second interface for the read path would be the place
 * a field could be added to one and not the other.
 */
export interface JourneyNotes {
  /** The pane's "Location" field — the journey's own name. */
  readonly name: string
  /** Free text, as the author types it: "3 – 9 Mar 2025". */
  readonly dates: string
  /** The weather badge's line, e.g. `'CLEAR 14C'`. */
  readonly weather: string
  /** The mood badge's line, e.g. `'WIDE EYED'`. */
  readonly mood: string
  /** Which of the three cards is pressed. */
  readonly weatherGlyph: WeatherGlyph
  /** The highlight list, at most {@link MAX_HIGHLIGHTS} rows. */
  readonly highlights: readonly Highlight[]
  /** "The note" — the page's prose paragraph. */
  readonly note: string
  /** The tally ticket, always {@link TALLY_ROWS} cells. */
  readonly tally: readonly TallyCell[]
  /** The sign-off, bottom right, in the author's hand. */
  readonly signoff: string
  /** The postage stamp's country line. */
  readonly stampCountry: string
  /** The postage stamp's face value. */
  readonly stampValue: string
  /** The journey accent, as a `#rrggbb` string. */
  readonly accent: string
  /** The gallery address's last segment. */
  readonly slug: string
}

/**
 * A row id, as a form sends one.
 *
 * `pageMutations.ts`'s spelling, for its reasons: `z.coerce.number()` first,
 * because a form body is text, and then `isRowId` rather than
 * `int().positive()`, because past 2^53 `Number` stops telling one integer from
 * the next and a crafted `journey=9007199254740993` would ask Postgres about a
 * different row.
 */
const ROW_ID = z.coerce.number().refine(isRowId, { message: 'not a row id' })

/**
 * The journey accent, as the five swatches post it.
 *
 * A SHAPE CHECK, NOT MEMBERSHIP OF THE PALETTE, and the difference matters in
 * both directions. It has to be at least this strict because the value is
 * interpolated into a CSS declaration — `linear-gradient(160deg, {c}, …)` on the
 * swatches and `background: {c}` on the book's bookmark tabs — so a value
 * carrying a `)` or a `url(` is a `POST` writing CSS into two screens. It must
 * not be stricter, because the palette is what the pane OFFERS today: a journey
 * whose stored accent predates a change to those five must still be savable, or
 * the author cannot edit the page at all until somebody notices why.
 */
const ACCENT = z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: 'not a hex colour' })

/**
 * The gallery address's last segment.
 *
 * `/gallery/<slug>` is a real route, and the column is `unique` and indexed, so
 * this is both a routing value and a key. Lowercase words joined by single
 * hyphens: no slashes, no dots, no leading or trailing hyphen — which refuses
 * `../../admin` by not recognising it rather than by listing it.
 */
const SLUG = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'not a gallery address' })

/**
 * What a highlight control posted, once split.
 *
 * `add` names no row; the other three do, and a bare `remove:` is refused
 * rather than treated as "remove the row whose id is the empty string".
 */
const OP = z
  .string()
  .transform((raw) => {
    const separator = raw.indexOf(':')
    return separator === -1 ? { verb: raw, id: '' } : { verb: raw.slice(0, separator), id: raw.slice(separator + 1) }
  })
  .pipe(
    z
      .object({ verb: z.enum(['add', 'up', 'down', 'remove']), id: z.string() })
      .refine((op) => op.verb === 'add' || op.id.length > 0, { message: 'the operation names no row' }),
  )

/**
 * The text the prototype's own "Add highlight" writes into a new row.
 *
 * NOT AN EMPTY STRING: `apps/web/collections/journeys.ts` declares
 * `highlights.text` as `required`, so a blank new row would be refused by
 * Payload at the moment the author pressed the button. `Travel Diary
 * Admin.dc.html`'s `addHighlight` concatenates this exact string.
 */
const NEW_HIGHLIGHT_TEXT = 'A new line'

/**
 * The id a row the author has just added carries until it is saved.
 *
 * A LITERAL, AND IT IS UNIQUE FOR AS LONG AS IT HAS TO BE. One request carries
 * at most one operation, so at most one row can be new at a time; the next
 * render reads the saved rows back with Payload's own array-row ids on them.
 */
const NEW_HIGHLIGHT_ID = 'new'

/**
 * Every value a form field holds, in the order the browser sent them.
 *
 * `getAll` rather than `Object.fromEntries`, which keeps only the LAST of a
 * repeated name — and the pane repeats four of them. A `File` entry is not a
 * string and is dropped here, which the length agreement below then catches.
 * @param form - The body the browser posted.
 * @param name - The field's name.
 * @returns Its values.
 */
const valuesOf = (form: FormData, name: string): readonly string[] =>
  form.getAll(name).flatMap((value) => (typeof value === 'string' ? [value] : []))

/** What the pane's single `<form>` posts, before the operation is applied. */
const NOTES = z
  .object({
    journey: ROW_ID,
    op: OP.optional(),
    location: z.string().trim().min(1),
    dates: z.string().trim().min(1),
    weather: z.string().trim(),
    mood: z.string().trim(),
    weatherGlyph: z.enum(WEATHER_GLYPHS),
    note: z.string(),
    signoff: z.string().trim(),
    stampCountry: z.string().trim(),
    stampValue: z.string().trim(),
    accent: ACCENT,
    slug: SLUG,
    // THE TWO HALVES OF EACH LIST ARE ZIPPED BY POSITION, so their lengths have
    // to agree or the zip silently files one row's text under another row's id.
    // A browser sends them in document order, one pair per row; anything else is
    // a `POST` that did not come from the pane.
    highlightIds: z.array(z.string()),
    highlightTexts: z.array(z.string()),
    tallyKeys: z.array(z.string()),
    tallyValues: z.array(z.string()),
  })
  .refine((posted) => posted.highlightIds.length === posted.highlightTexts.length, {
    message: 'the highlight rows do not line up',
  })
  .refine((posted) => posted.tallyKeys.length === posted.tallyValues.length, {
    message: 'the tally cells do not line up',
  })
  // FIXED, NOT CAPPED: `apps/web/collections/journeys.ts` sets `minRows` AND
  // `maxRows` to this number, and the pane draws that many rows whatever the
  // journey holds, so a body with any other count did not come from the pane.
  .refine((posted) => posted.tallyKeys.length === TALLY_ROWS, {
    message: `the tally has ${String(TALLY_ROWS)} cells`,
  })

/**
 * The highlight list after the control that was pressed has acted on it.
 *
 * @param rows - The rows as the author had them in front of them.
 * @param op - The operation posted, or `undefined` for a plain Save draft.
 * @returns The new list.
 */
const applyOp = (
  rows: readonly Highlight[],
  op: { readonly verb: 'add' | 'up' | 'down' | 'remove'; readonly id: string } | undefined,
): readonly Highlight[] => {
  if (op === undefined) return rows
  switch (op.verb) {
    case 'add':
      return addHighlight(rows, { id: NEW_HIGHLIGHT_ID, text: NEW_HIGHLIGHT_TEXT })
    case 'remove':
      return removeHighlight(rows, op.id)
    case 'up':
    case 'down':
      return moveHighlight(rows, op.id, op.verb)
  }
}

/**
 * Everything SCREENS.md §2.3's Notes pane posted, and which journey it is for.
 *
 * A BLANK LINE IS A DELETED ONE. `highlights.text` is `required` on the
 * collection, so a row the author emptied cannot be stored — and refusing the
 * whole save over it would strand them on a page they cannot leave. It is
 * dropped BEFORE the operation is applied, so the cap counts the rows that will
 * actually exist.
 * @param form - The body the browser posted.
 * @returns The journey's row id and the notes to write.
 * @throws {z.ZodError} When the journey is not a row id, the glyph is one the
 *   book cannot draw, the accent is not a hex colour, the gallery address is not
 *   a slug, the operation is unrecognised or names no row, the highlight ids and
 *   texts do not line up, or the tally is not {@link TALLY_ROWS} cells.
 * @example
 * readNotes(form) // { journey: 42, notes: { name: 'Tokyo', … } }
 */
export const readNotes = (form: FormData): { readonly journey: number; readonly notes: JourneyNotes } => {
  const posted = NOTES.parse({
    ...Object.fromEntries(form),
    highlightIds: valuesOf(form, 'highlightId'),
    highlightTexts: valuesOf(form, 'highlightText'),
    tallyKeys: valuesOf(form, 'tallyKey'),
    tallyValues: valuesOf(form, 'tallyValue'),
  })

  const typed = posted.highlightIds.flatMap((id, index): readonly Highlight[] => {
    const text = posted.highlightTexts[index]
    // Unreachable while the length refinement above holds, and written rather
    // than defaulted because `noUncheckedIndexedAccess` makes the lookup
    // fallible and CLAUDE.md §0.8 bans the `!` that would hide it.
    /* c8 ignore next */
    if (text === undefined) return []
    const typedText = text.trim()
    return typedText === '' ? [] : [{ id, text: typedText }]
  })

  return {
    journey: posted.journey,
    notes: {
      name: posted.location,
      dates: posted.dates,
      weather: posted.weather,
      mood: posted.mood,
      weatherGlyph: posted.weatherGlyph,
      highlights: applyOp(typed, posted.op),
      note: posted.note,
      tally: posted.tallyKeys.flatMap((key, index): readonly TallyCell[] => {
        const value = posted.tallyValues[index]
        /* c8 ignore next -- as above: the two lists are the same length by refinement */
        if (value === undefined) return []
        return [{ key, value }]
      }),
      signoff: posted.signoff,
      stampCountry: posted.stampCountry,
      stampValue: posted.stampValue,
      accent: posted.accent,
      slug: posted.slug,
    },
  }
}

/**
 * Saves the Notes pane as an unpublished draft.
 *
 * ONE WRITE, AND IT IS `draft: true`. See this module's header: the live row is
 * not touched, so the public book keeps the published notes until Publish, and
 * the merge into the newest version is what carries the author's earlier
 * unpublished edits through.
 *
 * THE ARRAY ROW IDS ARE NOT SENT. Payload gives every array row an `id`, and the
 * ids the form carried are the ones the last read minted; the save replaces both
 * arrays whole, so sending them would ask Payload to reconcile rows it is about
 * to rewrite. The consequence, stated rather than hidden: a highlight's id
 * changes on every save, so a form left open in a second tab posts stale ids and
 * its `×` and grips do nothing — the same staleness the page rail's arrows have,
 * and the same answer (the next render reads the current ids).
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param journey - The journey's row id.
 * @param notes - What the pane posted.
 * @throws From Payload, when the id names no row, the slug collides with another
 *   journey's, or the write is refused by the access rules.
 * @example
 * await writeNotesDraft(payload, scope, 42, notes)
 */
export const writeNotesDraft = async (
  payload: Payload,
  scope: AdminScope,
  journey: number,
  notes: JourneyNotes,
): Promise<void> => {
  await payload.update({
    collection: 'journeys',
    id: journey,
    ...scope,
    draft: true,
    data: {
      name: notes.name,
      dates: notes.dates,
      slug: notes.slug,
      weather: notes.weather,
      mood: notes.mood,
      weatherGlyph: notes.weatherGlyph,
      highlights: notes.highlights.map((row) => ({ text: row.text })),
      note: notes.note,
      tally: notes.tally.map((cell) => ({ key: cell.key, value: cell.value })),
      furniture: {
        signoff: notes.signoff,
        stampCountry: notes.stampCountry,
        stampValue: notes.stampValue,
        accent: notes.accent,
      },
    },
  })
}
