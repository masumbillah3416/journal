# 1 · Unit — the detail

The detail for `docs/testing.md` §1. That document states the suite's tool, its scope
and how to run it, and points here; everything else about the suite is below. The section
numbers are `docs/testing.md`'s and do not change.

- **Tool:** Vitest.
- **Scope:** pure functions, state machines, mappers, validators. No I/O.
- **Status:** implemented, as TWO Vitest projects (`vitest.config.ts`):
  - `unit` — every glob it declares, in the order the config declares them:
    `packages/*/src/**/*.test.ts`, `apps/web/lib/**/*.test.ts`,
    `apps/web/scripts/**/*.test.ts`, `apps/web/collections/**/*.test.ts`,
    `eslint-rules/**/*.test.js`, `scripts/**/*.test.js`, `apps/web/*.test.ts` and
    `e2e/**/*.test.ts`, all of them excluding `*.integration.test.ts`. Node environment; these files are pure. **This
    list is the whole of it and is meant to be diffable against the config** — CLAUDE.md
    §2.1 names the config comment and this document as the two homes an include fact has
    to live in, and an enumeration here that is missing a glob is how a reader audits
    "no file is in neither config's include" against a set smaller than the real one
    (final review 9, F9-8). Each glob beyond the `packages`, `lib` and
    `scripts` ones exists for a reason those do not cover, and carries that reason at the
    glob in `vitest.config.ts`:
    - `apps/web/collections/**/*.test.ts` — the collection tests that need **no** Docker.
      A collection config is a plain object, so a check over the numbers another module
      is written against (`users.lockout.test.ts`, the lockout window against
      `rateWindow.ts`'s) belongs in the pre-commit gate. `*.integration.test.ts` under the
      same directory stays with the integration project; the two patterns are disjoint.
    - `eslint-rules/**/*.test.js` — the rule that makes an unguarded Server Action a lint
      error, and its `RuleTester` cases. Plain JavaScript because ESLint loads a config
      and its plugins through Node rather than a bundler (§1a).
    - `scripts/**/*.test.js` — the repository's own build and CI scripts.
      `lighthouseAnnotations.mjs` decides what CI is told when a performance gate goes
      red, and `run-lighthouse.mjs` cannot be run by any Vitest project (it spawns
      `npx lhci`), so the deciding half was extracted into a module this glob collects the
      test for. Plain JavaScript, matching the script it serves. **This entry was missing
      from the enumeration until the Phase 3 standards task**: the glob was named
      elsewhere in the single `docs/testing.md`, so the guard that checks this list was
      satisfied by a mention in another suite's section rather than by the list itself.
      Splitting the document is what separated the two.
    - `apps/web/*.test.ts` — `middleware.test.ts`. Next.js requires the middleware at the
      app's own root, which no `lib/**` or `app/**` glob reaches.
    - `e2e/**/*.test.ts` — the file reads that live beside what they guard rather than in
      the browser job: `ciRegistration.test.ts`, the guard that says every browser spec is
      named by CI and by an npm script (ruling F57, and the browser-suite section below).
      Only `*.test.ts`; `playwright.config.ts` owns `e2e/*.spec.ts`.
  - `unit-dom` — `packages/*/src/**/*.test.tsx` and `apps/web/**/*.test.tsx`, in a
    **jsdom** environment, with esbuild's automatic JSX runtime so a component test
    needs no `import React`. A separate project rather than a wider glob on `unit`
    because the environment differs, and paying jsdom's setup cost for every pure test
    to accommodate a handful of component tests is the wrong trade. Two further settings
    arrived with Phase 1 Task 7's first real components: `setupFiles:
['./vitest.dom-setup.ts']`, which sets `IS_REACT_ACT_ENVIRONMENT` once for every file
    instead of four repeated lines at the top of each (React reads the flag off the
    global object, so it cannot be set by importing anything), and
    `css.modules.classNameStrategy: 'non-scoped'`, which makes a CSS Module import
    resolve each key to its own literal name rather than `undefined`. Nothing in a jsdom
    test asserts a computed style — jsdom performs no layout, which is exactly why the
    rules that matter (a back face's `pointer-events: none` above all) are asserted in a
    real browser instead — so the strategy is purely about components rendering readable
    class names under test.

  `unit-dom` exists _before_ Phase 1's first component, on purpose. Until it did, no
  project's `include` matched `*.test.tsx` and neither set a DOM environment — so the
  first React component test would have been collected by nobody, and **a test collected
  by nobody does not fail; it silently is not there and the run stays green**. That is
  the worst member of the family this phase has already met twice (a migration that
  looked real because dev-mode schema push had already built the schema; a concurrency
  test that kept passing with its guarding clause deleted), because there is no red to
  notice.

  Phase 2 Task 7 puts the first ADMIN components in `unit-dom`:
  `apps/web/components/admin/SignInShell.test.tsx` and `PasswordStep.test.tsx`. The
  second is where `SECURITY.md`'s second prototype hole is first held down — it plants
  `om-diary-otp` in `localStorage` with the opposite answer to the server's and requires
  the footer line not to move, and it spies on `Storage.prototype.getItem` to require
  that nothing was read at all. Neither assertion stands alone: both are paired with one
  that the footer line exists and says what `SCREENS.md` §3.1 says it should, because "no
  storage was read" is trivially true of a component that rendered nothing. What jsdom
  cannot reach — whether the DELIVERED page and its scripts read storage — is
  `e2e/signIn.spec.ts`'s.

  Task 9 adds the last three admin panes — `ResetStep.test.tsx`,
  `NewPasswordStep.test.tsx` and `SignedInStep.test.tsx`. Two things about them
  are worth knowing. First, **every case that says a pane does NOT print something is
  paired with one that says the pane printed anything at all**: "the confirmation carries
  no address of its own" and "the expired state never prints the token" are both trivially
  true of a pane that rendered nothing, which is this phase's most common defective shape.
  Second, **the geometry is deliberately not here**: `SCREENS.md` §3.4's 62px ringed
  circle, its 20px square and §3.3's 14px confirmation mark are numbers jsdom cannot read,
  because it performs no layout and loads no stylesheet, so all three are measured in a
  real engine by `e2e/reset.spec.ts` rather than left to a screenshot that would absorb
  them (see the Visual regression section on what the threshold does not catch).

  Task 8 adds `apps/web/components/admin/CodeStep.test.tsx`, the largest component suite
  here, and it is worth knowing what it deliberately does NOT prove. Its
  header names three things and hands each to `e2e/codeStep.spec.ts`: the cell widths
  (jsdom performs no layout), the paste path (jsdom performs no default paste, so
  `preventDefault` has nothing to prevent and the case cannot distinguish a working
  handler from a missing one on the browser's own terms), and the shake's
  `prefers-reduced-motion` honesty (a media query is a property of the stylesheet). Two
  of its cases were strengthened after a mutation showed them passing with the mechanism
  removed: the Backspace case moved from cell 0 to cell 2, because at the first cell
  "stays here" and "retreats" are the same outcome, and the countdown's non-finite guard
  is now tested with `NaN` rather than `Infinity`, because an infinite instant already
  falls out of the subtraction as "the window closed long ago" and passed with the guard
  deleted.

  Its numbers all come from `@travel-diary/domain/auth/otpChallenge` rather than from
  copies, and that is proven rather than asserted: raising `MAX_ATTEMPTS` to 5 in the
  domain fails 5 of its cases, doubling `EXPIRY_MS` fails 3, and halving
  `RESEND_COOLDOWN_MS` fails 1. The one number that cannot follow its constant is the
  word "Three" in "Three wrong codes…", so a case of its own pins `MAX_ATTEMPTS` to `3`
  as a literal — the copy names the number in words, and no expression turns the constant
  into that word.

  `apps/web/lib/react-harness.test.tsx` is the guard: it mounts a real React component
  into a real `document` with `react-dom/client` and reads the text back out, which is
  impossible to pass unless the file is being collected AND the environment is a DOM. It
  is named here so that its disappearance from a run summary is noticeable. It is not a
  placeholder and does not get deleted when real component tests arrive — it is the only
  thing in the repository that asserts the harness exists independently of any component.

  Two of Phase 1 Task 9's unit files carry a note of their own.
  `packages/domain/src/coverTitle.test.ts` asserts the clamp bounds as **literals**
  (`38`, `124`), never as `COVER_TITLE_SIZE.min`/`.max`: an assertion that reads the
  constant it is guarding moves with that constant and can never fail. That was caught
  by mutation, not by review — retuning the floor to 37 left the whole file green until
  the literals went in (`CLAUDE.md` §2.3, "a test that has never failed is unproven").
  `packages/domain/src/contentsLayout.test.ts`'s thirty-one-entry case pins **3 columns
  × 11 rows**, which is what SCREENS.md §1.2's formula produces and _not_ the "4 columns
  × 8 rows" the same section calls verified; the two cannot both be true for any entry
  count, and `docs/deviations.md` §9 carries the arithmetic. The multi-column path is
  therefore covered as arithmetic but never rendered in a browser — the seeded book has
  ten contents entries — so a task that seeds more than eleven journeys owes the
  Contents body a real overflow assertion.

- **Run:** `npm run test:unit` (both projects, with coverage), or `npm run test` for
  watch mode across every project.
- **Add one:** colocate `<name>.test.ts` next to `<name>.ts` — or `<name>.test.tsx` for
  anything that renders, which the `unit-dom` project picks up automatically. Follow the
  TDD cycle
  (`CLAUDE.md` §2.2): write the failing test, confirm it fails for the expected reason,
  write the minimum code to pass, refactor with the suite green. Time is always
  injected — never `Date.now()` inside logic under test (this is how `flipMachine`'s
  latch behaviour and `otpChallenges`' expiry are tested with no clock mocking library).

#### 1a · The ESLint rule, and the two questions about it that are not about a syntax tree

`vitest.config.ts` puts `eslint-rules/**/*.test.js` in the `unit` project and gates
`eslint-rules/**/*.js` at **100% lines, branches and functions**, and both of those lines
say "See docs/testing.md". This is that section — it did not exist for a round, which is
CLAUDE.md §1.2's own failure mode: a new test type, in a new language, in the gate Husky
runs, behind a cross-reference pointing at silence.

**What the suite is.** `eslint-rules/guarded-server-actions.js` is a custom ESLint rule: a
`'use server'` module may export nothing but calls to `guardedAction(...)`
(`apps/web/lib/auth/guard.ts`) — imported under that name, from that file, both halves
checked — may hold nothing at its top level but imports and declarations, and a
`'use server'` directive inside a function body is refused outright. Its one exception is an export the parser marks
`exportKind: 'type'`, which emits no runtime binding; every other export spelling, including
one the rule does not recognise, is reported. It exists because the same guarantee was written as a text scan **nine
times and defeated nine times** — "every export of every module" is not a sentence text
matching can express, so the check is written where the exports are already parsed.
`docs/adr/0018` is the decision; `apps/web/lib/auth/guard.ts` is the factory.

**Why it is plain JavaScript.** ESLint loads a config and its plugins through Node rather
than through a bundler, so a `.ts` rule would need a loader inside the pre-commit hook.
The consequence is stated rather than hidden: nothing typechecks `eslint-rules/`, the same
treatment `scripts/run-lighthouse.mjs` already has, which is why the rule takes no options
and holds no state — everything it could get wrong is a shape, and every shape is a case.

**How to run it.**

```
npx vitest run --project unit eslint-rules                      # the rule alone
npx vitest run --project unit eslint-rules --coverage           # with its 100% gate
npm run verify                                                  # what Husky runs
```

**How to add a case.** `eslint-rules/guarded-server-actions.test.js` uses ESLint's own
`RuleTester` with `typescript-eslint`'s parser. An `invalid` case is a `code` string, the
`messageId` it must report, and a `name` recording WHICH ROUND FOUND THE SHAPE — the list
is the valuable artefact, because every entry is something somebody actually reached for.
Every case is passed through `at()`, which gives it a real `filename` under
`apps/web/app/(admin)/admin/journeys/`: the rule resolves an import specifier against the
importing file and compares the result with `apps/web/lib/auth/guard.ts` itself, so a
fixture with no plausible filename would resolve nothing and every case would report
`notTheFactory`. The cases are valid ones — the control: every export
spelling, all guarded, plus the shapes the prologue walk has to answer "no" to — and
invalid ones, one per shape that has ever defeated a version of this check. **Neither count
is printed here, and that is round 8's correction to this paragraph.** It printed "40 cases
— 8 valid and 32 invalid", asserted nowhere, and the arrays grew past it in the very round
that added the assertion on the other side: what the test's own case "is a list whose
length is asserted rather than counted by hand" pins is the ARRAY LENGTHS, so the one place
a number lives is the place that fails when the list changes. A figure copied into prose
beside it is a second place, and this phase's record on second places is five for five
against. The test file's header carried the same defect from the other direction — it said
"the twelve mutations" through the rounds in which the list grew to 23 and then to 29.

**And the questions this suite CANNOT answer**, which is why
`apps/web/lib/auth/adminGuardRegistration.test.ts` keeps a block of its own about the rule
— which the table below sets out, question by question, and no count is written here.
A `RuleTester` case proves what the rule decides about a syntax tree it is handed. It
cannot say whether the rule is switched on, whether somebody has switched it off for a
file, or **which files ESLint hands it at all** — and that last one is where round 5's
version was defeated. A flat config lints the extensions some block's `files` array names;
nothing named `.jsx`, so an unguarded `'use server'` module written as `actions.jsx` passed
`eslint .` at exit 0, passed `tsc`, passed `prettier --check`, and was mounted by a running
dev server as a real action endpoint.

So the coverage check is INVERTED, and this is the arrangement to keep:

| Question                                              | Where it is answered             | With what                                                                                                                                                                                                                           |
| ----------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is this export guarded?                               | `guarded-server-actions.test.js` | `RuleTester`, over the AST                                                                                                                                                                                                          |
| Is the rule registered at `error`?                    | `adminGuardRegistration.test.ts` | a read of `eslint.config.js`                                                                                                                                                                                                        |
| Does ESLint visit every file carrying `'use server'`? | `adminGuardRegistration.test.ts` | git's listing of the repository + `ESLint#calculateConfigForFile`, asked in a child process                                                                                                                                         |
| Has anybody disabled the rule for a file?             | `adminGuardRegistration.test.ts` | the same git listing, keyed on the PRESENCE of a disable directive in any module carrying the directive, against an allowlist of exact paths                                                                                        |
| Could an inline severity comment switch it off?       | `adminGuardRegistration.test.ts` | the same git listing: the files permitted to spell the rule's own id, by exact path                                                                                                                                                 |
| Did a directive actually suppress a report of it?     | `adminGuardRegistration.test.ts` | `ESLint#lintFiles` over every file carrying a directive, reading `suppressedMessages`                                                                                                                                               |
| Could a `processor` strip the directive first?        | `adminGuardRegistration.test.ts` | `ESLint#calculateConfigForFile`, reading the resolved `processor` for every directive-carrying module and every hypothetical action path                                                                                            |
| Is each enumerated survivor still a survivor?         | `adminGuardRegistration.test.ts` | `ESLint#lintText` over the module each `SHAPES_THAT_GET_THROUGH` row carries, with an unguarded module as the negative control                                                                                                      |
| Is every command in the gate chain the pinned one?    | `adminGuardRegistration.test.ts` | a read of four files: `lint`, `verify` and `verify:full` compared whole, token for token, plus an uncommented `run:` step in `ci.yml` and a line in `.husky/pre-commit` that are exactly `npm run verify:full` and `npm run verify` |

**The last row is the one four rounds of keys did not cover, and it is a different kind of
question.** Every other row asks ESLint about its CONFIGURATION, through a `new ESLint({ cwd })`
that is handed no argv and cannot see one — so `--ignore-pattern apps/web/lib/journeys/**`
appended to the `lint` script left `npm run lint` and `npm run verify` at exit 0, at 1350
passing, with an unguarded mountable `'use server'` module on disk at that path, while bare
`npx eslint .` exited 1 throughout. The rule was right and nobody ran it over the file. The
argv is compared WHOLE rather than screened for flags known to narrow it, because a list of
dangerous flags is the enumeration this file has watched fail five times.

**Every link of the chain is compared whole for the same reason, which round 10 got wrong one
level up.** It pinned the `lint` argv whole and then asserted the three links above it with
`toContain`, and a substring accepts a superstring: the eighth whole-branch review defeated it
with `npm run lint -- --ignore-pattern apps/web/lib/journeys/**` in `verify` (npm appends
everything after `--` to the script it runs, so the `lint` script stayed byte-identical to the
pinned argv), with `npm run lint:changed` (matched by prefix), and with
`# - run: npm run verify:full` (a commented-out CI step still matched
`toContain('run: npm run verify:full')`) — 24 green in all three, and `npm run verify` at exit 0
in the first two with an unguarded module live. `verify` and `verify:full` are now compared
token for token like `lint`, comment lines are dropped from `ci.yml` and `.husky/pre-commit`
before anything is read off them, and `npm run lint || true` and `run: npm run verify:full || true`
— two shapes of the implementer's own — fail alongside the review's three.

**What that row does NOT answer, since the sentence that used to sit here said it answered more
than it did.** These are reads of four files: they say what the gates are DEFINED as, and they
run nothing. Nothing here makes anyone run the hook (`--no-verify`, an unstaged `.husky/`, or
`core.hooksPath` pointed elsewhere are all invisible to it); `continue-on-error: true` on CI's
gate step, or a job-level `if:` that never fires, leaves the step's text exactly as pinned; a
`.npmrc`, an `npm_config_*` variable or a different `eslint` on `PATH` changes what a pinned
command does without changing the command; and `apps/web`'s own workspace scripts are unread
because no gate runs them. Whether the command reports an unguarded module is the AST's
question, answered by `guarded-server-actions.test.js`.

Text is used for what text is good at — finding candidates anywhere, at extensions nobody
enumerated — and the AST decides correctness. The listing is
`git ls-files --cached --others --exclude-standard`, so a file written and never staged is
still seen, and no skip list of `node_modules`/`.next`/`coverage` has to be maintained.
An entry in that listing that is not a regular FILE throws by name — a nested git
repository or a submodule is reported by git as one directory entry, and the files inside
it appear in no listing at all. It is not filtered away, because dropping it silently
would be exactly the quiet hole this suite exists to close; before the seventh
whole-branch review it was read like a file and killed five cases with
`EISDIR: illegal operation on a directory, read`, which is fail-closed but tells a
developer who has legitimately vendored a checkout nothing about what to do.

**The last two rows are round 9's, and each closes something the sixth whole-branch review
measured.** A flat-config `processor` whose `preprocess` drops the directive line hands
every rule a module with no `'use server'` prologue, so the rule reports nothing and all
three disable keys go blind at once — no directive in the bytes, no rule id anywhere, no
suppressed message, because nothing fired. Re-measured on round 9's own tree before the key
existed: `eslint .` exit 0 and the suite at 24 passing, with an unguarded mountable module
at `apps/web/lib/journeys/actions.ts`. It is policed rather than disclosed because
`calculateConfigForFile` reports a resolved `processor` exactly as it reports a resolved
severity, so the answer costs ten lines. And `SHAPES_THAT_GET_THROUGH`'s CONTENTS were
unpinned: the reviewer deleted the committable row and the suite stayed green at 21 passing,
and wrote a live survivor with no row at all and it stayed green at 24. Each row now carries
either the module text this suite lints — requiring the rule to report nothing, so a row
that a later round CLOSES fails on that commit — or an explicit statement of why nothing
here can run it, and its length is asserted so a deletion is a two-line diff rather than a
one-line one. **A missing row still proves nothing, and no test can change that**:
enumerating what gets through means knowing what gets through. The array says so at itself.

**The severity probe runs in a child process, and the reason is a measured coverage
interaction rather than a preference.** ESLint loads `eslint.config.js` — and through it
the rule — with Node's own loader. Calling the ESLint API from inside a Vitest worker
therefore puts a SECOND, uninstrumented copy of the rule in the same process; both report
against the same source path, the uninstrumented one's zero counts win, and
`@vitest/coverage-v8` then reports the rule at **89.84% lines / 63.15% functions** with
every function marked unexecuted, against the 100% gate above — while the `RuleTester`
suite alone measures it at 100/100/100. Reproduced by running the two test files together
and then separately. A child process keeps the two loads in two processes, and asks the
question the way `npm run lint` asks it.

**What still gets through, so nobody has to rediscover it.** Thirty-three shapes have been
written to disk and run against the real gate. **Thirty-two fail `npm run verify`** — and
two of those fail it without failing `npm run lint`, which is the whole point of having the
coverage case beside the rule: a disable comment in a directory nobody listed, and a module
at an extension ESLint still does not enumerate (`.mdx` was tried), are caught by the test
rather than by the rule.

**The fourth whole-branch review then ran fourteen shapes of its own and three got
through**, so the sentence that used to end this paragraph — "the one shape that gets
through" — was wrong for a round: `export = x`, a different export of the real `guard.ts`
aliased to `guardedAction`, and a committed codegen script assembling the directive at
runtime. Round 7 closed the first two in the rule, and ran eleven shapes of its own — six
new — closing a fourth, `module.exports = { … }` in a `'use server'` module. **The fifth
review ran sixteen, eleven of them its own, and defeated the guard four more ways:** a bare
disable directive and one with the rule's id on the next line, both of which the allowlist
case could not see because it required a single LINE to carry both strings and both of
which COMMITTED; and four wrappers around `module.exports` that rule 4 walked past because
it refused one parser node shape. Round 8 closed all four — two by inverting rule 4 into an
allowlist of inert top-level statement KINDS, two by rebuilding the disable check on three
keys (presence in any spelling, the rule's id enumerated repository-wide, and ESLint's own
`suppressedMessages`) — and closed a fifth found while attacking that fix, an inline
`eslint <rule>: off` severity comment.

**The sixth review ran eight, all its own, and five got through — and round 8's allowlist was
one of the things it walked past.** A statement KIND is not inert: a `VariableDeclaration`
runs its initialiser at module load, so `const attached = Object.assign(module.exports, { … })`
was admitted where the identical call as a bare statement was refused, and that reached a
real commit. Round 9 asks what a statement EVALUATES instead — a declarator's initialiser
must be a literal, a function expression or a `guardedAction(...)` call — which closes that
shape, the same attachment through a function called at load, a static field initialiser, a
destructured initialiser, a computed enum member and a tagged template, none of them listed.
It also wrote the test that executes `guardedAction` (above), and the key over `processor`
blocks (below).

**What still gets through is enumerated where it can be asserted, and this document no
longer counts it.** The shapes that get through are enumerated, with the measurement and
the committability of each, by `SHAPES_THAT_GET_THROUGH` in
`apps/web/lib/auth/adminGuardRegistration.test.ts` — and a case there fails if this
document stops pointing at that array or starts restating it. No count is written here: a
number retyped in prose has drifted from this code in every round of this phase, and seven
sites said two while the fifth review measured four (ruling F76). The case reads EVERY file git lists, not a
named handful, and it flattens comment and quote continuations before matching, because
the seventh whole-branch review defeated the earlier version by splitting the sentence
across two lines of a block comment in `guard.ts` and left the suite green. It also strips
`*`, `_` and backticks first, because the eighth review then defeated it with the same
sentence set in bold — 24 green, in the house style of this very document. **What it
refuses is that one sentence in any file the repository holds, flattened across a line
break and stripped of those three markers. What it does not refuse is a paraphrase, an
HTML wrapping (`<b>…</b>`, `&nbsp;`) or a Markdown link** — the case asserts each of those
non-refusals in its own sentinels rather than describing them.

The costs of identifying the factory by name-and-path are worth knowing, and each fails
closed: a legitimate barrel re-exporting `guardedAction` is refused;
`import { guardedAction as somethingElse }` is refused; a local alias
(`const build = guardedAction`) is refused; and so is **a non-relative specifier that
resolves to the real `guard.ts`** — the `@/…` alias `create-next-app` scaffolds, or a
package name — because the rule answers `undefined` for any specifier not starting with `.`
rather than trusting a resolver it does not have. That last one is the false positive Phase
4 is most likely to meet, and it was stated in the rule's TSDoc and in a `RuleTester` case
while three documents counted the costs as three.
