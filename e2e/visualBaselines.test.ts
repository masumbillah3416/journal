/**
 * visualBaselines.test.ts — every admin screen has a visual baseline at all
 * three viewports, so a screen cannot ship unbaselined.
 *
 * ═══ WHAT THIS IS FOR ═══
 *
 * Phase 4's first exit criterion is "every screen matches `SCREENS.md`", and
 * what makes that checkable rather than asserted is a photograph of each screen
 * at each of `playwright.config.ts`'s three projects. Each screen task was
 * supposed to add its own as it landed. This is where the SET is checked for
 * holes — the check nobody can pass by remembering.
 *
 * ═══ WHY IT IS OVER SCREENS AND NOT OVER `ADMIN_NAV` ═══
 *
 * The plan's own version keyed on `ADMIN_NAV` and `startsWith`, and it was
 * blind three ways. `ADMIN_NAV` has nine entries and deliberately no `account`
 * — `packages/domain/src/admin/navigation.ts`'s header says why — so the
 * Account screen was invisible to it. `startsWith('admin-journeys-')` is
 * satisfied by `admin-journeys-create-desktop-linux.png`, a baseline of a
 * different state of a different thing. And one file satisfied a screen that
 * owes three: `admin-journeys-rungs-desktop-linux.png` exists at `desktop`
 * only, on purpose, and would have vouched for `mid` and `mobile` too.
 *
 * So the population is the SCREENS themselves — `SCREENS.md` §2.1 through
 * §2.11 plus the shell — and each owes the EXACT triple
 * `admin-<screen>-{desktop,mid,mobile}-linux.png`. Exact, because a prefix
 * match is what let a state stand in for a screen.
 *
 * ═══ THE LIST IS CHECKED AGAINST `SCREENS.md` IN BOTH DIRECTIONS ═══
 *
 * A hard-coded list of screens is bookkeeping, and bookkeeping drifts from the
 * thing it books (standing orders §17): a twelfth screen added to the handoff
 * would simply not be asked for. So {@link SCREENS} is checked against the §2.x
 * headings `SCREENS.md` actually prints — every heading has a row, every row
 * names a heading — and the guard fails on the commit that adds a screen to the
 * specification before it fails on the commit that forgets its baseline.
 *
 * THE SHELL IS THE ONE ENTRY WITH NO §2.x HEADING, and it is named rather than
 * derived: `SCREENS.md` §2's preamble specifies the 238px rail, the 96px header
 * and the masthead before §2.1 begins, and the phase's exit line counts it
 * ("eleven screens plus the shell"). It is listed with `heading: null`, which is
 * what keeps the both-directions check honest about it.
 *
 * ═══ A FILENAME IS NOT A PHOTOGRAPH ═══
 *
 * Requiring the three files is only half of standing order §17's diagnostic:
 * delete every `toHaveScreenshot('admin-*.png')` call from `e2e/visual.spec.ts`
 * and leave the `.png` files where they are, and a guard over filenames alone
 * stays green over thirty-six images nothing will ever regenerate. Empty files
 * satisfy it too.
 *
 * That matters because this guard is what tells segment 15b it has finished. So
 * each screen owes BOTH: the three files, and a `toHaveScreenshot` call in
 * `e2e/visual.spec.ts` naming it. The two are separate cases, so a run names
 * which screens are missing which half rather than reporting one number.
 *
 * ═══ WHAT THE CALL CHECK CANNOT SEE, NAMED RATHER THAN ASSERTED AWAY ═══
 *
 * It reads source, so its reach is a source matcher's, and a reader deciding
 * whether 15b is finished needs to know where that stops.
 *
 * 1. **A call is not tied to a PROJECT.** `e2e/visual.spec.ts` may restrict a
 *    case to one project at run time — `admin-journeys-rungs` does exactly
 *    that, deliberately — and nothing in the source says so in a form this can
 *    read. So one desktop-only case satisfies a screen that owes three files.
 *    Deliberately NOT chased: inferring a project restriction from source text
 *    is fragile enough to become its own defect, and the file half of this
 *    guard already fails until all three images exist. The hole is therefore
 *    bounded — a screen can be half-covered by a case, never by a file.
 * 2. **Only a single-quoted literal is seen.** A name built from a template
 *    literal or a variable matches nothing, which fails CLOSED: the screen is
 *    reported as unphotographed rather than silently vouched for.
 * 3. **The comment strip is textual, so two shapes can DROP a live call** and
 *    neither can invent one: a line-comment marker inside a string literal
 *    takes the rest of its line, and a block-comment opener inside a string or
 *    a line comment runs on to the next closer. Both leave a screen reported as
 *    unphotographed, which is the direction that costs a reader a second look
 *    rather than a false all-clear.
 * 4. **A runtime guard whose first argument is a quoted literal is refused as a
 *    declaration** — `test.skip('a' === b, 'reason')`. It fails loudly, naming
 *    the shape, rather than vouching for anything.
 *
 * The rules those limits belong to are pinned by the case
 * `tells a live screenshot call from prose about one…`, which asks them about
 * sources this repository does not hold.
 *
 * ═══ THE ONLY HONEST WAY TO TURN THIS FILE GREEN ═══
 *
 * Every filename it asks for ends `-linux.png` because the baselines are
 * produced inside the pinned Playwright Linux container
 * (`npm run test:visual:container:update`), and a machine that cannot run that
 * container cannot honestly produce one. Narrowing this guard to the screens
 * that happen to have files, or marking it `.skip`, would turn the phase's
 * first exit criterion back into a sentence.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A directory listing, some
 * extractions and set comparisons over what they find.
 *
 * Depends on: vitest, node:fs, node:path, node:url, `ADMIN_NAV`
 * (@travel-diary/domain/admin/navigation).
 */
