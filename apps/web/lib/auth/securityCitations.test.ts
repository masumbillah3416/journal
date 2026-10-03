/**
 * securityCitations.test.ts — every test case `docs/security.md` names in its
 * table must exist, as a real case declaration, spelled exactly the way the
 * table spells it.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * That table is the audit: one row per `SECURITY.md` requirement, and — since
 * Phase 2 Task 11 — a "Discharged in" column that names the module the
 * behaviour lives in and quotes the test cases that hold it there. A hundred
 * and thirteen quotations, whose entire value is that a reader can take one,
 * search for it, and read the case.
 *
 * The task that wrote them claimed "every case name was read out of the file
 * it is attributed to; none is paraphrased". Its review found three that were,
 * plus nine more that carried Markdown the source does not (backticks inside
 * the quotation, restyled quotes) and so could not be found either. All twelve
 * pointed at real, correct, covering cases — which is exactly what makes the
 * defect dangerous rather than obvious: nothing was wrong with the discharge,
 * only with the citation, and a citation that does not resolve is how a reader
 * stops trusting the hundred that do.
 *
 * Nobody can hold a hundred and thirteen strings in their head across a
 * rewrite. This is the check that can.
 *
 * ═══ WHAT IT MATCHES AGAINST, AND WHY THAT CHANGED ═══
 *
 * **Case declarations, not file text.** The first version of this file joined
 * every source file's whole contents into one string and asked whether each
 * quotation appeared in it. That would have accepted a quotation that only ever
 * appeared inside a module header comment, while the case is named "are all
 * real" — the guard reading stronger than it enforced, which is the shape this
 * phase has now found sixteen times. It now extracts the FIRST ARGUMENT of
 * every `it(...)` and `test(...)` in the repository and requires each citation
 * to be one of those names.
 *
 * **Both quote characters.** It also matched only curly `“…”` runs, so a
 * citation someone typed with straight quotes was not checked at all — and not
 * checked SILENTLY, which is the failure mode this guard exists to end. It now
 * reads both, and separates citations from prose by a property that is not the
 * quote character: {@link QUOTED_PROSE}, an explicit list of the fragments in
 * that table which quote the handoff, the UI or a spec rather than a test. Each
 * entry is required to still be present, so the list cannot rot into a hole; a
 * quoted run that is neither a declared case name nor a listed fragment fails,
 * which is the fail-closed direction.
 *
 * ═══ AND BACKTICKS, WHICH IS HOW THE PROSE SPELLS THEM ═══
 *
 * The same hole, one layer out, and found the same way. The table is quoted;
 * the PROSE around it writes a case name in backticks, and `QUOTED_RUN` sees
 * neither a curly nor a straight run there, so those citations were checked by
 * nothing at all. Phase 4 Task 13's fix round renamed an `e2e` case and left
 * this document's prose citing the old name in backticks; every gate stayed
 * green, including this one, and a human found it (`docs/deviations.md` §98).
 *
 * Widening it is not one more alternative in the pattern, because a backticked
 * run in this document is usually a path, an identifier, a field, a section
 * number or a fragment of SQL — in the very paragraph that defect lived in,
 * three backticked runs name real cases and a fourth names `e2e/routing.spec.ts`.
 * So a case name is separated from code by the one property a test case has and
 * a token does not: **it is a sentence.**
 * {@link A_CASE_NAME_IS_AT_LEAST_THIS_MANY_WORDS} is the WHOLE of that rule —
 * length, and nothing else.
 *
 * ═══ AND LENGTH ALONE, BECAUSE THE OTHER THREE RULES COULD NEVER FIRE ═══
 *
 * This file shipped with three refusals in front of the length rule —
 * {@link isPathCitation}, {@link isIdentifierCitation} and
 * {@link isSectionCitation} from `apps/web/lib/docs/citations.ts` — and a
 * sentence saying the four kinds were told apart by rules this repository
 * already owns. Review round 1 (F1) ran the one mutation that settles it:
 * deleting all three left every case in this file green, because the first two
 * are anchored single-token patterns and the third spans three tokens at most,
 * so NO run that reaches the floor can be refused by any of them. They were
 * unreachable by construction, and the sentence described a composition rather
 * than an effect — `CLAUDE.md` §0's first species, in the file written to catch
 * it.
 *
 * They are gone. What stands in their place is the premise that made them
 * pointless, measured on the real document on every run by
 * `are told apart from backticked code by length, which nothing in this
 * document outgrows`: all 564 backticked runs those three rules call code are
 * SHORTER than the floor — one word each, as it happens, because this document
 * backticks the file name and leaves the mark outside. So the case reddens if
 * the floor is lowered to one, or if those rules ever start describing
 * something a space can fit inside; it named all 254 distinct runs when that
 * was watched. The refusals could not have reddened on anything.
 *
 * Everything at or above the floor
 * must be a declared case name or be listed in
 * {@link BACKTICKED_RUNS_THAT_ARE_NOT_CASE_NAMES} with a reason, both
 * directions asserted, exactly as the quoted half works. A run this file has
 * never seen fails; that is the fail-closed direction, and it is the direction
 * the rename walked through.
 *
 * ═══ WHY IT IS A UNIT TEST AND NEEDS NO DATABASE ═══
 *
 * It reads two things off disk and compares strings: the document, and every
 * `.ts`/`.tsx` file under `apps/`, `packages/` and `e2e/`. No Payload, no
 * Postgres, no browser — so it runs in the Docker-free `unit` project and
 * therefore inside `npm run verify`, which is the pre-commit gate. A guard that
 * only runs in CI catches this one commit later than it can.
 *
 * ═══ WHAT IT STILL CANNOT SEE, MEASURED ═══
 *
 * A case name shorter than {@link A_CASE_NAME_IS_AT_LEAST_THIS_MANY_WORDS},
 * cited in backticks, reads as a token and is not checked. Three of this
 * repository's declared case names were that short when this was written, and
 * the case below holds that share under
 * {@link A_BLIND_SPOT_THIS_LARGE_IS_NO_LONGER_A_BLIND_SPOT} — so the hole
 * cannot grow quietly, which is the only thing that would make it matter.
 *
 * ═══ HOW IT AVOIDS BEING VACUOUS ═══
 *
 * Five ways, because a scan is the easiest kind of test to leave asserting
 * nothing (this repository has found sixteen such tests in one phase, and one
 * of them was introduced inside the fix for another):
 *
 *   1. The count of citations is asserted against a floor. A regex that matched
 *      nothing at all, or a document whose table was emptied, would otherwise
 *      pass every assertion below trivially.
 *   2. The count of DECLARED case names is asserted against a floor too — the
 *      corpus is now an extraction rather than raw text, so a declaration regex
 *      that quietly stopped matching would make every citation unresolvable
 *      rather than silently resolvable, but a floor says so in one line instead
 *      of a hundred and thirteen.
 *   3. A string that is deliberately not a case name anywhere is required NOT
 *      to be among them, so the search is proved able to answer "no".
 *   4. A case name this file did not write is required to be among them, so an
 *      extraction that returned nothing fails here rather than passing
 *      everything.
 *   5. Every entry of {@link QUOTED_PROSE} must still appear in the document,
 *      so an exemption cannot outlive the text it exempts.
 *
 * ═══ WHAT IT NORMALISES, AND WHY THAT IS NOT A LOOPHOLE ═══
 *
 * Exactly two things, both of them notation rather than words: a backslash
 * before an apostrophe (how a case name containing one is written inside a
 * single-quoted TypeScript literal) and the curly apostrophe `’` (which this
 * codebase's prose uses and its test names mix). Nothing else is normalised —
 * not case, not whitespace, not punctuation — so a paraphrase of any kind
 * still fails.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. It is two extractions and a set
 * comparison, and naming a pattern for it would be cargo cult.
 *
 * Depends on: vitest, node:fs, node:path, node:url, and the two things it
 * reads — `docs/security.md` and this repository's own TypeScript.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { backtickedRuns, isIdentifierCitation, isPathCitation, isSectionCitation } from '../docs/citations'

/** The repository root, from this file's own location. */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

