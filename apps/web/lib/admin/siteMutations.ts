/**
 * siteMutations — what SCREENS.md §2.9's three writes actually do to the
 * `site` global, and the Zod parses that stand between a `POST` and them.
 *
 * ═══ WHY THE DECISIONS ARE HERE AND NOT IN `actions.ts` ═══
 *
 * `journeyMutations.ts`'s reason, unchanged: a `'use server'` module is
 * dispatched under an opaque action id and carries a whole-file `c8 ignore`,
 * so anything decided there is decided where nothing measures it. The actions
 * module is the guard, the wiring and the cache hints; everything with a
 * branch in it lives here behind a `Payload` parameter.
 *
 * ═══ THE TOGGLE'S NAME IS CHECKED AGAINST THE CONFIG, NOT AGAINST A LIST ═══
 *
 * A reader toggle posts the column it writes, which means an untrusted string
 * naming a column. {@link readReaderToggle} refuses anything that is not a
 * `checkbox` field of the `site` global — derived from
 * `apps/web/globals/site.ts` rather than enumerated here, so the set the
 * screen offers and the set this accepts are ONE set (standing orders, species
 * 6: refuse what you do not recognise). A sixth checkbox is writable the day
 * it lands; `name`, `domain` and `analyticsId` never are, because they are not
 * checkboxes.
 *
 * ═══ THE GLOBAL IS NOT VERSIONED, SO A PLAIN `updateGlobal` IS CORRECT ═══
 *
 * `journeyMutations.ts`'s two-write dance exists because `journeys` carries
 * `versions.drafts` and Payload merges from the newest version. `site`
 * declares no `versions` block at all (`apps/web/globals/site.ts`), so there
 * is no draft to merge from and nothing to lose. Stated rather than left to be
 * re-derived by the next person who reads that header.
 *
 * ═══ A PARTIAL UPDATE, DELIBERATELY ═══
 *
 * `updateGlobal` is given only the columns each write owns. The Site card
 * posts four text fields and touches no toggle; a toggle posts one column and
 * touches no text. So the two cards cannot overwrite each other, and neither
 * can clear `analyticsId`, which no screen in this phase draws at all — a
 * whole-object write would set it to `undefined` the first time anybody saved
 * a site name.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — the global's shape stops here, and
 * the screen's actions speak in settings. DTO for {@link SiteForm}, which is
 * the card's four fields and not the global.
 *
 * INVARIANT — nothing here writes a column the `site` global does not declare,
 * and no toggle write can reach a field that is not a `checkbox`.
 * Depends on: zod, `payload` (types), `readerSettingNames`
 * (./readSettingsScreen), `AdminScope` (./adminScope).
 */
import type { Payload } from 'payload'
import { z } from 'zod'
import type { AdminScope } from './adminScope'
import { readerSettingNames } from './readSettingsScreen'

/** The four fields SCREENS.md §2.9's "The site" card collects. */
export interface SiteForm {
  /** Site name — what the rail's masthead and the book's title bar print. */
  readonly name: string
  /** Address — the domain the diary is served at. */
  readonly domain: string
  /** Description — the sentence a search result prints. */
  readonly description: string
  /** Reply-to address. */
  readonly replyTo: string
}

/**
 * What §2.9's Site card's four inputs must amount to.
 *
 * EVERY FIELD IS OPTIONAL AND DEFAULTS TO EMPTY, because a `<textarea>` a
 * reader cleared posts `''` and the global's own columns are all nullable.
 * `replyTo` is the one with a shape: the field is an `email` on the global, so
 * a value that is not one would be refused by Payload with a message the
 * screen cannot show — refusing it here is refusing it where the message can
 * be written.
 */
const SITE_FORM = z.object({
  name: z.string().trim().default(''),
  domain: z.string().trim().default(''),
  description: z.string().trim().default(''),
  replyTo: z
    .string()
    .trim()
    .default('')
    // TRIMMED FIRST, THEN JUDGED. A browser posts what the reader typed,
    // spaces and all, and `z.email().trim()` judges before it trims — so a
    // pasted address with a trailing space was refused while an empty box
    // was accepted, which is the wrong way round.
    .refine((value) => value === '' || z.email().safeParse(value).success, 'that is not an email address'),
})

