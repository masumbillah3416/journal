/**
 * guarded-server-actions.test.js — every shape that has ever defeated this
 * check, run against the rule that replaced them.
 *
 * ═══ WHY THE CASES ARE THE DEFEATS ═══
 *
 * Nine versions of this guarantee were written as text scans and nine were
 * defeated. The valuable artefact from that is not the rule — it is the LIST,
 * because each entry is a shape somebody actually reached for. So the invalid
 * cases below are not invented: each one is a mutation that was written to disk
 * and run against `npm run lint`, in the order they were found, with the round
 * that found each named beside it.
 *
 * THE NUMBER OF THEM IS ASSERTED RATHER THAN REMEMBERED, and that is round 7's
 * correction to this header. It said "the twelve mutations" through the rounds
 * in which the list grew to twenty-three and then to twenty-nine, and so did
 * `apps/web/lib/auth/adminGuardRegistration.test.ts` — a wrong number about the
 * guard, in the guard's own files, which is this branch's recurring defect in
 * miniature. The case named "is the list docs/testing.md counts" reads both
 * array lengths off the arrays, so the figures in `docs/testing.md` fail on the
 * commit that changes the list instead of rotting until somebody counts.
 *
 * THE VALID CASES MATTER AS MUCH AS THE INVALID ONES. A rule nobody can satisfy
 * is a rule Phase 4 turns off, so the shape this repository wants — every export
 * spelling, all guarded — is asserted green here rather than assumed.
 *
 * IT IS PLAIN JAVASCRIPT, and so is the rule, because ESLint loads its config
 * and its plugins through Node rather than through a bundler: a `.ts` rule
 * would need a loader in the pre-commit hook. The consequence is stated rather
 * than hidden — nothing typechecks this directory, the same treatment
 * `scripts/run-lighthouse.mjs` already has — and it is why the rule takes no
 * options and holds no state: everything it could get wrong is a shape, and
 * every shape is below.
 *
 * Depends on: eslint (RuleTester), typescript-eslint (the parser), vitest.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'
import { guardedServerActions } from './guarded-server-actions.js'

/** `eslint-rules/` -> the repository root. */
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Where every fixture below pretends to live.
 *
 * A REAL ADDRESS ON DISK, AND THAT IS NEW IN ROUND 6. The rule no longer
 * pattern-matches the import specifier; it resolves it against the importing
 * file and compares the result with `apps/web/lib/auth/guard.ts` itself. So a
 * fixture needs a plausible `filename` for its relative specifier to resolve
 * from, and the specifiers below are the real ones a Phase 4 action would
 * carry — four levels up out of `journeys/`, `admin/`, `(admin)/` and `app/`,
 * which is what `app/(admin)/admin/sign-out/route.ts` already writes.
 *
 * The directory itself does not exist, and does not need to: the file being
 * resolved is `guard.ts`, not this one.
 */
const ACTION_FILE = path.join(repositoryRoot, 'apps/web/app/(admin)/admin/journeys/actions.ts')

/** The import line a guarded module carries, resolving to the real factory. */
const IMPORT = "import { guardedAction } from '../../../../lib/auth/guard'"

/** A line break, written once so no fixture has to carry an escape. */
const NEWLINE = String.fromCharCode(10)

/** An action body, so no case is testing an empty function. */
const BODY = 'async (session) => Promise.resolve(session)'

/**
 * Puts a case at {@link ACTION_FILE}, so every one of them resolves the same way.
 *
 * @param {object} testCase - A RuleTester valid or invalid case.
 * @returns {object} The same case, given a filename.
 */
const at = (testCase) => ({ ...testCase, filename: ACTION_FILE })

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 2022, sourceType: 'module' },
})

