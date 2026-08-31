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
    files: ['packages/**/*.ts', 'apps/**/*.ts', 'apps/**/*.tsx'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: { parserOptions: { projectService: true } },
  },
  { ignores: ['**/dist/**', '**/.next/**', 'handoff/**', 'coverage/**'] },
)
