'use server'

/**
 * actions — the journey editor's mutations. Every export is built from
 * `guardedAction`, which is what a Server Action needs rather than a check it
 * could forget: an action is a `POST` endpoint of its own, dispatched before the
 * page around it renders, so the page's own guard has not run (`SECURITY.md`:
 * nothing inherits trust from the page it was reached from).
 *
 * ═══ THIS FILE GROWS, AND IT IS SHAPED FOR THAT ═══
 *
 * Task 5 landed the five page operations, Task 6 added `saveNotes`, and Task 7
 * adds `setSlotMedia`, `setSlotFocalPoint`, `setSlotText` and `clearSlot`. Every
 * one of them follows the SAME four lines — parse, hoist the scope, call one
 * mutation, revalidate — so an addition is one block and never a
 * restructuring. Two things make that work and must be kept:
 *
 *   1. NOTHING IS DECIDED HERE. A `'use server'` module cannot be executed by
 *      either Vitest project (an action is dispatched under an opaque action id
 *      and needs a request context no test process has), so it carries a
 *      whole-file `c8 ignore` — and a decision taken behind one is a decision
 *      nothing measures. The parses, the version-safe writes and the refusals
 *      are `../../../../../lib/admin/pageMutations.ts`'s, executed by
 *      `pageMutations.integration.test.ts`; Task 6's are
 *      `../../../../../lib/admin/notesMutations.ts`'s, executed by
 *      `notesMutations.integration.test.ts`. Later tasks put THEIR decisions
 *      in a module of their own rather than in the block they add here.
 *   2. NOTHING IS BUILT AT THE TOP LEVEL beyond a literal and an arrow —
 *      `eslint-rules/guarded-server-actions.js`'s rule 4, because a module that
 *      evaluates anything at load can attach an export no `export` keyword
 *      spells. A Zod schema is such an evaluation, which is the other reason
 *      the parses live in `lib/admin/`.
 *
 * THE SCOPE IS HOISTED ONCE PER ACTION. `adminScope` reads the account's row,
 * so resolving it per Payload call would be one `users` lookup per operation —
 * the N+1 CLAUDE.md §7 forbids.
 *
 * EVERY ARGUMENT IS `FormData`, because every caller is a `<form action={…}>`:
 * the rail's arrows, its Copy and Delete, the four glyph buttons and
 * "+ Add page with this layout". Zod parses it at that boundary
 * (CLAUDE.md §3.1); the guard says WHO is calling and nothing about what they
 * sent.
 *
 * `revalidatePath` AFTER EVERY ONE, and TWO addresses: the editor, because the
 * rail the author just reordered is a Server Component reading the database,
 * and the journeys list, because its `Pages` cell counts the rows these
 * actions add and remove — and its `Journey` cell prints the name `saveNotes`
 * writes. NEITHER OF THEM IS THE PUBLIC BOOK, and that is the point of
 * `saveNotes` being a draft write: nothing it does changes what `/` renders,
 * so revalidating the diary would be cache churn for a page that did not move.
 *
 * Depends on: `revalidatePath` (next/cache), `guardedAction`
 * (../../../../../lib/auth/guard), `adminScope`, the page mutations and the
 * notes mutations (../../../../../lib/admin/…), `getPayload`
 * (../../../../../lib/payload).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: this file
 * names the guard factory, hoists the scope and calls one mutation. Every
 * decision is `guardedAction`'s (executed by `guard.integration.test.ts`) or
 * `pageMutations.ts`'s and `notesMutations.ts`'s (each executed by its own
 * `*.integration.test.ts` and gated by vitest.integration.config.ts). Neither
 * Vitest project can
 * execute this file: a Server Action is dispatched by Next.js under an opaque
 * action id and needs a request context no test process has. The `c8 ignore` is
 * the treatment CLAUDE.md §2.1 asks for and the one
 * `app/(admin)/admin/journeys/actions.ts` already carries. Wraps the imports
 * too: an unimported file's imports are themselves uncovered lines. */
import { revalidatePath } from 'next/cache'
import { adminScope } from '../../../../../lib/admin/adminScope'
import { readNotes, writeNotesDraft } from '../../../../../lib/admin/notesMutations'
import {
  addPageRow,
  copyPageRow,
  deletePageRow,
  readNewPage,
  readPageLayoutRef,
  readPageOrder,
  readPageRef,
  reorderPageRows,
  setPageLayoutRow,
} from '../../../../../lib/admin/pageMutations'
import { guardedAction } from '../../../../../lib/auth/guard'
import { getPayload } from '../../../../../lib/payload'

/**
 * The list screen, whose `Pages` cell counts what these actions write.
 *
 * A string literal, which is one of the initialisers
 * `guarded-server-actions.js`'s rule 4 admits at the top level of a
 * `'use server'` module.
 */