import { ADMIN_NAV } from '@travel-diary/domain/admin/navigation'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** This directory, from this file's own location. */
const E2E_DIR = path.dirname(fileURLToPath(import.meta.url))

/** The repository root. */
const REPO_ROOT = path.resolve(E2E_DIR, '..')

/** Where Playwright keeps the committed baselines. */
const SNAPSHOT_DIR = path.join(E2E_DIR, 'visual.spec.ts-snapshots')

/** The specification these screens are transcribed from. */
const SCREENS_MD = 'handoff/design_handoff_travel_diary/SCREENS.md'

/**
 * The three viewport projects `playwright.config.ts` declares.
 *
 * Written here rather than imported from that file because importing it pulls
 * `@playwright/test`'s whole config machinery into a Vitest run; the pairing is
 * asserted instead, against the `name:` lines of the config itself, so this
 * list cannot quietly fall behind a fourth project.
 */
const PROJECTS = ['desktop', 'mid', 'mobile'] as const

/**
 * The suffix every committed baseline carries.
 *
 * `-linux.png` because Playwright names a snapshot after the platform that took
 * it, and every one of these is produced in the pinned Linux container — a file
 * ending `-win32.png` is one taken on somebody's laptop, which is a different
 * font stack and a different renderer.
 */
const PLATFORM = 'linux'

/**
 * Every admin screen that owes a baseline, with the `SCREENS.md` §2 heading it
 * is specified by and the name its baselines carry.
 *
 * The `screen` is what `toHaveScreenshot` is passed, minus the project and
 * platform Playwright appends: `admin-overview.png` becomes
 * `admin-overview-desktop-linux.png` and its two siblings. Where a screen is
 * also a rail entry, the name is `admin-` plus that entry's own `id` — these
 * are string literals, so the case `cover every rail entry the domain declares`
 * is what keeps the two from disagreeing.
 */
const SCREENS: readonly { readonly screen: string; readonly heading: string | null }[] = [
  // The one entry with no §2.x heading of its own — see this module's header.
  { screen: 'admin-shell', heading: null },
  { screen: 'admin-overview', heading: '2.1 Overview' },
  { screen: 'admin-journeys', heading: '2.2 Journeys' },
  { screen: 'admin-journey-editor', heading: '2.3 Journey editor' },
  { screen: 'admin-media', heading: '2.4 Media' },
  { screen: 'admin-galleries', heading: '2.5 Galleries' },
  { screen: 'admin-book', heading: '2.6 Book & bookmarks' },
  { screen: 'admin-cover', heading: '2.7 Cover & About' },
  { screen: 'admin-publish', heading: '2.8 Publish' },
  { screen: 'admin-settings', heading: '2.9 Settings' },
  { screen: 'admin-trash', heading: '2.10 Trash' },
  { screen: 'admin-account', heading: '2.11 Account' },
]