/** The document whose citations are under test. */
const SECURITY_DOC = path.join(REPO_ROOT, 'docs/security.md')

/** Where this repository's own TypeScript lives. */
const SOURCE_ROOTS = ['apps', 'packages', 'e2e'] as const

/** Directories a source walk must never descend into. */
const NOT_SOURCE: readonly string[] = ['node_modules', '.next', 'dist', 'coverage', 'test-results']

/**
 * Every `it(...)`/`test(...)` whose first argument is a quoted string, with
 * that string captured.
 *
 * Both quote characters, because a name containing an apostrophe is usually
 * written in double quotes to avoid escaping it, and both spellings exist here.
 * The escape classes are what let a name contain its own quote character.
 */
const CASE_DECLARATION = /\b(?:it|test)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/gu

/**
 * Every quoted run inside a Markdown table row, curly or straight.
 *
 * TWO ALTERNATIVES, NOT ONE CHARACTER CLASS. A class of both openers and both
 * closers lets `“honours "` match as a run — a curly opener closed by a
 * straight quote — which chops the one citation that embeds a straight-quoted
 * phrase into pieces that resolve to nothing. Alternation with the curly form
 * first means an opening `“` is closed by a `”`, and anything it encloses
 * (including inner straight quotes) belongs to that citation.
 */
