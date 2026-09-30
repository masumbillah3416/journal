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
 * ═══ AND THE DATE HAS A CEILING, WHICH IS THE HALF THAT WAS MISSING ═══
 *
 * The pattern alone accepts any `\d{4}-\d{2}-\d{2}`, so `2026-13-45-foo.md` —
 * or a fat-fingered `2062-` — sorts above every real report and becomes "the
 * newest" FOR EVER. Every genuine report written afterwards would go unchecked,
 * the non-vacuity floor would still be met by that one file's own backticks,
 * and this whole guard would report green while guarding nothing. So a date
 * must be a day the calendar has, and must not be more than
 * {@link DAYS_AHEAD_A_REPORT_MAY_BE_DATED} past the runner's own — and a report
 * whose date fails either test is REPORTED by name rather than quietly skipped,
 * because skipping it is the same silence one layer down.
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
 * Whether a `YYYY-MM-DD` run is a day that exists.
 *
 * The pattern above is arithmetic-free, so `2026-13-45` satisfies it. The
 * round trip through `Date` is what refuses that AND `2026-02-30`, which rolls
 * forward to March rather than failing — a string that comes back different is
 * a day the calendar does not have.
 * @param date - The run captured from a filename.
 * @returns Whether it names a real day.
 * @example
 * isARealDay('2026-02-30') // false — Date rolls it to 2026-03-02
 */
const isARealDay = (date: string): boolean => {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date)
}

/**
 * How far past the runner's own day a report may still be dated.
 *
 * ═══ WHY THIS IS NOT ZERO, AND WHY IT IS TWO RATHER THAN ONE ═══
 *
 * A report is named by its AUTHOR'S calendar and this check runs on the
 * RUNNER'S. The inhabited offsets run from UTC−12 to UTC+14, which is 26 hours,
 * and 26 hours is MORE THAN A DAY — so the two calendars can read two different
 * dates apart, not one: 01:30 on the 3rd at UTC+14 is 23:30 on the 1st at
 * UTC−12. A one-day ceiling therefore refuses a real report written on a real
 * machine, which is a guard going red at an honest author.
 *
 * TWO IS THE WHOLE OF THAT SPREAD, and it costs nothing this constant exists to
 * buy: what it is here to catch is a TYPO — `2099-`, `2062-`, `2026-13-45` —
 * and every one of those is years or months out, not days.
 *
 * This is a semantic bound and not a race (standing orders §15): nothing here
 * is waiting for a clock to catch up. Widening it past the inhabited spread
 * would make it admit typos; narrowing it below makes it refuse reports.
 */
const DAYS_AHEAD_A_REPORT_MAY_BE_DATED = 2

/**
 * The runner's own day, in its own zone.
 *
 * LOCAL AND NOT UTC, because that is the calendar whoever names the next report
 * will read off their own machine. The offset is subtracted before the ISO
 * spelling is taken, which is the only way to get a local calendar date out of
 * `Date` without a formatter.
 * @param now - The instant to read, injected so a case can move it.
 * @returns `YYYY-MM-DD`.
 */
const dayOf = (now: Date): string =>
  new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)

/**
 * The latest day a report may claim, given when this runs.
 *
 * @param now - The instant this check runs at.
 * @returns `YYYY-MM-DD`, inclusive.
 */
const latestDatePermitted = (now: Date): string =>
  dayOf(new Date(now.getTime() + DAYS_AHEAD_A_REPORT_MAY_BE_DATED * 24 * 60 * 60 * 1000))

/** One report's path and the day its name claims. */
interface DatedReport {
  readonly file: string
  readonly date: string
}

/**
 * Every dated report, split into the ones whose date is usable and the ones
 * whose date cannot be believed.
 *
 * ═══ WHY THE IMPOSSIBLE ONES ARE RETURNED RATHER THAN DROPPED ═══
 *
 * Dropping them silently is the defect this split exists to close. A file
 * committed as `docs/qa/2099-01-01-…` or `2026-13-45-…` would otherwise become
 * "the newest" for ever: every genuine report written afterwards would go
 * unchecked, the non-vacuity case would still be satisfied by that one file's
 * own backticks, and the whole guard would report green while guarding nothing.
 * Excluding them from the selection fixes the capture; REPORTING them is what
 * stops the exclusion being a second silence.
 * @param files - Repository-relative paths, in any order.
 * @param now - The instant this check runs at.
 * @returns The usable reports and the unbelievable ones, each sorted by path.
 */
const datedReports = (
  files: readonly string[],
  now: Date,
): { readonly usable: readonly DatedReport[]; readonly impossible: readonly DatedReport[] } => {
  const ceiling = latestDatePermitted(now)
  const all = files
    .flatMap((file) => {
      const matched = DATED_REPORT.exec(file)
      return matched === null ? [] : [{ file, date: matched[1] ?? '' }]
    })
    .sort((left, right) => (left.file < right.file ? -1 : 1))

  return {
    usable: all.filter((entry) => isARealDay(entry.date) && entry.date <= ceiling),
    impossible: all.filter((entry) => !isARealDay(entry.date) || entry.date > ceiling),
  }
}

