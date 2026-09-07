/**
 * readSignInScreen — everything the sign-in screen needs from the server, in
 * two queries.
 *
 * Repository pattern (CLAUDE.md §3.3): the screen never learns what a Payload
 * row or global looks like. It receives {@link SignInScreenContent} - four
 * definite values - and this module is the only place that maps a `book`
 * global and a `users` row onto them.
 *
 * ═══ THE FOOTER LINE IS WHY THIS MODULE EXISTS ═══
 *
 * `SCREENS.md` §3.1 ends the password step with "a rule and a footer line
 * with a 9px mark stating whether the code step is on". `SECURITY.md`'s
 * second prototype hole is exactly that statement's source: the handoff's
 * prototype read it from `localStorage['om-diary-otp']`, "where anyone can
 * set it to `0` and skip the second factor entirely". The required fix is
 * that the flag is `users.otpRequired`, read on the server. So the screen
 * gets it from here, before it is rendered, and the client is never asked -
 * there is no browser-storage read for it anywhere in this application, and
 * `e2e/signIn.spec.ts` asserts that against the delivered page rather than
 * against this comment.
 *
 * `NULL` READS AS REQUIRED, and so does an empty table. `users.otp_required`
 * is nullable, so a row written before the column's `defaultValue: true` is
 * `NULL`, and this database's `users` table is genuinely empty today (nothing
 * seeds an account). Both must fail CLOSED: a screen that told a reader the
 * second factor was off, because a column had never been written, would be
 * describing the opposite of what `signIn.ts` will actually do - it applies
 * the same `!== false` test to the same column.
 *
 * THE ACCOUNT IS THE LOWEST-ID ONE, and that is sound only because this
 * product has one. `apps/web/collections/users.ts` is "the diary's single
 * author account"; `SECURITY.md`'s threat model opens "One author, no visitor
 * accounts". The footer is printed before a reader has typed an address, so
 * there is no account to key it by - the alternative would be to withhold the
 * line SCREENS.md specifies, or to reveal per-address whether an account
 * exists, which is the enumeration `signIn.ts` spends a whole PBKDF2
 * derivation to prevent. INVARIANT: if this product ever grows a second
 * account, this line has to move behind the address the reader typed, and
 * this read has to move with it.
 *
 * WHAT THE LINE DISCLOSES, DELIBERATELY. An unauthenticated visitor learns
 * whether the owner's account asks for a second factor. That is what
 * SCREENS.md asks the screen to say, on the pre-address step, and the
 * disclosure is bounded: it names no account, and knowing the step is on
 * helps nobody past it.
 *
 * Depends on: `getPayload` (../payload), `cache` (react).
 */
import { cache } from 'react'
import { getPayload } from '../payload'

/** What the sign-in screen prints, already narrowed to definite values. */
export interface SignInScreenContent {
  /** The book's name, printed on the cloth panel and the narrow masthead. */
  readonly title: string
  /** The italic line under the cloth panel's title. */
  readonly subtitle: string
  /** The cover cloth colour both cloth blocks are painted in. */
  readonly coverCloth: string
  /**
   * Whether the one-time-code step runs after the password, as
   * `users.otpRequired` says - never as a browser told us. `true` when there
   * is no account, and when the column is `NULL`.
   */
  readonly codeStepRequired: boolean
}

/**
 * The cloth colour used when the `book` global has none.
 *
 * `coverCloth` is not `required: true`, so an editor can clear it, and an
 * empty string would paint the panel with a gradient that has no colour in
 * it. The handoff's default cloth is the first entry of `coverCloths`
 * (`@travel-diary/tokens/colour`); it is not imported here because this
 * module maps rows to strings and owns no design values - the stylesheet
 * carries the same default for the same reason, and `signIn.module.css` says
 * so at the rule.
 */
const FALLBACK_COVER_CLOTH = '#2f4a47'

/**
 * Reads the sign-in screen's content: the book's cover fields, and whether
 * the code step is on.
 *
 * Wrapped in React's `cache` so a request that renders the screen and asks
 * for its metadata costs two Payload queries between them rather than four -
 * the same reason `readBookBundle` is.
 *
 * @returns The four values in {@link SignInScreenContent}. Never throws for
 *   absent content: an unset title, subtitle or cloth degrades to a definite
 *   value, and an absent account degrades to "the code step is on".
 * @example
 * const { title, codeStepRequired } = await readSignInScreen()
 */
export const readSignInScreen = cache(async (): Promise<SignInScreenContent> => {
  const payload = await getPayload()

  const book = await payload.findGlobal({
    slug: 'book',
    depth: 0,
    select: { title: true, subtitle: true, coverCloth: true },
  })

  const accounts = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    pagination: false,
    // Ascending row id: the one account, and a deterministic answer rather
    // than whichever row Postgres happened to return first.
    sort: 'id',
    select: { otpRequired: true },
  })
  const account = accounts.docs[0]

  return {
    title: book.title ?? '',
    subtitle: book.subtitle ?? '',
    coverCloth: book.coverCloth ?? FALLBACK_COVER_CLOTH,
    // `!== false`, never `=== true` - see this module's header. `undefined`
    // (no account, or a NULL column) and `true` both mean the step runs.
    codeStepRequired: account?.otpRequired !== false,
  }
})