/** Every `## 2.x <title>` heading `SCREENS.md` prints, in document order. */
const specifiedScreens = (): readonly string[] =>
  readFileSync(path.join(REPO_ROOT, SCREENS_MD), 'utf8')
    .split('\n')
    .flatMap((line) => {
      const matched = /^## (2\.\d+ .+)$/u.exec(line.trim())
      return matched === null ? [] : [matched[1] ?? '']
    })

/** The three files one screen owes. */
const baselinesFor = (screen: string): readonly string[] =>
  PROJECTS.map((project) => `${screen}-${project}-${PLATFORM}.png`)

/** Which spec is supposed to take these photographs. */
const VISUAL_SPEC = 'e2e/visual.spec.ts'

/**
 * A declaration whose body never runs, or which stops every other body from
 * running, so the calls inside the file stand for nothing: `test.skip('…', …)`,
 * `test.fixme('…', …)`, `test.only('…', …)`, `describe.skip(…)`, and the same
 * four through Playwright's `serial` and `parallel` modifiers.
 *
 * THE QUOTED FIRST ARGUMENT IS WHAT MAKES THIS A DECLARATION rather than a
 * runtime guard. `test.skip(condition, reason)` — at file level or inside a
 * body — is a different thing entirely: it is how `admin-journeys-rungs`
 * restricts itself to one project, and that case still runs and still takes its
 * photograph.
 *
 * THE MODIFIERS ARE NOT OPTIONAL POLISH. `test.describe.serial.only(…)` is a
 * declaration whose calls are counted and whose siblings' bodies never run, so
 * without the `(?:\.(?:serial|parallel))*` it is a FALSE GREEN and not a strict
 * refusal — measured, not assumed.
 */
const UNATTRIBUTABLE_DECLARATION =
  /\b(?:test|it)\.(?:skip|fixme|only)\(\s*['"`]|\b(?:test\.)?describe(?:\.(?:serial|parallel))*\.(?:skip|fixme|only)\(/gu

/** The shape of a `toHaveScreenshot` call this guard can attribute to a screen. */
const SCREENSHOT_CALL = /toHaveScreenshot\(\s*'([^']+)\.png'/gu

/**
 * A source file with its comments blanked.
 *
 * Block comments first, then line comments, so a `//` inside a block comment
 * cannot leave a fragment behind. Crude in two ways, and both remove text
 * rather than adding it: a `//` inside a string literal takes the rest of that
 * line with it, and a `/*` inside a string or inside a line comment opens a
 * block that swallows to the next `* /`. Both can only DROP a call, never
 * invent one — see this file's header for why that direction is the safe one.
 * @param source - The file's text.
 * @returns The same text with every comment removed.
 * @example
 * withoutComments("// await expect(page).toHaveScreenshot('x.png')") // ''
 */
const withoutComments = (source: string): string =>
  source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\/\/[^\n]*/gu, '')

/**
 * Every name a spec's source hands `toHaveScreenshot`, without the `.png`.
 *
 * Pure, and over text rather than over a path, so the rule can be asked about a
 * source this repository does not hold — which is the only way to prove it
 * tells a live call from a commented-out one.
 *
 * COMMENTS ARE STRIPPED FIRST, because a commented-out call is prose ABOUT a
 * case and counting it would vouch for a screen nothing photographs.
 * @param source - A spec file's text.
 * @returns One entry per live call, duplicates included.
 * @example
 * screenshotNamesIn("await expect(page).toHaveScreenshot('admin-shell.png')") // ['admin-shell']
 */
const screenshotNamesIn = (source: string): readonly string[] =>
  [...withoutComments(source).matchAll(SCREENSHOT_CALL)].map((found) => found[1] ?? '')

/**
 * Every declaration in a spec's source whose calls cannot be attributed.
 *
 * Pure, for the same reason {@link screenshotNamesIn} is.
 * @param source - A spec file's text.
 * @returns The matched openers, trimmed, one per occurrence.
 * @example
 * unattributableDeclarationsIn("test.skip('x', () => {})") // ["test.skip('"]
 */
const unattributableDeclarationsIn = (source: string): readonly string[] =>
  [...withoutComments(source).matchAll(UNATTRIBUTABLE_DECLARATION)].map((found) => found[0].trim())

