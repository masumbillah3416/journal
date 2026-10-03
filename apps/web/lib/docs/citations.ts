/**
 * citations — what counts as a citation in this repository's prose, and how one
 * is resolved against the tree.
 *
 * ═══ WHY THIS MODULE EXISTS ═══
 *
 * `pathCitations.test.ts` wrote these rules for the LIVING documentation, whose
 * corpus deliberately excludes `docs/qa/**` — see that file's header for the
 * hole that exclusion leaves and why closing it by widening the corpus would be
 * wrong. `newestSweep.test.ts` closes the hole the way that header prescribes,
 * over the NEWEST sweep report alone, and it has to ask the same two questions
 * of a backticked run: is this a citation, and does it resolve?
 *
 * Two askers is when `markdownCorpus.ts`'s own argument applies — CLAUDE.md §4
 * bans an abstraction for a SINGLE caller, so a second real caller is where one
 * earns its place — and the alternative is the failure this directory exists to
 * refuse: a second copy of
 * `FILE_PATH` drifting away from the first, so that a report's citations are
 * checked by rules the documentation's are not.
 *
 * A THIRD ASKER SINCE PHASE 4 TASK 15e: `sectionCitations.test.ts` resolves
 * `<document> §N`, and `securityCitations.test.ts` has to ask whether a
 * backticked run is a path, an identifier or a `§N` before it may treat it as a
 * quoted test-case name. Both reach for {@link sectionCitations}, and the
 * second reaches for the two predicates above, which is the same argument a
 * second caller made: a copy of either rule is a rule that drifts.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Predicates over a backticked
 * run, an extraction, and lookups against what git lists.
 *
 * INVARIANT — {@link sourceCorpus} must never include the file asking it a
 * question. Every caller writes its probe strings and its exemptions as string
 * literals, and a corpus holding the asker resolves every one of them against
 * the asker itself. That is why `excluding` is a parameter with no default
 * rather than a convenience.
 *
 * Depends on: node:fs, node:path, ./markdownCorpus.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { REPOSITORY_ROOT, repositoryFiles } from './markdownCorpus'

/** Extensions that make a backticked run a citation of a file rather than prose. */
const SOURCE_EXTENSION = '(?:ts|tsx|js|mjs|cjs|json|md|css|yml|yaml|sql|sh|html|png|ico|woff2)'

/** A backticked run shaped like a repository-relative path to a file. */
const FILE_PATH = new RegExp(
  `^(?!/)(?:\\.\\.?/)*[\\w@.()\\[\\]-]+(?:/[\\w@.()\\[\\]{}+-]+)*\\.${SOURCE_EXTENSION}$`,
  'u',
)

/** A bare suffix (`-linux.png`, `.module.css`): a naming convention, not a path. */
const SUFFIX_CONVENTION = /^[.-][^/]*$/u

/** A content-hashed build output (`1g8qu58aprhre.css`), which no source tree holds. */
const BUILD_OUTPUT = /^[a-z0-9][a-z0-9_-]{8,}\.(?:js|css)$/u

/** A token shaped like an identifier rather than an English word. */
const IDENTIFIER = /^[A-Za-z_$][\w$]{3,}$/u

/** Which files hold this repository's own source, for resolving identifiers. */
const SOURCE_FILE = /\.(?:ts|tsx|js|mjs|cjs|json|css|yml|yaml)$/u

/** Directories whose contents are not this repository's own authored source. */
const NOT_OUR_SOURCE = [
  'node_modules',
  '.next',
  'coverage',
  'dist',
  'test-results',
  'lhci-reports',
  'playwright-report',
]

/**
 * A path's last `/`-separated segment.
 *
 * `slice` off `lastIndexOf` rather than `split('/').pop()`, which is the same
 * answer with no branch in it: `lastIndexOf` answers `-1` for a path with no
 * separator and `slice(0)` is then the whole string. The `pop()` spelling needs
 * a `?? ''` that `noUncheckedIndexedAccess` requires and no input can reach, so
 * it is a branch this module could never cover.
 * @param file - A repository-relative path, or a bare basename.
 * @returns Everything after the last `/`, or the whole string when there is none.
 * @example
 * basenameOf('apps/web/lib/auth/sessions.ts') // 'sessions.ts'
 */
const basenameOf = (file: string): string => file.slice(file.lastIndexOf('/') + 1)

/** One backticked run, and the 1-based line of the document it sits on. */
export interface Citation {
  /** The text between the backticks, trimmed. */
  readonly run: string
  /** Which line of the document carried it. */
  readonly line: number
}

