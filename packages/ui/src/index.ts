/**
 * packages/ui/src/index.ts — barrel export for @tax-portal/ui
 *
 * Minimal shadcn/ui-inspired primitives for this slice.
 * ADR-015: UI foundation deferred — only primitives this slice uses.
 */

export { Button, buttonVariants } from "./components/button.js";
export type { ButtonProps } from "./components/button.js";

export { Input } from "./components/input.js";
export type { InputProps } from "./components/input.js";

export { Checkbox } from "./components/checkbox.js";
export type { CheckboxProps } from "./components/checkbox.js";

export { Label } from "./components/label.js";
export type { LabelProps } from "./components/label.js";

export { cn } from "./lib/utils.js";
