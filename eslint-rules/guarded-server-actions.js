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
 * 4. A top-level ASSIGNMENT in a `'use server'` module is refused too, because
 *    `module.exports = { deleteJourney }` attaches an export that no `export`
 *    keyword spells and rule 3 therefore cannot see. See `assignsSomething`.
 *
 * ═══ WHAT DEFEATS IT — TWO SHAPES, STATED RATHER THAN LEFT TO BE FOUND ═══
 *
 * ONE · An `eslint-disable` comment in a file `.gitignore` also hides. The
 * disable comment alone is deliberate: it is one line in a diff with a reason
 * beside it, which is a decision somebody made — and
 * `apps/web/lib/auth/adminGuardRegistration.test.ts` fails if one naming this
 * rule appears in any file git lists for this repository. That is git's
 * listing, not a directory walk: the previous version of that check enumerated
 * five directory names inside `apps/web`, and a disable comment in
 * `apps/web/actions/` or in `packages/` sat outside all five. Everything in the
 * list above failed SILENTLY, which is the whole difference. A file
 * `.gitignore` covers is outside that listing too, so the two together blind
 * both mechanisms — and such a file cannot be committed: `git add` refuses it,
 * `git add -f` puts it back in `git ls-files --cached`, which is the listing the
 * test reads, and the pre-commit hook then fails.
 *
 * TWO · A COMMITTED SCRIPT THAT BUILDS THE DIRECTIVE AT RUNTIME, e.g.
 * `['use','server'].join(' ')` written to a module during `next build`. No
 * linted file contains the literal, the coverage case's byte scan finds
 * nothing, and the emitted module does not exist when ESLint runs — so
 * `npm run verify` is exit 0 with the script present, and unlike shape one this
 * shape CAN be committed. It is stated rather than caught, and that is a
 * decision: catching it means deciding whether an arbitrary string expression
 * can evaluate to `'use server'`, which no scan and no rule can do — the honest
 * alternative would be a check over `next build`'s output, which is not a thing
 * `npm run verify` has. It takes a deliberate two-line diff and it mounts
 * nothing on its own.
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
 * {@link module:guard.guardedAction} instead of joining a list, and then its
 * own exports are guarded by construction.
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
 * @param {object} statement - A node from a `Program` body.
 * @returns {boolean} True for a top-level assignment expression statement.
 */
const assignsSomething = (statement) =>
  statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression'

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
        'A top-level assignment in a "use server" module can attach an export no `export` keyword spells (module.exports, exports.name), and this rule cannot tell that from harmless module state. Export guardedAction(...) instead.',
    },
  },

  create(context) {
    const source = context.sourceCode

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

        for (const statement of program.body) {
          if (exportsSomething(statement, source)) {
            checkExport(statement)
            continue
          }
          if (assignsSomething(statement)) context.report({ node: statement, messageId: 'assignedExport' })
        }
      },
    }
  },
}
