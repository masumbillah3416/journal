/**
 * eslint.config.js — lint rules enforcing CLAUDE.md §3.1's non-negotiables.
 *
 * Two tiers: a syntactic baseline (no type information required) applies to every
 * TypeScript file, including root tooling config files that sit outside any tsconfig
 * project; the stricter type-aware ruleset applies only to app/package source, which
 * `projectService` can actually resolve to a tsconfig. Depends on: typescript-eslint.
 */
import tseslint from 'typescript-eslint'

export default tseslint.config(
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
  // Generated output, never authored here. The last three are the browser and
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
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      'handoff/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'lhci-reports/**',
    ],
  },
)
