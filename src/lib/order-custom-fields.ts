import { translateOptionValue } from "@/lib/variant-i18n";

/**
 * How an order line's answered field (a measurement, a note, a file) reads on the order page,
 * the invoice, the job sheet and the printed label. Lines written from the admin before
 * 2026-10-24 put "Passport — " before every measurement's name; they read as the name alone.
 */
export type OrderCustomField = {
  key?: string | null;
  label_ar?: string | null;
  label_en?: string | null;
  value?: string | null;
};

const OLD_PREFIX = /^\s*(?:fit\s+)?passport\s*[—–-]\s*/i;
const MEASUREMENT = /^(\s*\d+(?:[.,]\d+)?)\s*(in|cm)\s*$/i;

export function customFieldLabel(
  field: Pick<OrderCustomField, "key" | "label_ar" | "label_en">,
  lang: "ar" | "en",
): string {
  const label = lang === "ar" ? field.label_ar || field.label_en : field.label_en || field.label_ar;
  return (label ?? "").replace(OLD_PREFIX, "").trim() || field.key || "";
}

/** A measurement ("34 in") keeps its unit, in the reader's words ("34 إنش"). */
export function customFieldValue(field: OrderCustomField, lang: "ar" | "en"): string {
  const value = field.value ?? "";
  if (lang !== "ar") return value;
  return value.replace(
    MEASUREMENT,
    (_, n: string, unit: string) => `${n.trim()} ${unit.toLowerCase() === "cm" ? "سم" : "إنش"}`,
  );
}

/** Words as a reader sees them: the alef's forms, a closing ة or ى and vowel marks do not count. */
function plainWords(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim()
    .toLowerCase();
}

/** The same value, as written or in the store's own two words for it (أسود and Black). */
function sameOption(a: unknown, b: unknown): boolean {
  if (plainWords(a) === plainWords(b)) return true;
  const inEnglish = (value: unknown) => plainWords(translateOptionValue(String(value ?? ""), "en"));
  return inEnglish(a) === inEnglish(b);
}

type ShownAxis = { label: string; visible: boolean };

/**
 * A line's answers, less those that only repeat an option the line already prints. A product whose
 * own field asks "Colour" as well as its colour option printed "Colour: اسود" and "Colour: أسود"
 * on one line. Only the same name with the same value goes: "Length - Size: 54" stays under
 * "Size: 54", and an answer that differs from the option stays, since it says something new.
 */
export function withoutRepeatedOptions<
  F extends Pick<OrderCustomField, "key" | "label_ar" | "label_en"> & { value?: unknown },
>(
  fields: readonly F[],
  chosen: { color?: unknown; size?: unknown; fabric?: unknown } | null | undefined,
  axes: { color: ShownAxis; size: ShownAxis; fabric: ShownAxis },
  lang: "ar" | "en",
): F[] {
  const printed = (["color", "size", "fabric"] as const).flatMap((axis) =>
    chosen?.[axis] && axes[axis].visible
      ? [{ label: plainWords(axes[axis].label), value: chosen[axis] }]
      : [],
  );
  return fields.filter((field) => {
    const label = plainWords(customFieldLabel(field, lang));
    return !printed.some(
      (option) => option.label === label && sameOption(option.value, field.value),
    );
  });
}
