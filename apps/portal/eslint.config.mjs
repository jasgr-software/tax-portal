// @ts-check
// apps/portal/eslint.config.mjs — ESLint flat config for the Client Portal
// ADR-006: ESLint 9 flat config; TypeScript-aware rules; Next.js app-specific overrides.
// Note: @tax-portal/eslint-config uses module.exports (CJS) and is compatible via
// the pnpm require-interop. The shared base rules are inlined here to avoid the
// flat-config migration issue in the shared package (to be addressed separately).

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