const QUOTED_RUN = /“(.+?)”|"(.+?)"/gu

/**
 * How many citations the table is expected to carry, at least.
 *
 * A FLOOR, NOT THE COUNT. Pinning the exact number would fail every time a row
 * gained a case, which trains its author to edit the number rather than read
 * the failure — and a test edited on every green change stops being read. What
 * this catches is the failure that matters: a regex, or a table, that stopped
 * producing citations at all. There were 113 when this was written.
 */
const AT_LEAST_THIS_MANY_CITATIONS = 90

/**
 * How many case declarations the repository is expected to hold, at least.
 *
 * A floor for the same reason, guarding the other half: the corpus is an
 * extraction now, so a declaration pattern that stopped matching would make
 * every citation unresolvable. This says so in one failure rather than 113.
 * There were 1,848 when this was written.
 */
const AT_LEAST_THIS_MANY_DECLARATIONS = 500

/**
 * How many words a backticked run must carry before it is read as a quoted case
 * name rather than as a token of code.
 *
 * ═══ BOTH SIDES, MEASURED OVER THIS DOCUMENT AND THIS REPOSITORY ═══
 *
 * Driven rather than chosen, and every number below is a reading taken when
 * this was written rather than a property anything holds to. Over the 604
 * distinct backticked runs in
 * `docs/security.md`, after the path, identifier and section rules have taken
 * their share, the threshold decides how much of the remainder has to resolve:
 *
 *   - at **four** words, 42 runs are judged — the 15 real case-name citations
 *     and 27 pieces of code, SQL, shell and build output, which are listed
 *     below. Three of the repository's 3,985 declared case names are shorter
 *     than four words, so the blind spot is those three.
 *   - at **six**, the list falls to 10 entries and the blind spot rises to 68
 *     names, more than twenty times larger.
 *
 * Four, because the exemption list is asserted in both directions and cannot
 * rot, while the blind spot is asserted by nothing except
 * {@link A_BLIND_SPOT_THIS_LARGE_IS_NO_LONGER_A_BLIND_SPOT}. Trading a list
 * that maintains itself for silence is the trade this guard exists to refuse.
 */
const A_CASE_NAME_IS_AT_LEAST_THIS_MANY_WORDS = 4

/**
 * The largest share of declared case names that may be too short for the rule
 * above before the rule stops being worth its name.
 *
 * It was 3 in 3,985 when this was written. A ceiling rather than that number,
 * for the reason every floor here is a floor: a count pinned exactly is a count
 * its next author edits instead of reading.
 */
const A_BLIND_SPOT_THIS_LARGE_IS_NO_LONGER_A_BLIND_SPOT = 0.01

