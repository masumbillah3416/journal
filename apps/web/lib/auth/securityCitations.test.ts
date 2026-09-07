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
 * ═══ WHY IT IS A UNIT TEST AND NEEDS NO DATABASE ═══
 *
 * It reads two things off disk and compares strings: the document, and every
 * `.ts`/`.tsx` file under `apps/`, `packages/` and `e2e/`. No Payload, no
 * Postgres, no browser — so it runs in the Docker-free `unit` project and
 * therefore inside `npm run verify`, which is the pre-commit gate. A guard that
 * only runs in CI catches this one commit later than it can.
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
 * handoff, of the UI's own copy, or of a dependency's message, quoted as prose.
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
  'too many attempts',
  'wrong password',
  'respond identically',
  'no such account',
  'Sign out everywhere',
  'Keep me signed in',
  'keep me signed in',
  'will never use eval() in production mode',
  'a logged-in user',
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

/** Every quoted run in a table row of the document, in order. */
const quotedRunsInTableRows = (document: string): readonly string[] =>
  document
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .flatMap((line) => [...line.matchAll(QUOTED_RUN)].map((match) => match[1] ?? match[2] ?? ''))

describe('the case names docs/security.md quotes', () => {
  it('are all real declarations, spelled exactly as the table spells them', () => {
    const document = readFileSync(SECURITY_DOC, 'utf8')
    const declared = declaredCaseNames()
    const quoted = quotedRunsInTableRows(document)
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

    const stale = QUOTED_PROSE.filter((prose) => !document.includes(prose))
    const actuallyCases = QUOTED_PROSE.filter((prose) => declared.has(withOneSpellingOfApostrophe(prose)))

    expect(stale).toEqual([])
    expect(actuallyCases).toEqual([])
  })

  it('are checked by a search that can actually answer no', () => {
    // Without this, an extraction that accidentally matched everything — an
    // empty needle, a normalisation that ate the string — would report every
    // citation resolvable and prove nothing.
    const declared = declaredCaseNames()

    expect(declared.has(NOT_A_CASE_NAME_ANYWHERE)).toBe(false)
    expect(declared.has(A_CASE_NAME_THAT_MUST_BE_FOUND)).toBe(true)
  })
})