/** Every export shape this repository wants to be able to write. */
const VALID_CASES = [
  // THE CONTROL. Named exports, a re-exported local, a default export and
  // a type export, in one module — the shape Phase 4 will actually write.
  {
    code: [
      "'use server'",
      IMPORT,
      `export const publish = guardedAction(${BODY})`,
      `const unpublish = guardedAction(${BODY})`,
      'export { unpublish }',
      `export default guardedAction(${BODY})`,
      'export type Outcome = string',
    ].join('\n'),
  },
  // A module with no directive is not an action module, and its exports
  // are nobody's business here.
  { code: 'export const publish = async () => Promise.resolve()' },
  // A function that is not an action may hold any other directive.
  { code: "const f = () => { 'use strict'; return 1 }\nexport { f }" },
  // A body that is NOTHING BUT directives, none of them the one. The
  // prologue walk has to run off the end of the list and answer no,
  // rather than reading past it or falling through.
  { code: "'use strict'" },
  { code: ["const f = () => { 'use strict' }", 'export { f }'].join(NEWLINE) },
  // A prologue that ends without the directive: the walk has to stop at
  // the first non-directive statement rather than scanning the file.
  { code: "'use strict'\nexport const publish = async () => Promise.resolve()" },
  // The specifier has no extension and the factory is a `.ts` file, so
  // the resolution has to try the bare path and then append — the shape
  // `moduleResolution: "Bundler"` gives every import in this repository.
  {
    code: ["'use server'", IMPORT, `export const publish = guardedAction(${BODY})`].join(NEWLINE),
  },
  // A top-level assignment is refused only inside an action module. A module
  // with no directive mounts nothing, so its assignments are nobody's business
  // here — which is what keeps round 7's rule 4 from being a repository-wide
  // ban on CommonJS.
  { code: 'module.exports = { publish: async () => Promise.resolve() }' },
  // Nor is an unrecognised top-level statement anybody's business in a module
  // with no directive: round 8's inversion is scoped to action modules for the
  // same reason round 7's assignment refusal was.
  { code: "if (typeof module !== 'undefined') { module.exports = {} }" },
  // AN ASSIGNMENT INSIDE AN ACTION'S BODY IS ORDINARY CODE. What is refused is
  // an assignment evaluated at MODULE LOAD, which is what can attach an
  // endpoint; one inside a function runs when the action runs, and refusing it
  // would make the rule one Phase 4 turns off.
  {
    code: [
      "'use server'",
      IMPORT,
      'export const publish = guardedAction(async (session) => {',
      '  let attempts = 0',
      '  attempts = attempts + 1',
      '  return Promise.resolve([session, attempts])',
      '})',
    ].join(NEWLINE),
  },
]