/** A floor on the backticked runs judged, so an extraction that stopped matching fails here. */
const AT_LEAST_THIS_MANY_BACKTICKED_CANDIDATES = 30

/**
 * A floor on the backticked runs that `apps/web/lib/docs/citations.ts` calls a
 * path, an identifier or a `<document> §N`, so that the case measuring their
 * length is measuring something.
 *
 * 564 of them when this was measured. A floor, not the count: this document
 * gains and loses backticked paths with every edit, and a number pinned exactly
 * is a number its next author edits instead of reading.
 */
const AT_LEAST_THIS_MANY_BACKTICKED_CODE_RUNS = 400

/**
 * A string shaped exactly like a case name and deliberately not one, so the
 * search below is proved able to answer "no".
 */
const NOT_A_CASE_NAME_ANYWHERE = 'refuses a code that was never issued to anybody at all, ever'

/**
 * A case name this file did not write and does not own, asserted present so an
 * extraction that returned nothing fails loudly rather than silently passing.
 */
const A_CASE_NAME_THAT_MUST_BE_FOUND = 'draws the code from the CSPRNG, not from Math.random'

/**
 * The quoted runs in that table which are NOT citations: fragments of the
 * handoff, of the UI's own copy, of a dependency's message, or of a phase's own
 * exit criterion, quoted as prose.
 *
 * THIS LIST IS THE PROPERTY THAT SEPARATES PROSE FROM CITATIONS, and it is
 * deliberately not "the quote character somebody typed" — that was the previous
 * separator, and it meant a citation written with straight quotes was skipped
 * without anyone being told. Anything quoted in a table row that is neither a
 * declared case name nor listed here fails, so the untyped case is the failing
 * case.
 *
 * Every entry is asserted to still appear in the document, so removing the
 * sentence an exemption was written for removes the exemption with it.
 */
const QUOTED_PROSE: readonly string[] = [
  // `SECURITY.md`'s own sentences, quoted back at the requirement they state.
  'too many attempts',
  'wrong password',
  'no such account',
  'respond identically',
  'Keep me signed in',
  'keep me signed in',
  'Sign out everywhere',
  'EXIF verifiably absent',
  're-encode stills rather than passing originals through',
  'shoot anything at home and you have published your home address',
  "Not an attacker \u2014 losing 40GB of photographs. Automated offsite backups of Postgres and the media bucket, on a schedule, to a different provider. Versioned or write-once bucket storage, so a bad script or a compromised key can't delete history. Test a restore. An untested backup is a hypothesis.",
  'Export everything',
  // The admin's and the diary's own copy, quoted so a reader can recognise the
  // screen the sentence describes.
  'Those details did not let you in.',
  'Your password was right, but the code could not be sent. Try again shortly.',
  'Send a new code',
  'Three wrong codes',
  'Signed in',
  '\u2190 Back to password',
  // A dependency's or a spec's words, or a column heading, quoted as prose.
  'will never use eval() in production mode',
  'a logged-in user',
  'Discharged in',
  'Planned server actions',
  'Phase 2.',
  'all collections and the first migration',
  'server-side',
  'invalidate it and **force a resend**',
  // Phrases this document quotes from ITS OWN earlier revisions or from another
  // module's prose, in order to describe or refuse them. Each is a quotation of
  // a claim rather than a claim, which is the one thing a check cannot tell
  // apart - so they are listed, and each is asserted below to still be here.
  '`overrideAccess: false` is what makes Payload run those rules at all',
  'only occurrences',
  'other occurrences',
  'the only occurrences of the option in this repository',
  'no per-field sweep',
  'signed in, or refused',
  'signed in',
  'any account',
  'what a browser form would have sent',
  'the endpoint works',
  'a reader can sign in',
]

/**
 * The backticked runs in `docs/security.md` that read as sentences and are not
 * case names: SQL, shell, build output, a dependency's message, a result value,
 * a line of source, and two pieces of the admin's own copy.
 *
 * THE SAME TWO DIRECTIONS AS {@link QUOTED_PROSE}, for the same reason. Every
 * entry must still appear in the document, so an exemption cannot outlive the
 * sentence it was written for; and none may be a declared case name, so the
 * list cannot quietly excuse a real citation. A run that is neither is the
 * failing case.
 */
