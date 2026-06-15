// @ts-check
// apps/admin/eslint.config.mjs — ESLint flat config for the Tax Portal (admin)
// ADR-006: ESLint 9 flat config; TypeScript-aware rules; mirrors apps/portal/eslint.config.mjs.
// Note: @tax-portal/eslint-config uses module.exports (CJS); shared rules inlined here
// matching the portal pattern until flat-config migration of the shared package.

import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    // Global ignores
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
    ],
  },
  {
    // TypeScript source files
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
    rules: {
      // Base rules
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-unused-vars": "off",
      "prefer-const": "error",
      "eqeqeq": ["error", "always", { null: "ignore" }],
      "no-var": "error",

      // TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      // Note: no-floating-promises and await-thenable require type-aware linting
      // which is wired in via parserOptions.project above.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",

      // ADR-003 §6: prevent direct requestDb import
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@tax-portal/db/src/client", "*/db/src/client"],
              importNames: ["requestDb"],
              message:
                "Do not import `requestDb` directly (ADR-003 §6). Use the wrapped `db` client from @tax-portal/db.",
            },
          ],
        },
      ],
    },
  },
];
