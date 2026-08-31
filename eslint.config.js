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
  // project (app and package code). Config files at any depth are intentionally
  // excluded here (they still get the syntactic baseline above), because they
  // aren't included in any tsconfig and projectService has nothing to attach them to.
  {
    files: ['packages/**/*.ts', 'apps/**/*.ts'],
    ignores: ['**/*.config.ts', '**/*.config.js'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: { parserOptions: { projectService: true } },
  },
  { ignores: ['**/dist/**', '**/.next/**', 'handoff/**', 'coverage/**'] },
)
