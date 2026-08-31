import tseslint from 'typescript-eslint'

export default tseslint.config(
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': 'error',
    },
  },
  // Root tooling config files aren't part of any tsconfig project, so typed-linting
  // rules can't parse them (projectService has nothing to attach them to). They are
  // config, not application code, so they're excluded rather than given a project.
  { ignores: ['**/dist/**', '**/.next/**', 'handoff/**', 'coverage/**', '*.config.js', '*.config.ts'] },
)