/**
 * The reports written on the latest day any believable report was written on.
 *
 * Pure, and taking the list rather than reading the tree, so the selection can
 * be asked about a set of names this repository does not hold — which is the
 * only way to prove it prefers a later date over an earlier one rather than
 * preferring whatever sorts last.
 * @param files - Repository-relative paths, in any order.
 * @param now - The instant this check runs at.
 * @returns Every usable report carrying the newest date, sorted; empty when the
 *   list holds no usable report at all.
 * @example
 * newestOf(['docs/qa/2026-01-02-a-sweep.md', 'docs/qa/2026-01-03-b-sweep.md'], new Date())
 * // ['docs/qa/2026-01-03-b-sweep.md']
 */
const newestOf = (files: readonly string[], now: Date): readonly string[] => {
  const { usable } = datedReports(files, now)
  // ISO dates sort lexicographically, which is the whole reason the convention
  // writes them that way; the calendar check above is what earns that shortcut.
  const newest = usable.reduce((latest, entry) => (entry.date > latest ? entry.date : latest), '')
  return usable.filter((entry) => entry.date === newest).map((entry) => entry.file)
}

/** The newest reports this repository actually holds, as `[path, text]`. */
const newestReports = (): readonly (readonly [string, string])[] =>
  newestOf(markdownFiles(), new Date()).map(
    (file) => [file, readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8')] as const,
  )

/** Every backticked run of the newest reports, with where it was found. */
const citationsOf = (
  predicate: (run: string) => boolean,
): readonly { readonly run: string; readonly where: string }[] =>
  newestReports().flatMap(([file, text]) =>
    backtickedRuns(text)
      .filter(({ run }) => predicate(run))
      .map(({ run, line }) => ({ run, where: `${file}:${String(line)}` })),
  )

/** One day, in milliseconds, for the ceiling cases below. */
const DAY_MS = 24 * 60 * 60 * 1000

/** The westernmost inhabited UTC offset (Baker Island), in hours. */
const EARLIEST_OFFSET_HOURS = -12

/** The easternmost inhabited UTC offset (Line Islands), in hours. */
const LATEST_OFFSET_HOURS = 14

/**
 * The instant the pure cases below are asked about.
 *
 * Injected rather than `new Date()` (CLAUDE.md §2.3): every literal date in
 * those cases is fixed against it, so they cannot start failing on a particular
 * day of the year.
 */
const A_MONDAY = new Date('2026-06-15T09:00:00.000Z')

/** A report whose date is unremarkable, for the cases about the other kind. */
const REAL = 'docs/qa/2026-03-04-real-sweep.md'

describe('the newest report under docs/qa', () => {
  it('was found, and holds citations, so a green result below is a result', () => {
    // THE NON-VACUITY CASE, and it guards two different silences. An empty
    // selection makes every assertion below vacuously true, and so does a
    // report the extractor cannot find a single backticked run in — a file
    // saved with smart quotes, or a selection pointing at the wrong directory.
    const reports = newestReports()

    expect(reports.map(([file]) => file)).not.toEqual([])

    // ONE FLOOR PER PREDICATE, NOT ONE OVER THE UNION. A floor over the two
    // together is satisfied by either, so a newest report holding identifiers
    // and no path would leave the path case vacuously green with this case
    // still passing. A sweep report that names no
    // file and one that names no symbol are each worth a second look, which is
    // what these two messages say.
    expect(
      citationsOf(isPathCitation).length,
      'the newest report quotes no file path at all, so the path case below checks nothing — either the extractor broke or the report cites no file',
    ).toBeGreaterThanOrEqual(1)
    expect(
      citationsOf(isIdentifierCitation).length,
      'the newest report quotes no identifier at all, so the identifier case below checks nothing — either the extractor broke or the report names no symbol',
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
    expect(newestOf(['docs/qa/2026-01-03-zzz-sweep.md', 'docs/qa/2026-02-01-aaa-sweep.md'], A_MONDAY)).toEqual([
      'docs/qa/2026-02-01-aaa-sweep.md',
    ])

    // Every report of the newest day, not one of them.
    expect(
      newestOf(
        [
          'docs/qa/2026-02-01-desk-sweep.md',
          'docs/qa/2026-01-09-old-sweep.md',
          'docs/qa/2026-02-01-authoring-sweep.md',
        ],
        A_MONDAY,
      ),
    ).toEqual(['docs/qa/2026-02-01-authoring-sweep.md', 'docs/qa/2026-02-01-desk-sweep.md'])

    // Things that are not a dated report directly under `docs/qa/`: a
    // screenshot's directory, an undated note, and a document somewhere else
    // whose name happens to start with a date.
    expect(
      newestOf(
        [
          'docs/qa/assets/2026-09-30-shot.md',
          'docs/qa/notes.md',
          'docs/superpowers/2026-12-31-plan.md',
          'docs/qa/2026-01-02-only-sweep.md',
        ],
        A_MONDAY,
      ),
    ).toEqual(['docs/qa/2026-01-02-only-sweep.md'])

    // And a list with no report in it selects nothing rather than everything,
    // which is what the non-vacuity case above is standing over.
    expect(newestOf(['README.md'], A_MONDAY)).toEqual([])
  })

  it('refuses a date the calendar has no such day for, so one typo cannot capture the corpus', () => {
    // WITHOUT THIS, A TYPO RETIRES THE WHOLE GUARD SILENTLY: `2026-13-45`
    // sorts above every real date, becomes "the
    // newest" for ever, and every genuine report written afterwards goes
    // unchecked while the suite stays green.
    const withATypo = ['docs/qa/2026-13-45-typo-sweep.md', 'docs/qa/2026-02-30-also-typo-sweep.md', REAL]

    expect(newestOf(withATypo, A_MONDAY)).toEqual([REAL])
    expect(datedReports(withATypo, A_MONDAY).impossible.map((entry) => entry.file)).toEqual([
      'docs/qa/2026-02-30-also-typo-sweep.md',
      'docs/qa/2026-13-45-typo-sweep.md',
    ])
  })

  it('accepts a report dated as far ahead as the inhabited time zones reach, and refuses one dated further', () => {
    // BOTH SIDES OF THE CEILING, and the boundary MOVES with `now` rather than
    // with a literal — a hard-coded date here would pass for a while and then
    // start refusing every real report. The last accepted day is
    // DAYS_AHEAD_A_REPORT_MAY_BE_DATED past the runner's; see that constant for
    // why that number is the spread between UTC−12 and UTC+14 and not one day.
    const on = (date: string): string => `docs/qa/${date}-ahead-sweep.md`
    const dayFrom = (days: number): string => dayOf(new Date(A_MONDAY.getTime() + days * DAY_MS))
    const lastAccepted = dayFrom(DAYS_AHEAD_A_REPORT_MAY_BE_DATED)
    const firstRefused = dayFrom(DAYS_AHEAD_A_REPORT_MAY_BE_DATED + 1)

    // Every day up to and including the ceiling.
    for (let ahead = 0; ahead <= DAYS_AHEAD_A_REPORT_MAY_BE_DATED; ahead += 1) {
      expect(newestOf([REAL, on(dayFrom(ahead))], A_MONDAY)).toEqual([on(dayFrom(ahead))])
    }
    expect(newestOf([REAL, on(lastAccepted)], A_MONDAY)).toEqual([on(lastAccepted)])

    // And the first day past it, which is refused and named.
    expect(newestOf([REAL, on(firstRefused)], A_MONDAY)).toEqual([REAL])
    expect(datedReports([REAL, on(firstRefused)], A_MONDAY).impossible.map((entry) => entry.file)).toEqual([
      on(firstRefused),
    ])

    // And the same filename is accepted once the runner's own day has caught
    // up, which is what says the ceiling is read from `now` and not from a
    // constant hiding in the comparison.
    expect(newestOf([REAL, on(firstRefused)], new Date(A_MONDAY.getTime() + DAY_MS))).toEqual([on(firstRefused)])
  })

  it('sets that ceiling at the calendar span the inhabited offsets actually reach', () => {
    // THE CASES ABOVE COMPUTE THEIR EXPECTATIONS FROM THE CONSTANT, so none of
    // them can tell a right constant from a wrong one — the boundary moves with
    // the value and the assertions move with it. This is the case that pins the
    // value, and it does it by deriving it from the reason rather than by
    // writing the number down a second time: set the constant to 1 or 3 and
    // this fails, which is what standing order §2 asks of a gating constant.
    //
    // 26 hours is more than one day, so the two extremes read dates TWO apart:
    // 01:30 on the 3rd at UTC+14 is 23:30 on the 1st at UTC−12. A one-day
    // ceiling refuses a real report written on a real machine.
    expect(DAYS_AHEAD_A_REPORT_MAY_BE_DATED).toBe(Math.ceil((LATEST_OFFSET_HOURS - EARLIEST_OFFSET_HOURS) / 24))

    // And the arithmetic in that sentence, so the sentence cannot drift from it:
    // one instant, read as a local date at each extreme, two days apart.
    const instant = Date.UTC(2026, 5, 2, 11, 30)
    const localDay = (offsetHours: number): string =>
      new Date(instant + offsetHours * 60 * 60 * 1000).toISOString().slice(0, 10)

    expect(localDay(LATEST_OFFSET_HOURS)).toBe('2026-06-03')
    expect(localDay(EARLIEST_OFFSET_HOURS)).toBe('2026-06-01')
  })

  it('holds no report this repository dated impossibly, which is the state the two cases above protect', () => {
    // The check over the real tree. Without it the ceiling would quietly drop a
    // mis-dated report instead of dropping the guard, which is a second silence
    // rather than a fix.
    const { impossible } = datedReports(markdownFiles(), new Date())

    expect(
      impossible.map((entry) => entry.file),
      'these reports under docs/qa carry a date that is not a day, or one too far ahead to be a record; rename them',
    ).toEqual([])
  })
})
