/**
 * overrideAccessSites.test.ts — every place this repository switches Payload's
 * access control off, pinned against what the documents say about it.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * `docs/security.md`'s "What Phase 2 hands to Phase 4" section, and
 * `docs/api.md` after it, stated as the factual basis of that handover that
 * "`overrideAccess` appears nowhere in production code" and that "the only
 * occurrences of the option in this repository are in" two named test files.
 * Both sentences were false when they were written.
 * `apps/web/lib/auth/setNewPassword.ts` passes `overrideAccess: true` in
 * production, at the password-reset spend, and five files carry the option
 * rather than two. `git log -S` dates the code to `c9fec84` (2026-09-06) and
 * the sentence to `05da7fa` (2026-09-07) — written a DAY AFTER its own
 * counter-example — after which a later commit copied it into `docs/api.md`,
 * and it reached a merge decision as fact.
 *
 * The code was right; only the claim about it was wrong. That is this branch's
 * recurring defect, and the two mechanisms that have ever caught it here are
 * executable: `securityCitations.test.ts`, which pins the document's
 * quotations to `SECURITY.md`, and `adminGuardRegistration.test.ts`'s coverage
 * case, which pins a documented reach to ESLint's own answer. Neither covers a
 * sentence like this one, which is one `git grep` away from being a test. This
 * is that test.
 *
 * ═══ WHAT IT PINS, AND WHAT IT DELIBERATELY DOES NOT ═══
 *
 * It pins the PRODUCTION set exactly, because that is the set the documents
 * make a claim about and the set a Phase 4 reader needs to be able to trust: a
 * new production call site fails here until it is named in both documents. It
 * does NOT pin a total count. A count over test files churns with every case
 * added and says nothing a reader needs — and a fragile number is how the
 * false sentence got written in the first place. What it asserts instead is
 * that every other occurrence is in a test file, which is what makes the
 * production set the whole of the claim.
 *
 * It also refuses the sentence itself: neither document may say the option
 * appears nowhere in production while a production site exists. That
 * assertion is non-vacuous because the production set is asserted non-empty
 * two cases above it.
 *
 * ═══ AND TWO MORE SENTENCES, BECAUSE THE FIRST CORRECTION LEFT ITS OWN ═══
 *
 * Fix round 1 of Phase 4 Task 2 found that the commit which grew the set to two
 * paths appended a correct paragraph to `docs/security.md` and left THREE
 * singular assertions standing four paragraphs above it. Every case here was
 * green, because each asks only whether a document contains a path — a document
 * could name both sites and, in the same section, tell a reader there is one.
 * {@link SINGULAR_CLAIMS} refuses that, on the same argument as
 * {@link NOWHERE_CLAIM}, and with the same honesty about being a floor.
 *
 * The same round disputed which LINE of `setNewPassword.ts` carries the option,
 * and neither the review nor the documents could settle it without opening the
 * file — so {@link lineCitations} settles it: every `<site>:<line>` pointer
 * either document writes must land on a line that actually carries the option.
 * A line number in prose is a claim about bytes.
 *
 * WHY `overrideAccess: true` IS RIGHT AT THE ONE SITE THAT PASSES IT, so this
 * file is not read as recording a defect: a reader holding a password-reset
 * link is by definition not signed in, so the token IS the authorisation and
 * Payload has no user to judge. The reasoning is at `setNewPassword.ts:203-205`,
 * and the document erasing it was the whole problem.
 *
 * ═══ THE SECOND SITE PASSES THE OPPOSITE VALUE ═══
 *
 * Phase 4 Task 2's `apps/web/lib/admin/adminScope.ts` passes
 * `overrideAccess: false`, which is the module every admin Server Action
 * spreads so that Payload runs the rules Task 1 wrote. It is in the production
 * set for the same reason the first one is — a reader greps the option and
 * must be able to account for every hit — but it is there as the answer to the
 * trap rather than as an instance of it, so the last case below reads what each
 * of the two actually passes. Paths alone would let the two swap values
 * silently.
 *
 * ═══ WHY IT IS A UNIT TEST AND NEEDS NO DATABASE ═══
 *
 * It reads bytes off disk and compares strings — git's own listing of the
 * repository, the source it names, and two Markdown files. No Payload, no
 * Postgres, so it runs in the Docker-free `unit` project and therefore inside
 * `npm run verify`, which is the pre-commit gate. A guard that only runs in CI
 * catches this a commit later than it can.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. It is one listing, one filter
 * and four comparisons, and naming a pattern for that would be cargo cult.
 *
 * Depends on: vitest, node:child_process (git's listing), node:fs, node:path,
 * node:url, and the four things it reads — the repository's own TypeScript,
 * `docs/security.md` and `docs/api.md`.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** `apps/web/lib/auth/` -> the repository root. */
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