/**
 * The selector every admin `toHaveScreenshot` call has to mask.
 *
 * The rail prints `scope.user.email` on all eleven admin routes, and in this
 * suite that address ends in `fixtureLabel`'s WORKER INDEX, which Playwright
 * hands out differently from one run to the next. Masking it is what keeps
 * these baselines from resting on `maxDiffPixelRatio` swallowing a few glyphs
 * — the margin `docs/deviations.md` §110 records a stale baseline surviving on.
 */
const REQUIRED_MASK = 'data-profile-name'

/**
 * The text of the `toHaveScreenshot(…)` call naming a baseline, or `null`.
 *
 * Parentheses are balanced from the call's own opener rather than matched with
 * a pattern, because the options object holds nested calls — `page.locator(…)`
 * — and a non-greedy match stops at the first of them.
 *
 * ITS ONE BLIND SPOT FAILS CLOSED. A parenthesis inside a string literal in
 * the call (a selector like `:not(x)`) miscounts the depth, and both ways of
 * being wrong end in a refusal: the scan either closes early, returning a
 * slice too short to hold the mask, or runs off the end and returns `null`.
 * Neither can invent a mask that is not there.
 * @param source - A spec file's text, comments included.
 * @param baseline - The baseline stem whose call to find.
 * @returns The call from `(` to its matching `)`, or `null`.
 * @example
 * screenshotCallFor("toHaveScreenshot('a.png', { fullPage: true })", 'a') // "('a.png', { fullPage: true })"
 */
const screenshotCallFor = (source: string, baseline: string): string | null => {
  const scanned = withoutComments(source)
  const at = scanned.indexOf(`toHaveScreenshot('${baseline}.png'`)
  if (at < 0) return null

  const from = at + 'toHaveScreenshot'.length
  let depth = 0
  for (let index = from; index < scanned.length; index += 1) {
    const character = scanned[index]
    if (character === '(') depth += 1
    else if (character === ')') {
      depth -= 1
      if (depth === 0) return scanned.slice(from, index + 1)
    }
  }
  return null
}

/** The spec this guard reads, as text. */
const visualSpecSource = (): string => readFileSync(path.join(REPO_ROOT, VISUAL_SPEC), 'utf8')

/**
 * Every name `e2e/visual.spec.ts` hands `toHaveScreenshot`, without the `.png`.
 *
 * Read off that file's source rather than by running it: a Vitest project
 * cannot drive Playwright, and what is being asked is whether a case EXISTS to
 * regenerate a baseline, which is a question about the file.
 * @returns One entry per live call, duplicates included.
 * @example
 * screenshotCalls() // ['admin-overview', 'admin-journeys', 'diary-cover', …]
 */
const screenshotCalls = (): readonly string[] => screenshotNamesIn(visualSpecSource())

/**
 * Every `admin-*` baseline in this directory that is deliberately NOT one of
 * {@link SCREENS}, with the reason it is there.
 *
 * ═══ WHY THE SET IS CHECKED IN THIS DIRECTION TOO ═══
 *
 * Asking each screen for its three files never asks whether a committed file
 * still belongs to a screen — and that is not a hypothetical gap. It is
 * `docs/deviations.md` §86's own defect: three `admin-panel-*-linux.png` files
 * went on sitting in this directory photographing a screen Task 12 had
 * deleted, and nothing failed until somebody happened to look. An enumeration
 * where an inversion was needed, in the guard written to catch that class.
 *
 * FAIL-CLOSED IN BOTH DIRECTIONS, which is the shape `pathCitations.test.ts`
 * uses for the same job: a committed file matching no entry here fails, AND an
 * entry here matching no committed file fails. Without the second half this
 * list is where a deleted baseline's exemption goes to outlive it, which is
 * the same defect one level up.
 *
 * THE SIGN-IN FAMILY IS HERE BECAUSE IT IS `SCREENS.md` §3, NOT §2. Those
 * screens are specified, photographed and axe-checked; they are simply not
 * what "eleven screens plus the shell" counts. The two `admin-journeys-*`
 * entries are STATES of a screen that has its own triple.
 */
