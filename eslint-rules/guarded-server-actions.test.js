/**
 * guarded-server-actions.test.js — every shape that has ever defeated this
 * check, run against the rule that replaced them.
 *
 * ═══ WHY THE CASES ARE THE DEFEATS ═══
 *
 * Nine versions of this guarantee were written as text scans and nine were
 * defeated. The valuable artefact from that is not the rule — it is the LIST,
 * because each entry is a shape somebody actually reached for. So the invalid
 * cases below are not invented: they are the twelve mutations that were written
 * to disk and run against `npm run lint`, in the order they were found, with
 * the round that found each named beside it.
 *
 * THE VALID CASE MATTERS AS MUCH AS THE TWELVE. A rule nobody can satisfy is a
 * rule Phase 4 turns off, so the shape this repository wants — every export
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
import { RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'
import { guardedServerActions } from './guarded-server-actions.js'

/** The import line a guarded module carries. */
const IMPORT = "import { guardedAction } from '../lib/auth/guard'"

/** A line break, written once so no fixture has to carry an escape. */
const NEWLINE = String.fromCharCode(10)

/** An action body, so no case is testing an empty function. */
const BODY = 'async (session) => Promise.resolve(session)'

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 2022, sourceType: 'module' },
})

describe('guarded-server-actions', () => {
  it('admits every export spelling, so long as each is built from the factory', () => {
    ruleTester.run('guarded-server-actions', guardedServerActions, {
      valid: [
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
      ],
      invalid: [
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
      ],
    })
  })

  it('names the factory and the directive it is written against, so neither can drift silently', () => {
    // The rule is a string comparison against two names Next.js and this
    // repository choose. If either changes, every case above passes against the
    // wrong word — so the words themselves are asserted.
    const source = guardedServerActions.create.toString()

    expect(guardedServerActions.meta.messages.unguarded).toContain('guardedAction')
    expect(source).toContain('FACTORY')
    expect(Object.keys(guardedServerActions.meta.messages).sort()).toEqual([
      'inlineDirective',
      'notTheFactory',
      'unguarded',
      'unverifiable',
    ])
  })
})
