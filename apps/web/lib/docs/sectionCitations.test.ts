/**
 * sectionCitations.test.ts — every `<document> §N` reference this repository
 * writes names a section that document actually declares.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * `pathCitations.test.ts` is fail-closed on a backticked path and on a
 * backticked identifier. A section number was checked by nothing, and a wrong
 * one is worse than a path that resolves nowhere: a path naming nothing fails a
 * test, while a `§93` that exists and says something else READS AS CONFIRMED —
 * the reader follows it, finds a real heading, and takes the mismatch for their
 * own misunderstanding. Phase 4 Task 12's review found exactly that, by hand:
 * `apps/web/app/(admin)/admin/publish/actions.ts` cited `docs/deviations.md`
 * §93, the CopyLink island, in a sentence about §96, the revalidation gap.
 * Every gate stayed green. `docs/deviations.md` §98 is the entry; this file is
 * what that entry asks for.
 *
 * ═══ WHAT COUNTS AS A SECTION CITATION, AND WHY THE COUNT IS NOT A TARGET ═══
 *
 * §98 refuses to say how many there are, deliberately — an earlier revision
 * said 362, and Task 12 measured the same corpus four ways and got four other
 * answers. So the rule is decided here and the number falls out of it:
 *
 *   **A section citation is a reference that NAMES ITS DOCUMENT.** A `.md` file
 *   name — optionally backticked, optionally possessive — immediately followed
 *   by `§` and a dotted number, with nothing in between. See
 *   {@link sectionCitations}.
 *
 * Immediacy is the whole of the rule, and it is what makes the citation
 * resolvable at all: `§N` means nothing without a document, and this tree
 * writes the document next to the number or not at all. **A line wrap between
 * the two is still immediate** and is read as one citation, comment
 * continuation included — more than seventy of them, 76 when that was measured
 * on 2026-10-03, and a guard that reads a line at a time cannot see any of
 * them. Most are in a module header or a comment and 22 are ordinary Markdown
 * paragraphs — both numbers measured, because an unmeasured "every one" here
 * was wrong. A blank line is not immediate: that is a paragraph break.
 *
 * What the rule leaves out is stated rather than assumed away, and
 * {@link SECTION_MARK} counts it by subtraction on every run, so the uncovered
 * share is a number and not a feeling. Exactly two shapes: a bare `§6`, whose
 * document comes from the paragraph around it, and a document named by a
 * phrase ("design spec §8.2") rather than by a file. Guessing at either would
 * resolve most of them against the wrong document, which is the defect this
 * file exists to catch.
 *
 * **Over everything git lists**, not over the living documentation alone: most
 * of these citations are in module headers, where a frozen number is easiest to
 * forget, and that is where Task 12's finding lived.
 *
 * ═══ WHAT A SECTION NUMBER RESOLVES AGAINST ═══
 *
 * The document it names, and each cited document has its own heading shape, so
 * the shape is read off the document rather than configured:
 * {@link declaredSectionNumbers} takes every numbered heading at any level, and
 * the numbered items beneath it. The items are not a loophole — three documents
 * here put a section's parts in a numbered list and are cited that way
 * (`CLAUDE.md` §0.9, `SCREENS.md` §3.2, `docs/deviations.md` §13.4) — and that
 * module's own header carries the argument.
 *
 * A document is resolved the way `pathCitations.test.ts` resolves a path: by
 * full path, or by basename, since `SCREENS.md` is how this tree cites
 * `handoff/design_handoff_travel_diary/SCREENS.md` everywhere. Where a basename
 * names more than one file the headings of all of them count, which is the
 * lenient direction and is why a citation naming no file at all is a failure in
 * its own right rather than a silent skip.
 *
 * ═══ THE ONE DOCUMENT THIS FILE DOES NOT OWN ═══
 *
 * `CLAUDE.md`. Its sections were split into `docs/standards/`, so §8.1 is
 * declared in a reference file and not in `CLAUDE.md` at all, and
 * `standardsSections.test.ts` already resolves that family against the split it
 * also guards. Two resolvers for one family is the drift `citations.ts` was
 * extracted to prevent, so the family is routed there and not duplicated here —
 * and {@link CLAUDE_MD} is counted on every run against a floor, so the
 * exclusion cannot quietly widen into "everything" or narrow into nothing.
 *
 * ═══ HOW IT AVOIDS BEING VACUOUS ═══
 *
 * A floor on the citations resolved, so an extractor that stopped matching
 * fails in one line rather than passing two thousand; a floor on the documents
 * covered, so a resolver that found one document is not mistaken for one that
 * found eleven; and a resolver proved able to answer **no**, against a section
 * number assembled at run time so that writing it down cannot make it true.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Two extractions and a set
 * comparison.
 *
 * Depends on: vitest, node:fs, node:path, ./citations, ./markdownCorpus.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { declaredSectionNumbers, isSectionCitation, sectionCitations } from './citations'
import { REPOSITORY_ROOT, repositoryFiles } from './markdownCorpus'

/** The one document whose family `standardsSections.test.ts` owns; see the header. */
const CLAUDE_MD = 'CLAUDE.md'

