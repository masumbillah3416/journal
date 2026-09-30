/**
 * newestSweep.test.ts — the newest report under `docs/qa/` cites files and
 * symbols that exist, checked at the moment it is written.
 *
 * ═══ WHY THIS EXISTS, IN THE WORDS THAT ASKED FOR IT ═══
 *
 * `pathCitations.test.ts` excludes `docs/qa/**` from the living-documentation
 * corpus, and its header names the hole that leaves rather than asserting it
 * away: *"A sweep report is a LIVE document on the day it is written, and for
 * that day nothing checks its citations… What would close it honestly is a
 * write-time check over the NEWEST report alone. It does not exist."*
 *
 * This is that check. Phase 4 quadruples the number of reports in that
 * directory, which is what makes it worth building now rather than later.
 *
 * ═══ WHY THE NEWEST ONLY, AND WHY THAT IS NOT A WEAKENING ═══
 *
 * The older reports stay excluded, and that is the whole design. A report is a
 * record of what was true on the day it was written; a file it names may have
 * been renamed since, and a check over all of them would either fail honestly
 * over history or train their authors to edit the record. Keeping the corpus at
 * the newest report means the check fires exactly once per report — in the
 * commit that adds it, while its author is still the person who can fix it —
 * and never again. A citation that goes stale a phase later is history, not a
 * defect.
 *
 * ═══ WHY A DATE AND NOT A MODIFICATION TIME ═══
 *
 * `CLAUDE.md` §10 names the convention — `docs/qa/YYYY-MM-DD-<area>-sweep.md` —
 * so the date is in the name, where a checkout cannot lose it. `mtime` is a
 * property of this working copy: a fresh clone gives every file the same one,
 * and `git checkout` of an old branch would make a two-phase-old report the
 * newest thing on disk. The name is the report's own statement of when it was
 * written.
 *
 * ═══ A DAY CAN HOLD MORE THAN ONE REPORT, AND ALL OF THEM ARE CHECKED ═══
 *
 * `CLAUDE.md` §10 asks for one sweep per screen group, so a phase closing out
 * writes several on one day. "The newest report" would then be whichever of
 * them sorted last, and the other three would be checked by nobody — a
 * tiebreak that silently drops work. Every report carrying the newest DATE is
 * checked, which is strictly more than the hole asked to be closed and needs no
 * tiebreak at all.
 *
 * ═══ THERE IS NO EXEMPTION LIST, DELIBERATELY ═══
 *
 * `pathCitations.test.ts` needs two, because its corpus spans documents written
 * over four phases and some of their citations cannot resolve and should not.
 * This corpus is one day old. A citation in it that names nothing is a citation
 * its author can still correct, and an exemption list here would become the
 * second record that header warns about. A report that wants to name a file
 * this tree does not hold — a build artefact under `test-results/`, say — puts
 * the screenshot in `docs/qa/assets/` and cites that instead.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A selection and two lookups.
 *
 * Depends on: vitest, node:fs, node:path, node:url, ./citations,
 * ./markdownCorpus.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  backtickedRuns,
  isIdentifierCitation,
  isPathCitation,
  listedFiles,
  resolvesToAFile,
  sourceCorpus,
} from './citations'
import { REPOSITORY_ROOT, markdownFiles } from './markdownCorpus'

/**
 * A report directly under `docs/qa/` whose name opens with the date
 * `CLAUDE.md` §10's convention puts there. The capture is the date.
 *
 * Directly under: `docs/qa/assets/` holds the screenshots reports cite, and a
 * picture has no citations in it.
 */
const DATED_REPORT = /^docs\/qa\/(\d{4}-\d{2}-\d{2})-[^/]+\.md$/u

/**
 * The reports written on the latest day any report was written on.
 *
 * Pure, and taking the list rather than reading the tree, so the selection can
 * be asked about a set of names this repository does not hold — which is the
 * only way to prove it prefers a later date over an earlier one rather than
 * preferring whatever sorts last.
 * @param files - Repository-relative paths, in any order.
 * @returns Every dated report carrying the newest date, sorted; empty when the
 *   list holds no dated report at all.
 * @example
 * newestOf(['docs/qa/2026-01-02-a-sweep.md', 'docs/qa/2026-01-03-b-sweep.md'])
 * // ['docs/qa/2026-01-03-b-sweep.md']
 */