/**
 * The Payload option that turns collection and field access control off.
 *
 * ═══ THE SCAN NO LONGER EXCLUDES THIS FILE, AND THAT IS ROUND 8'S FIX ═══
 *
 * It did, by exact path, through an `OWN_PATH` constant — because this file
 * spells the option in its own header and was therefore its own first match.
 * The fifth whole-branch review found what that cost: `docs/security.md`
 * listed "the option's other occurrences" and the list omitted THIS FILE,
 * because nothing here could see it. An "other occurrences" list missing a
 * file, inside the sentence written to fix an "only occurrences" list missing
 * a file.
 *
 * Nothing is excused now. This file is a `.test.ts`, so it is counted as one of
 * the test occurrences the second case below permits, which is what it always
 * was — and `docs/security.md` no longer types the list at all: it points at
 * this test, so the set is derived rather than retyped.
 */
const OPTION = 'overrideAccess'

/**
 * Every production module permitted to pass the option, by exact path.
 *
 * TWO ENTRIES, AND THEY PASS OPPOSITE VALUES — which is why the last case
 * below reads what each one passes rather than trusting this list. Phase 4
 * Task 2 added `adminScope.ts`, where the option is `false`: it is the module
 * every admin Server Action spreads to switch access control ON, so the list
 * is no longer "where the checks are skipped" but "where the decision is
 * taken". `setNewPassword.ts` remains the only place it is skipped.
 *
 * A third entry is a decision rather than an omission, and adding one without
 * naming it in both documents fails the third case below.
 *
 * SORTED, because {@link filesCarryingTheOption} sorts, and the first case
 * compares the two sequences with `toEqual`.
 */
const PRODUCTION_SITES: readonly string[] = ['apps/web/lib/admin/adminScope.ts', 'apps/web/lib/auth/setNewPassword.ts']

/** The §1.2 documents that make a claim about where the option appears. */
const DOCUMENTS: readonly string[] = ['docs/security.md', 'docs/api.md']

/**
 * The false claim, reduced to the words that carry it.
 *
 * `'nowhere in production'` rather than the whole sentence
 * (`'overrideAccess appears nowhere in production code'`), so a rewording of it
 * fails too. The consequence is that neither document may reproduce the old
 * sentence even to disclose the correction — both describe it instead, which is
 * the right trade: a guard that a verbatim quotation can switch off is a guard
 * whose next false sentence arrives inside quotation marks.
 */
const NOWHERE_CLAIM = 'nowhere in production'

/**
 * Phrases asserting the production set holds exactly ONE path.
 *
 * The same mechanism as {@link NOWHERE_CLAIM} and for the same reason, but
 * aimed at the failure that outlived it: the commit that grew the set to two
 * appended a correct paragraph and left three singular assertions standing four
 * paragraphs above it, and every case here stayed green because each asks only
 * whether a document CONTAINS a path. A document could name both sites and, in
 * the same section, tell a reader there is one.
 *
 * IT IS A FLOOR, NOT AN INVERSION, and that is said plainly rather than
 * implied. English cardinality cannot be matched by a string comparison, so
 * this refuses the spellings that were actually wrong and would not catch a
 * fourth way of writing the same falsehood. The inverted half is the case above
 * it — the production SET is derived from git's listing, never enumerated — and
 * what this adds is that the prose around it cannot contradict the derivation
 * in a spelling that has already been committed once.
 *
 * Guarded by the set's own size below, so it disappears honestly if the set
 * ever returns to one path rather than becoming a rule nobody can satisfy.
 *
 * Written with single spaces and compared against {@link unwrapped} text, so a
 * claim that survives only because Prettier wrapped it across two lines is
 * still caught. Three of the four below do wrap in `docs/security.md` today.
 */
const SINGULAR_CLAIMS: readonly string[] = [
  'one production module',
  'that one path',
  'the one production site',
  'and one production site says so explicitly',
]

