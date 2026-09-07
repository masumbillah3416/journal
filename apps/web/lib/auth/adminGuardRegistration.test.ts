/**
 * adminGuardRegistration.test.ts — nothing that answers at an `/admin` address
 * can mutate without applying the guard in its own file.
 *
 * ═══ WHY THIS FILE EXISTS ═══
 *
 * `SECURITY.md`: "Check authorization on **every mutation**, not just at
 * login... nothing inherits trust from the page it was reached from." Phase 4
 * builds ten screens of mutations. A guard that each of those screens has to
 * remember to call is a guard one of them will not call, and the failure is
 * invisible in every other way this repository checks its work: the screen
 * renders, its tests pass, its visual baseline matches, and it is open to
 * anybody who types the address.
 *
 * The layer that would make forgetting impossible does not exist here, and the
 * reasons are written down where they belong — `apps/web/middleware.ts` runs
 * in the Edge runtime and cannot read a `sessions` row, and a shared layout
 * cannot cover `/admin/sign-in/done` without also covering the sign-in screens
 * beside it, which must answer to a reader who has no session. So the thing
 * that stands in for that layer is this test, and it fails on the commit that
 * forgets rather than on the day somebody notices. Not "makes forgetting
 * impossible", which is what this said for six rounds: it is a check, checks
 * have been defeated here nine times, and what it does is written in the
 * indicative below with each defeat that shaped it named.
 *
 * ═══ IT HAS NOW CREDITED THE WRONG THING FIVE TIMES, SO IT IS BUILT
 *     DIFFERENTLY ═══
 *
 * Four of the five were caught in the phase that wrote it, and the fifth was a
 * set of three found by the whole-branch review:
 *
 *   1. It matched the guard's NAME anywhere in the file, so the `import` line
 *      and the header comment satisfied it.
 *   2. It stripped those and required a `(` — and followed the route file's
 *      imports one level, so `guard.ts`'s own body credited every file that
 *      imported it.
 *   3. It stopped following `guard.ts` — and still credited a route for ANY
 *      module it imported, so a guarded route re-exporting any handler from
 *      `signInEndpoints.ts` passed, because that module holds several and one
 *      of them called the guard. Ruling F61 removed the following entirely.
 *   4. It read only `page.tsx` and `route.ts`, under a HARD-CODED
 *      `app/(admin)/admin`. So a Server Action in an `actions.ts` was never
 *      read at all — and `docs/api.md` says Phase 4's mutations will be server
 *      actions; an action defined INSIDE a scanned `page.tsx` satisfied the
 *      regex on the strength of the page component's own guard call, while
 *      being dispatched as a separate `POST` BEFORE the page renders; and a
 *      route under a second route group (`app/(panel)/admin/…`, which Next
 *      serves at the same address) was invisible to the walk.
 *
 * PATCHING THOSE THREE WOULD HAVE MADE A SIXTH INEVITABLE. Every version so
 * far has been an ENUMERATION — of file names, of directories, of the shapes
 * an author might use — and an enumeration is wrong the moment somebody uses a
 * shape nobody listed. This one is built the other way round, in four rules:
 *
 *   **A · Discover, do not enumerate.** The walk covers the whole `app/` tree
 *   and computes each file's address the way Next.js does, so a route group
 *   nobody has invented yet contributes nothing to the address and is seen.
 *
 *   **B · Fail closed on a file whose kind is not recognised.** Every file
 *   sitting under an admin address must be classified: a route file, a Server
 *   Action module, or one of the Next.js conventions in
 *   {@link NON_SERVABLE_FILES}, each listed with the reason it cannot answer a
 *   request. Anything else FAILS, naming the file. A new framework convention,
 *   a `.mdx` page, an extension nobody here has seen — none of them passes
 *   unseen; the suite stops and somebody decides.
 *
 *   **C · Server Actions are NOT this file's business, and that is round 5's
 *   correction.** They were, for one round: this file walked three named
 *   directories for a `'use server'` prologue and split each module's text at
 *   `/^export\s+(?:const|(?:async\s+)?function)/` to check its exports. It was
 *   defeated five times in five attempts — by a module in a fourth directory
 *   (`apps/web/actions/`), by `export default async function`, by
 *   `export { name }`, by `export default name`, and by a single space before
 *   the word `export`. Meanwhile three documents had been rewritten to promise
 *   "every export of every `'use server'` module in `apps/web`", which the scan
 *   never did: B3's species again, with the claim growing while the code stood
 *   still.
 *
 *   The fix is not a tenth pattern. "Every export of every module" is not a
 *   sentence text matching can express, so it is written where the exports are
 *   already parsed: `eslint-rules/guarded-server-actions.js`, an ESLint rule
 *   over the AST, running on every file `npm run lint` visits. The shape it
 *   admits leaves an action nothing to forget — `guardedAction()`
 *   (`apps/web/lib/auth/guard.ts`) calls the guard and then the action, and
 *   `guard.integration.test.ts` executes that rather than matching two
 *   substrings over `guard.ts`'s text, which is all that stood over it until
 *   round 9. "Cannot be got wrong" is what this sentence used to say, and it
 *   is the species of claim six whole-branch reviews have each falsified: what
 *   the rule does NOT report is enumerated by
 *   {@link SHAPES_THAT_GET_THROUGH} below rather than denied here. What THIS
 *   file keeps is the questions about that arrangement which are not about a
 *   syntax tree: is the rule still switched on, has anybody switched it off
 *   for a file, and is anything rewriting a file before the rule sees it.
 *
 * ═══ HOW IT DECIDES, FOR THE FILES IT DOES RECOGNISE ═══
 *
 * A route file at a guarded address must satisfy one of two things —
 *
 *   1. `adminAccess.ts` declares its address public (`ADMIN_PUBLIC_PATHS`, or
 *      the reset link's own shape), which is a deliberate, reviewable statement
 *      that the address answers to anybody; or
 *   2. the file APPLIES the guard in its own body — `guarded(handler)` for a
 *      route, `requireAdminSession()` for a page. Nothing it imports is read:
 *      see {@link GUARD_APPLICATIONS}.
 *
 * THE SENTINELS ARE NOT DECORATION. A scan that walked the wrong directory, or
 * whose path arithmetic was off by a segment, would find nothing and pass with
 * every screen unguarded. So the first cases assert the walk found the
 * addresses this repository is known to mount, by name, and that each new rule
 * can actually FAIL, before anything is concluded from any of them.
 *
 * Depends on: node:fs, node:path, node:url, vitest, ./adminAccess.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isGuardedAdminPath } from './adminAccess'

/** apps/web/lib/auth -> apps/web. */
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * The whole Next.js app directory, walked from its root.
 *
 * NOT `app/(admin)/admin`, which is what the previous version read. Next.js
 * serves `app/(panel)/admin/journeys/route.ts` at `/admin/journeys` — route
 * groups contribute no path segment — so a second group is a mutation endpoint
 * at a guarded address that a walk rooted inside the first group cannot see.
 * Rooting at `app/` means the walk cannot be escaped by naming a directory.
 */
const APP_DIRECTORY = 'app'

/** The prefix an address must carry to be this file's business. */
const ADMIN_PREFIX = '/admin'

/**
 * The file names Next.js serves an address from.
 *
 * Every extension Next.js accepts for each, not just the two this repository
 * happens to use: a `route.js` added tomorrow is the same endpoint as a
 * `route.ts`, and a scan that knew only about `.ts` would treat it as an
 * unrecognised file. Rule B would then fail rather than pass it, which is the
 * safe direction — but failing for the wrong reason teaches an author to widen
 * the wrong list.
 */
const ROUTE_FILE_NAMES: readonly string[] = [
  'page.tsx',
  'page.ts',
  'page.jsx',
  'page.js',
  'route.ts',
  'route.tsx',
  'route.js',
  'route.mjs',
]

/**
 * Files that may sit under an admin address without answering a request, each
 * with the reason it cannot.
 *
 * THIS LIST IS THE WHOLE OF RULE B, so it is written as reasons rather than as
 * a pattern. Anything under an admin address that is neither a route file, nor
 * a Server Action module, nor one of these, fails the suite by name — which is
 * what stops a convention nobody here has heard of from being served unseen.
 *
 * - `layout.tsx`/`template.tsx` wrap a page and answer no request of their own;
 *   the page inside them is scanned on its own terms, which is the point of
 *   `SECURITY.md`'s "nothing inherits trust from the page it was reached from".
 * - `not-found.tsx`, `loading.tsx`, `error.tsx`, `global-error.tsx` are
 *   rendered in place of a page rather than fetched, and none mutates.
 * - `*.module.css` is a stylesheet.
 * - `*.test.ts`/`*.test.tsx` are this repository's own tests, never shipped.
 */
const NON_SERVABLE_FILES: readonly { readonly matches: (name: string) => boolean; readonly because: string }[] = [
  { matches: (name) => name === 'layout.tsx', because: 'a layout wraps a page and answers no request of its own' },
  { matches: (name) => name === 'template.tsx', because: 'a template wraps a page and answers no request of its own' },
  { matches: (name) => name === 'not-found.tsx', because: 'rendered in place of a page, never fetched' },
  { matches: (name) => name === 'loading.tsx', because: 'rendered in place of a page, never fetched' },
  { matches: (name) => name === 'error.tsx', because: 'rendered in place of a page, never fetched' },
  { matches: (name) => name === 'global-error.tsx', because: 'rendered in place of a page, never fetched' },
  { matches: (name) => name.endsWith('.module.css'), because: 'a stylesheet' },
  { matches: (name) => name.endsWith('.test.ts') || name.endsWith('.test.tsx'), because: 'a test, never shipped' },
]

/**
 * The files permitted to carry an ESLint disable directive for the Server
 * Action rule, by exact path.
 *
 * DEFAULT-DENY, the same way `ADMIN_PUBLIC_PATHS` is, and for the same reason:
 * a disable comment switches `eslint-rules/guarded-server-actions.js` off for
 * a file, and that should be a decision somebody made rather than a line
 * somebody added. A second entry here is a diff a reviewer sees.
 *
 * IT IS NOT THE ONLY THING THAT DEFEATS THE RULE, which is what this comment
 * and `docs/adr/0018` both used to say. An inline `eslint <rule>: off`
 * severity comment does (round 8, keyed by
 * {@link FILES_PERMITTED_TO_NAME_THE_RULE}); a flat-config `processor` that
 * strips the directive prologue does, with all three disable keys blind at
 * once (round 9, keyed by "lets no processor strip the directive"); and two
 * shapes do so with no comment of any kind
 * ({@link SHAPES_THAT_GET_THROUGH}). What is true of a disable comment is
 * that it is the off switch this repository ALLOWS, for the files below.
 *
 * The one entry is Payload's own Server Action dispatcher. `RootLayout`
 * requires it and its directive has to sit inside a function, because Payload's
 * type is a function rather than a module. It is not ours to guard:
 * `handleServerFunctions` authenticates against the `payload-token` cookie and
 * runs Payload's own access control, and wrapping it in `guardedAction` would
 * demand a `td-session` Payload knows nothing about. Since
 * `apps/web/collections/sealedUserAuth.ts` sealed every endpoint that could
 * mint a `payload-token`, its reachable surface is what Payload grants an
 * anonymous request — the same surface `/api/**` already exposes.
 */