/** Every shape that has defeated a version of this check, or must not satisfy one. */
const INVALID_CASES = [
  {
    name: 'round 5 · a bare arrow export',
    code: ["'use server'", 'export const publish = async () => Promise.resolve()'].join('\n'),
    errors: [{ messageId: 'unguarded' }],
  },
  {
    name: 'round 5 · export default async function',
    code: ["'use server'", 'export default async function publish() { return Promise.resolve() }'].join('\n'),
    errors: [{ messageId: 'unguarded' }],
  },
  {
    name: 'round 5 · export { name }',
    code: ["'use server'", 'const publish = async () => Promise.resolve()', 'export { publish }'].join('\n'),
    errors: [{ messageId: 'unguarded' }],
  },
  {
    name: 'round 5 · export default name',
    code: ["'use server'", 'const publish = async () => Promise.resolve()', 'export default publish'].join('\n'),
    errors: [{ messageId: 'unguarded' }],
  },
  {
    name: 'round 5 · an indented export, which defeated a ^export regex',
    code: ["'use server'", '  export const publish = async () => Promise.resolve()'].join('\n'),
    errors: [{ messageId: 'unguarded' }],
  },
  {
    name: 'round 5 · export * from, which no scan can follow',
    code: ["'use server'", "export * from './elsewhere'"].join('\n'),
    errors: [{ messageId: 'unverifiable' }],
  },
  {
    name: 'a re-export by name from another module',
    code: ["'use server'", "export { publish } from './elsewhere'"].join('\n'),
    errors: [{ messageId: 'unverifiable' }],
  },
  {
    name: 'a local binding named guardedAction, which guards nothing',
    code: [
      "'use server'",
      'const guardedAction = (action) => action',
      `export const publish = guardedAction(${BODY})`,
    ].join('\n'),
    errors: [{ messageId: 'notTheFactory' }],
  },
  {
    name: 'the factory imported from somewhere that is not the guard',
    code: [
      "'use server'",
      "import { guardedAction } from './my-own-guard'",
      `export const publish = guardedAction(${BODY})`,
    ].join('\n'),
    errors: [{ messageId: 'notTheFactory' }],
  },
  {
    name: 'the directive pushed out of first position by another directive',
    code: ["'use strict'", "'use server'", 'export const publish = async () => Promise.resolve()'].join('\n'),
    errors: [{ messageId: 'unguarded' }],
  },
  {
    name: 'a parenthesised arrow, which is not a call at all',
    code: ["'use server'", 'export const publish = (async () => Promise.resolve())'].join('\n'),
    errors: [{ messageId: 'unguarded' }],
  },
  {
    name: 'an exported class carrying the action as a field',
    code: ["'use server'", 'export class Journeys { publish = async () => Promise.resolve() }'].join('\n'),
    errors: [{ messageId: 'unguarded' }],
  },
  {
    name: 'round 4 · an inline directive inside a guarded page component',
    code: [
      'const publish = async () => {',
      "  'use server'",
      '  return Promise.resolve()',
      '}',
      'export const Page = async () => { await requireAdminSession(); return publish }',
    ].join('\n'),
    errors: [{ messageId: 'inlineDirective' }],
  },
  {
    name: 'a destructured export, whose name the report has to fall back on',
    code: ["'use server'", 'export const { publish } = actions'].join('\n'),
    errors: [{ messageId: 'unguarded' }],
  },
  {
    name: 'an anonymous default function',
    code: ["'use server'", 'export default async function () { return Promise.resolve() }'].join('\n'),
    errors: [{ messageId: 'unguarded' }],
  },
  {
    name: 'a factory call whose name resolves to nothing at all',
    code: ["'use server'", `export const publish = guardedAction(${BODY})`].join(NEWLINE),
    errors: [{ messageId: 'notTheFactory' }],
  },
  {
    name: 'an export of a name this module never declares',
    code: ["'use server'", 'export { publish }'].join('\n'),
    errors: [{ messageId: 'unguarded' }],
  },
  {
    name: 'a call to something other than the factory',
    code: ["'use server'", IMPORT, `export const publish = wrap(${BODY})`].join('\n'),
    errors: [{ messageId: 'unguarded' }],
  },
  {
    // ROUND 6, DEFEAT 2. `apps/web/lib/auth/guardedAction.ts` is a path
    // no file in this repository has ever occupied, and the pattern that
    // used to decide this — `/(^|\/)auth\/guard(edAction)?$/` — accepted
    // it, so the optional group could only ever admit a forgery. A decoy
    // exporting a no-op of that name left `eslint .` at exit 0.
    name: 'round 6 · a decoy factory at lib/auth/guardedAction',
    code: [
      "'use server'",
      "import { guardedAction } from '../../../../lib/auth/guardedAction'",
      `export const publish = guardedAction(${BODY})`,
    ].join(NEWLINE),
    errors: [{ messageId: 'notTheFactory' }],
  },
  {
    // ROUND 6, DEFEAT 3. The pattern was a SUFFIX match, so any directory
    // named `auth` holding a `guard` satisfied it — including one written
    // beside the action, four levels away from the real factory.
    name: 'round 6 · a decoy auth/guard written beside the action',
    code: [
      "'use server'",
      "import { guardedAction } from './auth/guard'",
      `export const publish = guardedAction(${BODY})`,
    ].join(NEWLINE),
    errors: [{ messageId: 'notTheFactory' }],
  },
  {
    // THE CASE THAT PROVES THE COMPARISON IS AGAINST ONE FILE rather than
    // against "a specifier that resolves to something". `adminAccess.ts`
    // is a real file in the real directory the real factory lives in, and
    // it is still not the factory.
    name: 'round 6 · a real module in the factory’s own directory, which is not the factory',
    code: [
      "'use server'",
      "import { guardedAction } from '../../../../lib/auth/adminAccess'",
      `export const publish = guardedAction(${BODY})`,
    ].join(NEWLINE),
    errors: [{ messageId: 'notTheFactory' }],
  },
  {
    // A specifier that resolves to a real DIRECTORY rather than a file.
    // `apps/web/lib/auth` exists; `canonicalFile` has to answer no for it
    // rather than hand back a path that could compare equal to a file.
    name: 'round 6 · a specifier naming the factory’s directory rather than the file',
    code: [
      "'use server'",
      "import { guardedAction } from '../../../../lib/auth'",
      `export const publish = guardedAction(${BODY})`,
    ].join(NEWLINE),
    errors: [{ messageId: 'notTheFactory' }],
  },
  {
    // A bare specifier resolves to nothing here on purpose: admitting one
    // would mean trusting a package resolver the rule does not have, and
    // a package named `auth/guard` is a thing anybody can publish.
    name: 'round 6 · a bare specifier that merely spells the factory’s path',
    code: [
      "'use server'",
      "import { guardedAction } from 'auth/guard'",
      `export const publish = guardedAction(${BODY})`,
    ].join(NEWLINE),
    errors: [{ messageId: 'notTheFactory' }],
  },
  {
    // ROUND 7, DEFEAT 1 — THE FAIL-OPEN DIRECTION, and the reason this
    // round exists. `importsTheFactory` resolved the module SPECIFIER and
    // compared the file, and never read the name the import brought in,
    // so ANY export of the real `guard.ts` bound to the local name
    // `guardedAction` satisfied the rule. `authenticateAdminRequest` is a
    // real export of that file; this module left `eslint .` at exit 0 and
    // `tsc -p apps/web` clean. Nothing in `guard.ts` is presently both
    // callable-with-a-function and non-authenticating, so it was luck
    // rather than design — the day Phase 4 adds a `publicAction`, this
    // shape is a live unguarded POST. The MIRROR direction,
    // `import { guardedAction as somethingElse }`, was written down as a
    // refused false positive for three rounds while this one, which
    // failed OPEN, was written down nowhere.
    name: 'round 7 · another export of the real guard, aliased to the factory’s name',
    code: [
      "'use server'",
      "import { authenticateAdminRequest as guardedAction } from '../../../../lib/auth/guard'",
      `export const publish = guardedAction(${BODY})`,
    ].join(NEWLINE),
    errors: [{ messageId: 'notTheFactory' }],
  },
  {
    // The same hole through a DEFAULT import. `guard.ts` has no default
    // export, so this could not work at runtime — but the rule must
    // refuse it for the reason it refuses everything it cannot verify,
    // rather than leave `tsc` as the only thing between the two.
    name: 'round 7 · a default import of the real guard, bound to the factory’s name',
    code: [
      "'use server'",
      "import guardedAction from '../../../../lib/auth/guard'",
      `export const publish = guardedAction(${BODY})`,
    ].join(NEWLINE),
    errors: [{ messageId: 'notTheFactory' }],
  },
  {
    // And through a NAMESPACE import, which is the shape carrying no
    // `imported` name at all — so the check has to answer no from the
    // specifier's node type rather than from a name comparison.
    name: 'round 7 · a namespace import of the real guard, bound to the factory’s name',
    code: [
      "'use server'",
      "import * as guardedAction from '../../../../lib/auth/guard'",
      `export const publish = guardedAction(${BODY})`,
    ].join(NEWLINE),
    errors: [{ messageId: 'notTheFactory' }],
  },
  {
    // ROUND 7, DEFEAT 2. `TSExportAssignment` does not start with
    // `Export`, so the previous dispatch — `statement.type.startsWith` —
    // never called `checkExport` for it, and the fail-closed default the
    // rule's header promises was SILENCE. An enumeration of parser
    // node-type names, inside the rule that exists because enumerations
    // kept failing. `tsc` refuses the shape under ESM (TS1203), so it was
    // never exploitable; the mechanism was the defect.
    name: 'round 7 · export =, a node type whose name does not begin with Export',
    code: ["'use server'", 'const publish = async () => Promise.resolve()', 'export = publish'].join(NEWLINE),
    errors: [{ messageId: 'unverifiable' }],
  },
  {
    // The other node type outside that prefix. `export as namespace X`
    // declares a UMD global and emits nothing, so like `export =` it is
    // not exploitable — and like `export =` it proves the dispatch no
    // longer depends on how the parser spells a node's name.
    name: 'round 7 · export as namespace, the other node type outside the prefix',
    code: ["'use server'", 'export as namespace Journeys'].join(NEWLINE),
    errors: [{ messageId: 'unverifiable' }],
  },
  {
    // WHY THE NODE-TYPE HALF OF THE NEW DISPATCH IS KEPT rather than
    // replaced by the `export` keyword test. TypeScript permits a
    // decorator BEFORE `export`, which makes `@` the statement's first
    // token while the node is still an `ExportNamedDeclaration` — so the
    // two tests are a union, and this case is what fails if the keyword
    // test is ever left standing on its own.
    name: 'round 7 · a decorated export, whose first token is not the keyword',
    code: ["'use server'", '@decorated export class Journeys { publish = async () => Promise.resolve() }'].join(
      NEWLINE,
    ),
    errors: [{ messageId: 'unguarded' }],
  },
  {
    // ROUND 7, DEFEAT 3. `module.exports = { … }` attaches an export that no
    // `export` keyword spells, so no version of the dispatch above could see
    // it: written as `actions.cjs` at a real admin address it left `eslint .`
    // at exit 0 and the whole guard suite green. Whether Next.js would MOUNT a
    // CommonJS export from a `'use server'` module is a question about a
    // compiler transform, and this rule refuses the shape rather than
    // answering it — see `assignsSomething`.
    name: 'round 7 · module.exports, an export no export keyword spells',
    code: ["'use server'", 'const publish = async () => Promise.resolve()', 'module.exports = { publish }'].join(
      NEWLINE,
    ),
    errors: [{ messageId: 'assignedExport' }],
  },
  {
    // The property spelling of the same thing, which a test for the literal
    // name `module` would have walked straight past.
    name: 'round 7 · exports.name, the property spelling of the same attachment',
    code: ["'use server'", 'exports.publish = async () => Promise.resolve()'].join(NEWLINE),
    errors: [{ messageId: 'assignedExport' }],
  },
  {
    // And the spelling neither of those two names appears in. The refusal is
    // of ASSIGNMENT, not of two identifiers, which is what keeps it from being
    // one more enumeration.
    name: 'round 7 · an assignment through neither module nor exports',
    code: ["'use server'", 'globalThis.publish = async () => Promise.resolve()'].join(NEWLINE),
    errors: [{ messageId: 'assignedExport' }],
  },
  {
    // ROUND 8, DEFEATS 1-4, AND THE REASON THE DISPATCH INVERTED. Round 7
    // asked whether a top-level statement was an `ExpressionStatement`
    // holding an `AssignmentExpression`, which is an ENUMERATION OF ONE
    // PARSER NODE SHAPE inside the rule that exists because enumerations
    // fail - the third such enumeration to fail here, `startsWith('Export')`
    // having been the second. Four wrappers walked past it silently, each
    // written to disk at `apps/web/lib/journeys/actions.ts` and each leaving
    // `eslint .` at exit 0 and the guard suite green. The fix is not a longer
    // list of wrappers: the top level of a `'use server'` module now holds
    // only statement kinds that cannot attach an endpoint, and anything else
    // is refused unread.
    name: 'round 8 · Object.assign(module.exports, …), a call rather than an assignment',
    code: [
      "'use server'",
      'const publish = async () => Promise.resolve()',
      'Object.assign(module.exports, { publish })',
    ].join(NEWLINE),
    errors: [{ messageId: 'unrecognisedStatement' }],
  },
  {
    name: 'round 8 · Object.defineProperty(module.exports, …)',
    code: [
      "'use server'",
      'const publish = async () => Promise.resolve()',
      "Object.defineProperty(module.exports, 'publish', { value: publish })",
    ].join(NEWLINE),
    errors: [{ messageId: 'unrecognisedStatement' }],
  },
  {
    // The assignment is still there; it is the STATEMENT around it that
    // round 7's node-shape test did not recognise.
    name: 'round 8 · the assignment behind a typeof module guard',
    code: [
      "'use server'",
      'const publish = async () => Promise.resolve()',
      "if (typeof module !== 'undefined') { module.exports = { publish } }",
    ].join(NEWLINE),
    errors: [{ messageId: 'unrecognisedStatement' }],
  },
  {
    name: 'round 8 · void (module.exports = …), a unary expression',
    code: ["'use server'", 'const publish = async () => Promise.resolve()', 'void (module.exports = { publish })'].join(
      NEWLINE,
    ),
    errors: [{ messageId: 'unrecognisedStatement' }],
  },
  {
    // MINE, ROUND 8, found while attacking the fix above: the same
    // attachment through a function no list of wrappers named.
    name: 'round 8 · Reflect.set(module.exports, …), a wrapper no list named',
    code: [
      "'use server'",
      'const publish = async () => Promise.resolve()',
      "Reflect.set(module.exports, 'publish', publish)",
    ].join(NEWLINE),
    errors: [{ messageId: 'unrecognisedStatement' }],
  },
  {
    // MINE, ROUND 8. A labelled block, so the assignment is two nodes deep.
    name: 'round 8 · the assignment inside a labelled block',
    code: [
      "'use server'",
      'const publish = async () => Promise.resolve()',
      'attach: {',
      '  module.exports = { publish }',
      '}',
    ].join(NEWLINE),
    errors: [{ messageId: 'unrecognisedStatement' }],
  },
  {
    // MINE, ROUND 8. A loop, which is neither an expression nor a branch.
    name: 'round 8 · the assignment inside a top-level loop',
    code: [
      "'use server'",
      'const publish = async () => Promise.resolve()',
      "for (const key of ['publish']) module.exports[key] = publish",
    ].join(NEWLINE),
    errors: [{ messageId: 'unrecognisedStatement' }],
  },
  {
    // MINE, ROUND 8. THE SHAPE A STATEMENT ALLOWLIST ALONE WOULD MISS, and
    // the reason the assignment check sits on the assignment node itself: a
    // `VariableDeclaration` is inert and has to stay admissible, so an
    // assignment hidden in its initialiser is refused where it is written
    // rather than by the statement around it.
    name: 'round 8 · module.exports assigned inside an admissible declaration',
    code: [
      "'use server'",
      'const publish = async () => Promise.resolve()',
      'const attached = (module.exports = { publish })',
    ].join(NEWLINE),
    errors: [{ messageId: 'assignedExport' }],
  },
  {
    // MINE, ROUND 8. A class field initialiser evaluates when the class is
    // defined, which is module load - so it is module scope rather than a
    // function body, and the ancestor walk has to say so.
    name: 'round 8 · module.exports assigned in a class field initialiser',
    code: [
      "'use server'",
      'const publish = async () => Promise.resolve()',
      'class Attach { attached = (module.exports = { publish }) }',
    ].join(NEWLINE),
    errors: [{ messageId: 'assignedExport' }],
  },
]

