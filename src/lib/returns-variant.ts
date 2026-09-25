import { displayVariantParts } from "@/lib/variant-sku-utils";

type LabelledVariant = {
  sku?: string | null;
  size?: string | null;
  size_unit?: string | null;
  color?: string | null;
  fabric?: string | null;
  option_four?: string | null;
  option_five?: string | null;
};

/**
 * How the returns screens name a variant: its option values ("M / Black"),
 * translated like everywhere else, or its SKU when it has no options. Null when
 * it has neither, so each screen keeps its own fallback text.
 */
export function returnVariantLabel(
  variant: LabelledVariant | null | undefined,
  lang: "ar" | "en",
): string | null {
  if (!variant) return null;
  const parts = displayVariantParts(variant, lang);
  if (parts.length > 0) return parts.join(" / ");
  return variant.sku?.trim() || null;
}
