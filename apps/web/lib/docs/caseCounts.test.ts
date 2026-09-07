/**
 * caseCounts.test.ts — a count of a test file's cases, written in prose, is a
 * FLOOR that resolves against the file, or the sentence does not carry a count
 * at all.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * Eleven of the ninth whole-branch review's twenty-one findings were one
 * sentence written eleven times: an exact count of a named test file's cases,
 * true on the day it was typed and stale by the next task.
 * `ResetStep.test.tsx` "(19 cases)" had twenty; `otpService.integration.test.ts`
 * "is nineteen cases" had forty; `signIn.integration.test.ts` "is nineteen
 * cases" had twenty-four. Every prior round produced a share of the same shape,
 * and every round corrected the numbers, which is the treatment that guarantees
 * the next round finds them again.
 *
 * `securityCitations.test.ts` had already argued the way out, in its own words:
 * *"Pinning the exact number would fail every time a row gained a case, which
 * trains its author to edit the number rather than read the failure."* The
 * ninth review's recommendation was to adopt that repository-wide, and this is
 * the check that keeps it adopted. **A count in prose is a floor, or it is
 * deleted.**
 *
 * A floor is worth keeping where the magnitude is the point — "the largest
 * component suite here", "at least 32 cases" — because a floor only ever fails
 * when a file LOSES cases, which is a real event a reader should hear about.
 * An exact count fails on every addition, and a check that fails on every
 * healthy change is a check its author edits without reading.
 *
 * ═══ WHAT IT LOOKS AT ═══
 *
 * A backticked path to a test or spec file, followed within
 * {@link CITATION_SPAN} characters by a number and the word "case" or "cases".
 * That is the whole population of this defect, and it is deliberately narrower
 * than "a number in prose": "twenty-eight concurrent requests" and "fifteen
 * runs spanning 2,926ms" are measurements of an experiment, not an inventory of
 * a file, and a rule wide enough to catch them would be a rule nobody could
 * keep.
 *
 * Two things are then asked of every citation it finds:
 *
 *   1. **Is it a floor?** "at least N", "no fewer than N", "N or more", "N+".
 *      Anything else fails, naming the file and the line.
 *   2. **Is the floor true?** The named file is opened and its case
 *      declarations counted. A floor above what the file holds fails — so
 *      "at least 32 cases" cannot become a comfortable fiction either.
 *
 * ═══ WHAT IT DOES NOT CATCH, STATED RATHER THAN IMPLIED ═══
 *
 * - A count with no test file named near it ("six cases failed first and pass
 *   now") is not seen. Nothing resolves it: there is no file to open.
 * - A count of a SUBSET of a file's cases ("its four flag cases") is treated as
 *   a floor over the whole file, which is weaker than the sentence says.
 * - The pairing is by proximity, so a sentence that names one file and counts
 *   another's cases resolves against the wrong file. Where that was true in
 *   this repository the sentence was rewritten to name the file it counts.
 * - Counts elsewhere in prose — of shapes, configurations, documents — are not
 *   this file's subject. The rule is the same and applying it there is a human
 *   act; this is the population that recurred.
 *
 * ═══ HOW IT AVOIDS BEING VACUOUS ═══
 *
 *   1. The number of citations found is floored: an extractor that stopped
 *      matching would report no violations and prove nothing.
 *   2. {@link AN_EXACT_COUNT} — the sentence shape that produced eleven
 *      findings — must be REPORTED, so the check is proved able to answer yes.
 *   3. {@link A_FLOOR_COUNT} must NOT be reported, so it can answer no.
 *   4. The case counter must return a real count for a known file and zero for
 *      a file that declares none, so a counter returning zero everywhere would
 *      make every floor pass and is caught here instead.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. An extraction and a count.
 *
 * Depends on: vitest, node:fs, ./markdownCorpus.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPOSITORY_ROOT, livingDocuments, repositoryFiles } from './markdownCorpus'

/** How far after a test-file citation a count still belongs to it. */
const CITATION_SPAN = 80

/** The number words this repository's prose actually uses for counts. */
const NUMBER_WORDS =
  'two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty'

/** What each number word is worth, for resolving a floor written in words. */
const WORD_VALUE = new Map<string, number>([
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fifty', 50],
])

/**
 * A backticked test-file path, then a count of cases within
 * {@link CITATION_SPAN} characters of it.
 */
const CASE_COUNT_CITATION = new RegExp(
  '`([^`\\n]*\\.(?:test|spec)\\.tsx?)`([\\s\\S]{0,' +
    String(CITATION_SPAN) +
    '}?)(?<![\\w-])((?:' +
    NUMBER_WORDS +
    ')|\\d+)(\\s+(?:\\w+[- ]){0,2}cases?)(?![\\w-])',
  'gui',
)

/** The wordings that make a count a minimum rather than an inventory. */
const FLOOR_PREFIX = /(?:at least|no fewer than|a minimum of|more than)\s*$/iu

/** The wordings that make a count a minimum by following it. */
const FLOOR_SUFFIX = /^\s*(?:or more|and counting)/iu

