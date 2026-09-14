/**
 * standardsSections.test.ts — the two split documents and their reference
 * directories point at each other, and every `CLAUDE.md §N` citation in this
 * repository names a section `CLAUDE.md` actually declares.
 *
 * Two documents were split in the Phase 3 standards task: `CLAUDE.md` into
 * `docs/standards/`, and `docs/testing.md` into `docs/testing/`. The citation
 * half applies only to the first, because only `CLAUDE.md`'s numbers are cited
 * from module headers and configs across the tree; `docs/testing.md` kept every
 * heading it had, so its numbers are guarded by their own presence.
 *
 * Pattern (CLAUDE.md §3.3): none of the seven. Three extractions and three set
 * comparisons.
 *
 * A split document rots by silent drift: a section loses its reference file, a
 * reference file describes a section that no longer exists, or a citation
 * outlives the number it names. The third is not hypothetical —
 * `adminGuardRegistration.test.ts` cited section 8.4 of the standards twice,
 * and §8 has only §8.1 to §8.3. Both citations meant the Husky pre-commit
 * hook, which is §11's territory, and `verify` stayed green through three
 * phases. Prose is checked by a program or it is not checked.
 *
 * INVARIANTS a future edit could break:
 *   - Nothing here enumerates a known-good section, file or citation. Sections
 *     come from `CLAUDE.md`'s headings, files from `readdirSync`, citations
 *     from `git ls-files`. Refuse what you do not recognise (§6-species
 *     doctrine); a list of accepted values passes the case nobody listed.
 *   - §0 is the ONE section with no reference file, and that is asserted as an
 *     equality rather than skipped, so a second reference-less section fails.
 *   - A subsection resolves against the REFERENCE FILE, not against the core's
 *     stub heading, and the reference file's section has to carry a body. The
 *     structural cases alone are satisfied by a file that exists, is pointed at
 *     and has lost its subject.
 *   - The word budget is a case, not a convention: it is the only property the
 *     structure cannot imply, and it is the one the whole split exists for.
 *   - {@link A_SECTION_CLAUDE_MD_DOES_NOT_DECLARE} is assembled from two
 *     pieces rather than written out. Written out it would be a citation in
 *     the corpus this file scans, and the citation case would fail on its own
 *     sentinel — which is why this file is NOT excluded from that corpus, and
 *     must not become excluded.
 *
 * Depends on: vitest, node:fs, node:path, ./markdownCorpus.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPOSITORY_ROOT, repositoryFiles } from './markdownCorpus'

/** The document whose sections are under test. */
const CLAUDE_MD = path.join(REPOSITORY_ROOT, 'CLAUDE.md')

/** Where the detail behind each section lives, repository-relative. */
const STANDARDS_DIRECTORY = 'docs/standards'

/**
 * A `CLAUDE.md §N` citation, in every spelling this repository writes.
 *
 * The file name is optionally backticked and optionally possessive
 * (``CLAUDE.md`` §6, `CLAUDE.md §2.1's`), and `§§` appears where two sections
 * are cited together. Measured over the tree rather than assumed: a narrower
 * pattern missed 133 of the 748 citations, all of them backticked.
 */