const NOT_A_SCREEN: readonly { readonly stem: string; readonly why: string }[] = [
  {
    stem: 'admin-journeys-create',
    why: 'a STATE of §2.2, not a screen: the create panel is a client island only on screen once New journey has been pressed, and `admin-journeys` holds §2.2 itself',
  },
  {
    stem: 'admin-journeys-rungs',
    why: 'a STATE of §2.2 at a width no project sits at — the case sets 1200 itself to reach the three column rungs between the projects, and runs at `desktop` alone because the other two would photograph that same width again',
  },
  {
    stem: 'admin-sign-in',
    why: 'SCREENS.md §3.1, the password step — specified under §3 and not among §2’s eleven',
  },
  { stem: 'admin-sign-in-code', why: 'SCREENS.md §3.2, the one-time-code step' },
  { stem: 'admin-signed-in', why: 'SCREENS.md §3.4, the signed-in pane' },
  { stem: 'admin-reset', why: 'SCREENS.md §3.3, the reset request' },
  { stem: 'admin-reset-sent', why: 'the same screen once the link is on its way' },
  { stem: 'admin-reset-expired', why: 'the screen a spent reset link lands on' },
]

/** The `admin-` stem of every committed baseline, with the project and platform dropped. */
const committedAdminStems = (committed: ReadonlySet<string>): readonly string[] =>
  [...committed].flatMap((file) => {
    const matched = /^(admin-.+)-(?:desktop|mid|mobile)-linux\.png$/u.exec(file)
    return matched === null ? [] : [matched[1] ?? '']
  })