/**
 * A document's text with every run of whitespace collapsed to one space.
 *
 * A sentence in these documents is wrapped to 100 columns, so the line break
 * falls wherever Prettier put it. Searching the raw bytes for a phrase would
 * make the guard depend on that, which is a guard a reflow switches off.
 *
 * @param document - The repository-relative path.
 * @returns The file's text, unwrapped.
 */
const unwrapped = (document: string): string =>
  readFileSync(path.join(repositoryRoot, document), 'utf8').replaceAll(/\s+/g, ' ')

/**
 * A real source file that must NOT carry the option.
 *
 * So the scan is proved able to answer no. `guard.ts` is the module every
 * guarded read goes through and it passes the option nowhere, which is what
 * makes the one site that does worth naming.
 */
const A_FILE_THAT_MUST_NOT_CARRY_IT = 'apps/web/lib/auth/guard.ts'

/**
 * The separator `git ls-files -z` writes between paths.
 *
 * Built from its code point rather than written as an escape, the way
 * `adminGuardRegistration.test.ts` builds the same constant: a real control
 * byte in a source file would be invisible in a diff.
 */
const NUL_SEPARATOR = String.fromCharCode(0)

/**
 * The newline a line citation counts.
 *
 * `.gitattributes` normalises these files to LF in the working tree, so
 * splitting on LF gives the same numbering an editor shows. Built from its code
 * point for the same reason {@link NUL_SEPARATOR} is.
 */
const LINE_SEPARATOR = String.fromCharCode(10)

/**
 * Every file git lists for this repository.
 *
 * `--cached --others --exclude-standard`, so a file written and never staged is
 * still seen and no skip list of `node_modules`/`.next`/`coverage` has to be
 * maintained — the same listing `adminGuardRegistration.test.ts` reads, for the
 * same reason.
 *
 * @returns The repository-relative paths, with forward slashes.
 * @throws When git lists nothing, which would make every assertion below hold
 *   over an empty set.
 */
const repositoryFiles = (): readonly string[] => {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const files = listed.split(NUL_SEPARATOR).filter((file) => file.length > 0)
  if (files.length === 0) throw new Error('git listed no files, so nothing below has read anything')
  return files
}

/**
 * Every TypeScript file under `apps/` or `packages/` whose bytes carry the
 * option.
 *
 * A byte comparison rather than a parse, deliberately: the question is "does
 * this file mention the option at all", and text is what finds a mention at a
 * path nobody enumerated. Judging whether a mention is a call is what the exact
 * production list below is for.
 *
 * @returns The repository-relative paths, sorted. This file is not excluded —
 *   see {@link OPTION} for why it no longer needs to be.
 */
const filesCarryingTheOption = (): readonly string[] =>
  repositoryFiles()
    .filter((file) => file.startsWith('apps/') || file.startsWith('packages/'))
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .filter((file) => readFileSync(path.join(repositoryRoot, file), 'utf8').includes(OPTION))
    .toSorted((left, right) => left.localeCompare(right))

/** One `<production site>:<line>` pointer a document writes. */
interface LineCitation {
  /** The §1.2 document it appears in. */
  readonly document: string
  /** The production site cited, as {@link PRODUCTION_SITES} spells it. */
  readonly site: string
  /** The 1-based line the document sends a reader to. */
  readonly line: number
}

/**
 * Every `<production site>:<line>` citation either document writes.
 *
 * Both documents point a reader at the exact line of the reset spend, and
 * nothing has ever checked that the line is the right one — which is how the
 * review of this very task and the documents it reviewed disagreed about it,
 * neither able to settle it without opening the file. A line number in prose is
 * a claim about bytes, so it is checkable like any other.
 *
 * Derived from {@link PRODUCTION_SITES} rather than from a hard-coded path, so
 * a citation of a site added later is judged by the same case.
 *
 * @returns One entry per citation, with the document it appears in.
 */
const lineCitations = (): readonly LineCitation[] =>
  DOCUMENTS.flatMap((document) => {
    const text = readFileSync(path.join(repositoryRoot, document), 'utf8')
    return PRODUCTION_SITES.flatMap((site) => {
      // The path's dots are escaped so `.ts` matches only `.ts`, and the
      // capture is the digits immediately after the colon.
      const citation = new RegExp(`${site.replaceAll('.', String.raw`\.`)}:(\\d+)`, 'g')
      return [...text.matchAll(citation)].map((found) => ({ document, site, line: Number(found[1]) }))
    })
  })