/**
 * A floor on the citations this file resolves, so an extractor that quietly
 * stopped matching fails here rather than passing everything.
 *
 * A FLOOR, NOT THE COUNT, for the reason CLAUDE.md §0 gives and
 * `docs/deviations.md` §98 was written about: a number pinned exactly is a
 * number its next author edits instead of reading — and because the count
 * moves whenever anything in this tree writes a sentence, this header
 * included. There were more than 1,900 when this was written, across every
 * document this tree cites by name.
 */
const AT_LEAST_THIS_MANY_CITATIONS = 1500

/** A floor on the documents covered, so a resolver that found one is not mistaken for one that found eleven. */
const AT_LEAST_THIS_MANY_DOCUMENTS = 8

/** A floor on the `CLAUDE.md` citations routed elsewhere, so the exclusion cannot become "everything". */
const AT_LEAST_THIS_MANY_CLAUDE_MD_CITATIONS = 600

/**
 * A section number `docs/deviations.md` does not declare, so the resolver is
 * proved able to answer "no".
 *
 * JOINED, NOT WRITTEN, the way `standardsSections.test.ts` joins its own: spelt
 * out it would be a real citation in the corpus this file scans, and the case
 * below would fail on its own sentinel.
 */
const A_SECTION_DEVIATIONS_DOES_NOT_DECLARE = ['9', '7', '1'].join('')

/** A section `docs/deviations.md` does declare, asserted present so an empty extraction fails loudly. */
const A_SECTION_DEVIATIONS_DOES_DECLARE = '108'

/** A document every citation of which must resolve, used to prove the lookup is not empty. */
const A_DOCUMENT_THAT_IS_CITED = 'SCREENS.md'

/**
 * A document this tree does not hold, so the lookup is proved able to answer
 * "no" there too.
 *
 * JOINED, NOT WRITTEN, like the section sentinel above: spelt out beside a `§`
 * it would be a citation inside the corpus this file scans.
 */
const A_DOCUMENT_THAT_IS_NOT_HERE = `docs/${['there', 'IsNoSuchDocument'].join('')}.md`

/** A path's last `/`-separated segment. */
const basenameOf = (file: string): string => file.slice(file.lastIndexOf('/') + 1)

/**
 * Every file git lists whose path or basename a citation could name.
 *
 * @returns Repository-relative paths, keyed by both spellings.
 */
const documentsByName = (): ReadonlyMap<string, readonly string[]> => {
  const byName = new Map<string, string[]>()
  for (const file of repositoryFiles()) {
    if (!file.endsWith('.md')) continue
    for (const name of new Set([file, basenameOf(file)])) {
      const found = byName.get(name)
      if (found) found.push(file)
      else byName.set(name, [file])
    }
  }
  return byName
}

/**
 * Every section number the document (or documents) a citation names declares.
 *
 * @param document - The citation's own spelling of the document.
 * @param byName - What {@link documentsByName} listed.
 * @returns The numbers, or `null` when git lists no such document at all —
 *   which is a different failure and is reported as one.
 */
