/**
 * pathCitations.test.ts — every file path and every identifier the living
 * documentation quotes in backticks names something that exists in this tree.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * A citation that does not resolve is not a small error. `docs/architecture.md`
 * listed `packages/ui` as a package of this workspace for the whole of two
 * phases; it has never existed, and a contributor adding a shared primitive
 * either creates a third package nobody decided on or concludes the workspace
 * is broken (final review 9, F9-6). `docs/deviations.md` attributed `RESET_PATH`
 * to the module that IMPORTS it rather than the one that declares it, which is
 * how a reader fails to find a constant and re-declares it locally — the exact
 * duplication `resetPath.test.ts` exists to refuse (F9-11).
 *
 * The ninth reviewer resolved these by script and reported the result green,
 * which is the whole argument for adopting it: **a check that was run once by
 * hand and never again is a check the next document defeats.** Run over the
 * same surface it ran over, this file was green on its first execution. Run
 * over `docs/**` more widely, it was not — see WHAT IS EXCLUDED below.
 *
 * ═══ WHAT COUNTS AS A CITATION ═══
 *
 * **A path** is a backticked run of `/`-separated segments whose last segment
 * carries a source extension. Never a leading `/` — that is a route, and routes
 * are `docs/api.md`'s subject, not this file's. Never a bare suffix (`-linux.png`,
 * `.module.css`), which names a naming convention. Never a content-hashed build
 * output. It resolves if git lists it, or lists a file with that basename — a
 * document that writes `sessions.ts` for `apps/web/lib/auth/sessions.ts` is
 * citing accurately, and demanding the full path everywhere would make the
 * prose unreadable to close a hole nobody has fallen into. An ESM specifier's
 * `.js` is rewritten to `.ts`/`.tsx` before resolving, because that is what
 * `moduleResolution: Bundler` does with it.
 *
 * **An identifier** is a backticked token that is camelCase, PascalCase or
 * SCREAMING_SNAKE — both cases present, or an underscore. That shape is the
 * whole of the filter and it is deliberate: "the", "cases" and "shape" are
 * English, and a list of English words to exclude is an enumeration, which is
 * the failure mode this repository has now watched five times. It resolves if
 * the token appears anywhere in this repository's own source.
 *
 * ═══ WHAT IS EXCLUDED, AND WHY THAT IS NOT A HOLE ═══
 *
 * `docs/qa/**` and `docs/superpowers/**` are dated records — sweep reports,
 * plans, specs — of what was true on the day they were written. A file one of
 * them names may have been renamed since, and requiring those citations to
 * resolve would either fail honestly over history or, worse, train their authors
 * to edit the record. `handoff/**` is the specification of record and is not
 * ours to correct. {@link livingDocuments} is what remains: everything that
 * claims to describe the tree as it is.
 *
 * ═══ THE TWO EXEMPTION LISTS ═══
 *
 * {@link PATHS_THAT_NAME_NO_FILE} and {@link IDENTIFIERS_THAT_NAME_NOTHING_HERE}
 * carry the citations that cannot resolve and should not: a report in the
 * untracked `.superpowers/` directory, a probe written to disk and deleted, a
 * browser API, a symbol a document says in its own next paragraph is gone.
 *
 * They are fail-closed in both directions, the shape
 * `securityCitations.test.ts` uses for the same problem:
 *
 *   - every entry must still appear in a living document, so an exemption
 *     cannot outlive the sentence it was written for;
 *   - no entry may resolve, so the list cannot quietly excuse a real file or a
 *     real symbol that someone later adds.
 *
 * An unlisted citation that does not resolve is the failing case. That is the
 * direction that matters: silence is what F9-6 lived in.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Two extractions and two set
 * comparisons.
 *
 * Depends on: vitest, node:fs, ./markdownCorpus.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { REPOSITORY_ROOT, livingDocuments, repositoryFiles } from './markdownCorpus'

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

/** A floor on the path citations found, so an extractor that stopped matching fails here. */
const AT_LEAST_THIS_MANY_PATH_CITATIONS = 800