/** Whether a repository-relative path is a test file rather than production. */
const isTestFile = (file: string): boolean => file.endsWith('.test.ts') || file.endsWith('.test.tsx')

describe('the overrideAccess call sites the security document hands to Phase 4', () => {
  it('are the admin scope and the password-reset spend, and nothing else', () => {
    const production = filesCarryingTheOption().filter((file) => !isTestFile(file))

    expect(production).toEqual(PRODUCTION_SITES)
  })

  it('are otherwise test files only, so the production list is the whole claim', () => {
    // The floor first: a listing or a byte comparison that matched nothing
    // would satisfy the assertion under it having read no file at all.
    const carrying = filesCarryingTheOption()

    expect(carrying.length).toBeGreaterThanOrEqual(PRODUCTION_SITES.length + 1)
    expect(carrying.filter((file) => !isTestFile(file) && !PRODUCTION_SITES.includes(file))).toEqual([])
  })

  it('are each named in every document that describes where access control is off', () => {
    // A production site the documents do not name is a call Payload's access
    // control does not run for, that a reader greps and cannot account for.
    const unnamed = DOCUMENTS.flatMap((document) => {
      const text = readFileSync(path.join(repositoryRoot, document), 'utf8')
      return PRODUCTION_SITES.filter((site) => !text.includes(site)).map((site) => `${document} omits ${site}`)
    })

    expect(unnamed).toEqual([])
  })

  it('cannot be described as appearing nowhere in production while one of them is', () => {
    // The sentence that reached a merge decision, refused by name. Non-vacuous
    // because the first case above asserts the production set is not empty.
    const claiming = DOCUMENTS.filter((document) =>
      readFileSync(path.join(repositoryRoot, document), 'utf8').includes(NOWHERE_CLAIM),
    )

    expect(claiming).toEqual([])
  })

  it('switches access control ON at the admin scope and OFF only at the reset spend', () => {
    // The list above is a set of PATHS, and a set of paths cannot tell the two
    // sites apart — one turns the checks on for every admin screen, the other
    // turns them off for a reader who is not signed in. A list that hides that
    // difference is a list that has stopped meaning anything, and the day
    // `adminScope.ts` flips is the day every Phase 4 mutation runs unchecked
    // with this file still green.
    const scope = readFileSync(path.join(repositoryRoot, 'apps/web/lib/admin/adminScope.ts'), 'utf8')
    const spend = readFileSync(path.join(repositoryRoot, 'apps/web/lib/auth/setNewPassword.ts'), 'utf8')

    expect(scope).toContain(`${OPTION}: false`)
    expect(scope).not.toContain(`${OPTION}: true`)
    expect(spend).toContain(`${OPTION}: true`)
  })

  it('cannot be described as a single production module while there are two of them', () => {
    // The paragraph this document devotes to a false absolute claim acquired a
    // second one, in the commit that fixed the first. Non-vacuous only while
    // the set is not a singleton, which the guard below states rather than
    // assumes.
    expect(PRODUCTION_SITES.length).not.toBe(1)

    const claiming = DOCUMENTS.flatMap((document) => {
      const text = unwrapped(document)
      return SINGULAR_CLAIMS.filter((claim) => text.includes(claim)).map((claim) => `${document} says "${claim}"`)
    })

    expect(claiming).toEqual([])
  })

  it('are cited at the line they are actually on, in every document that gives one', () => {
    // A citation nothing checks is a citation that drifts, and this one was
    // disputed before it was measured. The floor first: a regular expression
    // that matched nothing would satisfy the assertion under it having read no
    // document at all.
    const citations = lineCitations()
    expect(citations.length).toBeGreaterThan(0)

    const wrong = citations.filter(({ site, line }) => {
      const lines = readFileSync(path.join(repositoryRoot, site), 'utf8').split(LINE_SEPARATOR)
      return lines[line - 1]?.includes(OPTION) !== true
    })

    expect(wrong).toEqual([])
  })

  it('are found by a scan that can actually answer no', () => {
    // Without this, a filter that accidentally matched every file — an empty
    // needle, a `readFileSync` returning the whole tree — would report the
    // production list satisfied and prove nothing.
    const carrying = filesCarryingTheOption()

    expect(carrying).not.toContain(A_FILE_THAT_MUST_NOT_CARRY_IT)
    expect(carrying).toContain('apps/web/lib/auth/setNewPassword.ts')
  })
})