const sectionsOf = (document: string, byName: ReadonlyMap<string, readonly string[]>): ReadonlySet<string> | null => {
  const files = byName.get(document)
  if (files === undefined) return null

  const numbers = new Set<string>()
  for (const file of files) {
    for (const number of declaredSectionNumbers(readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8'))) {
      numbers.add(number)
    }
  }
  return numbers
}

/** Every file git lists, as `[path, text]`, skipping what this process cannot read as text. */
const readableFiles = (): readonly (readonly [string, string])[] =>
  repositoryFiles().flatMap((file) => {
    let text: string
    try {
      text = readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8')
      /* c8 ignore next 4 -- a file git lists and this process cannot read is a nested checkout or a race; no case can produce one, and the floors above are what notice if it starts happening widely. */
    } catch {
      return []
    }
    return text.includes('\0') ? [] : [[file, text] as const]
  })

/** Every `<document> §N` citation in the tracked corpus, with where it was written. */
const citations = (): readonly { readonly document: string; readonly section: string; readonly where: string }[] =>
  readableFiles().flatMap(([file, text]) =>
    sectionCitations(text).map(({ document, section, line }) => ({
      document,
      section,
      where: `${file}:${String(line)}`,
    })),
  )

/**
 * One section mark, however many are written together.
 *
 * SUBTRACTION RATHER THAN A SECOND PATTERN, so the two numbers cannot disagree:
 * every mark in the corpus, less the ones a citation claimed, is exactly the
 * set this file does not cover. A second regular expression for "a mark with no
 * document" would be a second rule about what a citation is, which is the drift
 * `citations.ts` exists to prevent.
 */
const SECTION_MARK = /§+/gu

describe('the section numbers this repository cites', () => {
  it('name a section the document they name declares', () => {
    const byName = documentsByName()
    const found = citations().filter(({ document }) => basenameOf(document) !== CLAUDE_MD)

    expect(
      found.length,
      'no section citations were extracted, so a green result here would mean nothing',
    ).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_CITATIONS)
    expect(
      new Set(found.map(({ document }) => document)).size,
      'citations were found for fewer documents than this tree cites, so the extractor is reading one shape and missing the rest',
    ).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_DOCUMENTS)

    const unresolvable = [
      ...new Set(
        found
          .filter(({ document, section }) => !(sectionsOf(document, byName)?.has(section) ?? false))
          .map(({ document, section, where }) => `${document} §${section} (${where})`),
      ),
    ].sort()

    expect(
      unresolvable,
      'these references name a section that the document they name does not declare, or a document this tree does not hold; a reader following one lands on the wrong thing and believes it',
    ).toEqual([])
  })

  it('leave the CLAUDE.md family to the guard that owns the split it lives in', () => {
    // NOT A SKIP, A ROUTING, and it is asserted so that it cannot become one.
    // `standardsSections.test.ts` resolves `CLAUDE.md §N` against the core, §0's
    // numbered rules AND `docs/standards/`, because the split put §8.1 in a
    // reference file. If the filter above ever matched everything, or nothing,
    // this count is what says so.
    const claude = citations().filter(({ document }) => basenameOf(document) === CLAUDE_MD)

    expect(
      claude.length,
      'the CLAUDE.md family is empty here, which means either the extractor broke or the exclusion above is excluding the whole corpus',
    ).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_CLAUDE_MD_CITATIONS)
  })

  it('are a minority of the section references this tree writes, and the rest are named rather than hidden', () => {
    // WHAT THIS GUARD CANNOT SEE, MEASURED ON EVERY RUN. A bare `§104` is
    // resolvable by a reader and not by a program: the document comes from the
    // paragraph. Counting them keeps the limit honest — if a future convention
    // made every citation bare, this file would still be green over a handful
    // and this case is what would say the coverage had collapsed.
    const marks = readableFiles().reduce((total, [, text]) => total + [...text.matchAll(SECTION_MARK)].length, 0)
    const qualified = citations().length
    const bare = marks - qualified

    expect(bare, 'no unqualified references were counted, so this measurement is not measuring').toBeGreaterThan(0)
    expect(
      qualified,
      `fewer section references name their document (${String(qualified)}) than do not (${String(bare)}); this guard covers the named ones only, so that is a collapse in what is checked at all`,
    ).toBeGreaterThan(bare)
  })

  it('are read out of a document this parser has never seen, not only out of the ones it was built against', () => {
    // VERIFY FROM OUTSIDE THE FILE YOU FIXED: a matcher checked only against
    // the documents it was written while looking at is a matcher checked in the
    // one place it could not fail. This document is written here, so every
    // property is one a reader can see rather than one this repository happens
    // to have.
    const unseen = [
      '# Something',
      '',
      '## 2 · A numbered section',
      '',
      '1. **A numbered item**, which §2.1 names.',
      '',
      '**2 · A bolded item**, which §2.2 names.',
      '',
      '```',
      '1. Not an item; this is inside a fence.',
      '```',
      '',
      '### 2.4 A numbered subsection',
      '',
      '## An unnumbered heading',
      '',
      '1. Not an item either; the section it would belong to has no number.',
      '',
      '## 7 · Another',
    ].join('\n')

    expect([...declaredSectionNumbers(unseen)].sort()).toEqual(['2', '2.1', '2.2', '2.4', '7'])
    // ASSEMBLED, NOT WRITTEN, for the reason the sentinels below are: spelt out,
    // this probe would be a real citation of a document that does not exist,
    // inside the corpus the first case scans, and that case would fail on it.
    expect(sectionCitations(`see \`${A_DOCUMENT_THAT_IS_NOT_HERE}\` §4.2 and SCREENS.md’s §§1`)).toEqual([
      { document: A_DOCUMENT_THAT_IS_NOT_HERE, section: '4.2', line: 1 },
      { document: 'SCREENS.md', section: '1', line: 1 },
    ])
    // A reference with a word between the document and the mark is NOT one of
    // ours, and neither is a bare mark; both are counted by the case above
    // rather than resolved against a document nobody named.
    expect(sectionCitations('the SCREENS.md spec §8.2, and §4 below')).toEqual([])

    // ═══ THE WRAPPED SHAPE, WHICH IS MORE THAN SEVENTY OF THEM ═══
    //
    // A citation whose document ends a line and whose mark opens the next, over
    // each comment lead-in this tree writes AND over none — 21 of the 76 carry
    // no lead at all, nearly every one of them a Markdown paragraph, which is
    // why the empty alternative below is a case and not an accident. The line
    // reported is the DOCUMENT's, not the mark's, because that is the line a reader has to
    // edit. A blank line between the two is a paragraph break and is NOT one
    // citation — that is the over-match this shape risks, so it is pinned here
    // rather than hoped for.
    expect(sectionCitations('a\nsee `SCREENS.md`\n * §2.11 for it')).toEqual([
      { document: 'SCREENS.md', section: '2.11', line: 2 },
    ])
    expect(sectionCitations('see SCREENS.md\n    // §1.3')).toEqual([
      { document: 'SCREENS.md', section: '1.3', line: 1 },
    ])
    expect(sectionCitations('see SCREENS.md\n>    §1.3')).toEqual([{ document: 'SCREENS.md', section: '1.3', line: 1 }])
    // NO LEAD AT ALL, which is the majority shape in Markdown prose and had no
    // case of its own until the re-review counted the populations (ND-1).
    expect(sectionCitations('see `SCREENS.md`\n§1.3 says')).toEqual([
      { document: 'SCREENS.md', section: '1.3', line: 1 },
    ])
    expect(sectionCitations('see SCREENS.md\n\n§1.3 says')).toEqual([])
  })

  it('are resolved by a search that can actually answer no', () => {
    // Without this, a resolver that returned every number — or one whose
    // document lookup matched anything — would report every citation resolvable
    // and prove nothing.
    const byName = documentsByName()
    const deviations = sectionsOf('docs/deviations.md', byName)

    expect(deviations?.has(A_SECTION_DEVIATIONS_DOES_NOT_DECLARE)).toBe(false)
    expect(deviations?.has(A_SECTION_DEVIATIONS_DOES_DECLARE)).toBe(true)
    // By basename, which is how this tree cites the handoff's own documents.
    expect(sectionsOf(A_DOCUMENT_THAT_IS_CITED, byName)?.has('2.11')).toBe(true)
    expect(sectionsOf(A_DOCUMENT_THAT_IS_CITED, byName)?.has('3.2')).toBe(true)
    // And the predicate a backticked run is asked, which is the same rule
    // anchored: `securityCitations.test.ts` has to know that a run is a section
    // citation before it may treat it as a quoted test-case name.
    expect(isSectionCitation(`${A_DOCUMENT_THAT_IS_CITED} §2.11`)).toBe(true)
    expect(isSectionCitation('apps/web/lib/auth/sessions.ts')).toBe(false)
    expect(isSectionCitation(`see ${A_DOCUMENT_THAT_IS_CITED} §2.11 for it`)).toBe(false)
    // A document git lists nothing for is `null`, not an empty set: an empty set
    // would read as "this document declares no sections" and fail every citation
    // of it with the wrong reason.
    expect(sectionsOf(A_DOCUMENT_THAT_IS_NOT_HERE, byName)).toBeNull()
  })
})
