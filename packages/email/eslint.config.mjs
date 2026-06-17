// packages/email/eslint.config.mjs
// ADR-006: apps/packages use shared eslint-config from packages/eslint-config

import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import base from "@tax-portal/eslint-config";

export default [
  ...base,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
  },
];
