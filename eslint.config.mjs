import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import next from '@next/eslint-plugin-next';
import a11y from 'eslint-plugin-jsx-a11y';
import hooks from 'eslint-plugin-react-hooks';
import { fileURLToPath } from 'node:url';

export const tokenGuard = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { raw: 'Use a design token instead of a raw hex colour.' },
  },
  create(context) {
    const inspect = (node, value) => {
      if (typeof value === 'string' && /#[\da-f]{3,8}\b/i.test(value))
        context.report({ node, messageId: 'raw' });
    };
    return {
      Literal(node) {
        inspect(node, node.value);
      },
      TemplateElement(node) {
        inspect(node, node.value.raw);
      },
      JSXText(node) {
        inspect(node, node.value);
      },
    };
  },
};
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.next-preview/**',
      '**/next-env.d.ts',
      '**/dist/**',
      '.agents/**',
      '.codex/**',
      'test-results/**',
      'playwright-report/**',
      '.mock-data/**',
    ],
  },
  js.configs.recommended,
  {
    plugins: { '@next/next': next },
    settings: {
      next: { rootDir: fileURLToPath(new URL('./apps/web/', import.meta.url)) },
    },
  },
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        WebSocket: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-warning-comments': [
        'error',
        { terms: ['@ts-ignore'], location: 'anywhere' },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { '@next/next': next, 'jsx-a11y': a11y, 'react-hooks': hooks },
    rules: {
      ...next.configs.recommended.rules,
      ...a11y.configs.strict.rules,
      ...hooks.configs.recommended.rules,
    },
  },
  {
    files: ['apps/web/src/components/**/*.{ts,tsx}'],
    plugins: { kimo: { rules: { 'tokens-only': tokenGuard } } },
    rules: { 'kimo/tokens-only': 'error' },
  },
);
