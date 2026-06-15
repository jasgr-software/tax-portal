/**
 * packages/ui/src/components/label.tsx
 *
 * Minimal Label primitive.
 * ADR-015: UI foundation deferred — keep to slice-needed primitives only.
 */

import * as React from "react";
import { cn } from "../lib/utils.js";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          "block text-sm font-medium text-gray-700",
          className,
        )}
        {...props}
      />
    );
  },
);
Label.displayName = "Label";

export { Label };