const JOURNEYS_PATH = '/admin/journeys'

/**
 * The editor's own address.
 *
 * An arrow expression, which rule 4 admits for the reason it gives: defining a
 * function evaluates nothing, and its body runs when something calls it.
 * @param journey - The journey's row id.
 * @returns The path to revalidate.
 */
const editorPath = (journey: number): string => `${JOURNEYS_PATH}/${String(journey)}`

/**
 * Invalidates both screens one page operation changed.
 * @param journey - The journey whose editor was acted on.
 */
const revalidateEditor = (journey: number): void => {
  revalidatePath(editorPath(journey))
  revalidatePath(JOURNEYS_PATH)
}

/**
 * Adds a page to the end of the rail, with the layout the picker had selected.
 *
 * @param session - The account the guard admitted; the scope is read from it.
 * @param form - The add button's journey and layout.
 * @throws {z.ZodError} When the journey is not a row id or the layout is one no
 *   picker offers.
 */
export const addPage = guardedAction(async (session, form: FormData): Promise<void> => {
  const { journey, layout } = readNewPage(form)
  const scope = await adminScope(session)
  await addPageRow(await getPayload(), scope, journey, layout)
  revalidateEditor(journey)
})

/**
 * Copies a page into the place immediately after it, as a draft.
 *
 * @param session - The account the guard admitted.
 * @param form - The tool row's hidden `journey` and `page`.
 * @throws {z.ZodError} When either field names no row id.
 */
export const copyPage = guardedAction(async (session, form: FormData): Promise<void> => {
  const { journey, page } = readPageRef(form)
  const scope = await adminScope(session)
  await copyPageRow(await getPayload(), scope, page)
  revalidateEditor(journey)
})

/**
 * Removes a page — never the journey's last one.
 *
 * @param session - The account the guard admitted.
 * @param form - The tool row's hidden `journey` and `page`.
 * @throws {z.ZodError} When either field names no row id, and from
 *   `deletePageRow` when it is the journey's only page.
 */
export const deletePage = guardedAction(async (session, form: FormData): Promise<void> => {
  const { journey, page } = readPageRef(form)
  const scope = await adminScope(session)
  await deletePageRow(await getPayload(), scope, page)
  revalidateEditor(journey)
})

/**
 * Writes the journey's pages into the sequence an arrow produced.
 *
 * @param session - The account the guard admitted.
 * @param form - The arrow's `journey` and its whole `pages` sequence.
 * @throws {z.ZodError} When the sequence is empty, names one page twice, or
 *   holds something that is not a row id; and from `reorderPageRows` when it is
 *   not exactly this journey's pages.
 */
export const reorderPages = guardedAction(async (session, form: FormData): Promise<void> => {
  const { journey, pages } = readPageOrder(form)
  const scope = await adminScope(session)
  await reorderPageRows(await getPayload(), scope, journey, pages)
  revalidateEditor(journey)
})

/**
 * Writes the layout a glyph button was pressed on.
 *
 * @param session - The account the guard admitted.
 * @param form - The button's `journey`, `page` and `layout`.
 * @throws {z.ZodError} When any field is absent or outside its type.
 */
export const setPageLayout = guardedAction(async (session, form: FormData): Promise<void> => {
  const { journey, page, layout } = readPageLayoutRef(form)
  const scope = await adminScope(session)
  await setPageLayoutRow(await getPayload(), scope, page, layout)
  revalidateEditor(journey)
})

/**
 * Saves SCREENS.md §2.3's Notes pane as an unpublished draft.
 *
 * ONE ACTION FOR THE WHOLE PANE, INCLUDING ITS FOUR HIGHLIGHT CONTROLS. The
 * editor ships no client JavaScript, so "Add highlight", each `×` and each half
 * of a `::` grip is a submit button in the same `<form>` as the fields — each
 * posts an `op`, and `readNotes` applies it to the list the author has in front
 * of them. A control with an action of its own would have discarded everything
 * they had typed and not yet saved.
 *
 * @param session - The account the guard admitted; the scope is read from it.
 * @param form - Every field the pane holds, and the `op` of the button pressed.
 * @throws {z.ZodError} When the journey is not a row id, the glyph is one the
 *   book cannot draw, the accent is not a hex colour, the gallery address is not
 *   a slug, the operation is unrecognised, or either repeated list is the wrong
 *   length; and from Payload when the slug collides with another journey's.
 */
export const saveNotes = guardedAction(async (session, form: FormData): Promise<void> => {
  const { journey, notes } = readNotes(form)
  const scope = await adminScope(session)
  await writeNotesDraft(await getPayload(), scope, journey, notes)
  revalidateEditor(journey)
})
/* c8 ignore stop */