const CITATION = /CLAUDE\.md`?(?:'s)?[ \t]*§+[ \t]*(\d+(?:\.\d+)*)/gu

/** A numbered heading: `## 7 · Data handling`, `### 7.1 Repository content…`. */
const NUMBERED_HEADING = /^(#{2,4})[ \t]+(\d+(?:\.\d+)*)(?:[ \t]+·)?[ \t]+\S/u

/** The same, at any heading level, since a reference file opens at `# 8 · Git workflow`. */
const ANY_NUMBERED_HEADING = /^#{1,6}[ \t]+(\d+(?:\.\d+)*)(?:[ \t]+·)?[ \t]+\S/u

/** A numbered item of §0's list, which is what `§0.N` cites. */
const NUMBERED_ITEM = /^(\d+)\.[ \t]+\S/u

/** A backticked path into the reference directory. */
const REFERENCE = new RegExp('`(' + STANDARDS_DIRECTORY + '/[A-Za-z0-9._-]+\\.md)`', 'gu')

/** The second document split the same way, and where its per-suite detail lives. */
const TESTING_MD = path.join(REPOSITORY_ROOT, 'docs/testing.md')

/** Where the detail behind each test suite lives, repository-relative. */
const TESTING_DIRECTORY = 'docs/testing'

/** A backticked path into the suite reference directory. */
const SUITE_REFERENCE = new RegExp('`(' + TESTING_DIRECTORY + '/[A-Za-z0-9._-]+\\.md)`', 'gu')

/** The one section that carries its rules in full and points nowhere. */
const SECTION_WITH_NO_REFERENCE = '0'

/** A floor on the top-level sections found, so a parser that stopped matching fails here. */
const AT_LEAST_THIS_MANY_SECTIONS = 12

/** A floor on the citations found, for the same reason. There were 748 when this was written. */
const AT_LEAST_THIS_MANY_CITATIONS = 600

/**
 * The most words `CLAUDE.md` may hold.
 *
 * THE NUMBER THE SPLIT EXISTS TO PRODUCE. The file was 3,680 words, and every
 * dispatched agent read all of them whatever its task touched; the structure
 * below is what made 697 possible. Nothing about that structure notices size —
 * a section that grows by four lines every task still has a reference file,
 * still is pointed at, and still resolves every citation, while the file walks
 * back to where it started. A line in the core is where an author's eye lands,
 * so the budget has to be the thing that refuses, not a convention.
 */
const CLAUDE_MD_WORD_BUDGET = 700

/**
 * The least a section may carry in its reference file before it is a stub,
 * counted the way {@link sectionBodies} counts: **characters that are not
 * whitespace**, between a numbered heading and the next heading.
 *
 * MEASURED IN THE METRIC THE CHECK USES, which is worth saying because the
 * first version of this comment did not. It cited §8.3 at "142 body
 * characters", which is that section's length with intra-line spaces kept —
 * the metric a line-by-line `trim()` produces, and not the one below.
 * `sectionBodies` strips every whitespace character, and §8.3 is **134** by
 * that count. The floor holds under either number, so nothing ever passed or
 * failed differently; the sentence was simply a measurement the code does not
 * take, inside the file whose subject is measurements the code does not take.
 *
 * The numbers, in this file's own metric: the smallest section the floor
 * currently binds is §2.2 (the TDD cycle) at 276, and the smallest section in
 * `docs/standards/` at all is §8.3 (branch naming) at 134 — not judged today,
 * because the floor is applied to the subsections `CLAUDE.md`'s core declares
 * and the core does not declare §8.3, but judged the moment it does. 100 sits
 * under both and far above an emptied section.
 *
 * WHAT IT CATCHES IS DELETION, NOT EVISCERATION, and the distinction is the
 * boundary rather than a caveat. Both sides were driven rather than reasoned
 * about, by replacing §2.3's rules in `docs/standards/02-testing.md`: a
 * content-free sentence of 104 non-whitespace characters PASSED, and the same
 * sentence trimmed to 92 failed, reported as "§2.3 (92 characters in
 * docs/standards/02-testing.md)". So a heading kept with the rule deleted from
 * under it fails here, and a heading kept with a long enough sentence about
 * nothing does not. A check that judged whether prose means something would not
 * be a check; nothing above claims otherwise, and a reader who assumes more
 * from a green result will be wrong in exactly the way that matters.
 */
const A_SECTION_IS_A_STUB_BELOW = 100

/**
 * A section number `CLAUDE.md` does not declare, so the resolver is proved able
 * to answer "no".
 *
 * JOINED, NOT WRITTEN. Spelled out it would be a real citation inside the
 * corpus the citation case scans, and the case would then fail on this file's
 * own sentinel. See the module header.
 */
const A_SECTION_CLAUDE_MD_DOES_NOT_DECLARE = ['8', '4'].join('.')

/** A section number `CLAUDE.md` does declare, asserted present so an empty extraction fails loudly. */
const A_SECTION_CLAUDE_MD_DOES_DECLARE = '3.3'

/** A real section the CORE does not declare, since §8's detail holds §8.1 and §8.3. */
const A_SECTION_ONLY_A_REFERENCE_FILE_DECLARES = '8.1'

/** One top-level section: its number, and every reference file its body names. */
interface Section {
  readonly number: string
  readonly references: readonly string[]
}

/** `CLAUDE.md`, read once per case. */
const claudeMd = (): string => readFileSync(CLAUDE_MD, 'utf8')

/**
 * Every `## N · …` section of `CLAUDE.md`, with the reference files its body names.
 * @returns One entry per top-level section, in document order.
 * @example
 *   sections() // [{ number: '0', references: [] }, { number: '1', references: ['docs/standards/01-documentation.md'] }, …]
 */
const sections = (): readonly Section[] => {
  const found: { number: string; references: string[] }[] = []
  for (const line of claudeMd().split('\n')) {
    const heading = NUMBERED_HEADING.exec(line)
    if (heading?.[1] === '##') {
      found.push({ number: heading[2] ?? '', references: [] })
      continue
    }
    const current = found[found.length - 1]
    if (!current) continue
    for (const reference of line.matchAll(REFERENCE)) current.references.push(reference[1] ?? '')
  }
  return found
}

/**
 * Every section number a document declares as a numbered heading, at any level.
 *
 * A reference file opens at `# 8 · Git workflow` and carries `### 8.1 …`, while
 * the core uses `##` and `###`, so the level is not the thing being matched —
 * the number is.
 * @param document - The document's whole text.
 * @returns One entry per numbered heading, in document order.
 */
const numberedHeadings = (document: string): readonly string[] =>
  document.split('\n').flatMap((line) => {
    const heading = ANY_NUMBERED_HEADING.exec(line)
    return heading ? [heading[1] ?? ''] : []
  })

/**
 * Every section number a `CLAUDE.md §N` citation may resolve to — the core's
 * numbered headings, §0's numbered rules (which is what a `§0.N` citation
 * names), and **the reference files' own headings**.
 *
 * THE REFERENCE FILES ARE IN THIS SET DELIBERATELY. §8.1 and §8.3 are real,
 * correctly numbered sections that live in `docs/standards/08-git-workflow.md`
 * because that is where §8's detail went; the core carries §8.2's heading and
 * not theirs. Reading only the core would refuse
 * `// CLAUDE.md §8.1 forbids git add -A` — true, resolvable by any reader who
 * follows §8's pointer, and failed by the gate with advice that is wrong in
 * that case. A guard that refuses valid input is a guard people route around.
 * @returns The set of numbers a citation may resolve to.
 */
const declaredSections = (): ReadonlySet<string> => {
  const declared = new Set<string>()
  let insideSectionZero = false
  for (const line of claudeMd().split('\n')) {
    const heading = NUMBERED_HEADING.exec(line)
    if (heading) {
      const number = heading[2] ?? ''
      declared.add(number)
      insideSectionZero = number === SECTION_WITH_NO_REFERENCE
      continue
    }
    if (!insideSectionZero) continue
    const item = NUMBERED_ITEM.exec(line)
    if (item) declared.add(`${SECTION_WITH_NO_REFERENCE}.${item[1] ?? ''}`)
  }
  for (const file of referenceFiles()) {
    for (const number of numberedHeadings(readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8'))) {
      declared.add(number)
    }
  }
  return declared
}

/**
 * What each numbered section of a document carries beneath its own heading:
 * every non-heading character up to the next heading, whitespace not counted.
 *
 * A stub is the failure this measures. The split moved every rule out of the
 * core and into a reference file, so "§2.3 resolves" now means "a one-line
 * summary exists in the core" unless something reads the file behind it —
 * deleting `### 2.3 Test quality`'s twelve lines of rules from
 * `docs/standards/02-testing.md` left 109 files and 1,638 cases green.
 * @param document - The document's whole text.
 * @returns The number of body characters under each numbered heading.
 */
const sectionBodies = (document: string): ReadonlyMap<string, number> => {
  const bodies = new Map<string, number>()
  let current: string | undefined
  for (const line of document.split('\n')) {
    const heading = ANY_NUMBERED_HEADING.exec(line)
    if (heading) {
      current = heading[1] ?? ''
      bodies.set(current, 0)
      continue
    }
    if (line.startsWith('#')) {
      current = undefined
      continue
    }
    if (current === undefined) continue
    bodies.set(current, (bodies.get(current) ?? 0) + line.replace(/\s/gu, '').length)
  }
  return bodies
}

/**
 * Every Markdown file a reference directory holds, repository-relative.
 * @param directory - The reference directory, repository-relative.
 * @returns Repository-relative paths, sorted.
 */
const filesUnder = (directory: string): readonly string[] =>
  readdirSync(path.join(REPOSITORY_ROOT, directory))
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => `${directory}/${entry}`)
    .sort()

/** Every Markdown file the standards reference directory holds. */
const referenceFiles = (): readonly string[] => filesUnder(STANDARDS_DIRECTORY)

/**
 * Every `CLAUDE.md §N` citation in the tracked corpus, with where it was found.
 *
 * Over everything git lists rather than over the Markdown alone: most of these
 * citations are in module headers and config comments, which is where a frozen
 * number is most easily forgotten.
 * @returns One entry per citation.
 */
const citations = (): readonly { readonly section: string; readonly where: string }[] =>
  repositoryFiles().flatMap((file) => {
    let text: string
    try {
      text = readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8')
    } catch {
      // A file git lists and this process cannot read is a nested checkout or a
      // race, not a citation problem. It must not silently shrink the corpus,
      // so the floor below is what notices if that starts happening widely.
      return []
    }
    if (text.includes('\0')) return []
    return [...text.matchAll(CITATION)].map((match) => ({ section: match[1] ?? '', where: file }))
  })

describe('the sections of CLAUDE.md and the reference files behind them', () => {
  it('each name a reference file that exists, and only §0 names none', () => {
    const present = new Set(referenceFiles())

    const found = sections()
    expect(found.length, 'no sections were parsed, so a green result here would mean nothing').toBeGreaterThanOrEqual(
      AT_LEAST_THIS_MANY_SECTIONS,
    )

    const missing = found.flatMap((section) =>
      section.references
        .filter((reference) => !present.has(reference))
        .map((reference) => `§${section.number} -> ${reference}`),
    )
    const withoutReference = found.filter((section) => section.references.length === 0).map((section) => section.number)

    expect(missing, 'these CLAUDE.md sections point at a reference file that is not in this tree').toEqual([])
    expect(
      withoutReference,
      'exactly one section carries its rules in full and points nowhere; any other section without a Detail pointer is a rule nobody can read',
    ).toEqual([SECTION_WITH_NO_REFERENCE])
  })

  it('leave no reference file that no section points to', () => {
    const pointedAt = new Set(sections().flatMap((section) => section.references))

    const files = referenceFiles()
    expect(files.length, 'the reference directory is empty, so a green result here would mean nothing').toBeGreaterThan(
      0,
    )

    const orphans = files.filter((file) => !pointedAt.has(file))

    expect(
      orphans,
      'these files sit in docs/standards/ and no CLAUDE.md section points at them, so nothing routes a reader to them',
    ).toEqual([])
  })

  it('resolve every CLAUDE.md §N citation this repository writes', () => {
    const declared = declaredSections()

    const found = citations()
    expect(
      found.length,
      'no citations were extracted, so a green result here would mean nothing',
    ).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_CITATIONS)

    const unresolvable = [
      ...new Set(
        found.filter(({ section }) => !declared.has(section)).map(({ section, where }) => `§${section} (${where})`),
      ),
    ].sort()

    expect(
      unresolvable,
      'these citations name a CLAUDE.md section that does not exist; the numbers are frozen, so the citation is wrong, not the document',
    ).toEqual([])
  })

  it('each have their rule in the reference file, not only a stub heading in the core', () => {
    // WHAT THE SPLIT ACTUALLY RISKS. Before it, §2.3 was twelve lines of rules
    // in CLAUDE.md; after it, §2.3 in the core is one line and the rules are in
    // docs/standards/02-testing.md. The structural cases above are satisfied by
    // a file that exists, is pointed at, and has lost its subject: deleting
    // §2.3's detail left every one of its citations "resolving", to nothing.
    // So the reference file, not the pointer, is what a subsection resolves
    // against here.
    const detailFor = new Map(sections().flatMap(({ number, references }) => references.map((r) => [number, r])))

    const subsections = numberedHeadings(claudeMd()).filter((number) => number.includes('.'))
    expect(
      subsections.length,
      'no subsections were parsed out of CLAUDE.md, so a green result here would mean nothing',
    ).toBeGreaterThan(0)

    const missing: string[] = []
    const stubs: string[] = []
    for (const number of subsections) {
      const [top] = number.split('.')
      const reference = detailFor.get(top ?? '')
      if (reference === undefined) continue // §0 carries its rules in full and points nowhere.
      const bodies = sectionBodies(readFileSync(path.join(REPOSITORY_ROOT, reference), 'utf8'))
      const body = bodies.get(number)
      if (body === undefined) missing.push(`§${number} (not a heading in ${reference})`)
      else if (body < A_SECTION_IS_A_STUB_BELOW) stubs.push(`§${number} (${String(body)} characters in ${reference})`)
    }

    expect(
      missing,
      'CLAUDE.md carries these subsections and the reference file behind them does not, so a citation resolves to a summary with nothing under it',
    ).toEqual([])
    expect(
      stubs,
      'these sections have a heading in their reference file and almost nothing beneath it, which is a pointer that resolves and a rule that is gone',
    ).toEqual([])
  })

  it('leave CLAUDE.md inside the word budget the split exists to produce', () => {
    // The one property every other case here is in service of, and the only one
    // the structure cannot imply: shape stays perfect while size walks back.
    const words = claudeMd().trim().split(/\s+/u)

    expect(
      words.length,
      'CLAUDE.md read as no words at all, so a green result here would mean nothing',
    ).toBeGreaterThan(100)
    expect(
      words.length,
      'CLAUDE.md is over budget: a rule that needs more room than this belongs in its docs/standards/ reference file, which is what every section here points at',
    ).toBeLessThanOrEqual(CLAUDE_MD_WORD_BUDGET)
  })

  it('are resolved by a search that can actually answer no', () => {
    // Without this, a parser that returned every number - or a resolver that
    // matched anything - would report every citation resolvable and prove
    // nothing.
    const declared = declaredSections()

    expect(declared.has(A_SECTION_CLAUDE_MD_DOES_NOT_DECLARE)).toBe(false)
    expect(declared.has(A_SECTION_CLAUDE_MD_DOES_DECLARE)).toBe(true)
    expect(declared.has(`${SECTION_WITH_NO_REFERENCE}.4`)).toBe(true)
    // §8.1 and §8.3 exist only in docs/standards/08-git-workflow.md. Pinned
    // here so that reading the core alone - which would refuse a correct
    // citation of either - fails this case rather than a future author's commit.
    expect(declared.has(A_SECTION_ONLY_A_REFERENCE_FILE_DECLARES)).toBe(true)
  })
})