const ACTIONS_RULE_EXEMPT_FILES: readonly string[] = ['apps/web/app/(payload)/layout.tsx']

/**
 * The files permitted to NAME the Server Action rule, by exact path.
 *
 * ═══ A SECOND LIST BECAUSE A DISABLE DIRECTIVE IS NOT THE ONLY INLINE OFF
 *     SWITCH (ROUND 8) ═══
 *
 * ESLint also honours an inline CONFIGURATION comment — a block comment whose
 * body reads `eslint <rule>: off`. It sets a severity rather than suppressing
 * a report, so it carries no disable directive at all and produces no
 * suppressed message for anything to find. Measured, on a mountable unguarded
 * `'use server'` module at `apps/web/lib/journeys/actions.ts`: `eslint .` exit
 * 0 and the guard suite green. It is my own shape, found while attacking the
 * fix to the disable hole this round exists for.
 *
 * What such a comment MUST spell is the rule's own id, so that is what is
 * enumerated — across the whole repository rather than only the modules
 * carrying the directive, because a module can hide the directive from a byte
 * scan (an escaped `'use\u0020server'`) and still be judged by this rule.
 *
 * Two entries, and neither is a module Next.js can mount: `eslint.config.js`
 * is where the rule is registered, and `layout.tsx` is the one exempt file,
 * whose disable directive names it. This file is not among them because it
 * assembles the id from its halves — see {@link ACTIONS_RULE}, and
 * `apps/web/lib/auth/overrideAccessSites.test.ts` for what the alternative
 * cost: a scan that excused itself by exact path, and a document that then
 * listed "other occurrences" with a file missing.
 */
const FILES_PERMITTED_TO_NAME_THE_RULE: readonly string[] = ['eslint.config.js', 'apps/web/app/(payload)/layout.tsx']

/**
 * Hypothetical action modules, at every extension and in directories nobody
 * named — the paths two cases below ask ESLint about.
 *
 * `calculateConfigForFile` answers for a path whose file does not exist, so
 * these fail when a gap is INTRODUCED rather than when somebody first exploits
 * one. The extensions are Next.js's default `pageExtensions` (`tsx, ts, jsx,
 * js`, and `apps/web/next.config.ts` overrides none of them) plus the four
 * module extensions its compiler also accepts. THAT IS A LIST, and a list is
 * what the nine defeats taught us not to trust — which is why the coverage
 * case beside them consults no list and walks git's own listing instead.
 *
 * Shared by two cases rather than written twice: the rule must be at `error`
 * for every one of these, and none of them may be given a `processor`.
 */
const ACTION_PATH_PROBES: readonly string[] = [
  'apps/web/app/(admin)/admin/journeys/actions.ts',
  'apps/web/app/(admin)/admin/journeys/actions.tsx',
  'apps/web/app/(admin)/admin/journeys/actions.js',
  'apps/web/app/(admin)/admin/journeys/actions.jsx',
  'apps/web/app/(admin)/admin/journeys/actions.mjs',
  'apps/web/app/(admin)/admin/journeys/actions.cjs',
  'apps/web/app/(admin)/admin/journeys/actions.mts',
  'apps/web/app/(admin)/admin/journeys/actions.cts',
  // Directories no `files` array in this repository names, and one of them is
  // where two of the three round-6 defeats were written.
  'apps/web/actions/journeys.ts',
  'apps/web/globals/journeyActions.ts',
  'packages/domain/src/journeyActions.ts',
  'actions.ts',
  // Where the sixth review's `processor` attack put its module, and round 9's
  // own re-run of it.
  'apps/web/lib/journeys/actions.ts',
]

/** Splits a file into lines, whichever line ending it was written with. */
const NEWLINE = /\r?\n/u

/** One line break, spelled rather than written, for the reason {@link NUL_SEPARATOR} gives. */
const LINE_BREAK = String.fromCharCode(10)

/**
 * A line break with its indentation and any continuation marker, as one match.
 *
 * The markers are the ones a WRAPPED SENTENCE carries in this repository's own
 * file types: ` * ` opening the next line of a block comment, `//` opening the
 * next line of a line comment, `>` opening the next line of a Markdown quote,
 * and `#` opening the next line of a shell or YAML comment. `*\/` is excluded
 * so the end of a block comment is not eaten as a continuation of it.
 *
 * WHY IT EXISTS. A scan for a sentence in a source file is a scan over text a
 * human wrapped, and `\s+` matches the line break but not the ` * ` after it. The
 * seventh whole-branch review defeated this file's F76 case with exactly that:
 * the sentence it refuses, split across two lines of a block comment, in one
 * of the files it reads. Flattening first is what makes the scan read what a
 * reader reads rather than what a line happens to hold.
 */