describe('the admin screens’ visual baselines', () => {
  it('are asked for against SCREENS.md’s own §2 headings, so a twelfth screen cannot be missed', () => {
    // THE DIAGNOSTIC STANDING ORDERS §17 ASKS FOR, applied to this guard's own
    // bookkeeping: {@link SCREENS} is derived from nothing at run time, so the
    // only thing stopping it drifting from the specification is this case.
    const specified = specifiedScreens()
    expect(
      specified.length,
      'no §2.x headings were extracted from SCREENS.md, so this pairing checks nothing',
    ).toBeGreaterThanOrEqual(11)

    const claimed = SCREENS.flatMap((entry) => (entry.heading === null ? [] : [entry.heading]))

    expect(
      specified.filter((heading) => !claimed.includes(heading)),
      'SCREENS.md specifies these admin screens and this guard asks for no baseline for them',
    ).toEqual([])
    expect(
      claimed.filter((heading) => !specified.includes(heading)),
      'this guard names these headings and SCREENS.md prints no such section',
    ).toEqual([])
  })

  it('name the viewport projects playwright.config.ts actually declares, whatever they are called', () => {
    // A fourth project means a fourth baseline per screen, and a guard that
    // asked for three of four would report a complete set that is not.
    //
    // THE PATTERN IS AS WIDE AS THE SYNTAX, not as wide as today's file. An
    // indentation-anchored, lower-case-only pattern cannot see a project named
    // `mobile-dark` or `midWide`, or one declared at a different nesting, and
    // the equality below then passes on three of four. Any `name:` this config
    // grows that is NOT a project fails here too, which is the direction to be
    // wrong in: a loud failure over a config that changed shape, not a silent
    // pass. A double-quoted name would be invisible; Prettier's config makes
    // that unreachable, and `format:check` runs in the same gate as this file.
    const config = readFileSync(path.join(REPO_ROOT, 'playwright.config.ts'), 'utf8')
    const declared = [...config.matchAll(/\bname:\s*'([^']+)'/gu)].map((found) => found[1] ?? '')

    expect(
      declared.length,
      'fewer project names were read out of playwright.config.ts than this guard asks baselines for',
    ).toBeGreaterThanOrEqual(PROJECTS.length)
    expect([...declared].sort()).toEqual([...PROJECTS].sort())
  })

  it('cover every rail entry the domain declares, so a renamed entry cannot leave a screen unasked-for', () => {
    // The header says a screen that is also a rail entry is named after that
    // entry's `id`. The names are literals, so this case is what makes that
    // true rather than a hope: rename an entry in
    // `packages/domain/src/admin/navigation.ts` and this fails.
    //
    // ONE DIRECTION ONLY, deliberately. Three of the twelve screens are not
    // rail entries — the shell, the journey editor and Account, which
    // `navigation.ts`'s own header explains — so the reverse containment would
    // be false by design.
    const named = new Set(SCREENS.map((entry) => entry.screen))

    expect(ADMIN_NAV.length, 'ADMIN_NAV is empty, so this containment checks nothing').toBeGreaterThanOrEqual(1)
    expect(
      ADMIN_NAV.filter((entry) => !named.has(`admin-${entry.id}`)).map((entry) => entry.id),
      'these rail entries have no screen in this guard, so nothing asks for their baselines',
    ).toEqual([])
  })

  it('exist for every screen at every viewport, so a screen cannot ship unbaselined', () => {
    // EXACT FILENAMES, NOT A PREFIX. `admin-journeys-create-desktop-linux.png`
    // satisfies `startsWith('admin-journeys-')` and is a photograph of a panel,
    // not of the screen; `admin-journeys-rungs-desktop-linux.png` exists at one
    // project only and would have vouched for three.
    const committed = new Set(existsSync(SNAPSHOT_DIR) ? readdirSync(SNAPSHOT_DIR) : [])
    expect(committed.size, 'the snapshot directory is empty or missing, so nothing below is a check').toBeGreaterThan(0)

    const missing = SCREENS.flatMap((entry) => baselinesFor(entry.screen).filter((file) => !committed.has(file)))

    expect(
      missing,
      'these admin screens have no visual baseline at one or more viewports; produce them with npm run test:visual:container:update, never on a developer’s own platform',
    ).toEqual([])
  })

  it('are each produced by a case in e2e/visual.spec.ts, so a file cannot outlive the case that took it', () => {
    // STANDING ORDER §17's DIAGNOSTIC, RUN AGAINST THIS GUARD: delete every
    // `toHaveScreenshot` call and keep the files, and the case above stays
    // green over thirty-six images nothing regenerates. A committed `.png` is
    // bookkeeping; the call is the mechanism.
    //
    // A SHAPE THIS CANNOT ATTRIBUTE IS REFUSED RATHER THAN COUNTED. A call
    // inside a skipped or focused DECLARATION never runs, so counting it would
    // vouch for a screen nothing photographs — and working out which calls a
    // `describe.skip` covers is source analysis this file has no business
    // doing. It says so instead. `test.skip(condition, reason)`, whether at
    // file level or inside a body, is a different thing and is left alone: it
    // is how `admin-journeys-rungs` restricts itself to one project, and that
    // case still runs. The case below pins both rules against sources this
    // repository does not hold.
    expect(
      unattributableDeclarationsIn(visualSpecSource()),
      `${VISUAL_SPEC} declares a skipped or focused block, and this guard cannot tell which screens the calls inside it stand for`,
    ).toEqual([])

    const calls = screenshotCalls()
    expect(
      calls.length,
      'no toHaveScreenshot calls were read out of e2e/visual.spec.ts, so this check reads nothing',
    ).toBeGreaterThanOrEqual(1)

    const unphotographed = SCREENS.map((entry) => entry.screen).filter((screen) => !calls.includes(screen))

    expect(
      unphotographed,
      'these admin screens have no toHaveScreenshot case in e2e/visual.spec.ts, so nothing would ever regenerate their baselines',
    ).toEqual([])
  })

  it('belong to a screen, so a baseline cannot outlive the screen it photographed', () => {
    // THE INVERSE OF THE CASE ABOVE, and the one `docs/deviations.md` §86
    // needed: three `admin-panel-*-linux.png` files sat here photographing a
    // screen Task 12 had deleted, and a guard that only asks each screen for
    // its files never notices. See {@link NOT_A_SCREEN} for why the exemptions
    // are checked in both directions.
    const committed = new Set(existsSync(SNAPSHOT_DIR) ? readdirSync(SNAPSHOT_DIR) : [])
    const stems = committedAdminStems(committed)
    expect(
      stems.length,
      'no admin baselines were read out of the snapshot directory, so this checks nothing',
    ).toBeGreaterThanOrEqual(SCREENS.length)

    const named = new Set(SCREENS.map((entry) => entry.screen))
    const excused = new Set(NOT_A_SCREEN.map((entry) => entry.stem))

    expect(
      [...new Set(stems)].filter((stem) => !named.has(stem) && !excused.has(stem)).sort(),
      'these committed baselines photograph no screen this guard knows and no state NOT_A_SCREEN excuses; delete them, or say in NOT_A_SCREEN what they are',
    ).toEqual([])
    expect(
      NOT_A_SCREEN.filter((entry) => !stems.includes(entry.stem)).map((entry) => entry.stem),
      'these exemptions excuse a baseline that is no longer committed, so they have outlived the file they were written for',
    ).toEqual([])
  })

  it('each mask the one string in the frame that changes with the worker, so no baseline rests on the ratio', () => {
    // STANDING ORDER §17, TURNED ON THIS SEGMENT'S OWN NEW MECHANISM. Three
    // jsdom cases pin the three `data-*` hooks' EXISTENCE; without this one,
    // deleting `mask: [page.locator('[data-profile-name]')]` from any case
    // left every committed guard green — and restored the sub-threshold flake
    // the masks were added to remove, in a diff of a few glyphs that §110 has
    // just finished documenting as invisible.
    //
    // EVERY `admin-*` BASELINE IS ASKED, NOT ONLY THE TWELVE SCREENS —
    // CLAUDE.md §10's rule that a defect is fixed as a class. This case found
    // `admin-journeys` unmasked on the commit that added it, and that is a
    // screen in the set; `admin-journeys-create` and `admin-journeys-rungs`
    // carried the index for the same reason. The sign-in family draws no rail
    // at all, which this case does not have to know: those calls mask the
    // selector, the mask matches nothing, and the rule stays uniform.
    const source = visualSpecSource()
    const asked = [...SCREENS.map((entry) => entry.screen), ...NOT_A_SCREEN.map((entry) => entry.stem)]

    const unmasked = asked.filter(
      (baseline) => !(screenshotCallFor(source, baseline)?.includes(REQUIRED_MASK) ?? false),
    )

    expect(
      unmasked,
      `these baselines’ toHaveScreenshot calls do not mask [${REQUIRED_MASK}], so they carry the fixture account’s worker index and pass only while the diff stays under maxDiffPixelRatio`,
    ).toEqual([])
  })

  it('tells a live screenshot call from prose about one, and a runtime skip from a skipped case', () => {
    // THE RULE THAT DECIDES WHETHER A SCREEN COUNTS AS PHOTOGRAPHED, asked
    // about sources this repository does not hold. Without this the only proof
    // of it is a probe somebody ran once, and the piece of this guard nobody
    // can re-run is the piece 15b's completion signal rests on.
    const call = "await expect(page).toHaveScreenshot('admin-shell.png', { fullPage: true })"

    // A call is a call.
    expect(screenshotNamesIn(call)).toEqual(['admin-shell'])

    // Prose about a call is not a call, in either comment syntax.
    expect(screenshotNamesIn(`// ${call}`)).toEqual([])
    expect(screenshotNamesIn(`/* ${call} */`)).toEqual([])
    expect(screenshotNamesIn(`/**\n * ${call}\n */\n${call}`)).toEqual(['admin-shell'])

    // A DECLARATION THAT NEVER RUNS IS REFUSED, and so is one that stops every
    // other declaration running. `serial` and `parallel` are Playwright's own
    // modifiers and sit between `describe` and the annotation.
    expect(unattributableDeclarationsIn(`test.skip('a name', async () => {})`)).not.toEqual([])
    expect(unattributableDeclarationsIn(`test.fixme('a name', async () => {})`)).not.toEqual([])
    expect(unattributableDeclarationsIn(`test.only('a name', async () => {})`)).not.toEqual([])
    expect(unattributableDeclarationsIn(`test.describe.skip('a name', () => {})`)).not.toEqual([])
    expect(unattributableDeclarationsIn(`test.describe.serial.only('a name', () => {})`)).not.toEqual([])
    expect(unattributableDeclarationsIn(`test.describe.parallel.skip('a name', () => {})`)).not.toEqual([])

    // A RUNTIME GUARD IS NOT A SKIPPED CASE, and this is the direction that
    // costs something to get wrong: `e2e/visual.spec.ts` carries three of them,
    // and the one at `admin-journeys-rungs` photographs the only screen in this
    // guard's set that has all three of its files. A refusal that swallowed it
    // would take that screen out of the set.
    expect(unattributableDeclarationsIn(`test.skip(process.platform !== 'linux', 'a reason')`)).toEqual([])
    expect(unattributableDeclarationsIn(`test.skip(testInfo.project.name !== 'desktop', 'a reason')`)).toEqual([])
    expect(unattributableDeclarationsIn(`test.describe.serial('a name', () => {})`)).toEqual([])

    // And the real file, which is what the two assertions above are about:
    // its runtime skips are not declarations, and the rungs case is still seen.
    expect(screenshotCalls()).toContain('admin-journeys-rungs')
  })
})
