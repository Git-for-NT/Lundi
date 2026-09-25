/**
 * ESLint configuration for the server package.
 *
 * What ESLint does:
 *   ESLint performs static analysis on your source code to catch common
 *   programming errors, enforce stylistic conventions, and flag patterns
 *   that are likely to introduce bugs — all before the code ever runs.
 *
 * Why TypeScript-aware linting catches more than plain ESLint:
 *   The @typescript-eslint parser and plugin can use the TypeScript compiler's
 *   type information to power rules that are impossible with plain ESLint.
 *   For example, it can catch mismatched types in function arguments, flag
 *   variables whose inferred type is `any`, and enforce explicit return types —
 *   issues that plain JS linting cannot detect because it has no notion of types.
 *
 * Role of this config in the server package:
 *   This file configures ESLint specifically for the Node.js + Express + TypeScript
 *   backend. It enables the TypeScript parser so ESLint understands `.ts` syntax,
 *   activates the @typescript-eslint recommended ruleset as a baseline, and adds a
 *   few project-specific rules to improve code clarity and catch unused variables.
 *   The `parserOptions.project` field points ESLint at our `tsconfig.json` so that
 *   type-aware rules have access to the full type graph at lint time.
 */

'use strict';

module.exports = {
  // Use the TypeScript-aware parser instead of the default ESLint parser.
  // Without this, ESLint cannot understand TypeScript syntax (generics, decorators, etc.).
  parser: '@typescript-eslint/parser',

  parserOptions: {
    // Tell the parser where to find the TypeScript project configuration.
    // This is required for type-aware lint rules that need the compiler's type information.
    project: './tsconfig.json',

    // Resolve the project path relative to this config file's directory.
    // Using __dirname (CommonJS) makes this portable regardless of where ESLint is invoked from.
    tsconfigRootDir: __dirname,
  },

  // Load the @typescript-eslint plugin which provides all the TS-specific rules.
  plugins: ['@typescript-eslint'],

  extends: [
    // Start with ESLint's own recommended ruleset — catches obvious JS mistakes.
    'eslint:recommended',
    // Layer on the TypeScript-aware recommended rules, disabling any plain ESLint
    // rules that would conflict with TypeScript equivalents (e.g., no-unused-vars).
    'plugin:@typescript-eslint/recommended',
  ],

  env: {
    // Mark Node.js globals (process, __dirname, require, etc.) as known so ESLint
    // does not flag them as undefined variables.
    node: true,
    // Enable ES2020 globals (e.g., BigInt, globalThis) that we target in tsconfig.
    es2020: true,
  },

  rules: {
    // Warn (rather than error) when a function lacks an explicit return type annotation.
    // Using 'warn' instead of 'error' keeps the build green while still surfacing
    // places where adding a return type would improve readability and catch mistakes early.
    // Common mistake: omitting return types on async functions makes it easy to
    // accidentally return `undefined` instead of a `Promise<T>`.
    '@typescript-eslint/explicit-function-return-type': 'warn',

    // Error on variables that are declared but never used.
    // The argsIgnorePattern allows function parameters prefixed with `_` to be
    // intentionally unused (a common TypeScript convention for required-by-signature
    // but logically-unused arguments, e.g., Express middleware's `_req` parameter).
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
