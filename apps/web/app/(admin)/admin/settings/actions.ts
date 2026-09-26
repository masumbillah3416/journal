'use server'

/**
 * actions — SCREENS.md §2.9's three writes. Every export is built from
 * `guardedAction`, which is what a Server Action needs rather than a check it
 * could forget: an action is a POST endpoint of its own, dispatched before the
 * page around it renders, so the page's own guard has not run (SECURITY.md:
 * nothing inherits trust from the page it was reached from).
 *
 * NOTHING IS BUILT AT THE TOP LEVEL — `eslint-rules/guarded-server-actions.js`
 * rule 4 refuses a module that evaluates anything at load. Every decision
 * lives in `../../../../lib/admin/siteMutations.ts`, which an integration test
 * executes against a real Payload; this file is the guard, the wiring and the
 * cache hints.
 *
 * THE SCOPE IS HOISTED ONCE PER CALL and spread. `adminScope` reads the
 * account's row, so `...(await adminScope(session))` at each operation would
 * be one `users` lookup per operation — the N+1 CLAUDE.md §6 forbids.
 *
 * ═══ WHICH ADDRESSES EACH WRITE INVALIDATES, AND WHY ═══
 *
 * `settingsRevalidationRegistration.test.ts` holds the table and the
 * reasoning; it is a case rather than a comment because a decision taken
 * behind a `'use server'` module is a decision no Vitest project can execute.
 * This is the first screen in the phase whose writes change what the PUBLIC
 * diary serves, so the table reaches outside `/admin` for the first time.
 * Depends on: revalidatePath (next/cache), guardedAction
 * (../../../../lib/auth/guard), adminScope and the three writes
 * (../../../../lib/admin/…), getPayload (../../../../lib/payload).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: this file
 * names the guard factory and the writes it wraps. Every decision is
 * `guardedAction`'s (executed by `guard.integration.test.ts`) or
 * `siteMutations.ts`'s (executed by `siteMutations.integration.test.ts`,
 * gated at 100% by vitest.integration.config.ts). Neither Vitest project can
 * execute this file: a Server Action is dispatched by Next.js under an opaque
 * action id and needs a request context no test process has. The `c8 ignore`
 * is the treatment CLAUDE.md §2.1 asks for and the one every comparable file
 * here already carries; what CAN be observed of it is asserted by
 * `settingsRevalidationRegistration.test.ts`, which reads the addresses off
 * this source. Wraps the imports too: an unimported file's imports are
 * themselves uncovered lines. */
import { revalidatePath } from 'next/cache'
import { adminScope } from '../../../../lib/admin/adminScope'
import {
  readReaderToggle,
  readSiteForm,
  saveSite as writeSite,
  setReaderSetting as writeReaderSetting,
  takeBookOffline as writeBookOffline,
} from '../../../../lib/admin/siteMutations'
import { guardedAction } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'

/** This screen's own address, which every write here invalidates. */
const SETTINGS_PATH = '/admin/settings'

/**
 * The generated crawl policy, which reads `site.indexGalleries` per request.
 *
 * `app/robots.ts` is `force-dynamic`, so there is no prerendered artefact to
 * drop today — the call is REGISTERED rather than served differently, exactly
 * as `/p/<n>`'s is. What it buys the day this route is cached, by ISR or by a
 * CDN honouring it, is that the crawl policy stops being the one the author
 * changed ten minutes ago.
 */
const ROBOTS_PATH = '/robots.txt'

/**
 * Every gallery page, named by its route pattern rather than by a slug.
 *
 * `indexGalleries` changes the robots directive `generateMetadata` puts in
 * every gallery document, and `passwordProtect` changes whether the route
 * answers at all. Passing the PATTERN with the `page` type is Next.js's own
 * spelling for "every page of this dynamic route".
 */
const GALLERY_PATTERN = '/gallery/[slug]'

/**
 * Every page of the book, by pattern, and the mobile surface's own entry.
 *
 * Both matter and for one reason: `passwordProtect` is read by BOTH route
 * entries (ADR 0012), so a write that closed the book and invalidated only one
 * of them would leave the other serving a cached render of a book that is
 * supposed to be shut.
 */
const BOOK_PATTERN = '/p/[n]'

/** The mobile surface's route entry. See {@link BOOK_PATTERN}. */
const MOBILE_PATTERN = '/m/[n]'

/**
 * Writes SCREENS.md §2.9's four site fields.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param form - The Site card's whole form body.
 * @returns Nothing. The screen asks for the page again rather than being told.
 */
export const saveSite = guardedAction(async (session, form: FormData): Promise<void> => {
  await writeSite(await getPayload(), await adminScope(session), readSiteForm(form))
  revalidatePath(SETTINGS_PATH)
  // THE MASTHEAD IS ON EVERY ADMIN SCREEN. `AdminShell` prints `site.name`,
  // which this write changes, so the rail on every other screen is stale
  // without this — the route group's layout is not a cache key of its own.
  revalidatePath('/admin', 'layout')
})

/**
 * Writes one reader setting.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param form - The toggle's own form body: the column and the value.
 * @returns Nothing.
 */
export const setReaderSetting = guardedAction(async (session, form: FormData): Promise<void> => {
  await writeReaderSetting(await getPayload(), await adminScope(session), readReaderToggle(form))
  revalidatePath(SETTINGS_PATH)
  // EVERY PUBLIC ADDRESS THE FIVE SETTINGS REACH. One action writes any of
  // them, so it invalidates all of them rather than reading the column back to
  // decide — a cache hint that had to ask which setting changed would be a
  // second place the mapping lives.
  revalidatePath(ROBOTS_PATH)
  revalidatePath(GALLERY_PATTERN, 'page')
  revalidatePath(BOOK_PATTERN, 'page')
  revalidatePath(MOBILE_PATTERN, 'page')
})

/**
 * Closes the whole book to readers, from §2.9's "Careful now" block.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @returns Nothing.
 */
export const takeBookOffline = guardedAction(async (session): Promise<void> => {
  await writeBookOffline(await getPayload(), await adminScope(session))
  revalidatePath(SETTINGS_PATH)
  // THE SAME FOUR PUBLIC ADDRESSES, because this writes the same column the
  // fourth toggle writes (docs/deviations.md §102). `/robots.txt` is among
  // them deliberately: it does not read `passwordProtect` today, and a
  // divergence between these two lists would be a second decision about which
  // addresses a site setting reaches.
  revalidatePath(ROBOTS_PATH)
  revalidatePath(GALLERY_PATTERN, 'page')
  revalidatePath(BOOK_PATTERN, 'page')
  revalidatePath(MOBILE_PATTERN, 'page')
})
/* c8 ignore stop */