/** What one reader toggle's form posts. */
export interface ReaderToggleForm {
  /** The `site` column it writes. */
  readonly setting: string
  /** What to write.  */
  readonly on: boolean
}

/**
 * Reads SCREENS.md §2.9's Site card's form body.
 *
 * @param form - The posted body.
 * @returns The four fields, trimmed.
 * @throws {z.ZodError} When `replyTo` is neither empty nor an address.
 * @example
 * await saveSite(payload, scope, readSiteForm(form))
 */
export const readSiteForm = (form: FormData): SiteForm => SITE_FORM.parse(Object.fromEntries(form))

/**
 * Reads one reader toggle's form body.
 *
 * THE SETTING IS CHECKED AGAINST THE GLOBAL'S OWN CHECKBOXES — see this
 * module's header. `on` arrives as the string a hidden input carries, because
 * a toggle posts the value it is switching TO rather than a checkbox's
 * presence: a checkbox that is off posts nothing at all, so a form built that
 * way could never turn a setting off.
 * @param form - The posted body.
 * @returns The column and the value.
 * @throws {z.ZodError} When the column is not one the `site` global declares
 *   as a checkbox.
 * @example
 * const { setting, on } = readReaderToggle(form)
 */
export const readReaderToggle = (form: FormData): ReaderToggleForm =>
  z
    .object({
      setting: z.string().refine((name) => readerSettingNames().includes(name), {
        message: 'that is not a reader setting',
      }),
      on: z.enum(['true', 'false']).transform((value) => value === 'true'),
    })
    .parse(Object.fromEntries(form))

/**
 * Writes SCREENS.md §2.9's four site fields, and nothing else.
 *
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param input - What the card posted, already parsed.
 * @throws From Payload, when the write is refused by the access rules.
 * @example
 * await saveSite(payload, scope, readSiteForm(form))
 */
export const saveSite = async (payload: Payload, scope: AdminScope, input: SiteForm): Promise<void> => {
  await payload.updateGlobal({
    slug: 'site',
    ...scope,
    depth: 0,
    // `replyTo` is an `email` field, and Payload refuses `''` on one — a
    // cleared address is `null`, which is what an unwritten column already is.
    data: { ...input, replyTo: input.replyTo === '' ? null : input.replyTo },
  })
}

/**
 * Writes one reader setting.
 *
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param input - The column and the value, already parsed.
 * @throws From Payload, when the write is refused by the access rules.
 * @example
 * await setReaderSetting(payload, scope, readReaderToggle(form))
 */
export const setReaderSetting = async (payload: Payload, scope: AdminScope, input: ReaderToggleForm): Promise<void> => {
  await payload.updateGlobal({ slug: 'site', ...scope, depth: 0, data: { [input.setting]: input.on } })
}

/**
 * Closes the whole book to readers, from §2.9's "Careful now" block.
 *
 * ONE COLUMN, AND IT IS THE ONE THE FOURTH TOGGLE WRITES. `SCREENS.md` §2.9
 * draws a ringed "Take the book offline" beneath an explanation, and this data
 * model has exactly one thing that takes a book offline: `passwordProtect`,
 * which `apps/web/lib/bookAccess.ts` turns into a 401 at every public address.
 * A second column would be a second idea of what offline means, and
 * `DATA_MODEL.md` declares none. `docs/deviations.md` §102 records it.
 *
 * IT IS ONE-WAY, which is what the "Careful now" framing means: the toggle
 * above it is how the book is opened again, and the screen says so.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @throws From Payload, when the write is refused by the access rules.
 * @example
 * await takeBookOffline(payload, scope)
 */
export const takeBookOffline = async (payload: Payload, scope: AdminScope): Promise<void> => {
  await payload.updateGlobal({ slug: 'site', ...scope, depth: 0, data: { passwordProtect: true } })
}
