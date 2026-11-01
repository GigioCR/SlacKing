import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

// The dependency rule from docs/architecture.md: dependencies point inward only.
// domain -> nothing; application -> domain; infrastructure -> application + domain.
const frameworks = ['next', 'next/*', 'react', 'react-dom', 'react-dom/*', 'web-push', 'pg', 'otpauth', 'qrcode', 'node:*']

export default defineConfig([
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'public/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain Node scripts outside the app, including the Claude Code hook.
    files: ['scripts/**/*.mjs', 'hook/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        AbortSignal: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*', '@/*', ...frameworks],
              message: 'The domain layer imports nothing but its own files.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**', '**/app/**', '@/*', ...frameworks],
              message: 'The application layer may import only the domain and its own ports.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/app/**', '@/*', 'next', 'next/*', 'react', 'react-dom', 'react-dom/*'],
              message: 'Infrastructure must not depend on the delivery layer.',
            },
          ],
        },
      ],
    },
  },
])
