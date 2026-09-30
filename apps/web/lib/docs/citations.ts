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
 * Two askers is when `markdownCorpus.ts`'s own argument applies — a second real
 * use is where CLAUDE.md §3.3 says an abstraction earns its place — and the
 * alternative is the failure this directory exists to refuse: a second copy of
 * `FILE_PATH` drifting away from the first, so that a report's citations are
 * checked by rules the documentation's are not.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Two predicates, an extraction
 * and two lookups.
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
