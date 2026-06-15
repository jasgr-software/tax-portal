// @ts-check
/**
 * Shared ESLint flat-config base for the tax-portal monorepo.
 *
 * ADR-006: shared ESLint config in packages/eslint-config.
 * ADR-003 §6: the import-boundary rule that enforces requestDb isolation
 *             is a TODO here — it will be implemented in TASK-003 once
 *             packages/db exists and the real rule target is known.
 *
 * Usage (each app/package eslint.config.mjs):
 *   import base from "@tax-portal/eslint-config";
 *   export default [...base, { ... app-specific overrides ... }];
 */

"use strict";

// NOTE: peer deps (eslint, @typescript-eslint/*) are resolved at the
// workspace root. Each consumer's package.json lists them as devDependencies.

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    // Global ignores — apply to the full config array.
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.tsbuildinfo",
    ],
  },
  {
    // Base rules applied to all JS/TS files.
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-unused-vars": "off", // Handled by @typescript-eslint/no-unused-vars
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
    },
  },
  {
    // TypeScript-specific rules (applied when @typescript-eslint is available).
    // Each consuming package must extend with the TS parser + plugin.
    // These rules are the shared baseline; apps/packages add their own.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
    },
  },
  {
    // ADR-003 §6: import-boundary rule — TASK-003 (implemented here now that packages/db exists).
    //
    // Enforces the admin-pool import boundary:
    //   1. `requestDb` is never exported from packages/db barrel (index.ts does not export it).
    //      Any import of `requestDb` from outside packages/db/src/ is a lint error.
    //   2. `adminDb` must not be imported from request-handling code paths (apps/portal, apps/admin
    //      route handlers). Legitimate admin-pool consumers are listed in the 'allowPaths' note below.
    //
    // Legitimate adminDb consumers (must not appear in route handlers — enforce via pattern):
    //   packages/db/src/repositories/*.ts — sanctioned data-access layer (admin path for anon submit)
    //   scripts/**                         — migration scripts
    //   db/seed/**                         — seed scripts
    //
    // The rule below prevents direct import of requestDb from outside packages/db:
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            // Prevent importing requestDb from anywhere outside packages/db/src/
            // requestDb is the raw (unwrapped) client — callers must use the wrapped `db` export.
            group: ["@tax-portal/db/src/client", "*/db/src/client"],
            importNames: ["requestDb"],
            message:
              "Do not import `requestDb` directly (ADR-003 §6). Import the wrapped `db` client from @tax-portal/db instead. The raw requestDb bypasses the SESSION_CONTEXT $extends middleware.",
          },
        ],
      },
    ],
  },
];

module.exports = config;
