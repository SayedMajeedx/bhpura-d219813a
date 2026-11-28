import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { friendlyError } from "@/lib/friendly-error";

export { errorText } from "@/lib/friendly-error";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * What went wrong, in the page's language: a refusal named, a person's sentence kept, else the
 * caller's `fallback` (rules in `src/lib/friendly-error.ts`). Never the system's own text: read
 * that with `errorText` when a screen names its own codes.
 */
export function getFriendlyErrorMessage(err: unknown, fallback?: string): string {
  return friendlyError(err, { fallback });
}
