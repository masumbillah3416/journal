/**
 * guarded-server-actions — a Server Action that does not go through
 * `guardedAction()` is a lint error in this repository.
 *
 * ═══ WHY THIS IS A LINT RULE AND NOT A TEST ═══
 *
 * `apps/web/lib/auth/adminGuardRegistration.test.ts` scanned source TEXT for a
 * guard call and for `'use server'`. Nine versions of that idea have now been
 * defeated: by a comment, by an import line, by a neighbouring module, by a
 * second route group, by an `actions.ts` the walk never opened, by a directory
 * outside the walk's root list, and by four export spellings a regex over
 * `^export (const|function)` cannot see — `export default async function`,
 * `export { name }`, `export default name`, and an export with a space in
 * front of it.
 *
 * The lesson is not that the tenth regex will hold. It is that "every export of
 * every module" is not a sentence text matching can express, so the check has
 * to be written where the exports are already parsed. This rule reads the AST
 * ESLint has already built, on every file `npm run lint` visits, and it has no
 * `files` list of its own — so there is no directory it does not reach, and an
 * export spelling it does not RECOGNISE is reported rather than skipped, which
 * is round 7's correction and not what round 6 did (see rule 3 below).
 *
 * ═══ WHAT "EVERY FILE `npm run lint` VISITS" IS, AND IS NOT ═══
 *
 * This header used to call that reach "the whole working tree bar generated
 * output". IT IS NOT. A flat config lints the extensions some block's `files`
 * array names, and for four rounds nothing named `.jsx`: an unguarded
 * `'use server'` module written as `actions.jsx` passed `eslint .` at exit 0,
 * passed `tsc`, passed `prettier --check`, and was registered by a running
 * Next.js dev server as a real action endpoint. `eslint.config.js` now names
 * that extension, so the four Next.js serves by default are all visited.
 *
 * BUT AN EXTENSION LIST IS NOT A GUARANTEE, and this rule does not claim to be
 * one on its own. What proves the reach is
 * `apps/web/lib/auth/adminGuardRegistration.test.ts`: it takes git's own
 * listing of the repository, finds every file whose BYTES carry `'use server'`
 * at any extension in any directory, and asks ESLint's own API whether each one
 * is a file it lints with this rule at `error`. Text is used for what text is
 * good at — finding candidates nobody enumerated — and the AST decides whether
 * they are guarded. That case fails on the commit that introduces the next
 * extension gap; it cannot fail before such a file is written.
 *
 * ═══ WHAT IT REQUIRES ═══
 *
 * 1. A module whose directive prologue carries `'use server'` may export
 *    nothing but calls to `guardedAction(...)`, and the callee must resolve to
 *    an import whose IMPORTED NAME is `guardedAction` and whose specifier
 *    resolves on disk to `apps/web/lib/auth/guard.ts` — so a local function of
 *    the same name does not satisfy it, and neither does a DIFFERENT export of
 *    that same file aliased to the name (round 7's fail-open direction; see
 *    `importsTheFactory`). Both halves are checked, which two earlier versions
 *    of this sentence claimed while only the file half was.
 * 2. `'use server'` inside a function body is refused outright, wherever it
 *    appears. Such an action is dispatched as its own `POST` before the page
 *    around it renders, so a guard in that page's body does not gate it
 *    (`SECURITY.md`: nothing inherits trust from the page it was reached
 *    from). There is no way to tell that action's guard from the page's, so the
 *    shape is refused rather than analysed.
 * 3. Anything EXPORT-SHAPED at the top level of a `'use server'` module that
 *    this rule does not recognise as a guarded export is REPORTED. A re-export
 *    cannot be verified from here, and an export syntax nobody anticipated is
 *    exactly the shape that defeated every previous version — so the default is
 *    refusal. Export-shaped means the statement spells the `export` keyword, or
 *    its node type names an export; see `exportsSomething`, which is where
 *    round 6 was silent instead of refusing.
 *
 *    THE ONE EXPORT THIS RULE PASSES OVER is one the parser marks
 *    `exportKind: 'type'` — `export type`, `export interface`, and the ambient
 *    `export declare const`/`export declare function`. Those emit no runtime
 *    binding, so Next.js mounts no endpoint from them. It is a narrow
 *    exception rather than "any export", which four documents used to say.
 * 4. THE TOP LEVEL OF A `'use server'` MODULE MAY ONLY IMPORT AND DECLARE.
 *    `module.exports = { deleteJourney }` attaches an export that no `export`
 *    keyword spells, so rule 3 cannot see it — and round 7 answered that by
 *    refusing one node shape, an `ExpressionStatement` holding an
 *    `AssignmentExpression`, which four wrappers then walked past
 *    (`Object.assign`, `Object.defineProperty`, `void (…)`, an `if` block).
 *    That was the third enumeration to fail inside this rule, so rule 4 is now
 *    an ALLOWLIST of inert statement kinds: an unrecognised statement is
 *    refused the way an unrecognised export syntax is. See
 *    `INERT_TOP_LEVEL_TYPES`, and `assignmentAlreadyAnswered` for why an
 *    assignment in an action's own body is still ordinary code.
 *
 * ═══ WHAT DEFEATS IT — ENUMERATED WHERE IT CAN BE ASSERTED, NOT HERE ═══
 *
 * The shapes that still get through both mechanisms are enumerated, with the
 * measurement and the committability of each, by `SHAPES_THAT_GET_THROUGH` in
 * `apps/web/lib/auth/adminGuardRegistration.test.ts`; a case there fails if
 * this file stops pointing at that array or starts restating it. No count is
 * written here, because a count written in prose has drifted from this code in
 * every round of this phase — seven sites said two while the fifth
 * whole-branch review measured four (ruling F76).
 *
 * WHAT AN ESLINT DISABLE COMMENT DOES TO THIS RULE, since that is the question
 * a reader arrives with: it switches it off, deliberately — one line in a diff
 * with a reason beside it is a decision somebody made — and
 * `adminGuardRegistration.test.ts` then holds three keys over that decision,
 * each default-deny by exact path. One: no module carrying the directive may
 * hold a disable directive in ANY spelling, which is round 8's correction to a
 * check that required one LINE to carry both the directive and this rule's id,
 * and which a bare directive and a line-split one both walked past while
 * committing. Two: no file may spell this rule's id, because that is what an
 * inline `eslint <rule>: off` severity comment has to do. Three: ESLint's own
 * `suppressedMessages` must show this rule suppressed in nothing but the one
 * exempt file, which is the key no spelling evades.
 *
 * Depends on: node:fs and node:path, to resolve an import specifier to a real
 * file. ESLint supplies the AST and the scope analysis.
 */
import { realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The factory every Server Action must be built from. */
const FACTORY = 'guardedAction'

/** The directive that turns a module's exports into `POST` endpoints. */
const SERVER_DIRECTIVE = 'use server'

/**
 * The one file on disk the factory may come from.
 *
 * A PATH RESOLVED TO A REAL FILE, NOT A PATTERN MATCHED AGAINST A SPECIFIER,
 * and that is round 6's correction. The previous version tested the specifier
 * against `/(^|\/)auth\/guard(edAction)?$/`, which two decoys satisfied: a
 * module at `apps/web/lib/auth/guardedAction.ts` — a path no file in this
 * repository has ever occupied, so the optional group could only ever admit a
 * forgery — and an `auth/guard.ts` written in a directory beside the action and
 * imported as `./auth/guard`, because a suffix match accepts any directory
 * named `auth` holding a file named `guard`. Both exported a no-op
 * `guardedAction` and both left `eslint .` at exit 0.
 *
 * Resolved from this rule's own location rather than from a string, so the
 * comparison is between two inodes rather than between two spellings.
 */
const FACTORY_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/web/lib/auth/guard.ts')

/**
 * The extensions a relative specifier may resolve through, longest-lived first.
 *
 * Node and the TypeScript compiler both try the bare path before appending an
 * extension, and `tsconfig.base.json` sets `moduleResolution: "Bundler"`, so
 * `'../../lib/auth/guard'` names `guard.ts`. The list is an ordering, not a
 * gate: a specifier that resolves to no file at all is not the factory, which
 * is the safe answer.
 */
const RESOLVABLE_EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']

/**
 * The canonical on-disk path a file is at, or `undefined` when it is not a file.
 *
 * `realpathSync.native` rather than `path.resolve` alone: on Windows the same
 * file can be named in several cases, and two strings that differ only in case
 * would compare unequal while naming one file.
 *
 * @param candidate - An absolute path.
 * @returns The canonical path, or undefined when nothing is there.
 */
const canonicalFile = (candidate) => {
  try {
    return statSync(candidate).isFile() ? realpathSync.native(candidate) : undefined
  } catch {
    // `statSync` throws for a path that is not there, which is the ordinary
    // answer for every extension in the list but one. Not an error condition.
    return undefined
  }
}

/**
 * The file a relative import specifier names, resolved against the importer.
 *
 * A bare specifier (a package, or a tsconfig `paths` alias) resolves to
 * `undefined` deliberately: the factory is imported relatively everywhere in
 * this repository, and admitting a bare name would mean trusting a resolver
 * this rule does not have.
 *
 * @param importer - The absolute path of the file holding the import.
 * @param specifier - The string in the import statement.
 * @returns The canonical path of the file imported, or undefined.
 */
const resolvedImport = (importer, specifier) => {
  if (!specifier.startsWith('.')) return undefined
  const base = path.resolve(path.dirname(importer), specifier)
  for (const extension of RESOLVABLE_EXTENSIONS) {
    const found = canonicalFile(`${base}${extension}`)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Whether a binding is an import of the factory, resolved on disk.
 *
 * ═══ BOTH HALVES ARE CHECKED: WHICH EXPORT, AND WHICH FILE (ROUND 7) ═══
 *
 * The previous version read `definition.parent.source.value` — the module
 * SPECIFIER — and never read the name the import brought in, so ANY named
 * export of the real `guard.ts` bound to the local name `guardedAction`
 * satisfied it. `import { authenticateAdminRequest as guardedAction }` left
 * `eslint .` at exit 0, `tsc -p apps/web` clean and the guard suite green,
 * which is a FAIL-OPEN direction in a control whose whole stated principle is
 * fail-closed. Nothing in `guard.ts` was exploitable through it, and that was
 * luck rather than design: every export there either authenticates or is not
 * callable with a function. Phase 4 extends this module.
 *
 * ONE NAME, NOT AN ALLOWLIST OF AUTHENTICATING WRAPPERS, and the choice is
 * deliberate. A list of permitted names is a list this rule would have to
 * TRUST: it can compare a name and resolve a file, and it cannot tell whether
 * the function behind a name calls the guard — so an allowlist would put the
 * security property back into a table somebody maintains, which is the
 * enumeration failure mode this rule exists to end. A Phase 4 wrapper composes
 * `guardedAction` instead of joining a list, and then its own exports are
 * guarded by construction.
 *
 * THE ORDER OF THE COMPARISONS IS LOAD-BEARING. `imported` is checked against
 * `undefined` FIRST, so a repository that had moved or renamed `guard.ts`
 * cannot admit everything: with the factory missing, `factory` is `undefined`
 * too, and a naive equality would then match every specifier that also resolved
 * to nothing — which is every specifier a decoy uses. Requiring `imported` to
 * name a real file first means the rule refuses rather than relaxes when it
 * loses the ability to check.
 *
 * @param {object | undefined} definition - The variable definition of the name.
 * @param {string} importerFile - Absolute path of the file holding the import.
 * @returns {boolean} True only when the binding is the factory's own export,
 *   imported from the factory's own file.
 */
const importsTheFactory = (definition, importerFile) => {
  if (definition === undefined || definition.type !== 'ImportBinding') return false
  // ONE COMPARISON COVERS THREE SHAPES, which is why it is written as an
  // optional chain rather than as a type test. Only `ImportSpecifier` carries
  // an `imported` node at all, so a default import (`import guardedAction
  // from`) and a namespace import (`import * as guardedAction from`) both
  // reach `undefined` here; and `imported` is a `Literal` rather than an
  // `Identifier` for `import { 'a-b' as guardedAction }`, which has no `name`.
  // All three answer no, and none of them throws.
  if (definition.node.imported?.name !== FACTORY) return false

  const imported = resolvedImport(importerFile, String(definition.parent.source.value))
  return imported !== undefined && imported === canonicalFile(FACTORY_FILE)
}

/**
 * Whether a statement is the `'use server'` directive.
 *
 * @param {object} statement - A node from a `Program` or `BlockStatement` body.
 * @returns {boolean} True for `'use server'` written as a directive.
 */
const isServerDirective = (statement) =>
  statement.type === 'ExpressionStatement' &&
  statement.expression.type === 'Literal' &&
  statement.expression.value === SERVER_DIRECTIVE

/**
 * Whether a body's directive prologue carries `'use server'`.
 *
 * Walks the prologue rather than reading only the first statement: `'use
 * strict'` or a bundler pragma may legally precede it, and a check that looked
 * at `body[0]` alone would be defeated by one line above the directive.
 *
 * @param {object[]} body - The statements of a `Program` or `BlockStatement`.
 * @returns {boolean} True when the directive is in the prologue.
 */
const hasServerPrologue = (body) => {
  for (const statement of body) {
    if (isServerDirective(statement)) return true
    if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'Literal') return false
  }
  return false
}

/**
 * Whether a top-level statement exports something.
 *
 * ═══ THE `export` KEYWORD, NOT THE NODE TYPE'S NAME (ROUND 7) ═══
 *
 * The previous version asked `statement.type.startsWith('Export')`, which is an
 * ENUMERATION OF PARSER NODE-TYPE NAMES inside the rule that exists because
 * enumerations kept failing — and it had already failed twice:
 * `TSExportAssignment` (`export = x`) and `TSNamespaceExportDeclaration`
 * (`export as namespace X`) do not begin with `Export`, so `checkExport` was
 * never called for them and the `unverifiable` fallback that carries this
 * rule's fail-closed promise never fired. The default was SILENCE, which is
 * what the header claimed it was not.
 *
 * Every export syntax ECMAScript and TypeScript have is spelled with the
 * `export` keyword, so the keyword is what to look for: a node type nobody here
 * has heard of still has to spell it, and then it reaches `checkExport`, is not
 * recognised, and is REPORTED. That is the same fail-closed shape
 * `adminGuardRegistration.test.ts` already gives an unrecognised route-file
 * kind, expressed against the language rather than against a parser's naming.
 *
 * THE TWO TESTS ARE A UNION RATHER THAN A CHOICE. TypeScript permits a
 * decorator before the keyword (`@dec export class A {}`), which makes `@` the
 * statement's first token while the node is still an `ExportNamedDeclaration` —
 * so the node-type test is kept, widened from `startsWith` to `includes`, as
 * the second half. Each half has its own case in
 * `guarded-server-actions.test.js`.
 *
 * WHICH HALF ACTUALLY CATCHES `export =` TODAY, said plainly rather than left
 * to be inferred, because this branch's recurring defect is a claim stronger
 * than its code: BOTH node type names contain the substring `Export`, so it is
 * the WIDENING from `startsWith` to `includes` that reports them, and the
 * keyword test is the belt with no current buckle. That is deliberate and it is
 * the half worth keeping: `includes` is still a test on a name the parser
 * chooses, and the keyword is a property of the language. No node type in this
 * parser is export-shaped without `Export` in its name — so if one ever is,
 * the keyword test is the only thing standing between it and silence, and it
 * will be exercised on the day it matters rather than added then.
 *
 * INVARIANT — a statement always has a first token, so `getFirstToken` is not
 * null-guarded here. A statement with no tokens has no source text and cannot
 * be in a `Program` body; if some future parser produced one, this would throw
 * and ESLint would report a fatal error on the file, which fails the gate
 * loudly rather than passing it quietly.
 *
 * @param {object} statement - A node from a `Program` body.
 * @param {object} sourceCode - ESLint's `SourceCode` for the file.
 * @returns {boolean} True when the statement is export-shaped.
 */
const exportsSomething = (statement, sourceCode) =>
  statement.type.includes('Export') || sourceCode.getFirstToken(statement).value === 'export'

/**
 * Whether a top-level statement assigns to something.
 *
 * ═══ WHY AN ASSIGNMENT IS REFUSED RATHER THAN ANALYSED (ROUND 7) ═══
 *
 * `module.exports = { deleteJourney }` and `exports.deleteJourney = …` attach an
 * export that no `export` keyword spells, so {@link exportsSomething} cannot see
 * them and `checkExport` is never reached. Written into a `'use server'` module
 * this left `eslint .` at exit 0 and the guard suite green (round 7's shape N5).
 *
 * Whether Next.js would MOUNT such an export is a question about a compiler
 * transform, and answering it by reasoning is how this control has been wrong
 * five times. So the shape is refused instead — the same move rule 2 makes for
 * an inline directive, and for the same reason: there is no way to tell a
 * harmless top-level assignment from one that attaches an endpoint, and the
 * only cost of refusing is that a `'use server'` module cannot mutate module
 * state at load, which CLAUDE.md §3.3 rejects anyway.
 *
 * Broader than a `module`/`exports` name test on purpose. A test for those two
 * names would be an enumeration of identifiers, and the next spelling
 * (`globalThis.deleteJourney = …`, a re-assignment through an alias) would walk
 * past it.
 *
 * ═══ WHAT THIS FUNCTION IS NO LONGER RESPONSIBLE FOR (ROUND 8) ═══
 *
 * It used to be the whole of rule 4, asked of a top-level statement. That made
 * rule 4 an enumeration of ONE PARSER NODE SHAPE — the third enumeration to
 * fail inside this rule, after `startsWith('Export')` was the second — and four
 * wrappers walked past it with `eslint .` at exit 0 and the guard suite green:
 * `Object.assign(module.exports, …)`, `Object.defineProperty(module.exports,
 * …)`, `void (module.exports = …)`, and the same assignment inside an `if`
 * block. The answer is not a longer list of wrappers. The dispatch INVERTED —
 * see {@link isInertTopLevel} and the `Program` handler — and this function now
 * answers one narrow question for it: whether a statement's refusal belongs to
 * the `AssignmentExpression` listener instead, so one attachment is not
 * reported twice.
 *
 * @param {object} statement - A node from a `Program` body.
 * @returns {boolean} True for a top-level assignment expression statement.
 */
const assignsSomething = (statement) =>
  statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression'

/**
 * The statement kinds the top level of a `'use server'` module may hold.
 *
 * AN ALLOWLIST, WHICH IS THE WHOLE POINT. Every other list in this rule's
 * history was a denylist, and each was defeated by the spelling it did not
 * name. Nothing here can attach an endpoint: an import binds a name, a
 * declaration declares one, a type declaration emits nothing at all. Anything
 * else at module scope is code that RUNS when Next.js loads the module, and
 * there is no way to tell code that attaches an export from code that does
 * not — so it is refused unread, which is the treatment an unrecognised export
 * syntax (rule 3) and an unrecognised route-file kind already get.
 *
 * The cost is stated rather than left to be met: a `'use server'` module cannot
 * run a statement at load. CLAUDE.md §3.3 rejects module-level mutable state
 * anyway, an action's own body is untouched, and the refusal names the file and
 * the line rather than failing silently.
 */
const INERT_TOP_LEVEL_TYPES = new Set([
  'ImportDeclaration',
  'VariableDeclaration',
  'FunctionDeclaration',
  'ClassDeclaration',
  'EmptyStatement',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
  'TSDeclareFunction',
  'TSImportEqualsDeclaration',
])

/**
 * Whether a top-level statement of an action module can attach nothing.
 *
 * A DIRECTIVE IS THE ONE EXPRESSION STATEMENT ADMITTED, matched by shape
 * rather than by value: `'use server'` is one, a bundler pragma written beside
 * it is one, and `Object.assign(…)` — an `ExpressionStatement` whose
 * expression is a call — is not.
 *
 * @param {object} statement - A node from a `Program` body.
 * @returns {boolean} True when the statement only imports or declares.
 */
const isInertTopLevel = (statement) =>
  INERT_TOP_LEVEL_TYPES.has(statement.type) ||
  (statement.type === 'ExpressionStatement' && statement.expression.type === 'Literal')

/**
 * Whether an assignment is one rule 4 has no report to make about.
 *
 * TWO ANSWERS, ONE WALK, and both are about where the assignment sits.
 *
 * INSIDE A FUNCTION — ordinary code. An assignment at module scope runs when
 * Next.js loads the module, which is when an export can be attached; one
 * inside a function runs when that function is called, and refusing those
 * would ban `let attempts = 0; attempts = attempts + 1` from an action's own
 * body, which is how a rule becomes one Phase 4 turns off. A class FIELD
 * initialiser is module scope rather than a function: it runs when the class
 * is defined. `includes('Function')` covers `FunctionDeclaration`,
 * `FunctionExpression`, `ArrowFunctionExpression` and TypeScript's
 * declare-only shapes — a test on a name the parser chooses, the same union
 * {@link exportsSomething} documents, and here it fails in the SAFE direction
 * by construction: failing to recognise a function refuses an assignment
 * rather than admitting one.
 *
 * INSIDE A STATEMENT ALREADY REFUSED — reported once is enough. The `Program`
 * handler refuses `if (typeof module !== 'undefined') { module.exports = … }`
 * as a statement the top level may not hold; reporting the assignment inside
 * it as well would print two problems for one attachment.
 *
 * @param {object} node - Any node with a `parent` chain.
 * @param {Set<object>} refusedStatements - Top-level statements already reported.
 * @returns {boolean} True when this assignment needs no report of its own.
 */
const assignmentAlreadyAnswered = (node, refusedStatements) => {
  for (let current = node.parent; current !== null && current !== undefined; current = current.parent) {
    if (current.type.includes('Function')) return true
    if (refusedStatements.has(current)) return true
  }
  return false
}

/**
 * The variable a name resolves to, searching outwards through the scope chain.
 *
 * @param {object | null} scope - The scope to search from.
 * @param {string} name - The identifier to resolve.
 * @returns {object | undefined} The variable, or undefined when unresolved.
 */
const variableNamed = (scope, name) => {
  for (let current = scope; current !== null && current !== undefined; current = current.upper) {
    const found = current.variables.find((variable) => variable.name === name)
    if (found !== undefined) return found
  }
  return undefined
}

/** The ESLint rule. */
export const guardedServerActions = {
  meta: {
    type: 'problem',
    docs: { description: 'Every Server Action must be built from guardedAction().' },
    schema: [],
    messages: {
      unguarded:
        'Server Action "{{name}}" is a POST endpoint of its own. Export guardedAction(...) instead, imported from lib/auth/guard.',
      unverifiable:
        'This export cannot be checked here — a re-export, or an export syntax this rule does not recognise — and every export of a "use server" module is a POST endpoint. Declare the action in this module as guardedAction(...).',
      inlineDirective:
        'A "use server" directive inside a function makes it a POST endpoint dispatched BEFORE the page around it renders, so the guard in that page does not gate it. Move it to a module whose exports are all guardedAction(...).',
      notTheFactory:
        'guardedAction must be the export named guardedAction, imported from the file apps/web/lib/auth/guard.ts. A local binding of that name, another module named auth/guard, a barrel that re-exports it, or a DIFFERENT export of guard.ts aliased to that name, all guard nothing.',
      assignedExport:
        'An assignment at the top level of a "use server" module can attach an export no `export` keyword spells (module.exports, exports.name), and this rule cannot tell that from harmless module state. Export guardedAction(...) instead.',
      unrecognisedStatement:
        'The top level of a "use server" module may only import and declare. This statement RUNS when Next.js loads the module, and this rule cannot tell one that attaches an endpoint from one that does not - Object.assign(module.exports, ...) is how four wrappers walked past a check that knew one shape. Export guardedAction(...) instead.',
    },
  },

  create(context) {
    const source = context.sourceCode

    /**
     * Whether this file's own prologue carries the directive.
     *
     * Set by the `Program` handler, which ESLint runs before it reaches any
     * node inside the program, so the `AssignmentExpression` listener can rely
     * on it. `create` is called per file, so nothing here outlives one file's
     * traversal — this is not state shared between files.
     */
    let isActionModule = false

    /**
     * The top-level statements the `Program` handler has already refused.
     *
     * So that one attachment produces one problem — see
     * {@link assignmentAlreadyAnswered}. Per file, like `isActionModule`.
     */
    const refusedStatements = new Set()

    /**
     * Whether an expression is a call to the IMPORTED factory.
     *
     * Reports `notTheFactory` itself when the name is right and the binding is
     * not, so a shadowing `const guardedAction = (action) => action` fails
     * rather than passing.
     *
     * @param {object | null | undefined} expression - The initialiser.
     * @param {object} node - Where to report.
     * @returns {boolean} True when the shape is a call to something named FACTORY.
     */
    const isFactoryCall = (expression, node) => {
      if (expression === null || expression === undefined) return false
      if (expression.type !== 'CallExpression') return false
      if (expression.callee.type !== 'Identifier' || expression.callee.name !== FACTORY) return false

      const binding = variableNamed(source.getScope(node), FACTORY)
      const definition = binding === undefined ? undefined : binding.defs[0]
      if (!importsTheFactory(definition, path.resolve(context.filename))) {
        context.report({ node, messageId: 'notTheFactory' })
      }
      return true
    }

    /**
     * Reports an exported local name whose declaration is not a guarded action.
     *
     * @param {string} name - The exported name.
     * @param {object} node - Where to report.
     */
    const checkLocalName = (name, node) => {
      const binding = variableNamed(source.getScope(node), name)
      const definition = binding === undefined ? undefined : binding.defs[0]
      const initialiser =
        definition !== undefined && definition.type === 'Variable' && definition.node.type === 'VariableDeclarator'
          ? definition.node.init
          : null

      if (!isFactoryCall(initialiser, node)) context.report({ node, messageId: 'unguarded', data: { name } })
    }

    /**
     * Judges one top-level export of a `'use server'` module.
     *
     * @param {object} statement - The export node.
     */
    const checkExport = (statement) => {
      if (statement.exportKind === 'type') return

      if (statement.type === 'ExportNamedDeclaration' && statement.source === null) {
        if (statement.declaration === null) {
          for (const specifier of statement.specifiers) {
            if (specifier.exportKind !== 'type') checkLocalName(specifier.local.name, specifier)
          }
          return
        }
        if (statement.declaration.type === 'VariableDeclaration') {
          for (const declarator of statement.declaration.declarations) {
            if (!isFactoryCall(declarator.init, declarator)) {
              const name = declarator.id.type === 'Identifier' ? declarator.id.name : 'an export'
              context.report({ node: declarator, messageId: 'unguarded', data: { name } })
            }
          }
          return
        }
        // A function, class or enum declaration cannot be a guardedAction call.
        /* c8 ignore next -- every `export <declaration>` form TypeScript parses carries an `id`; the fallback exists because the node type permits null and reporting without a name would be worse than reporting a generic one */
        const name = statement.declaration.id?.name ?? 'an export'
        context.report({ node: statement, messageId: 'unguarded', data: { name } })
        return
      }

      if (statement.type === 'ExportDefaultDeclaration') {
        if (statement.declaration.type === 'Identifier') {
          checkLocalName(statement.declaration.name, statement)
          return
        }
        if (!isFactoryCall(statement.declaration, statement)) {
          context.report({ node: statement, messageId: 'unguarded', data: { name: 'default' } })
        }
        return
      }

      // RULE 3, and the fail-closed direction. `export * from`,
      // `export { x } from`, `export =`, and whatever a future parser adds:
      // refused, because nothing here can see what they export.
      context.report({ node: statement, messageId: 'unverifiable' })
    }

    return {
      // RULE 2, over EVERY file rather than only a `'use server'` module: an
      // inline directive is how an action is smuggled into a page.
      ':function > BlockStatement'(node) {
        if (hasServerPrologue(node.body)) context.report({ node, messageId: 'inlineDirective' })
      },

      Program(program) {
        if (!hasServerPrologue(program.body)) return
        isActionModule = true

        for (const statement of program.body) {
          if (exportsSomething(statement, source)) {
            checkExport(statement)
            continue
          }
          if (isInertTopLevel(statement)) continue
          // The listener below owns every assignment, wherever it is written,
          // so reporting here as well would report one attachment twice.
          if (assignsSomething(statement)) continue

          refusedStatements.add(statement)
          context.report({ node: statement, messageId: 'unrecognisedStatement' })
        }
      },

      // RULE 4, ASKED OF THE ASSIGNMENT RATHER THAN OF THE STATEMENT AROUND IT
      // (ROUND 8). `const attached = (module.exports = { … })` hides the
      // attachment inside a `VariableDeclaration`, which has to stay
      // admissible; asking the assignment where it is EVALUATED answers for
      // every statement it can be written inside, including ones nobody listed.
      AssignmentExpression(node) {
        if (!isActionModule) return
        if (assignmentAlreadyAnswered(node, refusedStatements)) return

        context.report({ node, messageId: 'assignedExport' })
      },
    }
  },
}