const newestOf = (files: readonly string[]): readonly string[] => {
  const dated = files.flatMap((file) => {
    const matched = DATED_REPORT.exec(file)
    return matched === null ? [] : [{ file, date: matched[1] ?? '' }]
  })
  // ISO dates sort lexicographically, which is the whole reason the convention
  // writes them that way; no parsing, and therefore no time zone.
  const newest = dated.reduce((latest, entry) => (entry.date > latest ? entry.date : latest), '')
  return dated
    .filter((entry) => entry.date === newest)
    .map((entry) => entry.file)
    .sort()
}

/** The newest reports this repository actually holds, as `[path, text]`. */
const newestReports = (): readonly (readonly [string, string])[] =>
  newestOf(markdownFiles()).map((file) => [file, readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8')] as const)

/** Every backticked run of the newest reports, with where it was found. */
const citationsOf = (
  predicate: (run: string) => boolean,
): readonly { readonly run: string; readonly where: string }[] =>
  newestReports().flatMap(([file, text]) =>
    backtickedRuns(text)
      .filter(({ run }) => predicate(run))
      .map(({ run, line }) => ({ run, where: `${file}:${String(line)}` })),
  )

describe('the newest report under docs/qa', () => {
  it('was found, and holds citations, so a green result below is a result', () => {
    // THE NON-VACUITY CASE, and it guards two different silences. An empty
    // selection makes every assertion below vacuously true, and so does a
    // report the extractor cannot find a single backticked run in — a file
    // saved with smart quotes, or a selection pointing at the wrong directory.
    const reports = newestReports()

    expect(reports.map(([file]) => file)).not.toEqual([])
    expect(
      [...citationsOf(isPathCitation), ...citationsOf(isIdentifierCitation)].length,
      'the newest report was found but nothing in it parsed as a citation',
    ).toBeGreaterThanOrEqual(1)
  })

  it('names files that exist in this repository', () => {
    const { files, basenames } = listedFiles()

    const unresolvable = citationsOf(isPathCitation)
      .filter(({ run }) => !resolvesToAFile(run, files, basenames))
      .map(({ run, where }) => `${run} (${where})`)

    expect(
      unresolvable,
      'the newest sweep report quotes a file path that names nothing in this tree; correct it now, while it is still today’s report',
    ).toEqual([])
  })

  it('names identifiers that exist in this repository’s source', () => {
    // This file is excluded from the corpus for the reason `pathCitations.test.ts`
    // gives for excluding itself: the probes below are string literals, and a
    // corpus holding this file would resolve them against this file.
    const corpus = sourceCorpus([fileURLToPath(import.meta.url)])

    const unresolvable = citationsOf(isIdentifierCitation)
      .filter(({ run }) => !corpus.includes(run))
      .map(({ run, where }) => `${run} (${where})`)

    expect(
      unresolvable,
      'the newest sweep report quotes an identifier that appears nowhere in this repository’s source',
    ).toEqual([])
  })

  it('is chosen by the date in its name, not by where the name sorts', () => {
    // A selection that took the last name alphabetically would pass every
    // assertion above against whichever report happened to sort last, forever.
    // The `zzz`/`aaa` pair is the one that tells the two apart.
    expect(newestOf(['docs/qa/2026-01-03-zzz-sweep.md', 'docs/qa/2026-02-01-aaa-sweep.md'])).toEqual([
      'docs/qa/2026-02-01-aaa-sweep.md',
    ])

    // Every report of the newest day, not one of them.
    expect(
      newestOf([
        'docs/qa/2026-02-01-desk-sweep.md',
        'docs/qa/2026-01-09-old-sweep.md',
        'docs/qa/2026-02-01-authoring-sweep.md',
      ]),
    ).toEqual(['docs/qa/2026-02-01-authoring-sweep.md', 'docs/qa/2026-02-01-desk-sweep.md'])

    // Things that are not a dated report directly under `docs/qa/`: a
    // screenshot's directory, an undated note, and a document somewhere else
    // whose name happens to start with a date.
    expect(
      newestOf([
        'docs/qa/assets/2026-09-30-shot.md',
        'docs/qa/notes.md',
        'docs/superpowers/2026-12-31-plan.md',
        'docs/qa/2026-01-02-only-sweep.md',
      ]),
    ).toEqual(['docs/qa/2026-01-02-only-sweep.md'])

    // And a list with no report in it selects nothing rather than everything,
    // which is what the non-vacuity case above is standing over.
    expect(newestOf(['README.md'])).toEqual([])
  })
})
