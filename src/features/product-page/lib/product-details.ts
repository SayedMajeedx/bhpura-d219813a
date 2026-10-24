import { occasionLabel } from "@/lib/product-occasion";
import { factLines, factSet, type FactLayout } from "@/lib/product-facts";

/**
 * The product page's details section (`ProductAccordion`): what this product is (its own fields,
 * named in the store's words) and how to look after it (the store's text). It says only what is
 * written: the section once printed every fashion product "hand wash cold or dry clean" when
 * the store wrote nothing, and titled a store-wide text "Fragrance Notes" as if it were the
 * product's.
 */

export type DetailLine = {
  /** A fact's key (`product-facts.ts`); the fabric and occasion have their own. */
  key: string;
  label: string;
  value: string;
  /** A list's items (notes, allergens), drawn one by one. */
  items?: string[];
};

/** The product's own details, in the order a shopper reads them. */
export function productDetailLines({
  fabricType,
  fabricLabel,
  occasion,
  facts,
  vertical,
  lang,
}: {
  fabricType?: string | null;
  /** The store's own word for the fabric axis (a roastery's is the process). */
  fabricLabel: string;
  occasion?: string | null;
  /** The product's facts (`products.details`), read by the store's vertical. */
  facts?: unknown;
  vertical?: string | null;
  lang: "ar" | "en";
}): DetailLine[] {
  const lines: DetailLine[] = [];
  const fabric = (fabricType ?? "").trim();
  if (fabric) lines.push({ key: "fabric_type", label: fabricLabel, value: fabric });
  const suits = occasionLabel(occasion, lang);
  if (suits) {
    lines.push({ key: "occasion", label: lang === "ar" ? "المناسبة" : "Occasion", value: suits });
  }
  return [...lines, ...factLines(facts, vertical, lang)];
}

/** A perfume's notes, top to base: drawn as its pyramid. */
export const NOTE_KEYS = ["top_notes", "heart_notes", "base_notes"] as const;

/**
 * How the lines are drawn for the store's kind: a perfume's notes as a pyramid, a food's
 * allergens as a note of their own (a shopper looks for them first), the rest as a table.
 */
export function detailGroups(
  lines: DetailLine[],
  vertical: string | null | undefined,
): { layout: FactLayout; notes: DetailLine[]; allergens: DetailLine | null; rest: DetailLine[] } {
  const { layout } = factSet(vertical);
  const isNote = (line: DetailLine) =>
    layout === "notes" && (NOTE_KEYS as readonly string[]).includes(line.key);
  const isAllergens = (line: DetailLine) => layout === "allergens" && line.key === "allergens";
  return {
    layout,
    notes: lines.filter(isNote),
    allergens: lines.find(isAllergens) ?? null,
    rest: lines.filter((line) => !isNote(line) && !isAllergens(line)),
  };
}

export type DetailsSection = { title: string; lines: DetailLine[]; care: string | null };

/**
 * The section, or nothing when there is nothing to say. Its title names what it holds: the
 * product's details, the store's care text, or both.
 */
export function detailsSection({
  lines,
  careText,
  specsLabel,
  careLabel,
}: {
  lines: DetailLine[];
  careText?: string | null;
  specsLabel: string;
  careLabel: string;
}): DetailsSection | null {
  const care = (careText ?? "").trim() || null;
  if (lines.length === 0 && !care) return null;
  const title =
    lines.length > 0 && care
      ? `${specsLabel} · ${careLabel}`
      : lines.length > 0
        ? specsLabel
        : careLabel;
  return { title, lines, care };
}
