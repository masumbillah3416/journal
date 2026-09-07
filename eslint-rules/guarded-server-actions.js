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
 * `files` list of its own — so there is no directory it does not reach and no
 * export spelling it cannot see.
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
 *    an IMPORT of `guardedAction` from `apps/web/lib/auth/guard` — so a local
 *    function of the same name does not satisfy it.
 * 2. `'use server'` inside a function body is refused outright, wherever it
 *    appears. Such an action is dispatched as its own `POST` before the page
 *    around it renders, so a guard in that page's body does not gate it
 *    (`SECURITY.md`: nothing inherits trust from the page it was reached
 *    from). There is no way to tell that action's guard from the page's, so the
 *    shape is refused rather than analysed.
 * 3. Anything else at the top level of a `'use server'` module that this rule
 *    does not recognise as a guarded export is REPORTED. A re-export cannot be
 *    verified from here, and an export syntax nobody anticipated is exactly the
 *    shape that defeated every previous version — so the default is refusal.
 *
 * ═══ WHAT DEFEATS IT, STATED RATHER THAN LEFT TO BE FOUND ═══
 *
 * An `eslint-disable` comment. That is deliberate: a disable comment is one
 * line in a diff with a reason beside it, which is a decision somebody made —
 * and `apps/web/lib/auth/adminGuardRegistration.test.ts` fails if one naming
 * this rule appears in any file git lists for this repository. That is git's
 * listing, not a directory walk: the previous version of that check enumerated
 * five directory names inside `apps/web`, and a disable comment in
 * `apps/web/actions/` or in `packages/` sat outside all five. Everything in the
 * list above failed SILENTLY, which is the whole difference.
 *
 * A file `.gitignore` covers is also outside that listing — deliberately, since
 * such a file cannot be committed, and the `.gitignore` line that hid it would
 * be in the same diff.
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
 * THE ORDER OF THE TWO COMPARISONS IS LOAD-BEARING. `imported` is checked
 * against `undefined` FIRST, so a repository that had moved or renamed
 * `guard.ts` cannot admit everything: with the factory missing, `factory` is
 * `undefined` too, and a naive equality would then match every specifier that
 * also resolved to nothing — which is every specifier a decoy uses. Requiring
 * `imported` to name a real file first means the rule refuses rather than
 * relaxes when it loses the ability to check.
 *
 * @param {object | undefined} definition - The variable definition of the name.
 * @param {string} importerFile - Absolute path of the file holding the import.
 * @returns {boolean} True only when the specifier resolves to the factory.
 */
const importsTheFactory = (definition, importerFile) => {
  if (definition === undefined || definition.type !== 'ImportBinding') return false
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
        'A re-export cannot be checked here, and every export of a "use server" module is a POST endpoint. Declare the action in this module as guardedAction(...).',
      inlineDirective:
        'A "use server" directive inside a function makes it a POST endpoint dispatched BEFORE the page around it renders, so the guard in that page does not gate it. Move it to a module whose exports are all guardedAction(...).',
      notTheFactory:
        'guardedAction must resolve to the file apps/web/lib/auth/guard.ts. A local binding of that name, or another module named auth/guard, guards nothing.',
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
          if (statement.type.startsWith('Export')) checkExport(statement)
        }
      },
    }
  },
}
