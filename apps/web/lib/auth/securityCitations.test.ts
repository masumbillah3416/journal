/**
 * securityCitations.test.ts — every test case `docs/security.md` names in its
 * table must exist, spelled exactly the way the table spells it.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * That table is the audit: one row per `SECURITY.md` requirement, and — since
 * Phase 2 Task 11 — a "Discharged in" column that names the module the
 * behaviour lives in and quotes the test cases that hold it there. A hundred
 * and nine quotations, whose entire value is that a reader can take one,
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
 * Nobody can hold a hundred and nine strings in their head across a rewrite.
 * This is the check that can.
 *
 * ═══ WHY IT IS A UNIT TEST AND NEEDS NO DATABASE ═══
 *
 * It reads two things off disk and compares strings: the document, and every
 * `.ts`/`.tsx` file under `apps/`, `packages/` and `e2e/`. No Payload, no
 * Postgres, no browser — so it runs in the Docker-free `unit` project and
 * therefore inside `npm run verify`, which is the pre-commit gate. A guard
 * that only runs in CI catches this one commit later than it can.
 *
 * ═══ HOW IT AVOIDS BEING VACUOUS ═══
 *
 * Three ways, because a scan is the easiest kind of test to leave asserting
 * nothing (this repository has found fifteen such tests in one phase, and one
 * of them was introduced inside the fix for another):
 *
 *   1. The count of quotations is asserted against a floor. A regex that
 *      matched nothing at all, or a document whose table was emptied, would
 *      otherwise pass every assertion below trivially.
 *   2. A string that is deliberately not a case name anywhere is required NOT
 *      to be found, so the search is proved able to answer "no".
 *   3. The corpus is asserted to contain a case name this file did not put
 *      there, so a file walk that silently returned nothing fails here rather
 *      than passing everything.
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
 * PATTERNS (CLAUDE.md §3.3): none of the seven. It is one scan and three
 * assertions, and naming a pattern for it would be cargo cult.
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
 * How many quotations the table is expected to carry, at least.
 *
 * A FLOOR, NOT THE COUNT. Pinning the exact number would fail every time a row
 * gained a case, which trains its author to edit the number rather than read
 * the failure — and a test edited on every green change stops being read. What
 * this catches is the failure that matters: a regex, or a table, that stopped
 * producing quotations at all. There were 109 when this was written.
 */
const AT_LEAST_THIS_MANY_QUOTATIONS = 90

/**
 * A string shaped exactly like a case name and deliberately not one, so the
 * search below is proved able to answer "no".
 */
const NOT_A_CASE_NAME_ANYWHERE = 'refuses a code that was never issued to anybody at all, ever'

/**
 * A case name this file did not write and does not own, asserted present so a
 * file walk that returned nothing fails loudly rather than silently passing.
 */
const A_CASE_NAME_THAT_MUST_BE_FOUND = 'draws the code from the CSPRNG, not from Math.random'

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

/** Every quotation in a table row of the document, in order. */
const quotedCaseNames = (document: string): readonly string[] =>
  document
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .flatMap((line) => [...line.matchAll(/“(.+?)”/gu)].map((match) => match[1] ?? ''))

/** Every character of this repository's own TypeScript, as one string. */
const allSource = (): string =>
  SOURCE_ROOTS.flatMap((root) => sourceFilesUnder(path.join(REPO_ROOT, root)))
    // EXCLUDING ITSELF IS LOAD-BEARING, not tidiness: this file holds
    // `NOT_A_CASE_NAME_ANYWHERE` as a literal, so a corpus that included it
    // would find that string and the "can answer no" case could never pass.
    // The one name this file requires to be PRESENT is deliberately owned
    // elsewhere (`otpService.integration.test.ts`), so excluding this file
    // cannot make that assertion pass by accident either.
    .filter((file) => file !== fileURLToPath(import.meta.url))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')

describe('the case names docs/security.md quotes', () => {
  it('are all real, and spelled exactly as the table spells them', () => {
    const quoted = quotedCaseNames(readFileSync(SECURITY_DOC, 'utf8'))
    const source = withOneSpellingOfApostrophe(allSource())

    // The floor first: every assertion after this one is over `quoted`, and
    // all of them hold trivially when it is empty.
    expect(quoted.length).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_QUOTATIONS)

    const unfindable = quoted.filter((name) => !source.includes(withOneSpellingOfApostrophe(name)))

    expect(unfindable).toEqual([])
  })

  it('are checked by a search that can actually answer no', () => {
    // Without this, a comparison that accidentally matched everything — an
    // empty needle, a normalisation that ate the string — would report every
    // citation resolvable and prove nothing.
    const source = withOneSpellingOfApostrophe(allSource())

    expect(source).not.toContain(NOT_A_CASE_NAME_ANYWHERE)
    expect(source).toContain(A_CASE_NAME_THAT_MUST_BE_FOUND)
  })
})
