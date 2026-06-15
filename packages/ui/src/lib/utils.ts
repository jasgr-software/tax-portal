/**
 * packages/ui/src/lib/utils.ts
 *
 * Utility for merging Tailwind class names.
 * Equivalent to shadcn/ui's cn() helper.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