/** A floor on the identifier citations found, for the same reason. */
const AT_LEAST_THIS_MANY_IDENTIFIER_CITATIONS = 500

/** A path shaped exactly like a citation and deliberately naming nothing, so the search can answer "no". */
const A_PATH_THAT_RESOLVES_NOWHERE = 'apps/web/lib/auth/thereIsNoSuchModuleAsThis.ts'

/** An identifier shaped exactly like a citation and deliberately naming nothing. */
const AN_IDENTIFIER_THAT_RESOLVES_NOWHERE = 'thereIsNoSuchSymbolAsThisOneAnywhere'

/**
 * The backticked paths in the living documentation that name no file here, each
 * with the reason it cannot.
 *
 * Every entry must still appear in a living document and must still fail to
 * resolve — see the module header for why both directions are asserted.
 */
const PATHS_THAT_NAME_NO_FILE: readonly { readonly citation: string; readonly why: string }[] = [
  {
    citation: '.superpowers/sdd/2026-09-01-phase-1-public-diary/lcp-floor-report.md',
    why: 'the SDD working directory is untracked and no commit ever held it; ADR 0008 says so at the citation and carries the reproduction method itself',
  },
  {
    citation: '.superpowers/sdd/2026-09-01-phase-1-public-diary/owner-decisions-report.md',
    why: 'untracked, and ADR 0008 states at the citation that the file cannot be opened',
  },
  {
    citation: '.superpowers/sdd/2026-09-01-phase-1-public-diary/closing-fixes-report.md',
    why: 'untracked, and ADR 0013 states at the citation what the decision rests on instead',
  },
  {
    citation: '.superpowers/sdd/2026-09-01-phase-1-public-diary/budget-and-housekeeping-report.md',
    why: 'untracked, and ADR 0014 states at the citation what the decision rests on instead',
  },
  {
    citation: 'render-boundary-report.md',
    why: 'a report in the same untracked SDD directory, named by ADR 0007 by its basename',
  },
  {
    citation: 'final-fix-report-5.md',
    why: 'a fix report in the same untracked SDD directory, named by docs/testing.md as the record of a round',
  },
  {
    citation: 'app/robots.ts',
    why: 'work Phase 4 owes: docs/testing.md names the file the crawl policy will live in, and says it is not written',
  },
  {
    citation: 'apps/web/app/robots.ts',
    why: 'the same unwritten file, named by docs/security.md at full path',
  },
  {
    citation: 'apps/web/scripts/emit-actions.ts',
    why: 'a probe written to disk and deleted, framed as one where it is cited',
  },
  {
    citation: 'e2e/dummyDrift.spec.ts',
    why: 'a spec written to disk to prove the CI-registration guard fails, and deleted in the same measurement',
  },
  {
    citation: 'e2e/ciRegistration.spec.ts',
    why: "the file's former name: ruling F57 moved it to `e2e/ciRegistration.test.ts` so it runs in the pre-commit gate, and docs/testing.md records the move",
  },
  {
    citation: 'proxy.ts',
    why: 'a Next.js file-convention name used generically in ADR 0018 — the convention Next renames `middleware.ts` to, not a file in this tree',
  },
  {
    citation: 'actions.cjs',
    why: 'the same generic convention, in the CommonJS spelling the guard refuses',
  },
  {
    citation: 'prerender-manifest.json',
    why: 'a Next build artefact under `apps/web/.next/`, which `.gitignore` excludes, read once by ADR 0010 to count what was prerendered',
  },
]

/**
 * The backticked identifiers in the living documentation that name nothing in
 * this repository's source, each with the reason.
 *
 * The large group is other people's API — a browser global, a React internal, a
 * Lighthouse audit key, a Payload hook name. Naming one is how a document
 * explains what it is written against, and this repository's source will never
 * contain it.
 */
