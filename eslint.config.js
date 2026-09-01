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
    },
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
  { ignores: ['**/dist/**', '**/.next/**', 'handoff/**', 'coverage/**'] },
)
