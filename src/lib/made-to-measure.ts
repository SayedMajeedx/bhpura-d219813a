import { realSize } from "@/lib/default-variant";

/**
 * A piece made to the customer's measurements has no size (migration `20261118100000`, the
 * owner's report of 2026-11-04: a made-to-measure order read "Size 56" everywhere). The database
 * holds it on every order line (`order_items_made_to_measure`); these are its twins for the
 * screens, the printed pages and the messages, and the one reading of a line's answers.
 */

/** The storefront's own mark on a line the shopper had made to their measurements. */
export const MADE_TO_MEASURE_KEY = "made_to_measure";

/** The answers a customer writes in their own words for the workshop. */
export const NOTE_KEYS: ReadonlySet<string> = new Set(["tailoring_notes", "custom_measurements"]);

const META = /_(unit|version|profile)$/;

/**
 * Whether an answer on a line is a measurement (or the mark): the twin of the database's
 * `order_line_measurement_key`. What a measurement is in, which profile and which version are
 * not measurements.
 */
export function isMeasurementKey(key: string | null | undefined): boolean {
  if (!key) return false;
  if (key === MADE_TO_MEASURE_KEY) return true;
  const named =
    key.startsWith("fit_") ||
    key === "custom_measurements" ||
    key.includes("measurement") ||
    key.startsWith("sizing_") ||
    key.includes("passport");
  return named && !META.test(key);
}

/** Bookkeeping kept with the measurements, shown to nobody: the mark, the unit, the version. */
export function isHiddenField(key: string | null | undefined): boolean {
  const k = (key ?? "").trim().toLowerCase();
  return k === MADE_TO_MEASURE_KEY || k.endsWith("_unit") || k.endsWith("_version");
}

type Field = { key?: string | null; value?: unknown };
type Line = {
  location?: string | null;
  selected_variant?: { size?: string | null; made_to_measure?: boolean | null } | null;
  custom_field_values?: readonly Field[] | null;
};

const filled = (value: unknown) => String(value ?? "").trim() !== "";

/**
 * Made to the customer's measurements: the database said so, or (a line not saved yet, or one the
 * public invoice reads without the mark) it is made to order and carries a measurement. The twin
 * of `order_line_made_to_measure`.
 */
export function madeToMeasure(line: Line | null | undefined): boolean {
  if (!line) return false;
  if (line.selected_variant?.made_to_measure === true) return true;
  return (
    line.location === "custom" &&
    (line.custom_field_values ?? []).some((f) => isMeasurementKey(f?.key) && filled(f?.value))
  );
}

/**
 * The size to name for a line, if any: never one for a piece made to measure (not even the size
 * its catalogue variant has), and never the default variant's word.
 */
export function lineSize(line: Line | null | undefined, fallback?: string | null): string | null {
  if (madeToMeasure(line)) return null;
  return realSize(line?.selected_variant?.size ?? fallback ?? null);
}

/**
 * A line's text without the line that names its size ("Size: 56"), for a piece made to measure:
 * the order editor writes a product's options under its name.
 */
export function withoutSizeLine(text: string, size: string | null | undefined): string {
  const named = String(size ?? "").trim();
  if (!named) return text;
  const escaped = named.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sizeLine = new RegExp(`^[^:\\n]{1,40}:\\s*${escaped}\\s*$`);
  return text
    .split("\n")
    .filter((line, i) => i === 0 || !sizeLine.test(line.trim()))
    .join("\n");
}

/**
 * A line's answers, in the order a reader wants them: the measurements and the other answers as
 * rows, then what the customer wrote for the workshop as notes, kept as they were written. The
 * bookkeeping is left out.
 */
export function lineFields<F extends Field>(values: readonly F[] | null | undefined) {
  const shown = (values ?? []).filter((f) => !isHiddenField(f?.key) && filled(f?.value));
  return {
    rows: shown.filter((f) => !NOTE_KEYS.has(String(f.key ?? ""))),
    notes: shown
      .filter((f) => NOTE_KEYS.has(String(f.key ?? "")))
      .map((f) => String(f.value ?? "").trim()),
  };
}

/** What a size reads for a piece made to measure, in the reader's language. */
export function madeToMeasureLabel(lang: "ar" | "en"): string {
  return lang === "ar" ? "حسب المقاس" : "Made to measure";
}

/** A line's text as an invoice prints it: a piece made to measure without its size line. */
export function lineDescription(text: string, line: Line | null | undefined): string {
  return madeToMeasure(line) ? withoutSizeLine(text, line?.selected_variant?.size) : text;
}

/** What a line's size reads ("56", "Made to measure"), or null when it names none. */
export function lineSizeText(
  line: Line | null | undefined,
  lang: "ar" | "en",
  fallback?: string | null,
): string | null {
  return madeToMeasure(line) ? madeToMeasureLabel(lang) : lineSize(line, fallback);
}