const IDENTIFIERS_THAT_NAME_NOTHING_HERE: readonly { readonly citation: string; readonly why: string }[] = [
  {
    citation: 'IntersectionObserver',
    why: "a browser global, named by ADR 0008 in the framework bundle's own contents",
  },
  { citation: 'MessageChannel', why: 'a browser global, named in the same inventory' },
  { citation: 'hydrateRoot', why: "React's own entry point, named in the same inventory" },
  { citation: 'createFromReadableStream', why: "React's Flight client, named in the same inventory" },
  { citation: 'onRecoverableError', why: 'a React root option, named in the same inventory' },
  { citation: 'FlightRouterState', why: "Next's own router type, named in the same inventory" },
  { citation: 'useSearchParams', why: 'a Next hook the diary deliberately does not call, named to say so' },
  {
    citation: 'scryptSync',
    why: "node:crypto's synchronous scrypt, named by ADR 0015 as the API this code does NOT use",
  },
  { citation: 'splitChunks', why: "webpack's option name, named by ADR 0012 to describe what Turbopack does instead" },
  { citation: 'noModule', why: "the HTML script attribute, named by docs/testing.md in a Lighthouse audit's terms" },
  { citation: 'emulatedUserAgentString', why: 'a Lighthouse configuration key, named by ADR 0014' },
  {
    citation: 'getStandardAssertionResults',
    why: 'a function inside `@lhci/utils`, read once to explain how lhci aggregates',
  },
  { citation: 'getValueForAggregationMethod', why: 'a function inside `@lhci/utils`, read in the same investigation' },
  { citation: 'htmlSize', why: 'a Lighthouse resource-summary key, named by ADR 0010' },
  { citation: 'observedLargestContentfulPaint', why: 'a Lighthouse metric key, named by ADR 0008' },
  { citation: 'CHROME_INTERSTITIAL_ERROR', why: 'a Chrome error code Playwright surfaces, named by docs/testing.md' },
  { citation: 'disablePlaygroundInProduction', why: 'a Payload GraphQL option, named by docs/api.md' },
  { citation: 'endOfLine', why: 'a Prettier option, named by docs/testing.md as one this repository does not set' },
  { citation: 'Expires', why: 'the HTTP response header, named by docs/security.md' },
  {
    citation: 'afterDelete',
    why: "a Payload collection-hook name, named by the runbook as where Phase 3's deletion belongs",
  },
  { citation: '_rsc', why: 'the query parameter Next appends to a prefetch, named by ADR 0014' },
  {
    citation: 'pgQueue',
    why: "the deferred queue adapter's name in architecture.md's diagram; no clips exist to enqueue",
  },
  { citation: 'transcodeQueue', why: 'the deferred transcode port, named as a seam in the same diagram' },
  {
    citation: 'flipMachine',
    why: "the seam's name in architecture.md's module table and diagram; the module on disk is `packages/domain/src/flip.ts` and the reducer it exports is `flipReducer`",
  },
  {
    citation: 'ADMIN_SECURITY_HEADERS',
    why: 'a symbol that was removed; the sentence citing it says so in the same clause, which is why it is cited at all',
  },
  {
    citation: 'PENDING_ADDRESS_MASK',
    why: "deviations §33 records a placeholder that Task 10 removed; the entry's own closure paragraph says it is gone",
  },
]