const BACKTICKED_RUNS_THAT_ARE_NOT_CASE_NAMES: readonly { readonly run: string; readonly why: string }[] = [
  // SQL, written out so a reader can see the predicate rather than trust it.
  { run: 'UPDATE ... WHERE consumed_at IS NULL', why: 'the consume statement, quoted as SQL' },
  {
    run: 'UPDATE ... SET attempts = attempts + 1 WHERE attempts < MAX_ATTEMPTS AND consumed_at IS NULL AND created_at > <floor>',
    why: 'the attempt statement, quoted as SQL so the atomicity argument can be read',
  },
  // Configuration and call shapes, quoted so the option being discussed is exact.
  { run: 'N: 16384, r: 8, p: 1', why: "scrypt's cost parameters, quoted as the numbers they are" },
  { run: 'graphQL: { disableMutations: true }', why: "Payload's own option, quoted from the config" },
  { run: 'lockTime: 15 * 60_000', why: "Payload's lockout option, quoted with its arithmetic" },
  { run: 'module.exports = { … }', why: 'the CommonJS shape an ESLint rule file must have' },
  {
    run: '{ hidden: { not_equals: true } }',
    why: "a Payload `where` clause, quoted from the collection's access rule",
  },
  { run: '{ user, overrideAccess: false }', why: 'the options object every narrowed Payload call passes' },
  { run: "{ ok: false, error: 'svg-rejected' }", why: "the processor's own refusal value" },
  { run: '{ orientation: 1 }', why: 'the metadata sharp writes back, quoted from the re-encode' },
  {
    run: 'const scope = await adminScope(session)',
    why: 'a line of source, quoted to show where the scope comes from',
  },
  {
    run: 'await payload.update({ collection, id, ...scope, data })',
    why: 'the line that spreads it, quoted beside the one above',
  },
  // Shell and build output, which is a transcript rather than a sentence.
  { run: 'CI=1 next build && next start', why: 'the command the production-mode CSP measurement was taken under' },
  { run: 'npx playwright install firefox webkit', why: 'the command a reader needs to run the cross-browser check' },
  { run: 'tsc -p apps/web --noEmit', why: 'the type-check command, named as one of the verify gates' },
  { run: '○ /robots.txt (Static) prerendered as static content', why: "a line of `next build`'s own output" },
  {
    run: 'eval() is not supported in this environment... React requires eval() in development mode',
    why: "React's own error text, quoted so the production-only CSP rule can be justified",
  },
  {
    run: 'root=é:svg ns=http://www.w3.org/2000/svg svgRects=1 scriptRan=true',
    why: 'what the namespace probe printed, quoted as a reading',
  },
  // Bytes, read off a file with a hex editor.
  { run: 'c2 a0 c2 a0', why: 'the bytes of two non-breaking spaces, read off a probe file' },
  { run: 'e3 80 80 71', why: 'the bytes of an ideographic space, read the same way' },
  { run: '0b 0c 0b 0c', why: 'the bytes of a vertical tab and a form feed, read the same way' },
  { run: 'c2 c2 c2 c2', why: 'a run of lone continuation bytes, read the same way' },
  { run: '69 87 04 00', why: 'the bytes of an EXIF IFD pointer tag, read off a re-encoded JPEG' },
  { run: '03 90 02 00', why: 'the bytes of the DateTimeOriginal tag, read the same way' },
  // The admin's and the diary's own copy, quoted so a reader recognises the screen.
  { run: 'password the whole book', why: "the Settings screen's own label for the site-wide gate" },
  { run: '0 of 3 tried', why: "the code step's attempts counter, quoted as the screen draws it" },
  {
    run: '"Send a new code", disabled false',
    why: 'a reading taken off the resend button, quoted as the measurement it is',
  },
]

