import type { CustomField } from "@/features/inventory/types";
import { cleanPassportCustomFields } from "./product-form";

/**
 * Adds a customization preset (Fit Passport measurements, engraving, gift note...) to a product
 * that is already saved, the way the product editor's "Quick Preset" does for one product.
 */

export type PresetLike = { key: string; fields: unknown[] };
type PresetField = { key: string } & Partial<CustomField>;

/** The editor stamps a preset's keys as `f<time>-<n>-<key>`; this is the key the preset gave it. */
const presetKeyOf = (key: string) => key.replace(/^f\d+-\d+-/, "");

/**
 * What to write to a product to add the preset, or null when it already has all of its fields
 * (running it twice, or on a product set up by hand, adds nothing). A preset with fields makes
 * the product made to order, as it does in the editor.
 */
export function addPresetToProduct(
  product: { custom_fields: CustomField[] | null; is_made_to_order?: boolean | null },
  preset: PresetLike,
  stamp = Date.now(),
): { custom_fields: CustomField[]; is_made_to_order: boolean } | null {
  const existing = product.custom_fields ?? [];
  const have = new Set(existing.map((field) => presetKeyOf(field.key)));
  const missing = (preset.fields as PresetField[]).filter((field) => !have.has(field.key));
  if (missing.length === 0) return null;
  const added = missing.map(
    (field, index) => ({ ...field, key: `f${stamp}-${index}-${field.key}` }) as CustomField,
  );
  return {
    custom_fields: cleanPassportCustomFields([...existing, ...added]),
    is_made_to_order: preset.fields.length > 0 ? true : Boolean(product.is_made_to_order),
  };
}