const WRAPPED_LINE = /\r?\n[ \t]*(?:\*(?!\/)|\/\/+|>+|#+)?[ \t]*/gu

/**
 * One text with its line wrapping flattened to single spaces.
 *
 * @param text - The file's contents, or a sentinel string.
 * @returns The same text with every {@link WRAPPED_LINE} replaced by one space,
 *   so a sentence a human wrapped reads as the sentence they wrote.
 */
const unwrapped = (text: string): string => text.replace(WRAPPED_LINE, ' ')

/**
 * The one file allowed to spell the sentence the F76 case refuses.
 *
 * This one: the case's sentinels have to contain the sentence in order to
 * prove the regex matches it, and a scan over every file the repository holds
 * reads this file too. Named exactly, never by a `*.test.ts` pattern - a
 * pattern would also excuse a count written into any other test file, and the
 * whole defect being closed here is a sentence at an address nobody listed.
 */
const FILE_PERMITTED_TO_SPELL_THE_SENTENCE = 'apps/web/lib/auth/adminGuardRegistration.test.ts'

/**
 * The rule that makes an unguarded Server Action a lint error.
 *
 * ASSEMBLED FROM ITS HALVES, WHICH IS LOAD-BEARING. This file scans the
 * repository for files naming this rule; written as one literal, the scanner
 * would be its own first match and would need an entry in its own allowlist —
 * the shape `overrideAccessSites.test.ts` took with `OWN_PATH`, where the
 * fifth whole-branch review found a list of "other occurrences" that omitted a
 * file precisely because the pin excluded itself.
 */
const ACTIONS_RULE = ['travel-diary', 'guarded-server-actions'].join('/')

/**
 * The substring every inline ESLint disable directive spells.
 *
 * Assembled for the same reason as {@link ACTIONS_RULE}: a scan whose needle
 * is written out is a scan that finds itself. Every spelling of the directive
 * contains it — the bare form, the `-line` and `-next-line` forms, in a block
 * comment or a line comment, with the rule id after it, with the rule id on
 * the NEXT line, or with no rule id at all. That last freedom is the point:
 * the fifth whole-branch review's blocker was a check that required one LINE
 * to carry both this and the rule id, and two spellings satisfying ESLint
 * satisfied neither half of it.
 */
const DISABLE_DIRECTIVE = ['eslint', 'disable'].join('-')

/**
 * The shapes KNOWN to get through both mechanisms, with the measurement.
 *
 * ═══ WHY THE LIST IS HERE AND NOT IN THE DOCUMENTS (RULING F76) ═══
 *
 * It was in the documents: seven sites said "TWO shapes get through", and by
 * the fifth whole-branch review there were four — two of which could be
 * committed with `npm run verify` at exit 0. That is the fifth consecutive
 * round in which a count written in prose drifted from the code, and a number
 * a human retypes in seven places will be wrong again. So the count is not
 * written anywhere: the documents send a reader HERE, the case below fails if
 * one of them stops pointing at this array or starts restating the sentence,
 * and the number is whatever this array's length is on the day somebody asks.
 *
 * ═══ WHAT THIS ARRAY CANNOT DO, WHICH ROUND 8 LEFT UNSAID ═══
 *
 * F76 made the POINTER structural and the CONTENTS trustworthy only by
 * convention, and the ledger's summary of it — "that is the count made
 * structural" — was half true. The sixth whole-branch review proved the other
 * half both ways: it DELETED the committable row and the suite went 21
 * passing, `eslint .` exit 0, prettier clean; and it wrote a live committable
 * survivor with no row here at all and the same suite went 24 passing. Nothing
 * tied a row to anything measurable.
 *
 * Round 9 pins what CAN be pinned and says plainly what cannot:
 *
 *   - **A ROW CANNOT BE STALE.** Each `demonstration` marked `'linted'`
 *     carries the module text, and the case "demonstrates every shape it says
 *     gets through" hands it to ESLint at a real config path and requires this
 *     rule to report NOTHING. So a shape that a later round CLOSES fails here
 *     on the commit that closes it, and has to be removed or corrected rather
 *     than left standing as a survivor that no longer survives.
 *   - **A ROW THAT NOTHING HERE CAN RUN SAYS SO, IN THE ROW.** The alternative
 *     `demonstration` is `'nothing here can run it'` with the reason. That is
 *     a disclosure, not a pin, and it is written where a reader meets the row.
 *   - **A ROW CANNOT BE REMOVED SILENTLY.** The length is asserted, the way
 *     `eslint-rules/guarded-server-actions.test.js` asserts its own case
 *     count, so deleting a row is a two-line diff that says what it did. That
 *     is the most a test can do about an absence, and it is not much: it makes
 *     a deletion visible, not impossible.
 *   - **A MISSING ROW STILL PROVES NOTHING, AND NO TEST CAN CHANGE THAT.**
 *     Enumerating what gets through means knowing what gets through; a shape
 *     nobody has thought of has no row, and this array does not learn about a
 *     shape by the shape existing. Read it as "the shapes we know about",
 *     never as "the shapes there are".
 *
 * WHAT AN ENTRY MEANS. Each of these leaves `eslint .` at exit 0 and this
 * suite green. `committable` is the second half a reader needs and the half
 * the fourth review asked for: shape one cannot reach a commit, because the
 * pre-commit hook runs this suite against `git ls-files --cached` and
 * `git add -f` puts the file back in that listing; shape two can.
 *
 * Neither is caught rather than stated, and both refusals are decisions:
 * catching the codegen shape means deciding whether an arbitrary string
 * expression evaluates to `'use server'`, which no scan and no rule can do,
 * and the honest alternative is a check over `next build`'s output, which
 * `npm run verify` does not have.
 */
const SHAPES_THAT_GET_THROUGH: readonly {
  /** What somebody would have to write. */
  readonly shape: string
  /** Whether the pre-commit gate lets it reach a commit. */
  readonly committable: boolean
  /** What was measured, on the tree that shipped it. */
  readonly measurement: string
  /**
   * How this suite checks the row is still true — or why it cannot.
   *
   * `'linted'` carries a module this suite hands to ESLint at `at`, requiring
   * this rule to report nothing. `'nothing here can run it'` carries the
   * reason instead, and is a disclosure rather than a pin.
   */
  readonly demonstration:
    | { readonly kind: 'linted'; readonly at: string; readonly source: string }
    | { readonly kind: 'nothing here can run it'; readonly because: string }
}[] = [
  {
    shape:
      'A disable directive for this rule in a module a `.gitignore` line also hides, which blinds the rule and hides the file from the git listing every scan here reads.',
    committable: false,
    measurement:
      '`eslint .` exit 0 and this suite green while the file is hidden; `git ls-files --others --exclude-standard` does not list it; `git add` refuses it ("ignored by one of your .gitignore files"); `git add -f` puts it into `--cached`, which is a listing every scan here reads, and the pre-commit hook then fails with HEAD unmoved.',
    demonstration: {
      kind: 'linted',
      // The repository ROOT, because it is a path no `files`-scoped block gives
      // typescript-eslint's `projectService` — which would answer "not found in
      // any project" for a file that does not exist and fail the parse rather
      // than the rule. The rule itself is unscoped, so it judges this path
      // exactly as it judges an action module inside `app/`; the case
      // "has the rule at error for every extension Next.js serves" already
      // probes this same path for that reason.
      at: 'actions.ts',
      source: [
        `/* ${DISABLE_DIRECTIVE} */`,
        "'use server'",
        'export const deleteJourney = () => Promise.resolve()',
      ].join(String.fromCharCode(10)),
    },
  },
  {
    shape:
      "A committed script that assembles the directive at runtime - `['use','server'].join(' ')` written into a module during `next build`. No linted file holds the literal and the emitted module does not exist when ESLint runs.",
    committable: true,
    measurement:
      '`eslint .` exit 0; `grep -c "use server"` on the script 0; this suite green; `npm run verify` exit 0. It takes a deliberate two-part diff and mounts nothing on its own.',
    demonstration: {
      kind: 'nothing here can run it',
      because:
        'the module ESLint would have to judge is written by `next build` and does not exist when `eslint .` runs, so there is no text to hand a linter. Demonstrating it needs a check over the build OUTPUT, which `npm run verify` does not have — and linting the SCRIPT instead would demonstrate a different claim, since a script carrying no directive is not the shape that gets through.',
    },
  },
]

/**
 * Every way a mounted file can apply the guard, and the `(` is the point.
 *
 * `guarded(` is the wrapper a route handler is exported through;
 * `requireAdminSession(` is what a Server Component or a Server Action calls;
 * `authenticateAdminRequest(` is the underlying read, allowed here because a
 * route that calls it directly has still made the decision in its own file.
 *
 * The fix for the three rounds this scan was decorative is not another
 * exclusion: it is that **the guard is applied in the file itself**
 * (`guarded(handleSignOut)`), so this scan reads that one file and follows
 * nothing at all. A check that has to look somewhere else to find its subject
 * is a check that can be satisfied by a neighbour.
 */
const GUARD_APPLICATIONS = /(guarded|requireAdminSession|authenticateAdminRequest)\s*\(/u

/**
 * The separator `git ls-files -z` writes between paths.
 *
 * `String.fromCharCode(0)` rather than an escape, for the same reason the
 * rule's own test spells a line break that way: an escape sequence written into
 * a source file by a script is one transcription error away from being a real
 * control byte in the file, and this one would be invisible in a diff.
 */
const NUL_SEPARATOR = String.fromCharCode(0)

/** The repository root — `apps/web/lib/auth` -> the workspace above `apps/`. */
const repositoryRoot = path.resolve(webRoot, '../..')

/**
 * Every file the repository holds, tracked or newly written, repository-relative.
 *
 * ═══ WHY GIT AND NOT A DIRECTORY WALK ═══
 *
 * The version this replaced enumerated five directory names
 * (`['app','components','lib','collections','scripts']`) inside `apps/web` — in
 * the file whose own header says that being outside a directory list is how
 * five of the nine defeats worked. It was duly defeated by
 * `apps/web/actions/journeys.ts` and by `apps/web/globals/journeyActions.ts`,
 * both real directories, and by anything at all outside `apps/web`.
 *
 * A hand-rolled walk from the repository root would need a skip list —
 * `node_modules`, `.next`, `coverage`, `media`, the Playwright and Lighthouse
 * artefacts — and that skip list is the same enumeration wearing a different
 * hat. `git ls-files` needs no list from us: the index plus the untracked files
 * git does not ignore IS "what this repository holds", and `.gitignore` is
 * already the repository's own written statement of what is generated rather
 * than authored.
 *
 * `--others --exclude-standard` as well as `--cached` is the load-bearing part:
 * an attack on this check writes a file, runs the gate and deletes it, and a
 * listing of the index alone would not see a file that was never staged. What
 * it deliberately does NOT see is a file somebody has added to `.gitignore` —
 * which cannot be committed, and whose `.gitignore` line is a visible decision
 * in the same diff.
 *
 * @returns One repository-relative path per file, with `/` separators.
 * @throws If `git` cannot be run, rather than returning an empty list — an
 *   empty list would satisfy every case below having read nothing.
 */
const repositoryFiles = (): readonly string[] => {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const files = listed.split(NUL_SEPARATOR).filter((file) => file.length > 0)
  if (files.length === 0) throw new Error('git listed no files, so nothing below has read anything')

  // EVERY ENTRY MUST BE A FILE SOMETHING HERE CAN READ, and one kind is not:
  // a nested git repository (a vendored checkout, a submodule) is reported by
  // `git ls-files` as a single DIRECTORY entry, and its contents are in no
  // listing at all. Every caller below then reads that entry and dies on
  // `EISDIR: illegal operation on a directory, read` - five cases at once,
  // fail-closed but saying nothing a reader can act on. The seventh
  // whole-branch review's finding 3, measured with a real nested repository
  // holding an unguarded module.
  //
  // It THROWS rather than filtering the entry away, which is the whole point:
  // a directory entry here means files this scan cannot see, and dropping it
  // silently would turn a loud, wrong-looking failure into a quiet hole of
  // exactly the kind this file exists to close.
  const unreadable = files.filter((file) => !isReadableFile(file))
  if (unreadable.length > 0) {
    throw new Error(
      `git lists these as repository entries and they are not files this scan can read, so the files under them are in no listing here: ${unreadable.join(', ')}. A nested git repository or submodule is reported as one directory entry; vendor it as ordinary files, or exclude it deliberately and say so.`,
    )
  }
  return files
}

/**
 * Whether one listed entry is a regular file this scan can read.
 *
 * @param file - A repository-relative path from the git listing.
 * @returns True only for a regular file (or a symbolic link to one, which
 *   `statSync` follows); false for a directory entry and for a path that
 *   cannot be stat'd at all, such as one staged and then deleted.
 */
const isReadableFile = (file: string): boolean => {
  try {
    return statSync(path.join(repositoryRoot, file)).isFile()
  } catch {
    return false
  }
}

/** The bytes of one repository file. */
const bytesOf = (file: string): Buffer => readFileSync(path.join(repositoryRoot, file))

/**
 * One script from the repository-root `package.json`, by name.
 *
 * ═══ WHY A TEST READS THE SCRIPTS AT ALL ═══
 *
 * The seventh whole-branch review's finding 1. Everything else in this
 * describe block asks ESLint about its CONFIGURATION — the severity it
 * resolves for a path, whether it walks that path, whether a processor
 * rewrites the text first, what it suppressed — and every one of those probes
 * builds `new ESLint({ cwd })`, which is handed no argv and cannot see one.
 * So the rule's reach was policed from four directions and the COMMAND that
 * applies it from none: appending `--ignore-pattern apps/web/lib/journeys/**`
 * to the `lint` script left `npm run lint` at exit 0 and `npm run verify` at
 * exit 0, `1350 passed`, with an ordinary unguarded mountable `'use server'`
 * module on disk at that path and this suite at 23 passing.
 *
 * A rule is only ever as good as the invocation that runs it, and the
 * invocation is three JSON strings nothing had read.
 *
 * @param name - The script's key in the root manifest.
 * @returns The command that key maps to.
 * @throws If the manifest cannot be parsed, has no `scripts` object, or does
 *   not define that key — never returning an empty string, which would satisfy
 *   a caller having read nothing.
 */
const rootScript = (name: string): string => {
  const manifest: unknown = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'))
  if (typeof manifest !== 'object' || manifest === null || !('scripts' in manifest)) {
    throw new Error('the root package.json parsed to no scripts object, so nothing below has read a command')
  }
  const { scripts } = manifest
  if (typeof scripts !== 'object' || scripts === null || !(name in scripts)) {
    throw new Error(
      `the root package.json defines no \`${name}\` script, so the gate this case describes does not exist`,
    )
  }
  const command: unknown = Reflect.get(scripts, name)
  if (typeof command !== 'string') {
    throw new Error(`the root package.json's \`${name}\` script is not a string`)
  }
  return command
}

/**
 * The argv `npm run lint` must be, token for token.
 *
 * Written as the WHOLE command rather than as a list of flags that would be
 * dangerous, because a list of dangerous flags is the enumeration this file
 * has now watched fail five times: `--ignore-pattern` narrows what is linted,
 * and so do `--config`, `--no-config-lookup`, `--rulesdir`, a path in place of
 * `.`, and whatever a later ESLint adds. Anything that is not this exact
 * command fails, and the diff that changes it says what it now runs.
 */
const LINT_INVOCATION: readonly string[] = ['eslint', '.', '--max-warnings', '0']

/**
 * Both spellings of the directive that turns a module's exports into endpoints.
 *
 * Searched over BYTES rather than decoded text, so a file this scan has no
 * business decoding — a PNG baseline, the handoff's screenshots — costs one
 * buffer comparison instead of a UTF-8 decode, and cannot throw.
 */
const SERVER_DIRECTIVE_SPELLINGS: readonly string[] = ["'use server'", '"use server"']

/** Whether a file carries the directive anywhere in it, comments included. */
const carriesTheDirective = (file: string): boolean => {
  const bytes = bytesOf(file)
  return SERVER_DIRECTIVE_SPELLINGS.some((spelling) => bytes.includes(spelling))
}

/**
 * Files that carry the directive as PROSE rather than as a module, by exact path.
 *
 * DEFAULT-DENY, like {@link ACTIONS_RULE_EXEMPT_FILES}: the coverage case below
 * requires every file carrying `'use server'` to be one ESLint lints with the
 * rule at `error`, and every entry below is documentation quoting the
 * mechanism rather than a module. The count is not written: it said "these
 * three" through the rounds in which the list grew to five, in the same commit
 * that discharged ruling F76 by moving a count out of prose — which is the
 * defect that ruling exists to end, committed inside its own discharge.
 * They are named individually rather than excused by a `docs/` prefix or a
 * `.md` suffix, because a prefix would also excuse a `.jsx` action somebody
 * dropped in a documentation directory, and the whole defect being closed here
 * is a file at an address nobody listed.
 *
 * The consequence is stated rather than left to be met: a NEW document that
 * quotes the directive fails this case until it is listed. That is the safe
 * direction — the failure names the file and asks somebody whether it is prose
 * or a module — but it is friction, and it is the price of not owning a pattern
 * that a real action could hide behind.
 */
const DIRECTIVE_IN_PROSE: readonly { readonly path: string; readonly because: string }[] = [
  { path: 'docs/adr/0018-admin-request-policy-and-the-guard-split.md', because: 'the ADR describing the rule' },
  { path: 'docs/api.md', because: 'the shape a Phase 4 action takes, in a fenced example' },
  { path: 'docs/architecture.md', because: 'the paragraph naming the rule and what defeats it' },
  { path: 'docs/security.md', because: 'the discharge table cell for authorization on every mutation' },
  { path: 'docs/testing.md', because: 'the section explaining this suite, which §1.2 requires' },
]

/** Narrows an unknown to an indexable object, so nothing below needs a cast. */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** The severity that makes the gate fail rather than warn. */
const ERROR_SEVERITY = 2

/**
 * The program that asks ESLint how it would configure the rule for some paths.
 *
 * ═══ WHY THIS RUNS IN A CHILD PROCESS ═══
 *
 * It could be four lines of `await new ESLint().calculateConfigForFile(...)`
 * inline, and that is how it was first written. The reason it is not is a
 * measured coverage-tooling interaction, not a preference: ESLint loads
 * `eslint.config.js` — and through it `eslint-rules/guarded-server-actions.js` —
 * with Node's own loader, so calling the ESLint API from inside a Vitest worker
 * puts a SECOND, UNINSTRUMENTED copy of the rule in the same process. Both
 * copies report against the same source path, the uninstrumented one's zero
 * counts win, and `@vitest/coverage-v8` then reports the rule at 89.84% lines /
 * 63.15% functions — with every function marked unexecuted — where the
 * RuleTester suite alone measures it at 100/100/100 and `vitest.config.ts`
 * gates it at 100%. Reproduced by running the two test files together and then
 * separately.
 *
 * A child process keeps the two loads in two processes. It also asks the
 * question the way `npm run lint` asks it — a fresh Node process, ESLint
 * resolving its own config off disk — rather than the way a test harness would.
 *
 * The paths arrive on STDIN as JSON rather than as arguments: this repository
 * lists over five hundred files, and Windows caps a command line at 32,767
 * characters.
 */
const SEVERITY_PROBE_PROGRAM = [
  "import { ESLint } from 'eslint'",
  'const chunks = []',
  'for await (const chunk of process.stdin) chunks.push(chunk)',
  'const eslint = new ESLint({ cwd: process.cwd() })',
  'const answer = {}',
  "for (const file of JSON.parse(Buffer.concat(chunks).toString('utf8'))) {",
  '  const resolved = await eslint.calculateConfigForFile(file)',
  "  const entry = resolved?.rules?.['" + ACTIONS_RULE + "']",
  '  answer[file] = Array.isArray(entry) ? entry[0] : (entry ?? null)',
  '}',
  'process.stdout.write(JSON.stringify(answer))',
].join('\n')

/**
 * How ESLint would configure {@link ACTIONS_RULE} for each of some paths.
 *
 * ASKED OF ESLINT RATHER THAN READ OUT OF `eslint.config.js`. The case this
 * replaced sliced the config's source text between two markers and asserted a
 * `files:` key was absent from the slice, which a `files:` key written AFTER
 * the rules key sat outside of. `calculateConfigForFile` runs the same
 * resolution `eslint .` runs, answers for a path whose file does not exist, and
 * has no opinion about where in the file a key was written.
 *
 * The child's answer is narrowed rather than trusted — CLAUDE.md §3.1 bans the
 * `any` ESLint types that method as, and this crosses a process boundary, which
 * is a trust boundary — so a reply of any other shape reads back as
 * `undefined`, which every caller treats as "not at error".
 *
 * @param files - Repository-relative paths, which need not exist.
 * @returns The severity per path: 2 for `error`, 1 for `warn`, 0 for `off`,
 *   undefined when it is a file ESLint does not lint at all.
 * @throws If the child cannot be run or does not answer with an object, rather
 *   than returning nothing — an empty answer would satisfy every case below.
 */
const configuredSeverities = (files: readonly string[]): ReadonlyMap<string, number | undefined> => {
  const printed = execFileSync(process.execPath, ['--input-type=module', '-e', SEVERITY_PROBE_PROGRAM], {
    cwd: repositoryRoot,
    input: JSON.stringify(files),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const answer: unknown = JSON.parse(printed)
  if (!isRecord(answer)) throw new Error('the severity probe did not answer with an object')

  const severities = new Map<string, number | undefined>()
  for (const file of files) {
    const severity: unknown = answer[file]
    severities.set(file, typeof severity === 'number' ? severity : undefined)
  }
  return severities
}

/**
 * A program printing, for each path handed to it, whether ESLint ignores it.
 *
 * A SECOND PROBE RATHER THAN A FIELD ON THE FIRST, because the two questions
 * are different: `calculateConfigForFile` answers for a path ESLint would never
 * visit, so it cannot tell a linted file from an ignored one. Run in a child
 * process for the same measured coverage reason as
 * {@link SEVERITY_PROBE_PROGRAM} — see its own comment.
 */
const IGNORE_PROBE_PROGRAM = [
  "import { ESLint } from 'eslint'",
  'const chunks = []',
  'for await (const chunk of process.stdin) chunks.push(chunk)',
  'const eslint = new ESLint({ cwd: process.cwd() })',
  'const answer = {}',
  "for (const file of JSON.parse(Buffer.concat(chunks).toString('utf8'))) {",
  '  answer[file] = await eslint.isPathIgnored(file)',
  '}',
  'process.stdout.write(JSON.stringify(answer))',
].join('\n')

/**
 * Whether ESLint ignores each of some paths, asked of ESLint.
 *
 * @param files - Repository-relative paths, which need not exist.
 * @returns The paths ESLint does NOT ignore, in the order given.
 * @throws If the child cannot be run or does not answer with an object, rather
 *   than returning nothing — an empty answer would satisfy the case below.
 */
const pathsEslintWalks = (files: readonly string[]): readonly string[] => {
  const printed = execFileSync(process.execPath, ['--input-type=module', '-e', IGNORE_PROBE_PROGRAM], {
    cwd: repositoryRoot,
    input: JSON.stringify(files),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const answer: unknown = JSON.parse(printed)
  if (!isRecord(answer)) throw new Error('the ignore probe did not answer with an object')

  return files.filter((file) => answer[file] !== true)
}

/**
 * A program printing, for each file handed to it, which rules a disable
 * directive suppressed in it.
 *
 * ═══ WHY ESLINT IS ASKED RATHER THAN THE FILE READ (ROUND 8) ═══
 *
 * A byte scan for the directive's spelling answers "is one written here". This
 * answers "did one take effect", which is the question the control is about,
 * and it cannot be wrong about a spelling: ESLint's own results carry
 * `suppressedMessages`, one entry per report a directive swallowed, with the
 * justification the author gave. So a module that hides the directive from
 * every text scan — `'use\u0020server'`, which the rule still judges because
 * it compares the literal's VALUE — is still caught here, because the rule
 * fires and the suppression is recorded.
 *
 * Run in a child process for the measured coverage reason
 * {@link SEVERITY_PROBE_PROGRAM} documents, and over a handful of files rather
 * than the repository: linting everything takes twenty seconds, and the files
 * worth linting are the ones a directive could be hiding in.
 */
const SUPPRESSION_PROBE_PROGRAM = [
  "import { ESLint } from 'eslint'",
  'const chunks = []',
  'for await (const chunk of process.stdin) chunks.push(chunk)',
  'const eslint = new ESLint({ cwd: process.cwd() })',
  'const answer = {}',
  "const files = JSON.parse(Buffer.concat(chunks).toString('utf8'))",
  'for (const file of files) {',
  '  const [result] = await eslint.lintFiles([file])',
  '  answer[file] = (result?.suppressedMessages ?? []).map((message) => message.ruleId)',
  '}',
  'process.stdout.write(JSON.stringify(answer))',
].join('\n')

/**
 * The files in which a disable directive suppressed the Server Action rule.
 *
 * @param files - Repository-relative paths that exist.
 * @returns Those whose lint result carries a suppressed report of that rule.
 * @throws If the child cannot be run or does not answer with an object, rather
 *   than returning nothing — an empty answer would satisfy the case below.
 */
const filesSuppressingTheRule = (files: readonly string[]): readonly string[] => {
  const printed = execFileSync(process.execPath, ['--input-type=module', '-e', SUPPRESSION_PROBE_PROGRAM], {
    cwd: repositoryRoot,
    input: JSON.stringify(files),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const answer: unknown = JSON.parse(printed)
  if (!isRecord(answer)) throw new Error('the suppression probe did not answer with an object')

  return files.filter((file) => {
    const suppressed: unknown = answer[file]
    return Array.isArray(suppressed) && suppressed.includes(ACTIONS_RULE)
  })
}

/**
 * A program printing, for each path handed to it, the processor ESLint would
 * run over it before any rule sees the file.
 *
 * ═══ THE OFF SWITCH WITH NO KEY OVER IT, UNTIL ROUND 9 ═══
 *
 * A flat-config block may name a `processor`, whose `preprocess` hands ESLint
 * whatever text it likes. One whose `preprocess` drops the directive line
 * leaves every rule in this repository judging a module with no `'use server'`
 * prologue — so this rule reports nothing, and all three disable keys are
 * blind at once: there is no directive to find in the bytes, no rule id to
 * find anywhere, and no `suppressedMessages` entry, because nothing was
 * suppressed. Nothing fired.
 *
 * Measured by the sixth whole-branch review, and again on round 9's own tree
 * before this probe existed: a `processor` block for
 * `apps/web/lib/journeys/**` plus an ordinary unguarded
 * `export const deleteJourney` at `apps/web/lib/journeys/actions.ts` left
 * `eslint .` at exit 0 and this suite at 24 passing. `docs/adr/0018` called a
 * disable comment "the one thing that defeats the RULE"; this is one config
 * hunk, exactly as visible in a diff, and it had nothing over it.
 *
 * It is POLICED rather than disclosed, because the answer costs ten lines:
 * `calculateConfigForFile` reports the resolved `processor` the same way it
 * reports the resolved severity, so the question is asked of ESLint rather
 * than read out of the config's source text. Run in a child process for the
 * measured coverage reason {@link SEVERITY_PROBE_PROGRAM} documents.
 *
 * A SECOND PROGRAM RATHER THAN A FIELD ON THE SEVERITY ONE, so that each
 * probe's answer stays one value per path and a reply of another shape narrows
 * to "no answer" rather than to a wrong one.
 */
const PROCESSOR_PROBE_PROGRAM = [
  "import { ESLint } from 'eslint'",
  'const chunks = []',
  'for await (const chunk of process.stdin) chunks.push(chunk)',
  'const eslint = new ESLint({ cwd: process.cwd() })',
  'const answer = {}',
  "for (const file of JSON.parse(Buffer.concat(chunks).toString('utf8'))) {",
  '  const resolved = await eslint.calculateConfigForFile(file)',
  '  answer[file] = resolved?.processor === undefined ? null : true',
  '}',
  'process.stdout.write(JSON.stringify(answer))',
].join('\n')

/**
 * The paths ESLint would run a processor over, asked of ESLint.
 *
 * @param files - Repository-relative paths, which need not exist.
 * @returns Those paths a config block gives a processor, in the order given.
 * @throws If the child cannot be run or does not answer with an object, rather
 *   than returning nothing — an empty answer would satisfy the case below.
 */
const pathsWithAProcessor = (files: readonly string[]): readonly string[] => {
  const printed = execFileSync(process.execPath, ['--input-type=module', '-e', PROCESSOR_PROBE_PROGRAM], {
    cwd: repositoryRoot,
    input: JSON.stringify(files),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const answer: unknown = JSON.parse(printed)
  if (!isRecord(answer)) throw new Error('the processor probe did not answer with an object')

  return files.filter((file) => answer[file] === true)
}

/**
 * A program printing, for each module text handed to it, which rules ESLint
 * REPORTED on it — at a path the text need not occupy on disk.
 *
 * WHY TEXT RATHER THAN A FILE. {@link SHAPES_THAT_GET_THROUGH}'s rows claim a
 * shape gets through, and until round 9 nothing checked the claim: the sixth
 * whole-branch review deleted a row and the suite stayed green. Writing each
 * row's module to disk to check it would have this suite creating and deleting
 * files inside the repository it scans, in a gate that runs on every commit.
 * `lintText` asks the same question with no file: ESLint resolves the config
 * for the path it is given and runs every rule over the text.
 *
 * Run in a child process for the measured coverage reason
 * {@link SEVERITY_PROBE_PROGRAM} documents — this one loads the rule itself,
 * so it is the probe that reason was found on.
 */
const LINT_TEXT_PROBE_PROGRAM = [
  "import { ESLint } from 'eslint'",
  'const chunks = []',
  'for await (const chunk of process.stdin) chunks.push(chunk)',
  'const eslint = new ESLint({ cwd: process.cwd() })',
  'const answer = []',
  "for (const probe of JSON.parse(Buffer.concat(chunks).toString('utf8'))) {",
  '  const [result] = await eslint.lintText(probe.source, { filePath: probe.at })',
  '  answer.push((result?.messages ?? []).map((message) => message.ruleId ?? message.message))',
  '}',
  'process.stdout.write(JSON.stringify(answer))',
].join('\n')

/** One module text, and the path ESLint should resolve its config from. */
interface LintProbe {
  /** The config path. Need not exist on disk. */
  readonly at: string
  /** The module text to lint. */
  readonly source: string
}

/**
 * What ESLint REPORTS on each of some module texts.
 *
 * A suppressed report is deliberately not in the answer: a disable directive
 * moves a report from `messages` to `suppressedMessages`, and a shape that
 * gets through by suppressing this rule is a shape ESLint reports nothing for,
 * which is exactly what the row claims.
 *
 * @param probes - Texts and the paths to resolve their config from.
 * @returns One list of reported rule ids (or fatal messages) per probe, in
 *   order.
 * @throws If the child cannot be run or does not answer with one list per
 *   probe, rather than returning nothing — a short answer would satisfy the
 *   case below for the probes it did not cover.
 */
const rulesReportedOn = (probes: readonly LintProbe[]): readonly (readonly string[])[] => {
  const printed = execFileSync(process.execPath, ['--input-type=module', '-e', LINT_TEXT_PROBE_PROGRAM], {
    cwd: repositoryRoot,
    input: JSON.stringify(probes),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const answer: unknown = JSON.parse(printed)
  if (!Array.isArray(answer) || answer.length !== probes.length) {
    throw new Error('the lint-text probe did not answer with one list per probe')
  }

  return answer.map((reported: unknown) =>
    Array.isArray(reported) ? reported.filter((entry): entry is string => typeof entry === 'string') : [],
  )
}

/**
 * Every directory `.prettierignore` names, as a probe path inside it.
 *
 * Read off the file rather than listed here, so the two ignore sets cannot
 * drift apart silently — which is exactly what happened to `.lighthouseci/`.
 * Only directory entries are taken: `.prettierignore` also names one generated
 * FILE and three binary globs, which are not directories ESLint walks into.
 *
 * @returns One `<directory>/probe.js` per directory entry.
 */
const generatedDirectoryProbes = (): readonly string[] =>
  readFileSync(path.join(repositoryRoot, '.prettierignore'), 'utf8')
    .split(NEWLINE)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && line.endsWith('/'))
    .map((directory) => `${directory}probe.js`)

/** One mounted address and the file that serves it. */
interface MountedAddress {
  /** The URL Next.js serves it at, e.g. `/admin/sign-in/done`. */
  readonly url: string
  /** The file, relative to `apps/web`. */
  readonly file: string
}

/**
 * Every file under a directory, recursively.
 *
 * @param directory - Where to look, relative to `apps/web`.
 * @returns One path per file, relative to `apps/web`, with `/` separators.
 */
const filesUnder = (directory: string): readonly string[] =>
  readdirSync(path.join(webRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const child = `${directory}/${entry.name}`
    return entry.isDirectory() ? filesUnder(child) : [child]
  })

/**
 * The address Next.js serves a file at, computed the way Next.js computes it.
 *
 * @param file - The file, relative to `apps/web`.
 * @returns The URL of the directory holding it. Route groups — a directory in
 *   parentheses — contribute no segment, exactly as Next.js treats them, so a
 *   file under ANY group is measured at the address it really answers at; a
 *   bracketed segment is left as written, which is what `adminAccess.ts`'s
 *   reset-link rule expects to see.
 */
const addressOf = (file: string): string => {
  const segments = file
    .slice(`${APP_DIRECTORY}/`.length)
    .split('/')
    .slice(0, -1)
    .filter((segment) => !segment.startsWith('('))
  return `/${segments.join('/')}`
}

/**
 * A source file with its comments and its import statements removed.
 *
 * Both are places the guard's NAME appears without the guard being applied: a
 * TSDoc header that explains the guarding, and the `import` that brings it in.
 * A scan over raw text is satisfied by either, which is what made the first
 * version of this file green with the call deleted.
 *
 * Text-level rather than a parse, and the failure direction is why that is
 * enough: it can only remove too much, which makes the scan find FEWER calls
 * and turns a mistake into a failing test rather than a silent pass.
 *
 * @param source - The file's text.
 * @returns The same text with its comments blanked and its imports dropped.
 */
const sourceWithoutMentions = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/u, ''))
    .filter((line) => !/^\s*import\b/u.test(line))
    .join('\n')

/**
 * The text of one file under `apps/web`.
 * @param file - The path, relative to `apps/web`.
 * @returns Its contents.
 */
const textOf = (file: string): string => readFileSync(path.join(webRoot, file), 'utf8')

/**
 * Whether a file mentions the `'use server'` directive at all.
 *
 * DELIBERATELY CRUDE, and it is not a guard: `eslint-rules/guarded-server-actions.js`
 * decides what a Server Action module may export, over the parsed AST. This is
 * only rule B's classifier, and it fails in the safe direction — a file it
 * cannot recognise falls into the unaccounted list and fails the suite.
 *
 * @param source - The file's text, comments and imports already stripped.
 * @returns `true` when the directive appears anywhere in the file.
 */
const mentionsServerDirective = (source: string): boolean => /(['"])use server\1/u.test(source)

/**
 * Whether a file applies the guard in its own body.
 * @param source - The file's text, comments and imports already stripped.
 * @returns `true` when the file itself calls or applies a guard.
 */
const appliesTheGuard = (source: string): boolean => GUARD_APPLICATIONS.test(source)

describe('the admin addresses this repository mounts', () => {
  const everyAppFile = filesUnder(APP_DIRECTORY)
  const underAnAdminAddress = everyAppFile.filter((file) => addressOf(file).startsWith(ADMIN_PREFIX))
  const mounted: readonly MountedAddress[] = underAnAdminAddress
    .filter((file) => ROUTE_FILE_NAMES.includes(path.basename(file)))
    .map((file) => ({ url: addressOf(file), file }))

  it('finds the addresses that are known to be mounted, so the scan is not looking at nothing', () => {
    // The sentinel. Every conclusion below is drawn from this list, and a walk
    // that produced an empty one would satisfy them all.
    const urls = mounted.map((address) => address.url)

    expect(urls).toContain('/admin/sign-in')
    expect(urls).toContain('/admin/sign-in/done')
    expect(urls).toContain('/admin/sign-out')
    expect(urls).toContain('/admin/reset/[token]')
  })

  it('walks the whole app tree, so a second route group is not invisible to it', () => {
    // The walk used to be rooted at `app/(admin)/admin`. Next serves
    // `app/(panel)/admin/journeys/route.ts` at `/admin/journeys` all the same,
    // and a walk inside one group cannot see another. Proved on real files:
    // the tree holds three route groups, and the address arithmetic drops each.
    expect(everyAppFile.some((file) => file.startsWith('app/(diary)/'))).toBe(true)
    expect(everyAppFile.some((file) => file.startsWith('app/(payload)/'))).toBe(true)
    expect(addressOf('app/(panel)/admin/journeys/route.ts')).toBe('/admin/journeys')
    expect(addressOf('app/(admin)/admin/sign-out/route.ts')).toBe('/admin/sign-out')
  })

  it('finds both kinds of file, so a route handler is not invisible to it', () => {
    // A scan matching only `page.tsx` would see every screen and no endpoint —
    // and the endpoints are the mutations `SECURITY.md` is actually about.
    expect(mounted.map((address) => address.file).filter((file) => file.endsWith('route.ts'))).not.toHaveLength(0)
    expect(mounted.map((address) => address.file).filter((file) => file.endsWith('page.tsx'))).not.toHaveLength(0)
  })

  it('leaves every guarded address applying the guard in its own file', () => {
    const unguarded = mounted
      .filter((address) => isGuardedAdminPath(address.url))
      .filter((address) => !appliesTheGuard(sourceWithoutMentions(textOf(address.file))))

    expect(
      unguarded.map((address) => address.file),
      'these admin addresses are guarded by policy but apply no guard in their own file: declare them in ADMIN_PUBLIC_PATHS, call requireAdminSession, or export guarded(handler)',
    ).toEqual([])
  })

  it('accounts for every file under an admin address, so an unrecognised one fails rather than passing', () => {
    // RULE B, and the reason this file is not another enumeration. Every
    // previous version listed the shapes it knew and was silent about the rest;
    // this one requires each file to be classified, so a Next.js convention
    // nobody here has heard of stops the suite instead of shipping unseen.
    const unaccounted = underAnAdminAddress.filter((file) => {
      const name = path.basename(file)
      if (ROUTE_FILE_NAMES.includes(name)) return false
      if (NON_SERVABLE_FILES.some((kind) => kind.matches(name))) return false
      return !mentionsServerDirective(sourceWithoutMentions(textOf(file)))
    })

    expect(
      unaccounted,
      'these files sit under an /admin address and this scan cannot say whether they answer a request: classify them in ROUTE_FILE_NAMES, NON_SERVABLE_FILES, or make them a guarded Server Action module',
    ).toEqual([])
  })

  it('reads a guard APPLICATION rather than a mention of one', () => {
    // Fix round 1, finding 6 of round 0: the first version matched the guard's
    // name anywhere, so deleting the call left the `import` line and the header
    // comment matching and every case green.
    const namedButNeverApplied = [
      "import { requireAdminSession } from '../../lib/auth/guard'",
      '/** Calls requireAdminSession() before it draws anything. */',
      '// requireAdminSession() belongs here',
      'const Page = () => null',
    ].join('\n')

    expect(GUARD_APPLICATIONS.test(sourceWithoutMentions(namedButNeverApplied))).toBe(false)
    expect(GUARD_APPLICATIONS.test(sourceWithoutMentions('const account = await requireAdminSession()'))).toBe(true)
    expect(GUARD_APPLICATIONS.test(sourceWithoutMentions('export const POST = guarded(handleSignOut)'))).toBe(true)
  })

  it('credits no route for what a module it imports happens to contain', () => {
    // FIX ROUND 1, FINDING 2, and the third instance of this class in the one
    // file whose whole purpose is to stop a screen going unguarded. The scan
    // used to follow a route file's imports one level, so a guarded route
    // re-exporting ANY handler from `signInEndpoints.ts` passed — that module
    // holds several, and one of them called the guard. It now reads the route
    // file alone, which is why `sign-out/route.ts` applies `guarded` itself.
    //
    // Asserted against a REAL mounted file rather than a fabricated string: a
    // route that names a handler and no guard must fail the scan even though
    // the module it imports from is full of guard calls.
    expect(appliesTheGuard(sourceWithoutMentions(textOf('app/(admin)/admin/sign-in/password/route.ts')))).toBe(false)
    expect(appliesTheGuard(sourceWithoutMentions(textOf('app/(admin)/admin/sign-out/route.ts')))).toBe(true)
  })

  it('has at least one guarded address, so the case above is not vacuous', () => {
    // A repository whose every address was declared public would pass the
    // guarding case having checked nothing at all.
    expect(mounted.filter((address) => isGuardedAdminPath(address.url))).not.toHaveLength(0)
  })

  it('declares every public address deliberately rather than by prefix', () => {
    // The other direction: an address that answers to anybody must be one
    // somebody wrote down. This case is what a new sign-in step would fail if
    // it were mounted without being declared — which is the moment to decide
    // whether it should be public at all.
    const publicAddresses = mounted.filter((address) => !isGuardedAdminPath(address.url)).map((one) => one.url)

    expect(publicAddresses.sort((left, right) => left.localeCompare(right))).toEqual([
      '/admin/reset',
      '/admin/reset/[token]',
      '/admin/reset/request',
      '/admin/reset/set',
      '/admin/sign-in',
      '/admin/sign-in/code',
      '/admin/sign-in/code/resend',
      '/admin/sign-in/code/verify',
      '/admin/sign-in/password',
    ])
  })
})

describe('the rule that reports an unguarded Server Action', () => {
  const eslintConfig = readFileSync(path.join(webRoot, '../../eslint.config.js'), 'utf8')

  it('registers the rule at error, so removing it fails the same gate the guard does', () => {
    // THE ONLY THING THIS FILE STILL SAYS ABOUT SERVER ACTIONS, and it is a
    // question about configuration rather than about syntax — which is what
    // reading text is adequate for. What the rule DOES is asserted where the
    // AST is, by `eslint-rules/guarded-server-actions.test.js`, over every
    // invalid shape that defeated the scans this replaced or the rule versions
    // that replaced them — a list whose length that file asserts off its own
    // array, and which no comment here spells, because this one said "twelve"
    // through two rounds in which the list grew and "thirty-two" through the
    // round in which it grew again.
    expect(eslintConfig).toContain("'guarded-server-actions': guardedServerActions")
    expect(eslintConfig).toContain(`'${ACTIONS_RULE}': 'error'`)
  })

  it('is applied by a command nothing can narrow, which is the command the gates run', () => {
    // THE SEVENTH WHOLE-BRANCH REVIEW'S FINDING 1, AND A CLASS THE OTHER
    // FOUR KEYS CANNOT REACH. They ask ESLint what its CONFIGURATION resolves
    // to - a severity, an ignore, a processor, a suppression - and every one
    // of them builds `new ESLint({ cwd })`, which is handed no argv. A flag
    // appended to the command is therefore invisible to all four: with
    // `--ignore-pattern apps/web/lib/journeys/**` on the `lint` script and an
    // ordinary unguarded mountable `'use server'` module at that path,
    // `npm run lint` exited 0, `npm run verify` exited 0 at 1350 passing, and
    // this suite stayed at 23. Bare `npx eslint .` exited 1 the whole time,
    // which is the shape of the defect: the rule was right and nobody ran it
    // over the file.
    //
    // The argv is compared WHOLE ({@link LINT_INVOCATION}) rather than
    // screened for flags known to be dangerous, because a list of dangerous
    // flags is the enumeration this file has watched fail five times.
    //
    // THE CHAIN IS ASSERTED LINK BY LINK BELOW, because a command nothing
    // runs is not a gate: `ci.yml` runs `verify:full`, which runs `verify`,
    // which runs `lint`, and the Husky hook CLAUDE.md §8.4 relies on runs
    // `verify` too. Each link is one string, and each of them was unread
    // until this case.
    const tokensOf = (command: string): readonly string[] => command.split(/\s+/u).filter((token) => token.length > 0)

    expect(
      tokensOf(rootScript('lint')),
      'the `lint` script is the command that applies this rule, and an argument appended to it narrows what the rule is handed without changing any configuration this suite can see: keep the command exactly `eslint . --max-warnings 0`, and if it must change, change LINT_INVOCATION in the same diff and say why',
    ).toEqual([...LINT_INVOCATION])

    expect(rootScript('verify'), 'the pre-commit gate no longer runs `npm run lint`').toContain('npm run lint')
    expect(rootScript('verify:full'), 'the CI gate no longer runs `npm run verify`').toContain('npm run verify')
    expect(
      bytesOf('.github/workflows/ci.yml').toString('utf8'),
      'no CI step runs `npm run verify:full`, so nothing in CI reaches the lint command this case pins',
    ).toContain('run: npm run verify:full')
    expect(
      bytesOf('.husky/pre-commit').toString('utf8'),
      'the Husky pre-commit hook no longer runs `npm run verify`, which is the gate CLAUDE.md §8.4 relies on',
    ).toContain('npm run verify')
  })

  it('reaches every file in the repository that carries the directive, whatever its extension', () => {
    // THE COVERAGE CHECK, INVERTED - RULING F73.
    //
    // The rule keeps the AST, because judging an export is not something text
    // matching can do. But the rule can only judge a file ESLint HANDS it, and
    // the question of which files those are was answered by an extension list
    // nobody had audited: a flat config lints what some block's `files` array
    // names, and no block named `.jsx`. An unguarded `'use server'` module
    // written as `apps/web/app/(admin)/admin/journeys/actions.jsx` therefore
    // passed `eslint .` at exit 0 - naming it directly answered "File ignored
    // because no matching configuration was supplied" - while a running Next.js
    // dev server registered its export as a real action endpoint.
    //
    // So the two halves are put where each is strong. TEXT FINDS THE
    // CANDIDATES, anywhere in the repository and at any extension, because a
    // byte comparison needs no list of where to look. THE AST DECIDES
    // CORRECTNESS, on the files text handed it. This case is the join: every
    // file carrying the literal must be a file ESLint visits with the rule at
    // `error`, asked of ESLint's own API rather than inferred from the config's
    // source text.
    //
    // WHAT THIS DOES NOT CLAIM. It cannot fail before the file exists - a
    // twenty-ninth extension gap is closed on the commit that first writes a
    // module at it, not in advance. The case below narrows that for the
    // extensions Next.js is known to serve; beyond those, this is a check that
    // fires on the commit that would have shipped the hole, which is the commit
    // somebody is reading.
    const carrying = repositoryFiles().filter(carriesTheDirective)

    // THE SENTINEL. A listing that found nothing, or a byte comparison that
    // matched nothing, would satisfy the loop below having read no file at all.
    expect(carrying).toContain('apps/web/lib/auth/guard.ts')
    expect(carrying).toContain('apps/web/app/(payload)/layout.tsx')
    expect(carrying).toContain('eslint-rules/guarded-server-actions.js')

    const asModules = carrying.filter((file) => !DIRECTIVE_IN_PROSE.some((prose) => prose.path === file))
    const severities = configuredSeverities(asModules)
    const unreached = asModules.filter((file) => severities.get(file) !== ERROR_SEVERITY)

    expect(
      unreached,
      `these files carry a "use server" directive and ESLint does not lint them with ${ACTIONS_RULE} at error: give their extension a config block, or list them in DIRECTIVE_IN_PROSE if they are documentation`,
    ).toEqual([])
  })

  it('has the rule at error for every extension Next.js serves, in directories nobody listed', () => {
    // The proactive half, and the replacement for a case that read the config's
    // TEXT POSITIONALLY: it sliced `eslint.config.js` between `plugins: {` and
    // the rules key and asserted no `files:` in the slice, so a `files` key
    // written AFTER the rules key in the same object scoped the rule and the
    // case still passed. Asked of ESLint's own config resolution instead, so
    // where the key sits in the file is not something this case can be wrong
    // about.
    //
    // The paths are HYPOTHETICAL - `calculateConfigForFile` answers for a path
    // that does not exist - so this fails when an extension gap is introduced
    // rather than when somebody first exploits it. The extensions are Next.js's
    // default `pageExtensions` (`tsx, ts, jsx, js`, and
    // `apps/web/next.config.ts` overrides none of them) plus the four module
    // extensions its compiler also accepts. That IS a list, and a list is what
    // the nine defeats taught us not to trust - which is why the case above
    // exists and does not consult one.
    const severities = configuredSeverities(ACTION_PATH_PROBES)
    const notAtError = ACTION_PATH_PROBES.filter((probe) => severities.get(probe) !== ERROR_SEVERITY)

    expect(
      notAtError,
      `ESLint would not apply ${ACTIONS_RULE} at error to these paths: an extension with no config block, or a \`files\` list the rule now sits inside`,
    ).toEqual([])
  })

  it('is not disabled in any module carrying the directive, bar the one file somebody wrote down', () => {
    // RULING F74, AND THE FIFTH REVIEW'S BLOCKER. The previous version of this
    // case asked whether one LINE carried both the disable directive and this
    // rule's id. Two spellings satisfy ESLint and not that filter: a bare
    // directive, which disables every rule and names none, and the directive
    // with the rule's id on the NEXT line, since ESLint parses a block
    // comment's whole value. Measured on an ordinary mountable unguarded
    // `'use server'` module at `apps/web/lib/journeys/actions.ts`, with a test
    // beside it: `eslint .` exit 0, this suite green, `tsc` clean, prettier
    // clean, `npm run verify` exit 0, and `git commit` SUCCEEDED. Neither
    // spelling needs a `.gitignore` line, and neither is hidden from anything -
    // they simply were not matched.
    //
    // So the key is the PRESENCE of a disable directive in a module carrying
    // the directive, not a spelling of one. It cannot be evaded by placement,
    // by naming or not naming the rule, or by which comment syntax is used,
    // because a directive that ESLint honours must spell
    // {@link DISABLE_DIRECTIVE} somewhere in the file, and a comment cannot
    // escape its own text.
    //
    // The documentation files that QUOTE the directive are excluded by exact
    // path ({@link DIRECTIVE_IN_PROSE}) rather than by a `docs/` prefix or an
    // `.md` suffix, for the reason that list already gives.
    const modulesCarryingTheDirective = repositoryFiles()
      .filter(carriesTheDirective)
      .filter((file) => !DIRECTIVE_IN_PROSE.some((prose) => prose.path === file))

    // THE SENTINELS. A listing that found nothing, or a byte comparison that
    // matched nothing, would satisfy the assertion below having read no file.
    expect(modulesCarryingTheDirective).toContain('apps/web/app/(payload)/layout.tsx')
    expect(modulesCarryingTheDirective).toContain('apps/web/lib/auth/guard.ts')

    const disabling = modulesCarryingTheDirective.filter((file) => bytesOf(file).includes(DISABLE_DIRECTIVE))

    expect(
      disabling.sort((left, right) => left.localeCompare(right)),
      'these modules carry a "use server" directive and an ESLint disable directive, which switches this rule off for them: build the action from guardedAction(), or add the file to ACTIONS_RULE_EXEMPT_FILES with the reason',
    ).toEqual([...ACTIONS_RULE_EXEMPT_FILES])
  })

  it('is named by exactly the files somebody wrote down, so an inline severity cannot switch it off unseen', () => {
    // MINE, ROUND 8, FOUND WHILE ATTACKING THE FIX ABOVE. A disable directive
    // is not ESLint's only inline off switch: a block comment whose body reads
    // `eslint <rule>: off` sets a SEVERITY instead, so it spells no disable
    // directive and suppresses no message. Measured on the same mountable
    // unguarded module: `eslint .` exit 0 and this suite green.
    //
    // Such a comment must spell the rule's id, so the files permitted to spell
    // it are enumerated - across the whole repository rather than only the
    // modules carrying the directive, because a module can hide the directive
    // from a byte scan (`'use\u0020server'`, whose VALUE this rule still
    // judges) and this key must not depend on that scan.
    const naming = repositoryFiles().filter((file) => bytesOf(file).includes(ACTIONS_RULE))

    expect(
      naming.sort((left, right) => left.localeCompare(right)),
      'these files spell this rule\u2019s id, which is what an inline `eslint <rule>: off` comment must do: name them in FILES_PERMITTED_TO_NAME_THE_RULE with the reason, or refer to the rule by its file path instead',
    ).toEqual([...FILES_PERMITTED_TO_NAME_THE_RULE].sort((left, right) => left.localeCompare(right)))
  })

  it('has suppressed a report of itself in exactly one file, asked of ESLint rather than of the bytes', () => {
    // THE THIRD KEY, AND THE ONE NO SPELLING EVADES. The two above read bytes.
    // This one asks ESLint what actually happened: every lint result carries
    // `suppressedMessages`, one entry per report a directive swallowed. So a
    // module that hides the directive from a byte scan - the escaped
    // `'use\u0020server'` above, which the rule judges anyway because it
    // compares the literal's value - is caught here, because the rule fires
    // and the suppression is recorded.
    //
    // THE CANDIDATE SET IS COMPLETE, and that is why it is small enough to
    // lint. A suppression can only come from a directive in the file it
    // suppresses, so a file carrying no disable directive can suppress
    // nothing, and every file that carries one is below. Linting them costs
    // about nine seconds; linting the repository costs twenty-two.
    const candidates = repositoryFiles().filter((file) => bytesOf(file).includes(DISABLE_DIRECTIVE))

    // THE SENTINEL: a needle that matched nothing would leave this case
    // asserting that no file suppresses the rule, having linted none.
    expect(candidates.length).toBeGreaterThanOrEqual(8)
    expect(candidates).toContain('apps/web/app/(payload)/layout.tsx')

    expect(
      filesSuppressingTheRule(candidates).toSorted((left, right) => left.localeCompare(right)),
      'a disable directive in these files stopped this rule reporting something it wanted to report: build the action from guardedAction(), or add the file to ACTIONS_RULE_EXEMPT_FILES with the reason',
    ).toEqual([...ACTIONS_RULE_EXEMPT_FILES])
    // AN EXPLICIT BUDGET, WITH THE ARITHMETIC AT THE LINE, because this case
    // runs a real lint over a dozen files: measured 9.1s, against a harness
    // default of 5,000ms it was never going to fit. Sixty seconds is roughly
    // six times the measurement, the same headroom ruling F2 settled on for
    // the one other case here whose cost is knowable in advance - and a case
    // that discovers its own budget in a merge gate is a flake somebody
    // deletes as tidying.
  }, 60_000)

  it('is the only place the shapes that get through are written down, and every document points here', () => {
    // RULING F76. "TWO shapes get through" was false at seven sites while the
    // rule's own test table proved four, and the same sentence had already been
    // wrong in four earlier rounds. The lesson the phase drew is that a claim
    // about a control has to be asserted off the artefact it describes, so this
    // case is that assertion: the count lives in {@link SHAPES_THAT_GET_THROUGH}
    // and every document that used to restate it must point at the array by
    // name instead.
    //
    // WHAT IT REFUSES, in the indicative, with the defeat that shaped each
    // half - and the round-9 version of this paragraph said instead that "what
    // it makes impossible is a number sitting in prose where a reader will
    // trust it", which the seventh whole-branch review falsified in three
    // lines. Ruling F78: a control is described by what it refuses.
    //
    //   1. THE SENTENCE ON ONE LINE, IN ANY FILE THE REPOSITORY HOLDS. It used
    //      to be seven named sites. Seven named sites is an enumeration, and
    //      the five enumerations that failed in this phase all failed the same
    //      way: a count written into an eighth file - a new ADR, a QA report,
    //      a README - was not looked at. The scan is the same `git ls-files`
    //      listing every other case here uses.
    //
    //   2. THE SAME SENTENCE WRAPPED. `\s+` matches a newline but not the
    //      ` * ` that opens the next line of a block comment, so the review
    //      inserted `* Only TWO shapes` / `* get through today` into
    //      `guard.ts` - one of the sites below, and the file a Phase 3 reader
    //      trusts most - and this suite stayed at 23 passing with prettier
    //      clean. Comment and quote continuations are flattened before
    //      matching now, so a line break is not a hiding place.
    //
    // WHAT IT DOES NOT REFUSE, said rather than implied: a PARAPHRASE. "two
    // survivors get past", "both of them are live", anything that renames the
    // noun or puts a word between "shapes" and "get" - all walk past it, and no
    // regex over English closes that. What it refuses is the one sentence that
    // has been wrong in five rounds, in every wrapping and in every file.
    const SURVIVOR_SENTENCE = /shapes?\s+gets?\s+through/iu

    // The sentinels first: a regex that matched nothing, or a flattener that
    // flattened nothing, would pass this case having read every file in the
    // repository and found nothing in any of them. The four wrapped ones are
    // the review's own counter-example, its line-comment twin, a Markdown
    // quote, and a wrapped sentence that must still NOT match.
    //
    // A LINE BREAK IS SPELLED, NEVER WRITTEN, here as everywhere in this file:
    // an escape sequence a script writes into a source file is one
    // transcription error away from being a real control byte, and this one
    // would be invisible in a diff.
    expect(SURVIVOR_SENTENCE.test(unwrapped('TWO shapes get through today, not one'))).toBe(true)
    expect(SURVIVOR_SENTENCE.test(unwrapped('the shapes that get through are enumerated'))).toBe(false)
    expect(
      SURVIVOR_SENTENCE.test(unwrapped(` * Only TWO shapes${LINE_BREAK} * get through today, and both are harmless.`)),
    ).toBe(true)
    expect(SURVIVOR_SENTENCE.test(unwrapped(`// Only TWO shapes${LINE_BREAK}// get through today`))).toBe(true)
    expect(SURVIVOR_SENTENCE.test(unwrapped(`> TWO shapes${LINE_BREAK}> get through`))).toBe(true)
    expect(SURVIVOR_SENTENCE.test(unwrapped(`the shapes${LINE_BREAK} * that get through are enumerated`))).toBe(false)

    expect(SHAPES_THAT_GET_THROUGH.length).toBeGreaterThan(0)
    for (const survivor of SHAPES_THAT_GET_THROUGH) {
      expect(survivor.shape.length).toBeGreaterThan(40)
      expect(survivor.measurement).toContain('eslint')
    }

    const sitesThatUsedToCount: readonly string[] = [
      'docs/adr/0018-admin-request-policy-and-the-guard-split.md',
      'docs/architecture.md',
      'docs/security.md',
      'docs/api.md',
      'docs/testing.md',
      'apps/web/lib/auth/guard.ts',
      'eslint-rules/guarded-server-actions.js',
    ]

    // THE SENTINEL FOR THE LISTING, for the same reason every other case here
    // carries one: a `git ls-files` that answered with nothing would satisfy
    // the assertion below having read no file at all.
    const scanned = repositoryFiles().filter((file) => file !== FILE_PERMITTED_TO_SPELL_THE_SENTENCE)
    expect(scanned).toContain('apps/web/lib/auth/guard.ts')
    expect(scanned).toContain('docs/architecture.md')
    expect(scanned).not.toContain(FILE_PERMITTED_TO_SPELL_THE_SENTENCE)

    const restating = scanned.filter((file) => SURVIVOR_SENTENCE.test(unwrapped(bytesOf(file).toString('utf8'))))
    const notPointing = sitesThatUsedToCount.filter(
      (file) => !bytesOf(file).toString('utf8').includes('SHAPES_THAT_GET_THROUGH'),
    )

    expect(
      restating,
      'these files restate a count of the shapes that get through instead of pointing at SHAPES_THAT_GET_THROUGH, and a wrapped line is not an exception: the count lives in the array, which the case below demonstrates row by row',
    ).toEqual([])
    expect(
      notPointing,
      'these documents describe what defeats the guard without sending the reader to SHAPES_THAT_GET_THROUGH',
    ).toEqual([])
  })

  it('demonstrates every shape it says gets through, so a row cannot be stale', () => {
    // THE CONTENTS OF THE SURVIVOR ARRAY, PINNED - the sixth whole-branch
    // review's finding 5, and the third "guard on a guard written in the same
    // edit" in this phase. Before this case the array's only floors were its
    // length, each shape's length and the word "eslint" in each measurement,
    // so a row could be deleted (measured: 21 passing) or could go on claiming
    // a shape a later round had closed. What is pinned is the CLAIM: a row
    // marked `'linted'` carries the module, and this rule must report nothing
    // for it.
    //
    // WHAT IT STILL CANNOT DO is written at the array and is worth repeating
    // where it is asserted: a row's ABSENCE proves nothing, because
    // enumerating what gets through means knowing what gets through. This
    // fails on a row that has stopped being true. It cannot fail on a shape
    // nobody has thought of.
    // `flatMap` rather than `filter`, so the row is narrowed by the ternary
    // that reads it and no unreachable arm has to be written to re-narrow it.
    const linted = SHAPES_THAT_GET_THROUGH.flatMap((survivor) =>
      survivor.demonstration.kind === 'linted'
        ? [{ at: survivor.demonstration.at, source: survivor.demonstration.source }]
        : [],
    )

    // THE SENTINEL, AND IT IS A NEGATIVE CONTROL RATHER THAN A COUNT. A probe
    // that answered "nothing reported" for everything - a broken child, a
    // config that stopped applying at this path - would "demonstrate" every
    // row. So an ordinary unguarded action module goes through the same probe
    // and MUST be reported.
    const control: LintProbe = {
      at: 'actions.ts',
      source: ["'use server'", 'export const deleteJourney = () => Promise.resolve()'].join(String.fromCharCode(10)),
    }
    const [reportedOnControl, ...reportedOnRows] = rulesReportedOn([control, ...linted])
    expect(reportedOnControl, 'the probe reports nothing even for a plainly unguarded action module').toContain(
      ACTIONS_RULE,
    )

    const stillTrue = linted.filter((_probe, index) => !(reportedOnRows[index] ?? []).includes(ACTIONS_RULE))

    // The sentinel counts rows CARRYING a module rather than surviving ones,
    // so that a stale row fails on the sentence naming it rather than on this.
    expect(linted.length, 'no row in SHAPES_THAT_GET_THROUGH carries a module for this case to lint').toBeGreaterThan(0)

    // AND THE MOST THAT CAN BE DONE ABOUT AN ABSENCE: removing a row is now
    // a TWO-line diff rather than a one-line one. The sixth whole-branch
    // review deleted the committable row and the suite stayed green, and
    // that row is the one nothing here can lint - so the length is asserted
    // the way `eslint-rules/guarded-server-actions.test.js` asserts its own
    // case count. It does not make the array complete and does not pretend
    // to: it makes a deletion say so in the diff, and it makes ADDING a
    // survivor a deliberate act rather than an optional one. Ruling F76
    // rules out a count in PROSE, which a reader trusts and nothing checks;
    // this is the executable kind it asked for instead.
    expect(SHAPES_THAT_GET_THROUGH).toHaveLength(2)
    expect(
      linted.length - stillTrue.length,
      'these rows say a shape gets through and this rule reports it: the shape was closed, so correct the row or delete it',
    ).toBe(0)

    // And a row nothing here can run says so in the row, rather than being
    // trusted by convention.
    for (const survivor of SHAPES_THAT_GET_THROUGH) {
      if (survivor.demonstration.kind === 'nothing here can run it') {
        expect(survivor.demonstration.because.length).toBeGreaterThan(80)
      }
    }
  }, 60_000)

  it('lets no processor strip the directive before this rule is handed the file', () => {
    // FINDING 4, POLICED RATHER THAN DISCLOSED. A flat-config `processor`
    // whose `preprocess` drops the directive line defeats the rule and all
    // three disable keys at once - no directive in the bytes, no rule id
    // anywhere, and no `suppressedMessages`, because nothing fired. Measured
    // on round 9's own tree: `eslint .` exit 0 and this suite at 24 passing,
    // with an unguarded mountable module at
    // `apps/web/lib/journeys/actions.ts`.
    //
    // Asked of ESLint's own config resolution, so where the key sits in
    // `eslint.config.js` is not something this case can be wrong about; and
    // asked BOTH of the modules that exist and of paths nobody has written,
    // so a processor scoped to a Phase 4 directory fails on the commit that
    // adds it rather than on the commit that exploits it.
    const carrying = repositoryFiles()
      .filter(carriesTheDirective)
      .filter((file) => !DIRECTIVE_IN_PROSE.some((prose) => prose.path === file))

    // THE SENTINEL: a listing that found nothing would satisfy this having
    // probed only the hypothetical paths.
    expect(carrying).toContain('apps/web/lib/auth/guard.ts')

    const probes = [...carrying, ...ACTION_PATH_PROBES]

    expect(
      pathsWithAProcessor(probes),
      'a config block gives these paths a processor, which hands every rule text of its own choosing: this rule cannot see a directive a preprocess step removed',
    ).toEqual([])
  })

  it('does not walk the generated directories prettier ignores, so the gate is one anybody can pass', () => {
    // WHY THIS SITS BESIDE THE RULE. `eslint.config.js` excludes generated
    // artefact directories, and its own comment says why: they are
    // `.gitignore`d, so they are invisible in `git status`, but ESLint walks
    // the WORKING TREE — which made `npm run lint`, and therefore the
    // pre-commit gate, pass or fail depending on whether the developer had run
    // `test:e2e` or `test:perf` since the last clean. CLAUDE.md §11: a gate has
    // to be one a developer can always pass honestly.
    //
    // The comment claimed the class was closed and it was not:
    // `.lighthouseci/`, `blob-report/`, `build/` and `.superpowers/` were in
    // `.prettierignore` and not in that array, so `isPathIgnored` answered
    // false for all four while answering true for `lhci-reports/`. None held a
    // linted extension, so nothing was failing — which is why only an
    // executable check finds it. Asked of ESLint's own API rather than read out
    // of the config's source text, and read off `.prettierignore` rather than
    // from a list here, so the next directory added to one file and not the
    // other fails on that commit.
    const probes = generatedDirectoryProbes()

    // THE SENTINEL, first: an empty `.prettierignore`, or a filter that matched
    // no line, would satisfy the assertion below having probed nothing.
    expect(probes.length).toBeGreaterThanOrEqual(10)
    expect(pathsEslintWalks(probes)).toEqual([])
  })

  it('still walks this repository’s own source, so the exclusions above are not a hole', () => {
    // Without this, an `ignores` array of `['**']` would pass the case above.
    expect(pathsEslintWalks(['apps/web/lib/auth/guard.ts', 'eslint-rules/guarded-server-actions.js'])).toEqual([
      'apps/web/lib/auth/guard.ts',
      'eslint-rules/guarded-server-actions.js',
    ])
  })

  it('can tell a file that disables it from one that does not', () => {
    // Without this, a scan that matched nothing would pass the cases above by
    // agreeing with an allowlist it never tested against.
    //
    // The needle is ASSEMBLED, here as everywhere in this file: written out,
    // this line would put the directive's own spelling into a file the scan
    // above reads, and the scan would then have to excuse itself.
    const nextLine = `${DISABLE_DIRECTIVE}-next-line ${ACTIONS_RULE}`

    expect(textOf('app/(payload)/layout.tsx')).toContain(nextLine)
    expect(textOf('lib/auth/guard.ts')).not.toContain(nextLine)
  })

  it('resolves the factory to a real file, so a module merely named like it is not it', () => {
    // Round 6's other two defeats, and the reason they are asserted HERE as
    // well as in the rule's own RuleTester suite: both were about a path on
    // disk rather than about a syntax tree. The old check tested the import
    // specifier against a suffix pattern, so a decoy at
    // `apps/web/lib/auth/guardedAction.ts` - a file this repository has never
    // had, meaning the optional group could only ever admit a forgery - and an
    // `auth/guard.ts` written beside the action and imported as `./auth/guard`
    // both satisfied it while calling no guard.
    //
    // What the rule compares now is a resolved path against ONE real file, so
    // that file has to be where the rule looks for it. This case is what fails
    // if `guard.ts` is ever moved or renamed without the rule being told.
    const rule = textOf('../../eslint-rules/guarded-server-actions.js')

    expect(rule).toContain("'../apps/web/lib/auth/guard.ts'")
    expect(rule).not.toContain('FACTORY_MODULE')
    expect(filesUnder('lib/auth')).toContain('lib/auth/guard.ts')
  })

  it('has a factory for actions to be built from, which is what makes the rule satisfiable', () => {
    // A rule nobody can satisfy is a rule Phase 4 turns off. `guardedAction`
    // is the one shape it admits, and it lives beside the guard it calls.
    expect(textOf('lib/auth/guard.ts')).toContain('export const guardedAction =')
    expect(textOf('lib/auth/guard.ts')).toContain('await requireAdminSession()')
  })
})