/**
 * Notation removed before comparing: the backslash TypeScript needs before an
 * apostrophe inside a single-quoted literal, and the curly apostrophe this
 * codebase's prose prefers. Words, spacing, case and every other mark are left
 * exactly as they are.
 * @param text - The text to normalise.
 * @returns The same text with both apostrophe spellings reduced to one.
 */
const withOneSpellingOfApostrophe = (text: string): string => text.replaceAll("\\'", "'").replaceAll('’', "'")

/**
 * Every `.ts`/`.tsx` file under a directory, recursively.
 * @param directory - Where to start.
 * @returns Absolute paths.
 */
const sourceFilesUnder = (directory: string): readonly string[] =>
  readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry)
    if (NOT_SOURCE.includes(entry)) return []
    if (statSync(full).isDirectory()) return sourceFilesUnder(full)
    return entry.endsWith('.ts') || entry.endsWith('.tsx') ? [full] : []
  })

/**
 * Every case name this repository declares, normalised.
 *
 * EXCLUDES THIS FILE, and that is load-bearing rather than tidiness: this file
 * holds {@link NOT_A_CASE_NAME_ANYWHERE} as a literal, and a future edit that
 * put such a sentinel inside an `it(...)` would satisfy the "can answer no"
 * case with its own declaration. The one name this file requires to be PRESENT
 * is deliberately owned elsewhere (`otpService.integration.test.ts`), so
 * excluding this file cannot make that assertion pass by accident either.
 * @returns The set of declared names.
 */
const declaredCaseNames = (): ReadonlySet<string> => {
  const names = new Set<string>()
  const own = fileURLToPath(import.meta.url)
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFilesUnder(path.join(REPO_ROOT, root))) {
      if (file === own) continue
      for (const match of readFileSync(file, 'utf8').matchAll(CASE_DECLARATION)) {
        names.add(withOneSpellingOfApostrophe(match[1] ?? match[2] ?? ''))
      }
    }
  }
  return names
}

/**
 * The document with every run of whitespace collapsed to one space.
 *
 * A quotation in wrapped prose spans lines; a Markdown renderer joins them, and
 * so does this, so that a citation is one string here exactly as it is one
 * phrase on the page.
 * @param document - The document's whole text.
 * @returns The same text on one line.
 */
const collapsed = (document: string): string => document.replace(/\s+/gu, ' ')

/** Every quoted run in the document, in order. */
const quotedRuns = (document: string): readonly string[] =>
  [...collapsed(document).matchAll(QUOTED_RUN)].map((match) => match[1] ?? match[2] ?? '')

/**
 * Whether a backticked run is this document quoting a test case.
 *
 * LENGTH ALONE, WHICH IS A STRONGER RULE THAN THE FOUR-WAY TEST IT REPLACED.
 * A path, an identifier and a `<document> §N` are told apart from a case name
 * because they are SHORT: `pathCitations.test.ts`'s two patterns are anchored
 * single tokens and a section citation spans three at most, so none of them can
 * describe anything that reaches
 * {@link A_CASE_NAME_IS_AT_LEAST_THIS_MANY_WORDS}. Naming them here as well
 * read as a discrimination and performed none (review round 1, F1); the
 * property that makes the omission safe is measured instead, by the case this
 * file's header names.
 * @param run - The text between the backticks.
 * @returns Whether it must resolve to a declared case name.
 * @example
 * isCaseNameQuotation('e2e/routing.spec.ts') // false — one word, so a token
 */
const isCaseNameQuotation = (run: string): boolean => run.split(' ').length >= A_CASE_NAME_IS_AT_LEAST_THIS_MANY_WORDS

/**
 * Every backticked run in the document that reads as a quoted case name.
 *
 * Collapsed first, for the reason {@link collapsed} gives: a citation in
 * wrapped prose spans lines, and a Markdown renderer joins them.
 * @param document - The document's whole text.
 * @returns The runs, in order, duplicates included.
 */
const backtickedCaseNameQuotations = (document: string): readonly string[] =>
  backtickedRuns(collapsed(document))
    .map(({ run }) => run)
    .filter(isCaseNameQuotation)

