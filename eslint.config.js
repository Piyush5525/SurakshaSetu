import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      'functions/lib/**',
      '**/node_modules/**',
      '3-auto-cv/**',
      '.emulator-data/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['{1-sticker-app,2-user-report-site,packages}/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['2-user-report-site/public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['functions/**/*.ts', 'scripts/**/*.{ts,mjs}'],
    languageOptions: { globals: globals.node },
  },
);
