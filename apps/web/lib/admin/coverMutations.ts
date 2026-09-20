/**
 * coverMutations — what SCREENS.md §2.7's two cards do to the database, and the
 * Zod parses that stand between a `POST` and them.
 *
 * ═══ WHY THE DECISIONS ARE HERE AND NOT IN `actions.ts` ═══
 *
 * `bookMutations.ts`'s reason, unchanged, one screen over: a `'use server'`
 * module carries a whole-file `c8 ignore` because a Server Action needs a
 * request context no Vitest project has, and Zod schemas cannot sit at its top
 * level either (`eslint-rules/guarded-server-actions.js` rule 4). The action is
 * the guard and the wiring; every branch lives here behind a `Payload`
 * parameter, executed by `coverMutations.integration.test.ts`.
 *
 * ═══ TWO GLOBALS, AND BOTH WRITES NAME ONLY THEIR OWN COLUMNS ═══
 *
 * {@link saveCover} writes four columns of `book` and {@link saveAbout} writes
 * three of `about`. Neither names the rest, and both rely on `updateGlobal`
 * merging — the property `bookMutations.integration.test.ts` asserts for `book`
 * and this file's own case asserts for `about`, because a global that replaced
 * would mean saving the reply-to address cleared the portrait.
 *
 * `book.coverCloth` is written by BOTH screens — §2.6's Book settings card has
 * four swatches and §2.7's Cover card has the same four — so
 * {@link COVER_CLOTH} is imported from `bookMutations.ts` rather than spelled
 * again. One column, one parse.
 *
 * ═══ THE PORTRAIT IS REPLACED BY NAMING A MEDIA ROW, AND MAY BE LEFT ALONE ═══
 *
 * // HANDOFF-DEVIATION: `Travel Diary Admin.dc.html`'s "Replace" button under
 * the portrait carries no handler at all — it opens nothing, because the
 * prototype has no media library to open. This repository does, so Replace is
 * a `<select>` over it plus a submit, which is the smallest control that
 * actually replaces a portrait and ships no client JavaScript. That submit
 * posts the WHOLE card, because the card is one `<form>` — so "Replace" and
 * "Save about" write the same four groups and differ only in their label. `''` means "leave the portrait as it is", which is what every
 * save that is about the paragraphs sends. See `docs/deviations.md` §83.
 *
 * ═══ A BLANK PARAGRAPH IS KEPT AND A BLANK KIT LINE IS NOT ═══
 *
 * The two are different shapes and the difference is deliberate. §2.7 draws
 * exactly TWO paragraph boxes, so `paragraphs` is a fixed pair and a cleared
 * one is stored as an empty row — otherwise clearing the first would slide the
 * second up into its box while the author watched. The Kit is a LIST, drawn one
 * input per stored line plus one empty input to add by, so a blank line is not
 * a line; keeping them would have the list grow a blank row per save.
 * `readBookBundle.ts`'s `textLines` drops every empty row on the way out
 * regardless, so neither choice can put an empty paragraph or an empty kit
 * line on the About page.
 *
 * ═══ EVERY PARSE IS AN INVERSION, AND EVERY REFUSAL IS A DEAD END ═══
 *
 * SCREENS.md §2.7 gives this screen no error surface and the prototype has
 * none, so a refusal arrives as an unhandled Server Action error
 * (`docs/deviations.md` §60). None of them lists what is bad: the cloth must BE
 * a hex colour, the portrait must BE a row id or nothing, and the reply-to must
 * BE an address or empty.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — the globals' shapes stop here, and
 * the screen's actions speak in {@link CoverFields} and {@link AboutFields}.
 * DTO for both interfaces, which are §2.7's two cards and not two global rows.
 *
 * INVARIANT — nothing here writes `about.portraitCaption` or any `book` column
 * §2.7's Cover card does not draw. The caption is printed by the About page and
 * §2.7 offers no control for it, so a write that reset it would silently delete
 * a line the author never saw on this screen.
 * Depends on: zod, `payload` (types), `isRowId` (@travel-diary/domain/ids),
 * `AdminScope` (./adminScope), `COVER_CLOTH` (./bookMutations).
 */