describe('the case names docs/security.md quotes', () => {
  it('are all real declarations, spelled exactly as the document spells them', () => {
    const document = readFileSync(SECURITY_DOC, 'utf8')
    const declared = declaredCaseNames()
    const quoted = quotedRuns(document)
    const citations = quoted.filter((run) => !QUOTED_PROSE.includes(run))

    // The two floors first: every assertion after them is over these
    // collections, and all of them hold trivially when either is empty.
    expect(citations.length).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_CITATIONS)
    expect(declared.size).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_DECLARATIONS)

    const unfindable = citations.filter((name) => !declared.has(withOneSpellingOfApostrophe(name)))

    expect(unfindable).toEqual([])
  })

  it('are separated from quoted prose by a list nothing can outgrow unnoticed', () => {
    // An exemption that outlives the sentence it exempts is a hole with a
    // comment over it: the next citation to use those words would be waved
    // through. Requiring each entry to still be in the document closes that,
    // and requiring none of them to be a declared case name keeps the list from
    // quietly excusing a real citation.
    const document = readFileSync(SECURITY_DOC, 'utf8')
    const declared = declaredCaseNames()

    const stale = QUOTED_PROSE.filter((prose) => !collapsed(document).includes(prose))
    const actuallyCases = QUOTED_PROSE.filter((prose) => declared.has(withOneSpellingOfApostrophe(prose)))

    expect(stale).toEqual([])
    expect(actuallyCases).toEqual([])
  })

  it('are all real declarations when the prose writes them in backticks, too', () => {
    // THE HOLE `QUOTED_RUN` LEFT, AND THE ONE A RENAME WALKED THROUGH. Task 13
    // renamed an `e2e` case and left this document's prose citing the old name
    // in backticks; every gate stayed green, including this file
    // (`docs/deviations.md` §98). Backticks are how the prose spells a case
    // name, so the prose was the half nothing read.
    const document = readFileSync(SECURITY_DOC, 'utf8')
    const declared = declaredCaseNames()
    const excused = new Set(BACKTICKED_RUNS_THAT_ARE_NOT_CASE_NAMES.map((entry) => entry.run))

    const candidates = backtickedCaseNameQuotations(document)
    expect(
      candidates.length,
      'no backticked runs were judged, so a green result here would mean nothing',
    ).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_BACKTICKED_CANDIDATES)
    expect(declared.size).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_DECLARATIONS)

    const unfindable = [
      ...new Set(candidates.filter((run) => !excused.has(run) && !declared.has(withOneSpellingOfApostrophe(run)))),
    ]

    expect(
      unfindable,
      'this document quotes these in backticks and no test declares them; either a case was renamed under the sentence, or the run is code this file has not been told about',
    ).toEqual([])
  })

  it('are separated from backticked code by a list nothing can outgrow unnoticed', () => {
    // Both directions, exactly as the quoted half: an exemption that outlives
    // its sentence is a hole with a comment over it, and one that starts naming
    // a real case waves a live citation through.
    const document = collapsed(readFileSync(SECURITY_DOC, 'utf8'))
    const declared = declaredCaseNames()

    const stale = BACKTICKED_RUNS_THAT_ARE_NOT_CASE_NAMES.filter((entry) => !document.includes(entry.run)).map(
      (entry) => entry.run,
    )
    const actuallyCases = BACKTICKED_RUNS_THAT_ARE_NOT_CASE_NAMES.filter((entry) =>
      declared.has(withOneSpellingOfApostrophe(entry.run)),
    ).map((entry) => entry.run)
    const unjudged = BACKTICKED_RUNS_THAT_ARE_NOT_CASE_NAMES.filter((entry) => !isCaseNameQuotation(entry.run)).map(
      (entry) => entry.run,
    )

    expect(stale, 'these exemptions are no longer written in docs/security.md').toEqual([])
    expect(actuallyCases, 'these exemptions now name a real case, so they excuse nothing and must be deleted').toEqual(
      [],
    )
    // An entry the classifier would never reach excuses nothing and hides that
    // the classifier moved — which is how a list outlives the loop that spends
    // it (`docs/deviations.md` §108's own species).
    expect(unjudged, 'these exemptions are not even candidates, so the rule above has changed under them').toEqual([])
    expect(BACKTICKED_RUNS_THAT_ARE_NOT_CASE_NAMES.filter((entry) => entry.why.length < 20)).toEqual([])
  })

  it('leave a blind spot too small to hide a renamed case in', () => {
    // WHAT THE LENGTH RULE COSTS, MEASURED ON EVERY RUN RATHER THAN ASSERTED
    // ONCE. A case name shorter than the threshold, cited in backticks, reads
    // as a token and is not checked. That is tolerable while almost no case
    // name is that short, and this is the thing that stops being true quietly.
    const declared = declaredCaseNames()
    const short = [...declared].filter((name) => name.split(/\s+/u).length < A_CASE_NAME_IS_AT_LEAST_THIS_MANY_WORDS)

    expect(declared.size).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_DECLARATIONS)
    expect(
      short.length / declared.size,
      `${String(short.length)} declared case names are shorter than ${String(A_CASE_NAME_IS_AT_LEAST_THIS_MANY_WORDS)} words, which is more than this guard can leave unread: ${short.slice(0, 10).join(' | ')}`,
    ).toBeLessThan(A_BLIND_SPOT_THIS_LARGE_IS_NO_LONGER_A_BLIND_SPOT)
  })

  it('are told apart from backticked code by length, which nothing in this document outgrows', () => {
    // THE PREMISE THAT LETS {@link isCaseNameQuotation} BE ONE LINE, MEASURED
    // RATHER THAN REASONED ABOUT. Until review round 1 this file also refused a
    // path, an identifier and a `<document> §N` by name. Deleting all three left
    // every case here green — they cannot fire above the floor — so what looked
    // like a four-way discrimination was the length rule wearing three extra
    // coats. The refusals are gone; this is the property they were standing in
    // for, and unlike them it can fail.
    const document = readFileSync(SECURITY_DOC, 'utf8')
    const runs = backtickedRuns(collapsed(document)).map(({ run }) => run)
    const code = runs.filter((run) => isPathCitation(run) || isIdentifierCitation(run) || isSectionCitation(run))

    expect(
      code.length,
      'no backticked run in this document is a path, an identifier or a section citation, so this case is measuring nothing',
    ).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_BACKTICKED_CODE_RUNS)
    expect(
      [...new Set(code.filter((run) => run.split(' ').length >= A_CASE_NAME_IS_AT_LEAST_THIS_MANY_WORDS))],
      'these are code by the rules apps/web/lib/docs/citations.ts owns AND long enough to be judged as case names, so length no longer separates the two and this guard needs a refusal in front of it again',
    ).toEqual([])
  })

  it('are checked by a search that can actually answer no', () => {
    // Without this, an extraction that accidentally matched everything — an
    // empty needle, a normalisation that ate the string — would report every
    // citation resolvable and prove nothing.
    const declared = declaredCaseNames()

    expect(declared.has(NOT_A_CASE_NAME_ANYWHERE)).toBe(false)
    expect(declared.has(A_CASE_NAME_THAT_MUST_BE_FOUND)).toBe(true)
    // And the backticked classifier on the four shapes `docs/deviations.md` §98
    // names, which it refuses for ONE reason — they are short. Round 1 read
    // these four lines as proof of a four-way discrimination; they never were,
    // and the case above is where that property now lives.
    expect(isCaseNameQuotation('e2e/routing.spec.ts')).toBe(false)
    // An identifier this repository really declares, rather than one
    // `pathCitations.test.ts` excuses: writing an EXCUSED symbol here would
    // make its exemption resolve, and that file's own list would go red
    // because this file quoted it.
    expect(isCaseNameQuotation('overrideAccess')).toBe(false)
    expect(isCaseNameQuotation('SCREENS.md §2.11')).toBe(false)
    expect(isCaseNameQuotation('depth: 0')).toBe(false)
    expect(isCaseNameQuotation(A_CASE_NAME_THAT_MUST_BE_FOUND)).toBe(true)
  })
})
