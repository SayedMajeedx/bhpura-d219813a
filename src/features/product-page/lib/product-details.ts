import { occasionLabel } from "@/lib/product-occasion";

/**
 * The product page's details section (`ProductAccordion`): what this product is (its own fields,
 * named in the store's words) and how to look after it (the store's text). It says only what is
 * written: the section once printed every fashion product "hand wash cold or dry clean" when
 * the store wrote nothing, and titled a store-wide text "Fragrance Notes" as if it were the
 * product's.
 */

export type DetailLine = { label: string; value: string };

/** The product's own details, in the order a shopper reads them. */
export function productDetailLines({
  fabricType,
  fabricLabel,
  occasion,
  lang,
}: {
  fabricType?: string | null;
  /** The store's own word for the fabric axis (a roastery's is the process). */
  fabricLabel: string;
  occasion?: string | null;
  lang: "ar" | "en";
}): DetailLine[] {
  const lines: DetailLine[] = [];
  const fabric = (fabricType ?? "").trim();
  if (fabric) lines.push({ label: fabricLabel, value: fabric });
  const suits = occasionLabel(occasion, lang);
  if (suits) lines.push({ label: lang === "ar" ? "المناسبة" : "Occasion", value: suits });
  return lines;
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
