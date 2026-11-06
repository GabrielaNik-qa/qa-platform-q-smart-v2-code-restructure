// The automatic code checks for v2. Today's app (current-app/) keeps its own checks.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  // .claude/: the working folders of other Claude sessions (each a separate copy of the project)
  {
    ignores: [
      'current-app/**',
      'docs/**',
      'notes/**',
      '.claude/**',
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // NestJS modules are decorated classes that may hold only static parts
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
];
