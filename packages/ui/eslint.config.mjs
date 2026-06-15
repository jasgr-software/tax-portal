// @ts-check
// packages/ui/eslint.config.mjs — ESLint flat config for @tax-portal/ui
// ADR-006: shared base from @tax-portal/eslint-config

import base from "@tax-portal/eslint-config";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...base,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
  },
  {
    ignores: ["node_modules/**", "dist/**"],
  },
];
