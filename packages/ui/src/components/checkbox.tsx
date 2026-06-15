/**
 * packages/ui/src/components/checkbox.tsx
 *
 * Minimal Checkbox primitive — native HTML checkbox with consistent styling.
 * ADR-015: UI foundation deferred — keep to slice-needed primitives only.
 */

import * as React from "react";
import { cn } from "../lib/utils.js";

export interface CheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <label
        htmlFor={id}
        className="flex items-start gap-3 cursor-pointer group"
      >
        <input
          type="checkbox"
          id={id}
          ref={ref}
          className={cn(
            "mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600",
            "focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        {label && (
          <span className="text-sm text-gray-700 group-hover:text-gray-900">
            {label}
          </span>
        )}
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