/** A case declaration: `it(`, `test(`, and their `.each`/`.skip`/`.only` forms. */
const CASE_DECLARATION = /^[ \t]*(?:it|test)(?:\.\w+)*(?:\s*(?:\(|`))/gmu

/** A floor on the citations found, so an extractor that stopped matching fails here. */
const AT_LEAST_THIS_MANY_CITATIONS = 4

/** The sentence shape that produced eleven findings. Required to be reported. */
const AN_EXACT_COUNT =
  'Task 9 adds the last three admin panes — `apps/web/components/admin/ResetStep.test.tsx` (19 cases).'

/** The same sentence written as a floor. Required NOT to be reported. */
const A_FLOOR_COUNT =
  'Task 9 adds the last three admin panes — `apps/web/components/admin/ResetStep.test.tsx` (at least 19 cases).'

/** A file that declares no cases at all, so the counter is proved able to return zero. */
const A_FILE_WITH_NO_CASES = 'apps/web/lib/docs/markdownCorpus.ts'

/** A file whose case count this file does not own, so a counter returning zero fails here. */
const A_FILE_WITH_MANY_CASES = 'apps/web/lib/auth/securityCitations.test.ts'

/** One count of a test file's cases, as a document writes it. */
interface CaseCountCitation {
  readonly document: string
  readonly line: number
  readonly file: string
  readonly written: string
  readonly count: number
  readonly isFloor: boolean
}

/**
 * Every place a document puts a number of cases beside a test file's name.
 * @param document - The document's repository-relative path.
 * @param text - Its whole text.
 * @returns One entry per citation, in document order.
 */
const caseCountCitations = (document: string, text: string): readonly CaseCountCitation[] =>
  [...text.matchAll(CASE_COUNT_CITATION)].map((match) => {
    const [whole, file = '', between = '', number = '', tail = ''] = match
    const after = text.slice(match.index + whole.length, match.index + whole.length + 20)
    const word = number.toLowerCase()
    return {
      document,
      line: text.slice(0, match.index).split('\n').length,
      file,
      written: `${number}${tail}`.replace(/\s+/gu, ' ').trim(),
      count: WORD_VALUE.get(word) ?? Number(number),
      isFloor: FLOOR_PREFIX.test(between) || FLOOR_SUFFIX.test(after) || /\d\+$/u.test(number),
    }
  })

/**
 * How many cases a test file declares.
 * @param file - A repository-relative path, or a basename to resolve.
 * @returns The count, or `null` when no such file is in the tree.
 */
const declaredCases = (file: string, files: readonly string[]): number | null => {
  const exact = files.includes(file) ? file : files.find((candidate) => candidate.endsWith(`/${file}`))
  if (exact === undefined) return null
  const full = path.join(REPOSITORY_ROOT, exact)
  if (!existsSync(full)) return null
  return [...readFileSync(full, 'utf8').matchAll(CASE_DECLARATION)].length
}

/** Every citation in every living document. */
const allCitations = (): readonly CaseCountCitation[] =>
  livingDocuments().flatMap((document) =>
    caseCountCitations(document, readFileSync(path.join(REPOSITORY_ROOT, document), 'utf8')),
  )

describe('the counts the documentation puts beside a test file', () => {
  it('are floors, never inventories', () => {
    const citations = allCitations()
    expect(
      citations.length,
      'no case-count citations were extracted, so a green result here would mean nothing',
    ).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_CITATIONS)

    const exact = citations
      .filter((citation) => !citation.isFloor)
      .map((citation) => `${citation.document}:${String(citation.line)} — "${citation.written}" for ${citation.file}`)

    expect(
      exact,
      'these sentences give an exact count of a test file\'s cases. A count in prose is a floor ("at least N") or it is deleted: an exact one is true on the day it is typed, stale by the next task, and correcting it is what makes the next reader find it stale again',
    ).toEqual([])
  })

  it('are floors the file can actually meet', () => {
    // A floor nobody checks is a number with a softer word in front of it. This
    // is the half that makes "at least 32" mean something: it fails when a file
    // LOSES cases, which is the event worth hearing about, and never when one
    // gains them.
    const files = repositoryFiles()
    const citations = allCitations().filter((citation) => citation.isFloor)

    const unresolved = citations
      .filter((citation) => declaredCases(citation.file, files) === null)
      .map((citation) => `${citation.document}:${String(citation.line)} — ${citation.file} is not a file in this tree`)
    expect(unresolved, 'these counts name a test file nothing here holds').toEqual([])

    const overstated = citations
      .filter((citation) => (declaredCases(citation.file, files) ?? 0) < citation.count)
      .map(
        (citation) =>
          `${citation.document}:${String(citation.line)} — claims "${citation.written}" of ${citation.file}, which declares ${String(declaredCases(citation.file, files))}`,
      )

    expect(overstated, 'these floors are above what the file they name actually declares').toEqual([])
  })

  it('are judged by an extractor that reports the sentence this file exists for', () => {
    // Without this, an extractor that had stopped matching would report every
    // document clean. The fixture is the shape eleven findings had.
    const reported = caseCountCitations('fixture.md', AN_EXACT_COUNT)

    expect(reported).toHaveLength(1)
    expect(reported[0]?.isFloor).toBe(false)
    expect(reported[0]?.count).toBe(19)
  })

  it('are judged by an extractor that can actually answer no', () => {
    const reported = caseCountCitations('fixture.md', A_FLOOR_COUNT)

    expect(reported).toHaveLength(1)
    expect(reported[0]?.isFloor).toBe(true)
  })

  it('are resolved by a counter that can tell a suite from a module', () => {
    // A counter returning zero everywhere would make every floor above pass.
    const files = repositoryFiles()

    expect(declaredCases(A_FILE_WITH_NO_CASES, files)).toBe(0)
    expect(declaredCases(A_FILE_WITH_MANY_CASES, files) ?? 0).toBeGreaterThan(2)
    expect(declaredCases('apps/web/lib/auth/thereIsNoSuchSuite.test.ts', files)).toBeNull()
  })
})