import { isRowId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import { z } from 'zod'
import type { AdminScope } from './adminScope'
import { COVER_CLOTH } from './bookMutations'

/**
 * How many paragraph boxes SCREENS.md §2.7's About card draws: two, always.
 *
 * NOT A MAXIMUM AND NOT A MINIMUM — the card draws this many boxes whatever the
 * global holds, so a body with any other count did not come from the card. It
 * is the same fixed-grid treatment `notesMutations.ts` gives `TALLY_ROWS`, and
 * for the same reason: §2.7 labels them "Opening paragraph" and "Second
 * paragraph", which is a shape rather than a list.
 */
export const ABOUT_PARAGRAPHS = 2

/**
 * The most Kit lines one call may save.
 *
 * A CHOSEN CEILING, AND NOTHING DERIVES IT. SCREENS.md §2.7 specifies no cap
 * and the prototype draws three; this bounds what one unattended `POST` can
 * store, and it sits far enough above three that meeting it means something
 * other than an author is calling. Both sides of it are pinned by cases built
 * from this constant, so the boundary follows it wherever it is moved.
 */
export const MAX_KIT_LINES = 12

/** Everything SCREENS.md §2.7's Cover card holds. */
export interface CoverFields {
  /** The cover title, fitted by `fitTitleSize` and never truncated. */
  readonly title: string
  /** The italic line under it. */
  readonly subtitle: string
  /** The name printed after "Kept by". */
  readonly owner: string
  /** The Courier 13px years line. */
  readonly yearsShown: string
  /** The cloth, as one of the four swatches posts it. */
  readonly coverCloth: string
}

/** Everything SCREENS.md §2.7's About card holds. */
export interface AboutFields {
  /** Exactly {@link ABOUT_PARAGRAPHS} boxes, in the order they are drawn. */
  readonly paragraphs: readonly string[]
  /** The Kit list, blanks dropped — see this module's header. */
  readonly kit: readonly string[]
  /** The address under "Write to me". `''` clears it. */
  readonly replyTo: string
  /** The media row to make the portrait, or `''` to leave the portrait alone. */
  readonly portrait: string
}

/** What SCREENS.md §2.7's Cover card amounts to. */
const COVER = z.object({
  title: z.string(),
  subtitle: z.string(),
  owner: z.string(),
  yearsShown: z.string(),
  coverCloth: COVER_CLOTH,
})

/**
 * The portrait's media row, or nothing.
 *
 * `''` IS A VALUE HERE, not a missing one: it is what the select posts when the
 * author changed a paragraph and not the portrait, and it has to mean "leave it
 * alone" rather than "clear it" — a save about the prose that emptied the
 * portrait mount would be the worst kind of quiet.
 */
const PORTRAIT_REF = z.union([z.literal(''), z.coerce.number().refine(isRowId, { message: 'not a row id' })])

/**
 * The reply-to address, or nothing.
 *
 * `about.replyTo` is an `email` column, so an address that is not one is
 * refused by Payload anyway — one layer down, with a message naming a column,
 * on a screen that draws no error. `''` is admitted because the field is not
 * `required` and an author clearing it is an ordinary state.
 *
 * IT IS WRITTEN AS `''` AND NOT AS `null`, WHICH WAS MEASURED RATHER THAN
 * ASSUMED. The first draft mapped the empty string to `null` under a comment
 * claiming Payload's own validation refuses an empty `email` — it does not, and
 * the branch was deleted when a mutation that removed it left every case in
 * this module's suite green. A branch nothing can fail is not a guard; see
 * `readBookBundle.ts`'s `toAboutContent`, which narrows either spelling to `''`
 * before the About page ever sees it.
 */
const REPLY_TO = z.union([z.literal(''), z.email()])

/** What SCREENS.md §2.7's About card amounts to. */
const ABOUT = z.object({
  paragraphs: z.array(z.string()).length(ABOUT_PARAGRAPHS),
  kit: z.array(z.string()).max(MAX_KIT_LINES),
  replyTo: REPLY_TO,
  portrait: PORTRAIT_REF,
})

/**
 * Every value a form field holds, in the order the browser sent them.
 *
 * `getAll` rather than `Object.fromEntries`, which keeps only the LAST of a
 * repeated name — and this card repeats two of them. A `File` entry is not a
 * string and is dropped here, which the length checks above then catch.
 * @param form - The body the browser posted.
 * @param name - The field's name.
 * @returns Its values.
 */
const valuesOf = (form: FormData, name: string): readonly string[] =>
  form.getAll(name).flatMap((value) => (typeof value === 'string' ? [value] : []))

/**
 * One value a form field holds, or the empty string.
 * @param form - The body the browser posted.
 * @param name - The field's name.
 * @returns Its value.
 */
const valueOf = (form: FormData, name: string): string => {
  const found = form.get(name)
  return typeof found === 'string' ? found : ''
}

/**
 * What SCREENS.md §2.7's About card posted, as {@link AboutFields}.
 *
 * THE BLANK KIT LINES ARE DROPPED HERE rather than in the write, because this
 * is where the card's shape becomes the global's — see this module's header for
 * why the paragraphs are not.
 * @param form - The body the card's single `<form>` posted.
 * @returns The card's four groups, unparsed — {@link saveAbout} parses.
 * @example
 * await saveAbout(payload, scope, readAbout(form))
 */
export const readAbout = (form: FormData): AboutFields => ({
  paragraphs: valuesOf(form, 'paragraph'),
  kit: valuesOf(form, 'kit').filter((line) => line.trim() !== ''),
  replyTo: valueOf(form, 'replyTo').trim(),
  portrait: valueOf(form, 'portrait'),
})

/**
 * Writes SCREENS.md §2.7's Cover card.
 *
 * FOUR COLUMNS OF THE `book` GLOBAL, NAMED, plus the cloth. The contents note,
 * the two slider values and the three toggles are §2.6's and survive this write
 * because `updateGlobal` merges — see this module's header.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}, spread into the call.
 * @param cover - The card's five fields.
 * @throws {z.ZodError} From the parse.
 * @throws From Payload, when the write is refused by the access rules.
 * @example
 * await saveCover(payload, scope, { title: 'Wanderings', …, coverCloth: '#2f4a47' })
 */
export const saveCover = async (payload: Payload, scope: AdminScope, cover: CoverFields): Promise<void> => {
  const parsed = COVER.parse(cover)

  await payload.updateGlobal({ slug: 'book', ...scope, depth: 0, data: parsed })
}

/**
 * Writes SCREENS.md §2.7's About card.
 *
 * THE PORTRAIT IS OMITTED FROM THE WRITE when the select posted `''`, rather
 * than written as `null`: the two are different instructions and only one of
 * them is what a save about the paragraphs means.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}, spread into the call.
 * @param about - The card's four groups, as {@link readAbout} built them.
 * @throws {z.ZodError} From the parse.
 * @throws From Payload, when the write is refused, or when the portrait names
 *   no media row.
 * @example
 * await saveAbout(payload, scope, readAbout(form))
 */
export const saveAbout = async (payload: Payload, scope: AdminScope, about: AboutFields): Promise<void> => {
  const parsed = ABOUT.parse(about)

  await payload.updateGlobal({
    slug: 'about',
    ...scope,
    depth: 0,
    data: {
      paragraphs: parsed.paragraphs.map((text) => ({ text })),
      kit: parsed.kit.map((text) => ({ text })),
      replyTo: parsed.replyTo,
      ...(parsed.portrait === '' ? {} : { portrait: parsed.portrait }),
    },
  })
}
