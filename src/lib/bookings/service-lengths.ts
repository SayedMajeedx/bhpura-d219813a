import { formatDuration } from "@/lib/bookings/format";

/**
 * A service's booking lengths in a few words for cards and its page:
 * "3 hours", "3–8 hours" / "3–8 ساعات", or null when it is not priced by length.
 */
export function serviceLengthsText(
  variants: ReadonlyArray<{ duration_minutes?: number | null }>,
  isAr: boolean,
): string | null {
  const minutes = variants
    .map((variant) => variant.duration_minutes)
    .filter((value): value is number => typeof value === "number" && value > 0)
    .sort((a, b) => a - b);
  if (minutes.length === 0) return null;
  const shortest = minutes[0];
  const longest = minutes[minutes.length - 1];
  if (shortest === longest) return formatDuration(shortest, isAr);
  // Whole hours read as a range of hours ("3–8 hours"); anything else as two lengths.
  if (shortest % 60 === 0 && longest % 60 === 0 && longest > 120) {
    const range = `${shortest / 60}–${longest / 60}`;
    if (!isAr) return `${range} hours`;
    // A range of digits in an Arabic line is its own left-to-right run, or the dash between two
    // numbers turns them round ("3–8" showed as "8–3"); the noun agrees with the larger number
    // ("3–8 ساعات", "3–12 ساعة").
    return `\u2066${range}\u2069 ${longest / 60 <= 10 ? "ساعات" : "ساعة"}`;
  }
  return `${formatDuration(shortest, isAr)} – ${formatDuration(longest, isAr)}`;
}