/** Every backticked run in a document, with the line it sits on. */
const backtickedRuns = (text: string): readonly { readonly run: string; readonly line: number }[] =>
  text.split('\n').flatMap((line, index) =>
    [...line.matchAll(/`([^`\n]+)`/gu)].map((match) => ({
      run: (match[1] ?? '').trim(),
      line: index + 1,
    })),
  )

/** The living documentation, read once, as `[path, text]`. */
const documents = (): readonly (readonly [string, string])[] =>
  livingDocuments().map((file) => [file, readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8')] as const)

/** Whether a backticked run is a citation of a file rather than prose or a route. */
const isPathCitation = (run: string): boolean =>
  FILE_PATH.test(run) &&
  !/[*]|\.\.\./u.test(run) &&
  !SUFFIX_CONVENTION.test(run) &&
  !BUILD_OUTPUT.test(run) &&
  !run.startsWith('node_modules/') &&
  !run.startsWith('@')

/** Whether a backticked run is shaped like an identifier rather than an English word. */
const isIdentifierCitation = (run: string): boolean =>
  IDENTIFIER.test(run) && (run.includes('_') || (/[a-z]/u.test(run) && /[A-Z]/u.test(run)))

/**
 * Whether git lists a file this citation could name.
 *
 * The `.js` rewrite is what an ESM specifier needs: `./payload.js` is how
 * TypeScript wants `payload.ts` imported, and a document quoting an import line
 * is quoting it correctly.
 * @param citation - The backticked path.
 * @param files - Every path git lists.
 * @param basenames - Every basename git lists.
 * @returns Whether it resolves.
 */
const resolvesToAFile = (citation: string, files: ReadonlySet<string>, basenames: ReadonlySet<string>): boolean => {
  const cleaned = citation.replace(/^(?:\.\.?\/)+/u, '')
  const spellings = [cleaned, cleaned.replace(/\.js$/u, '.ts'), cleaned.replace(/\.js$/u, '.tsx')]
  return spellings.some((spelling) => files.has(spelling) || basenames.has(spelling.split('/').pop() ?? ''))
}

/**
 * This repository's own source, concatenated, for resolving identifiers.
 *
 * EXCLUDES THIS FILE, and that is load-bearing rather than tidiness. Every
 * entry of {@link IDENTIFIERS_THAT_NAME_NOTHING_HERE} is written here as a
 * string literal, so a corpus including this file would report all of them as
 * resolving and the "no entry may resolve" assertion would be satisfied by the
 * exemption list quoting itself. {@link AN_IDENTIFIER_THAT_RESOLVES_NOWHERE}
 * has the same problem in the other direction. The one identifier this file
 * requires to be PRESENT is deliberately owned elsewhere
 * (`packages/domain/src/auth/session.ts`), so excluding this file cannot make
 * that assertion pass by accident either.
 * @returns Every source file's text, joined.
 */
const sourceCorpus = (): string =>
  repositoryFiles()
    .filter((file) => path.join(REPOSITORY_ROOT, file) !== fileURLToPath(import.meta.url))
    .filter((file) => SOURCE_FILE.test(file) && !file.split('/').some((segment) => NOT_OUR_SOURCE.includes(segment)))
    .map((file) => {
      try {
        return readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8')
      } catch {
        // A file git lists and this process cannot read is a nested repository
        // or a race, not a citation problem; it must not silently shrink the
        // corpus, so it becomes a marker the assertions below can see.
        return ` UNREADABLE:${file} `
      }
    })
    .join('\n')

describe('the paths and identifiers the living documentation quotes', () => {
  it('name files that exist in this repository', () => {
    const files = new Set(repositoryFiles())
    const basenames = new Set([...files].map((file) => file.split('/').pop() ?? ''))
    const excused = new Set(PATHS_THAT_NAME_NO_FILE.map((entry) => entry.citation))

    const citations = documents().flatMap(([file, text]) =>
      backtickedRuns(text)
        .filter(({ run }) => isPathCitation(run))
        .map(({ run, line }) => ({ run, where: `${file}:${String(line)}` })),
    )
    expect(
      citations.length,
      'no path citations were extracted, so a green result here would mean nothing',
    ).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_PATH_CITATIONS)

    const unresolvable = citations
      .filter(({ run }) => !excused.has(run) && !resolvesToAFile(run, files, basenames))
      .map(({ run, where }) => `${run} (${where})`)

    expect(
      unresolvable,
      'these documents quote a file path that names nothing in this tree; either the path is wrong or the file is gone',
    ).toEqual([])
  })

  it('name identifiers that exist in this repository’s source', () => {
    const corpus = sourceCorpus()
    const excused = new Set(IDENTIFIERS_THAT_NAME_NOTHING_HERE.map((entry) => entry.citation))

    const citations = documents().flatMap(([file, text]) =>
      backtickedRuns(text)
        .filter(({ run }) => isIdentifierCitation(run))
        .map(({ run, line }) => ({ run, where: `${file}:${String(line)}` })),
    )
    expect(
      citations.length,
      'no identifier citations were extracted, so a green result here would mean nothing',
    ).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_IDENTIFIER_CITATIONS)

    const unresolvable = citations
      .filter(({ run }) => !excused.has(run) && !corpus.includes(run))
      .map(({ run, where }) => `${run} (${where})`)

    expect(
      unresolvable,
      'these documents quote an identifier that appears nowhere in this repository’s source; either it was renamed or it never existed',
    ).toEqual([])
  })

  it('are separated from the citations that cannot resolve by two lists nothing can outgrow unnoticed', () => {
    // An exemption that outlives its sentence is a hole with a comment over it,
    // and one that starts naming something real waves a live citation through.
    // Both directions are asserted, so neither can happen quietly.
    const prose = documents()
      .map(([, text]) => text)
      .join('\n')
    const files = new Set(repositoryFiles())
    const basenames = new Set([...files].map((file) => file.split('/').pop() ?? ''))
    const corpus = sourceCorpus()

    const stalePaths = PATHS_THAT_NAME_NO_FILE.filter((entry) => !prose.includes(entry.citation)).map((e) => e.citation)
    const nowRealPaths = PATHS_THAT_NAME_NO_FILE.filter((entry) =>
      resolvesToAFile(entry.citation, files, basenames),
    ).map((e) => e.citation)
    const staleIdentifiers = IDENTIFIERS_THAT_NAME_NOTHING_HERE.filter((entry) => !prose.includes(entry.citation)).map(
      (e) => e.citation,
    )
    const nowRealIdentifiers = IDENTIFIERS_THAT_NAME_NOTHING_HERE.filter((entry) =>
      corpus.includes(entry.citation),
    ).map((e) => e.citation)

    expect(stalePaths, 'these path exemptions are no longer quoted by any living document').toEqual([])
    expect(nowRealPaths, 'these path exemptions now resolve, so they excuse nothing and must be deleted').toEqual([])
    expect(staleIdentifiers, 'these identifier exemptions are no longer quoted by any living document').toEqual([])
    expect(
      nowRealIdentifiers,
      'these identifier exemptions now name real source, so they excuse nothing and must be deleted',
    ).toEqual([])

    // Every reason is written down, so an entry cannot be added silently.
    expect(
      [...PATHS_THAT_NAME_NO_FILE, ...IDENTIFIERS_THAT_NAME_NOTHING_HERE].filter((entry) => entry.why.length < 20),
    ).toEqual([])
  })

  it('are checked by searches that can actually answer no', () => {
    // Without this, a resolver that accidentally matched everything - an empty
    // needle, a basename set holding '' - would report every citation resolvable
    // and prove nothing.
    const files = new Set(repositoryFiles())
    const basenames = new Set([...files].map((file) => file.split('/').pop() ?? ''))

    expect(resolvesToAFile(A_PATH_THAT_RESOLVES_NOWHERE, files, basenames)).toBe(false)
    expect(resolvesToAFile('apps/web/lib/auth/sessions.ts', files, basenames)).toBe(true)
    expect(sourceCorpus().includes(AN_IDENTIFIER_THAT_RESOLVES_NOWHERE)).toBe(false)
    expect(sourceCorpus().includes('SESSION_LIFETIME_MS')).toBe(true)
    expect(isPathCitation('/admin/sign-in')).toBe(false)
    expect(isIdentifierCitation('cases')).toBe(false)
  })
})
