/**
 * ESLint configuration for the client package.
 *
 * What ESLint does for a React + TypeScript project:
 *   ESLint performs static analysis on your source code to catch common
 *   programming errors, enforce stylistic conventions, and flag patterns
 *   that are likely to introduce bugs — all before the code ever runs.
 *   In a React + TypeScript project, this means catching misused hooks,
 *   missing effect dependencies, incorrect JSX patterns, and type-related
 *   issues that plain JavaScript linting cannot detect.
 *
 * Why react/react-in-jsx-scope is turned off:
 *   Older versions of React required `import React from 'react'` at the top
 *   of every JSX file so the JSX transform could call `React.createElement`.
 *   Since React 17, the new JSX transform (enabled by `jsx: react-jsx` in
 *   tsconfig.json) automatically imports the necessary runtime — you no
 *   longer need to import React just to write JSX. Disabling this rule
 *   prevents false positives on files that legitimately omit the import.
 *
 * Why React version is detected automatically:
 *   The `react/recommended` ruleset needs to know which React version is
 *   installed so it can apply version-appropriate rules (e.g., some APIs
 *   are only available in certain versions). Setting `version: 'detect'`
 *   reads the installed version from node_modules at lint time, keeping
 *   this config in sync with package.json without a manual version bump.
 *
 * Role of react-hooks/recommended:
 *   This plugin enforces the Rules of Hooks (hooks may only be called at
 *   the top level and only from React functions) and, crucially, the
 *   exhaustive-deps rule — which catches missing dependencies in useEffect,
 *   useCallback, and useMemo. Stale-closure bugs from missing deps are one
 *   of the most common and confusing React mistakes; this rule surfaces them
 *   at lint time before they cause subtle runtime issues.
 */

'use strict';

module.exports = {
  // Use the TypeScript-aware parser instead of the default ESLint parser.
  // Without this, ESLint cannot understand TypeScript syntax (generics, type
  // annotations, decorators, etc.) and will error on valid .ts/.tsx files.
  parser: '@typescript-eslint/parser',

  parserOptions: {
    // Tell the parser where to find the TypeScript project configuration.
    // This is required for type-aware lint rules that need the compiler's
    // type information (e.g., detecting unsafe `any` assignments).
    project: './tsconfig.json',

    // Resolve the project path relative to this config file's directory.
    // Using __dirname (CommonJS) makes this portable regardless of where
    // ESLint is invoked from (e.g., root vs client/ working directory).
    tsconfigRootDir: __dirname,
  },

  // Load all three plugins: TypeScript-specific rules, React component rules,
  // and React Hooks enforcement rules.
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],

  extends: [
    // Start with ESLint's own recommended ruleset — catches obvious JS mistakes.
    'eslint:recommended',
    // Layer on the TypeScript-aware recommended rules, disabling plain ESLint
    // rules that conflict with TypeScript equivalents (e.g., no-unused-vars
    // is replaced by @typescript-eslint/no-unused-vars).
    'plugin:@typescript-eslint/recommended',
    // Add React-specific rules: correct JSX usage, prop-types patterns (though
    // TypeScript largely replaces prop-types), and component best practices.
    'plugin:react/recommended',
    // Add Rules of Hooks enforcement and exhaustive-deps checking for hooks
    // that accept dependency arrays (useEffect, useCallback, useMemo, etc.).
    'plugin:react-hooks/recommended',
  ],

  settings: {
    react: {
      // Automatically read the installed React version from node_modules so
      // react/recommended rules apply version-appropriate checks without
      // requiring a manual version string here.
      version: 'detect',
    },
  },

  env: {
    // Mark browser globals (window, document, fetch, sessionStorage, etc.)
    // as known so ESLint does not flag them as undefined variables.
    browser: true,
    // Enable ES2020 globals (e.g., globalThis, BigInt, Promise.allSettled)
    // that we target in tsconfig.json.
    es2020: true,
  },

  rules: {
    // Turn off the requirement to import React in scope for JSX.
    // The new JSX transform (`jsx: react-jsx` in tsconfig.json) handles
    // the runtime import automatically — keeping this rule on would produce
    // spurious errors on every JSX file that correctly omits the import.
    'react/react-in-jsx-scope': 'off',

    // Warn (rather than error) when a function lacks an explicit return type
    // annotation. 'warn' keeps the build green while still surfacing places
    // where an explicit type would catch mistakes earlier. Common oversight:
    // async functions without return types silently return `Promise<any>`.
    '@typescript-eslint/explicit-function-return-type': 'warn',

    // Error on variables that are declared but never used.
    // argsIgnorePattern allows function parameters prefixed with `_` to be
    // intentionally unused — a common TypeScript convention for arguments
    // that are required by a callback signature but not needed in the body
    // (e.g., an event handler that only needs the second argument).
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