/**
 * Every backticked run in a document, with the line it sits on.
 *
 * @param text - A document's whole text.
 * @returns One entry per run, in document order, duplicates included — a
 *   citation quoted twice is wrong twice and is reported at both lines.
 * @example
 * backtickedRuns('see `apps/web/lib/env.ts`') // [{ run: 'apps/web/lib/env.ts', line: 1 }]
 */
export const backtickedRuns = (text: string): readonly Citation[] =>
  text.split('\n').flatMap((line, index) =>
    [...line.matchAll(/`([^`\n]+)`/gu)].map((match) => ({
      /* c8 ignore next -- the pattern's one group always participates in a match, so the fallback is `noUncheckedIndexedAccess` satisfied rather than a case. */
      run: (match[1] ?? '').trim(),
      line: index + 1,
    })),
  )

/**
 * Whether a backticked run is a citation of a file rather than prose or a route.
 *
 * Never a leading `/` — that is a route, and routes are `docs/api.md`'s subject.
 * Never a bare suffix, which names a naming convention, and never a
 * content-hashed build output, which no source tree holds.
 * @param run - The text between the backticks.
 * @returns Whether it should resolve to a file.
 * @example
 * isPathCitation('/admin/sign-in') // false — a route
 */
export const isPathCitation = (run: string): boolean =>
  FILE_PATH.test(run) &&
  !/[*]|\.\.\./u.test(run) &&
  !SUFFIX_CONVENTION.test(run) &&
  !BUILD_OUTPUT.test(run) &&
  !run.startsWith('node_modules/') &&
  !run.startsWith('@')

/**
 * Whether a backticked run is shaped like an identifier rather than an English
 * word: camelCase, PascalCase or SCREAMING_SNAKE.
 *
 * Both cases present, or an underscore. That shape is the whole of the filter
 * and it is deliberate — "the", "cases" and "shape" are English, and a list of
 * English words to exclude is an enumeration.
 * @param run - The text between the backticks.
 * @returns Whether it should resolve to a symbol.
 * @example
 * isIdentifierCitation('cases') // false — English
 */
export const isIdentifierCitation = (run: string): boolean =>
  IDENTIFIER.test(run) && (run.includes('_') || (/[a-z]/u.test(run) && /[A-Z]/u.test(run)))

/**
 * Whether git lists a file this citation could name.
 *
 * The `.js` rewrite is what an ESM specifier needs: `./payload.js` is how
 * TypeScript wants `payload.ts` imported, and a document quoting an import line
 * is quoting it correctly. A basename match counts, because a document that
 * writes `sessions.ts` for `apps/web/lib/auth/sessions.ts` is citing
 * accurately.
 * @param citation - The backticked path.
 * @param files - Every path git lists.
 * @param basenames - Every basename git lists.
 * @returns Whether it resolves.
 * @example
 * resolvesToAFile('sessions.ts', files, basenames) // true
 */
export const resolvesToAFile = (
  citation: string,
  files: ReadonlySet<string>,
  basenames: ReadonlySet<string>,
): boolean => {
  const cleaned = citation.replace(/^(?:\.\.?\/)+/u, '')
  const spellings = [cleaned, cleaned.replace(/\.js$/u, '.ts'), cleaned.replace(/\.js$/u, '.tsx')]
  return spellings.some((spelling) => files.has(spelling) || basenames.has(basenameOf(spelling)))
}

/**
 * Every path git lists, and every basename, as the two sets
 * {@link resolvesToAFile} takes.
 *
 * @returns The two lookups, built from one listing so they cannot disagree.
 * @example
 * const { files, basenames } = listedFiles()
 */
export const listedFiles = (): { readonly files: ReadonlySet<string>; readonly basenames: ReadonlySet<string> } => {
  const files = new Set(repositoryFiles())
  return { files, basenames: new Set([...files].map(basenameOf)) }
}

/**
 * This repository's own source, concatenated, for resolving identifiers.
 *
 * @param excluding - Absolute paths to leave out — see this module's INVARIANT.
 *   Every caller passes at least its own file.
 * @returns Every remaining source file's text, joined.
 * @example
 * sourceCorpus([fileURLToPath(import.meta.url)])
 */
export const sourceCorpus = (excluding: readonly string[]): string => {
  const skip = new Set(excluding)
  return repositoryFiles()
    .filter((file) => !skip.has(path.join(REPOSITORY_ROOT, file)))
    .filter((file) => SOURCE_FILE.test(file) && !file.split('/').some((segment) => NOT_OUR_SOURCE.includes(segment)))
    .map((file) => {
      // A file git lists and this process cannot read is a nested repository or
      // a race, not a citation problem; it must not silently shrink the corpus,
      // so it becomes a marker the callers' assertions can see.
      //
      // THE SUPPRESSION IS THE WHOLE try/catch, not the catch arm, and that is
      // v8's shape rather than a choice: the `catch` clause is counted as a
      // BRANCH at its own line, so a directive over the arm's statements leaves
      // the branch uncovered and this file at 85.71%. The `readFileSync` inside
      // it is exercised by every run of every caller; what cannot be exercised
      // is the failure, because no test can make git list a file this process
      // may not read.
      /* c8 ignore start -- the read's failure arm; see above. */
      try {
        return readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8')
      } catch {
        return ` UNREADABLE:${file} `
      }
      /* c8 ignore stop */
    })
    .join('\n')
}

/**
 * A `<document> §N` citation: the document named, the section number, and
 * nothing in between.
 *
 * ═══ WHAT THIS PATTERN DELIBERATELY DOES NOT MATCH ═══
 *
 * A bare `§N`. More than a fifth of this repository's section references are
 * written that way — "§6's LCP gate", "see §104" — and which document they mean
 * comes from the paragraph around them, not from the text. A resolver that
 * guessed would resolve most of them to the wrong document, which is the exact
 * failure `docs/deviations.md` §98 exists to stop. They are out of scope and
 * counted rather than silently dropped, so the share that IS resolvable is a
 * number a reader can see.
 *
 * It also does not match a document named by a word rather than a file —
 * "design spec §8.2" — for the same reason.
 *
 * The spellings it does carry are the ones this tree actually writes, measured
 * rather than guessed: the file name optionally backticked, optionally
 * possessive in either apostrophe, and `§§` where two sections are cited
 * together (of which only the first number is resolved).
 *
 * ═══ AND ONE A LINE WRAP SPLITS, WHICH IS THE COMMON SHAPE ═══
 *
 * A citation whose document ends a line and whose mark opens the next was
 * invisible to the first version of this pattern, and it is not a rarity: more
 * than seventy of them — 76 occurrences over 45 document/section pairs when
 * this was measured, 2026-10-03 — of which most, but NOT all, are in a module
 * header or a comment. 54 are, which is the place this directory's guards say a
 * frozen number is most easily forgotten; the other 22 are ordinary Markdown
 * paragraphs in `docs/api.md`, `docs/data-model.md` and the ADRs, where the
 * wrap is just where the line ended. The first draft of this sentence said 68
 * and "every one of them", and both were readings nobody re-took (re-review,
 * ND-1) — a floor and two populations now, because the pattern has to be right
 * about the shape and not about the census. So the separator admits ONE newline
 * with a
 * comment-continuation lead — ` * `, `// `, `> ` or nothing — and one only: two
 * newlines are a paragraph break, and a document at the end of one paragraph
 * has nothing to do with a mark at the start of the next.
 */
const SECTION_CITATION =
  /(?<![\w/.-])`?((?:[\w@.-]+\/)*[\w.-]+\.md)`?(?:'s|’s)?(?:[ \t]*|[ \t]*\r?\n[ \t]*(?:\*|\/\/|>)?[ \t]*)§+[ \t]*(\d+(?:\.\d+)*)/gu

/** The same, anchored, for asking whether a whole backticked run is one. */
const WHOLE_SECTION_CITATION = new RegExp(`^${SECTION_CITATION.source}$`, 'u')

/** A numbered heading at any level: `## 7 · Data handling`, `## 2.1 Overview`. */
const NUMBERED_HEADING = /^#{1,6}[ \t]+(\d+(?:\.\d+)*)(?:[ \t]+·)?[ \t]+\S/u

/**
 * A numbered item inside a section, in the two spellings this tree's documents
 * use: an ordinary ordered-list item (`1. TDD: …`, which is what `CLAUDE.md`
 * §0.1 and `docs/deviations.md` §13.4 name) and a bolded one
 * (`**1 · Password**`, which is what `SCREENS.md` §3.1 names).
 */
const NUMBERED_ITEM = /^(?:(\d+)\.[ \t]+\S|\*\*(\d+)[ \t]+·[ \t]+\S)/u

/** A Markdown fence, opening or closing. */
const FENCE = /^[ \t]*(?:```|~~~)/u

/** One `<document> §N` citation, and where it was written. */
export interface SectionCitation {
  /** The document the citation names, exactly as it is spelled. */
  readonly document: string
  /** The section number, dots included. */
  readonly section: string
  /** Which 1-based line of the file carried it. */
  readonly line: number
}

/**
 * Every `<document> §N` citation in a file's text.
 *
 * OVER THE WHOLE TEXT, NOT LINE BY LINE, which is what lets a wrapped citation
 * be seen at all — see {@link SECTION_CITATION}'s second half. The line is then
 * counted from the match's own offset rather than handed down by a `split`, and
 * it is the line the DOCUMENT sits on, because that is where a reader fixing the
 * citation has to type. The cursor only ever moves forward, since `matchAll`
 * yields in order.
 * @param text - The file's whole text.
 * @returns One entry per citation, in order, duplicates included — a citation
 *   written twice is wrong twice.
 * @example
 * sectionCitations('see `SCREENS.md` §2.1') // [{ document: 'SCREENS.md', section: '2.1', line: 1 }]
 */
export const sectionCitations = (text: string): readonly SectionCitation[] => {
  const found: SectionCitation[] = []
  let line = 1
  let counted = 0
  for (const match of text.matchAll(SECTION_CITATION)) {
    const at = match.index
    for (let index = counted; index < at; index += 1) if (text[index] === '\n') line += 1
    counted = at
    /* c8 ignore next 2 -- both groups always participate in a match; the fallbacks satisfy noUncheckedIndexedAccess rather than any input. */
    found.push({ document: match[1] ?? '', section: match[2] ?? '', line })
  }
  return found
}

/**
 * Whether a backticked run is, in its entirety, a `<document> §N` citation.
 *
 * `securityCitations.test.ts` asks this so that `` `docs/deviations.md §98` ``
 * is not mistaken for a quoted test-case name.
 * @param run - The text between the backticks.
 * @returns Whether the whole run is one citation and nothing else.
 * @example
 * isSectionCitation('SCREENS.md §2.11') // true
 */
export const isSectionCitation = (run: string): boolean => WHOLE_SECTION_CITATION.test(run)

/**
 * Every section number a document declares — its numbered headings, and the
 * numbered items each of those headings carries.
 *
 * ═══ WHY THE ITEMS COUNT AND ARE NOT A LOOPHOLE ═══
 *
 * Three documents put a section's parts in a numbered list rather than in
 * sub-headings, and all three are cited that way: `CLAUDE.md` §0.9 is the ninth
 * rule of §0's list, `SCREENS.md` §3.2 is the second bolded item of `# 3 ·
 * Sign-in`, and `docs/deviations.md` §13.4 is the fourth item of §13. Reading
 * headings alone refuses more than a hundred citations in this tree that any
 * reader resolves in one scroll, and a guard that refuses valid input is a
 * guard people route around.
 *
 * A FLOOR, BECAUSE THE EXACT NUMBER MOVES AND IT MOVED UNDER THE FIRST DRAFT OF
 * THIS SENTENCE: it said 149, which was already 162 the day it shipped (review
 * round 1, F5). The number is not the argument, and `CLAUDE.md` §0 says what to
 * do with one in prose.
 *
 * Fenced blocks are skipped, so a `1.` inside an example is not a section.
 * @param text - The document's whole text.
 * @returns Every number a `§N` citation of this document may name.
 * @example
 * declaredSectionNumbers('# 3 · Sign-in\n\n**1 · Password**\n') // Set { '3', '3.1' }
 */
export const declaredSectionNumbers = (text: string): ReadonlySet<string> => {
  const declared = new Set<string>()
  let section: string | undefined
  let fenced = false
  for (const line of text.split('\n')) {
    if (FENCE.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const heading = NUMBERED_HEADING.exec(line)
    if (heading) {
      /* c8 ignore next -- the pattern's one group always participates in a match; the fallback satisfies `noUncheckedIndexedAccess` rather than a case. */
      section = heading[1] ?? ''
      declared.add(section)
      continue
    }
    if (line.startsWith('#')) {
      // An unnumbered heading ends the numbered section it follows, so a list
      // under `## Threat model` cannot lend its numbers to the section above.
      section = undefined
      continue
    }
    if (section === undefined) continue
    const item = NUMBERED_ITEM.exec(line)
    /* c8 ignore next 2 -- exactly one of the pattern's two alternatives participates in a match, so the second fallback is the type's requirement rather than a case. */
    if (item) declared.add(`${section}.${item[1] ?? item[2] ?? ''}`)
  }
  return declared
}
