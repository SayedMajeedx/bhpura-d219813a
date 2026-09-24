import { splitCompositeVariantSize } from "@/lib/format";

/** What the inline attribute editor holds while the admin types (empty string = unset). */
export type VariantAttributeDraft = {
  size: string;
  sizeUnit: string;
  color: string;
  fabric: string;
  optionFour: string;
  optionFive: string;
};

type VariantAttributes = {
  size: string | null;
  size_unit: string | null;
  color: string | null;
  fabric: string | null;
  option_four?: string | null;
  option_five?: string | null;
};

export function attributeDraftFrom(variant: VariantAttributes): VariantAttributeDraft {
  return {
    size: variant.size ?? "",
    sizeUnit: variant.size_unit ?? "",
    color: variant.color ?? "",
    fabric: variant.fabric ?? "",
    optionFour: variant.option_four ?? "",
    optionFive: variant.option_five ?? "",
  };
}

/**
 * The patch to save. A composite size typed without a colour ("700 g - classic")
 * is split into size, unit and the option it carries (stored as colour).
 */
export function normalizeAttributeDraft(draft: VariantAttributeDraft): Required<VariantAttributes> {
  const split = splitCompositeVariantSize(draft.size, draft.sizeUnit);
  let size = draft.size || null;
  let unit = draft.sizeUnit || null;
  let color = draft.color || null;
  if (split.isComposite && !color) {
    size = split.size;
    unit = split.unit;
    color = split.option;
  }
  return {
    size,
    size_unit: unit,
    color,
    fabric: draft.fabric || null,
    option_four: draft.optionFour || null,
    option_five: draft.optionFive || null,
  };
}
