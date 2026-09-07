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
 * ESLint has already built, over every file `npm run lint` visits — which is
 * the whole working tree bar generated output — so there is no root list to sit
 * outside of and no spelling to slip past.
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
 * this rule appears anywhere in the tree. Everything in the list above failed
 * SILENTLY, which is the whole difference.
 *
 * Depends on: nothing. ESLint supplies the AST and the scope analysis.
 */

/** The factory every Server Action must be built from. */
const FACTORY = 'guardedAction'

/** The directive that turns a module's exports into `POST` endpoints. */
const SERVER_DIRECTIVE = 'use server'

/**
 * Where {@link FACTORY} must be imported from, matched against the specifier.
 *
 * The path rather than the name alone, so that a local
 * `const guardedAction = (action) => action` — which is the first thing anybody
 * writes to get past a rule like this one — reports rather than satisfies it.
 * `auth/guard` is where the factory lives, beside `requireAdminSession`, which
 * is the only function it calls.
 */
const FACTORY_MODULE = /(^|\/)auth\/guard(edAction)?$/u

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
        'guardedAction must be the one imported from lib/auth/guard; a local binding of that name guards nothing.',
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
      const imported =
        definition !== undefined &&
        definition.type === 'ImportBinding' &&
        FACTORY_MODULE.test(String(definition.parent.source.value))
      if (!imported) context.report({ node, messageId: 'notTheFactory' })
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
