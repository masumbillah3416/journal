/**
 * formRefusal — how a Server Action's Zod refusal reaches the screen that
 * posted it, with what the author typed still in the form.
 *
 * `docs/deviations.md` §104 is the defect this closes: every admin form parses
 * its body with Zod (CLAUDE.md §3.1) and, until this module, nothing stood
 * between the author and the throw — so a reply-to of `not-an-address`
 * answered HTTP 500, showed Next's error overlay and lost everything typed.
 *
 * ═══ THE CARRIER IS A COOKIE THAT THE BROWSER IS TOLD TO DISCARD ═══
 *
 * A Server Action cannot hand a value to the render that follows it: these
 * screens hold no client state (`shellShipsNoClientJs.test.ts`), so there is no
 * `useActionState` to receive a returned refusal. What a Server Action CAN do
 * is write a cookie, and three things about that were measured in Chromium
 * against this app rather than assumed:
 *
 *   1 · A cookie set inside the action is readable by the render that follows
 *       it IN THE SAME REQUEST — both by the page and by a layout above it.
 *   2 · It is readable with JavaScript disabled too, where the action's `POST`
 *       is answered with the re-rendered document (`POST 200`).
 *   3 · With `maxAge: 0` the browser never stores it, so nothing is sent back
 *       on the next request and no later screen can pick up a stale refusal.
 *       The value is still readable above, because the render reads the
 *       REQUEST-SCOPED store rather than the browser's jar.
 *
 * So the refusal is one-shot by construction rather than by an expiry, a nonce
 * or a query parameter, and the author's address bar does not change.
 *
 * WHY NOT A REDIRECT WITH THE REFUSAL IN THE QUERY, which is what
 * `changePassword` does for its own notice. Measured: `redirect()` from a
 * Server Action answers `303` with JavaScript off and `200` with a client-side
 * navigation with it on — so `guard.ts`'s `307`-and-re-post warning, which is
 * about a `POST` ROUTE HANDLER, does not apply here and a redirect would have
 * been safe. It was not taken because the typed values have to survive: a
 * query that carried two paragraphs of About prose is a URL in the author's
 * history and a `414` waiting for a long enough entry.
 *
 * ═══ WHICH VALUES ARE KEPT IS THE FORM'S OWN ALLOWLIST ═══
 *
 * {@link KEPT_FIELDS_NAME} is a hidden field naming the fields whose values may
 * travel back. Nothing else does, and that is the direction it has to refuse
 * in: a Server Action's body is whatever was posted to it, and
 * `changePassword`'s body is two passwords. A denylist would have to recognise
 * every secret anybody ever adds to a form (standing orders §6); this
 * recognises what a card has declared it wants back, and drops the rest.
 *
 * WHY THIS MODULE HOLDS NO REQUEST AND NO ZOD AT RUNTIME. The carrier is
 * `./formRefusalFlash.ts`, which is the half that touches `next/headers` and
 * the half that parses what comes back; everything here is a function of its
 * arguments and its only `zod` import is a type. That is what lets
 * `CreatePanel.tsx` — a client island — import {@link KEPT_FIELDS_NAME} and
 * {@link keptValue} without putting `next/headers` or a schema library into
 * the admin's 320KB budget (CLAUDE.md §6).
 *
 * PATTERNS (CLAUDE.md §3.3). Data transfer object: {@link FormRefusal} is the
 * posted body reduced to the two things a screen can draw, and it crosses a
 * boundary — the action writes it, a later render reads it — as data with no
 * behaviour attached.
 *
 * INVARIANT — nothing here keeps a value the posting form did not name in
 * {@link KEPT_FIELDS_NAME}, and nothing here logs (CLAUDE.md §7).
 *
 * Depends on: zod (types only).
 */
import type { z } from 'zod'

/**
 * The hidden field a form uses to name the values it wants back.
 *
 * One field, repeated once per name, rather than one space-separated value: a
 * field name may hold anything, and splitting a joined string would invent a
 * boundary the browser never sent.
 */
export const KEPT_FIELDS_NAME = 'refusalKeeps'

/** One thing that was wrong, as a screen can print it. */
export interface RefusedField {
  /** The posted field it is about, or `''` when the refusal is the body's. */
  readonly field: string
  /** What Zod said, which is what the author reads. */
  readonly message: string
}

/** A refused post, reduced to what a screen can draw. */
export interface FormRefusal {
  /** Every refusal in the body, in the order Zod reported them. */
  readonly refused: readonly RefusedField[]
  /** What was typed, for the fields the form asked to keep. */
  readonly kept: Readonly<Record<string, readonly string[]>>
}

/**
 * The names a posted body asked to have kept.
 *
 * @param form - The body the browser posted.
 * @returns The field names, with anything that is not a string dropped.
 */
const keptFieldsOf = (form: FormData): readonly string[] =>
  form.getAll(KEPT_FIELDS_NAME).flatMap((value) => (typeof value === 'string' ? [value] : []))

/**
 * Turns a Zod refusal and the body that caused it into what a screen draws.
 *
 * @param error - The refusal the parse threw.
 * @param form - The body that was posted.
 * @returns The messages, and the values the form asked to keep.
 * @example
 * refusalFrom(error, form) // { refused: [{ field: 'replyTo', … }], kept: { … } }
 */
export const refusalFrom = (error: z.ZodError, form: FormData): FormRefusal => ({
  refused: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
  // `Object.fromEntries` RATHER THAN ASSIGNING INTO A LITERAL, because the keys
  // are the posted body's. `kept[name] = …` with a `name` of `__proto__` calls
  // the inherited setter and changes the object's prototype instead of storing
  // anything; `fromEntries` defines an own property for every key, including
  // that one.
  kept: Object.fromEntries(
    keptFieldsOf(form).map((name) => [
      name,
      form.getAll(name).flatMap((value) => (typeof value === 'string' ? [value] : [])),
    ]),
  ),
})

/**
 * What the author typed in one field, or what the database holds.
 *
 * @param refusal - This render's refusal, or `null`.
 * @param field - The field's name.
 * @param stored - What to draw when the post was not refused.
 * @returns The value to put in the box.
 * @example
 * <input name="replyTo" defaultValue={keptValue(refusal, 'replyTo', about.replyTo)} />
 */
export const keptValue = (refusal: FormRefusal | null, field: string, stored: string): string =>
  refusal?.kept[field]?.[0] ?? stored

/**
 * What the author typed in a repeated field, or what the database holds.
 *
 * SEPARATE FROM {@link keptValue} BECAUSE AN EMPTY LIST IS AN ANSWER. A card
 * that repeats a field (the About card's paragraphs and kit) posts zero or more
 * values, and `?? stored` on the first of them would redraw the stored list for
 * an author who had just cleared every line.
 * @param refusal - This render's refusal, or `null`.
 * @param field - The field's name.
 * @param stored - What to draw when the post was not refused.
 * @returns The values to put in the boxes.
 * @example
 * keptValues(refusal, 'paragraph', about.paragraphs)
 */
export const keptValues = (refusal: FormRefusal | null, field: string, stored: readonly string[]): readonly string[] =>
  refusal?.kept[field] ?? stored