describe('the suites of docs/testing.md and the reference files behind them', () => {
  // The same split, made in the same task, so it rots the same two ways. There
  // is no citation case here: `docs/testing.md` §N is cited in this tree, but
  // the suite headings never left the core, so the numbers are guarded by their
  // own presence rather than by a scan.
  it('point at reference files that exist', () => {
    const present = new Set(filesUnder(TESTING_DIRECTORY))

    const pointedAt = [...readFileSync(TESTING_MD, 'utf8').matchAll(SUITE_REFERENCE)].map((match) => match[1] ?? '')
    expect(
      pointedAt.length,
      'docs/testing.md points at no suite reference file, so a green result here would mean nothing',
    ).toBeGreaterThanOrEqual(present.size)

    const missing = pointedAt.filter((reference) => !present.has(reference))

    expect(missing, 'docs/testing.md points at these suite reference files and they are not in this tree').toEqual([])
  })

  it('leave no reference file that docs/testing.md does not point to', () => {
    const pointedAt = new Set(
      [...readFileSync(TESTING_MD, 'utf8').matchAll(SUITE_REFERENCE)].map((match) => match[1] ?? ''),
    )

    const orphans = filesUnder(TESTING_DIRECTORY).filter((file) => !pointedAt.has(file))

    expect(
      orphans,
      'these files sit in docs/testing/ and docs/testing.md points at none of them, so nothing routes a reader to them',
    ).toEqual([])
  })
})
