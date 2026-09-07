/**
 * markdownCorpus — the set of Markdown files the documentation guards read,
 * and the repository root they are read from.
 *
 * ═══ WHY THIS MODULE EXISTS AT ALL ═══
 *
 * Four guards in this directory each need "every Markdown file this repository
 * holds" and "the repository root". Written four times, that is four
 * enumerations of the same thing, and this phase has now watched five separate
 * enumerations drift away from what they enumerate. It is written once, here,
 * and the guards import it — the second real use, which is when CLAUDE.md §3.3
 * says an abstraction earns its place.
 *
 * PATTERN (CLAUDE.md §3.3): none of the seven. Two file reads and a filter.
 * Naming a pattern for it would be cargo cult.
 *
 * ═══ WHY GIT AND NOT A DIRECTORY WALK ═══
 *
 * The same reason `apps/web/lib/auth/adminGuardRegistration.test.ts` gives for
 * its own listing, and it is worth restating rather than cross-referencing: a
 * hand-rolled walk needs a skip list (`node_modules`, `.next`, `coverage`, the
 * Playwright and Lighthouse artefacts), and that skip list is an enumeration
 * wearing a different hat. `git ls-files` needs no list from us — the index
 * plus the untracked files git does not ignore IS what this repository holds,
 * and `.gitignore` is already the repository's own written statement of what is
 * generated rather than authored. A document added in the same commit as the
 * change it describes is therefore checked by that commit's own pre-commit run,
 * which is the point.
 *
 * `--others --exclude-standard` as well as `--cached`, for the same reason it
 * is there: a listing of the index alone cannot see a file that was written and
 * never staged.
 *
 * Depends on: node:child_process, node:path, node:url.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repository root, derived from this file's own location. */
export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

/** The separator `git ls-files -z` writes between paths. */
const NUL = '\0'

/**
 * Every file git reports for this repository, as repository-relative paths with
 * `/` separators.
 *
 * @returns One path per file.
 * @throws If git lists nothing, rather than returning an empty list — an empty
 *   list would satisfy every caller below having read nothing at all.
 */
export const repositoryFiles = (): readonly string[] => {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const files = listed.split(NUL).filter((file) => file.length > 0)
  if (files.length === 0) throw new Error('git listed no files, so nothing that reads this list has read anything')
  return files
}

/**
 * Every Markdown file in the repository, git's whole list filtered by
 * extension — the handoff and the skills included, because a fence that
 * swallows a document is a defect wherever the document came from.
 *
 * @returns Repository-relative paths, sorted.
 * @example
 *   markdownFiles() // ['CLAUDE.md', 'README.md', 'docs/adr/0001-…', …]
 */
export const markdownFiles = (): readonly string[] =>
  repositoryFiles()
    .filter((file) => file.endsWith('.md'))
    .slice()
    .sort()

/**
 * The documentation that describes the repository AS IT IS, as opposed to the
 * dated records of a moment.
 *
 * WHAT IS EXCLUDED AND WHY, because the exclusion is the interesting half.
 * `docs/qa/**` are sweep reports and `docs/superpowers/**` are plans and specs:
 * each is stamped with the date it was written and is a record of what was true
 * then. A file one of them names may legitimately have been renamed or deleted
 * since, and requiring those citations to resolve would either fail honestly
 * over history or train their authors to edit the record. `handoff/**` is
 * excluded for a different reason: it is the specification of record, not ours
 * to correct. Everything that claims to describe the tree today is in.
 *
 * @returns Repository-relative paths, sorted.
 */
export const livingDocuments = (): readonly string[] =>
  markdownFiles().filter(
    (file) =>
      file === 'README.md' ||
      file === 'CLAUDE.md' ||
      (file.startsWith('docs/') && !file.startsWith('docs/qa/') && !file.startsWith('docs/superpowers/')),
  )