describe('guarded-server-actions', () => {
  it('admits every export spelling, so long as each is built from the factory', () => {
    ruleTester.run('guarded-server-actions', guardedServerActions, {
      valid: VALID_CASES.map(at),
      invalid: INVALID_CASES.map(at),
    })
  })

  it('is a list whose length is asserted rather than counted by hand', () => {
    // ONE PLACE A NUMBER ABOUT THIS LIST LIVES, AND IT FAILS WHEN THE LIST
    // CHANGES. `docs/testing.md` used to print both figures with nothing
    // enforcing either: its "30 cases - 7 valid and 23 invalid" was right
    // while this file's own header said twelve, and its "40 cases - 8 valid
    // and 32 invalid" was stale within a round of these assertions being
    // added. So the document no longer prints them and points here instead
    // (ruling F76, the same move the survivor count made).
    expect(VALID_CASES).toHaveLength(10)
    expect(INVALID_CASES).toHaveLength(41)
  })

  it('names the factory and the directive it is written against, so neither can drift silently', () => {
    // The rule is a string comparison against two names Next.js and this
    // repository choose. If either changes, every case above passes against the
    // wrong word — so the words themselves are asserted.
    const source = guardedServerActions.create.toString()

    expect(guardedServerActions.meta.messages.unguarded).toContain('guardedAction')
    expect(guardedServerActions.meta.messages.notTheFactory).toContain('apps/web/lib/auth/guard.ts')
    expect(source).toContain('FACTORY')
    expect(Object.keys(guardedServerActions.meta.messages).sort()).toEqual([
      'assignedExport',
      'inlineDirective',
      'notTheFactory',
      'unguarded',
      'unrecognisedStatement',
      'unverifiable',
    ])
  })
})
