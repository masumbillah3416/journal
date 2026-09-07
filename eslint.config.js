/**
 * eslint.config.js — lint rules enforcing CLAUDE.md §3.1's non-negotiables.
 *
 * Two tiers: a syntactic baseline (no type information required) applies to every
 * TypeScript file, including root tooling config files that sit outside any tsconfig
 * project; the stricter type-aware ruleset applies only to app/package source, which
 * `projectService` can actually resolve to a tsconfig. Depends on: typescript-eslint.
 */
import tseslint from 'typescript-eslint'
import { guardedServerActions } from './eslint-rules/guarded-server-actions.js'

export default tseslint.config(
  // ══ Server Actions ══
  //
  // A Server Action is a POST endpoint Next.js mounts under an opaque action
  // id, reachable by anybody who has that id, and the middleware does not close
  // it — it enforces CSRF and never authentication. Phase 2 tried NINE times to
  // catch an unguarded one by scanning source text and was defeated every time,
  // most recently by four export spellings and by a directory outside the
  // scan's root list. This rule reads the AST ESLint has already built, over
  // every file `npm run lint` visits, and REPORTS every value export of a
  // `'use server'` module that is not built from `guardedAction()`, every
  // re-export from one, every top-level statement in one that evaluates
  // anything at load bar a literal, a function expression or that same call,
  // and every `'use server'` directive inside a function body. It said it
  // "admits nothing but" those exports until round 9, which is an absolute the
  // sixth whole-branch review falsified twice over; what it does NOT report is
  // enumerated by `SHAPES_THAT_GET_THROUGH` in
  // `apps/web/lib/auth/adminGuardRegistration.test.ts`. See the rule's own
  // header, and `apps/web/lib/auth/guard.ts` for the factory.
  //
  // It sits FIRST and unscoped, before every `files`-scoped block below, so
  // there is no path in this repository it does not apply to.
  {
    plugins: { 'travel-diary': { rules: { 'guarded-server-actions': guardedServerActions } } },
    rules: { 'travel-diary/guarded-server-actions': 'error' },
  },
  // ══ `.jsx`, which ESLint enumerated for nobody ══
  //
  // A flat config lints the extensions some block's `files` array names, and
  // nothing here named this one: ESLint's own default covers `.js`/`.mjs`/
  // `.cjs` and `tseslint.configs.recommended` covers `.ts`/`.tsx`/`.mts`/
  // `.cts`, which left `.jsx` invisible to `eslint .` — naming such a file
  // directly answered "File ignored because no matching configuration was
  // supplied", and the rule above could not report on a file it was never
  // handed. Next.js's default `pageExtensions` is `tsx, ts, jsx, js` and
  // `apps/web/next.config.ts` sets none of its own, so a `'use server'`
  // module written as `.jsx` was a live action endpoint that passed lint,
  // typecheck and `prettier --check` in silence. It was mounted against a
  // running dev server and Next registered its export
  // (`name="$ACTION_ID_00c4d417…"`), so this is a demonstrated hole rather
  // than a theoretical one.
  //
  // This block adds no rule. Its whole job is to put the extension in
  // ESLint's enumeration, after which the UNSCOPED block above applies to it
  // like everything else. The parser is typescript-eslint's for the same
  // reason the rest of the repository uses it, and `ecmaFeatures.jsx` is set
  // so a `.jsx` file holding actual JSX parses rather than erroring — a parse
  // error would fail the gate for the wrong reason and teach an author to add
  // an ignore.
  //
  // AN EXTENSION LIST CANNOT BE TRUSTED COMPLETE, which is the lesson of the
  // nine text scans, so this block is not what proves the reach.
  // `adminGuardRegistration.test.ts`'s coverage case is: it walks the
  // repository for the literal `'use server'` and asks ESLint, through its own
  // API, whether each file it finds is one ESLint visits with this rule at
  // `error`. Text finds candidates at extensions nobody listed; the AST
  // decides whether they are guarded. It fails on the commit that introduces
  // the next extension gap and cannot fail before such a file exists, which
  // is a real limit rather than a guarantee.
  {
    files: ['**/*.jsx'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  // Syntactic baseline — no type information needed, so it can parse every TS file
  // including config files. The three CLAUDE.md §3.1 non-negotiables live here so
  // they can never be silently dropped for a file that falls outside a tsconfig project.
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': 'error',
      // A leading underscore is the conventional "deliberately unused" marker —
      // needed for Payload-generated migrations, whose up/down signature
      // destructures `payload`/`req` alongside `db` whether or not a given
      // migration's SQL needs them.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // A relative import must not carry a `.js` extension. `tsconfig.base.json`
      // sets `moduleResolution: "Bundler"`, so the extension was never required —
      // it was a leftover NodeNext-style convention. It is banned rather than
      // merely discouraged because of how it fails: Vitest and `tsc` both resolve
      // `./payload.js` to `payload.ts` happily, so a file carrying one looks
      // correct everywhere until a Next.js route imports it, at which point
      // Turbopack resolves it to nothing and the build fails with "Can't resolve
      // './payload.js'" — an error that names a missing file rather than a wrong
      // convention, which is a confusing way to learn this. Next's own
      // `experimental.extensionAlias` escape hatch is on its published list of
      // options Turbopack ignores, so there is no configuration fix. Phase 1
      // Task 7 hit this on the first route to reach `apps/web/lib`.
      // Both the bare and the nested pattern are listed: a rule matching only
      // `./*.js` would miss `./contract/queue-contract.js`, which is exactly the
      // shape that was in the repository.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./*.js', './**/*.js', '../*.js', '../**/*.js'],
              message:
                'Drop the .js extension from relative imports. moduleResolution is "Bundler", and Turbopack does not resolve a .js specifier to a .ts file — see docs/architecture.md.',
            },
          ],
        },
      ],
    },
  },
  {
    // This file's own import of the rule above, and the rule's own test.
    // `no-restricted-imports` bans a relative specifier ending `.js` because
    // Turbopack will not resolve one to a `.ts` file — but `eslint-rules/*.js`
    // ARE `.js` files, loaded by Node under `"type": "module"`, where the
    // extension is required rather than optional, and Turbopack never sees
    // them. Scoped to these paths, like the `(payload)` override below, rather
    // than weakened globally.
    files: ['eslint.config.js', 'eslint-rules/**/*.js'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Payload GENERATES `app/(payload)/cms/importMap.js` as a real `.js` file on
    // disk, so its specifier is correct and the rule above would be a false
    // positive on it. Scoped to the three files that import it, by path, rather
    // than weakened globally.
    files: ['apps/web/app/(payload)/**/*.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
  // Type-aware strict rules — only for source files that live inside a tsconfig
  // project (app and package code); `files` already confines this to `packages/`
  // and `apps/`, so root-level tooling config (eslint.config.js, vitest.config.ts)
  // is naturally excluded without needing a name-based `ignores` — a broad
  // `**/*.config.ts` pattern would also catch `apps/web/payload.config.ts` and
  // `apps/web/next.config.ts`, which *are* covered by apps/web's own tsconfig
  // and should get the same strict rules as the rest of that app's source.
  {
    // e2e/**/*.ts (Task 12) has its own tsconfig.json, so `projectService`
    // resolves it by the same ancestor-directory walk it uses for
    // packages/** and apps/** — the strict, type-aware tier is not limited
    // to product code. `playwright.config.ts` deliberately stays out of
    // this list: it lives at the repository root, which already has its own
    // `tsconfig.json` (the composite build's reference-only "solution"
    // file, with no `include`) — projectService finds that one first by the
    // same directory walk and, finding the file not listed in it, refuses
    // to fall back to e2e's sibling project. It is still typechecked (see
    // e2e/tsconfig.json and the root `typecheck` script), just not by
    // ESLint's type-aware rules — the same treatment `vitest.config.ts`
    // already gets, for the same reason (see this file's own header).
    files: ['packages/**/*.ts', 'apps/**/*.ts', 'apps/**/*.tsx', 'e2e/**/*.ts'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: { parserOptions: { projectService: true } },
  },
  {
    // The console mailer is the one legitimate writer to stdout (its dev-only
    // terminal preview of the OTP code, and the masked line every send
    // produces) - a targeted override for this single file, not a weakening
    // of the global rule, so `console.log` anywhere else is still caught.
    files: ['apps/web/lib/adapters/console-mailer.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // The performance runner is a terminal command: printing which gate passed
    // and which failed IS its output, and a summary nobody can read would
    // defeat the reason it exists (see its own header). Named by exact path,
    // like the mailer above, so `console.log` in application code is still an
    // error.
    files: ['scripts/run-lighthouse.mjs'],
    rules: { 'no-console': 'off' },
  },
  // Generated output, never authored here. The last four are the browser and
  // performance harnesses' own artefacts, and they are listed for the same
  // reason `coverage/` already was: they are `.gitignore`d, so they are
  // invisible in `git status`, but ESLint walks the working tree rather than
  // the index — leaving them in made `npm run lint` (and therefore the
  // pre-commit gate) pass or fail depending on whether the developer had run
  // `npm run test:e2e` or `npm run test:perf` since the last clean, with
  // thousands of errors reported against Playwright's own bundled trace
  // viewer. A gate has to be one a developer can always pass honestly
  // (CLAUDE.md §11), so the artefacts are excluded rather than the rules
  // weakened.
  //
  // `.lighthouseci/`, `blob-report/`, `build/` and `.superpowers/` are the four
  // this list MISSED, and they are round 7's correction. `.prettierignore`
  // covers all four; this array covered none, so
  // `new ESLint().isPathIgnored('.lighthouseci/x.js')` answered FALSE while the
  // same probe for `lhci-reports/x.js` answered true. None of the four holds a
  // linted extension today — Lighthouse CI writes `.html` and `.json`,
  // Playwright's blob report writes `.zip`, `build/` is unused, and
  // `.superpowers/` holds Markdown and diffs — which is precisely what made it
  // worth closing rather than leaving: the defect the paragraph above says was
  // fixed was still latent in the same file, one artefact filename away from
  // recurring, and it was found as a latent recurrence rather than as an
  // outage.
  //
  // The set is now pinned to `.prettierignore`'s own directory entries by
  // `apps/web/lib/auth/adminGuardRegistration.test.ts`'s case "does not walk
  // the generated directories prettier ignores", asked of ESLint's own
  // `isPathIgnored` rather than read out of this file — so the next generated
  // directory added to one ignore file and not the other fails a gate instead
  // of waiting for a review to notice. The trade this makes is the same one the
  // seven original entries already made: a directory ESLint does not walk is
  // one `travel-diary/guarded-server-actions` does not apply to. What keeps
  // that from being a hole is `adminGuardRegistration.test.ts`'s coverage case,
  // which reads GIT's listing — so a `'use server'` module forced into the
  // index from any of these directories fails there.
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      'handoff/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'blob-report/**',
      'lhci-reports/**',
      '.lighthouseci/**',
      '.superpowers/**',
    ],
  },
)
