import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';

const compat = new FlatCompat({ baseDirectory: path.dirname(fileURLToPath(import.meta.url)) });

export default tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', 'drizzle/**', '.pglite/**', '.storage/**', '.test-data/**', 'next-env.d.ts'],
  },

  // Next.js rules (accessibility, image and script usage, hook correctness).
  ...compat.extends('next/core-web-vitals'),

  ...tseslint.configs.recommended,

  {
    rules: {
      // Unused arguments prefixed with _ are intentional (action signatures).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // The codebase uses `unknown` plus narrowing rather than `any`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      'no-console': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },

  {
    // Scripts are operator tools: writing to stdout is their purpose.
    files: ['scripts/**/*.ts', 'tests/**/*.ts', 'netlify/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
);
