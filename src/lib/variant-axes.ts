import { useMemo } from "react";
import { useAddons } from "@/components/addons/AddonsProvider";
import { useStorefront } from "@/lib/storefront-context";
import {
  resolveVariantAxis,
  variantAxisDefaultsFrom,
  type ProductVariantLabels,
  type VariantAxisKey,
} from "@/lib/addons/addon-registry";
import type { BrandAddonRow } from "@/lib/addons/addon-types";
import { resolveColorHex } from "@/lib/color-names";
import { formatSizeWithUnit } from "@/lib/format";
import { translateOptionValue } from "@/lib/variant-i18n";

/**
 * Variant columns are generic slots (`size`, `color`, `fabric`, `option_four`,
 * `option_five`). What each slot *means* depends on the store: for a coffee
 * roastery `color` holds the grind or roast and `size` the bag weight. Every
 * storefront surface must therefore take its labels and its swatch/chip
 * rendering from here, never from the column name.
 */

export type VariantField = "size" | "color" | "fabric" | "option_four" | "option_five";

export const VARIANT_AXIS_FIELDS: Record<VariantAxisKey, VariantField> = {
  size: "size",
  color: "color",
  fabric: "fabric",
  four: "option_four",
  five: "option_five",
};

/** Display order shared by the product page and quick view. */
export const VARIANT_AXIS_ORDER: VariantAxisKey[] = ["color", "size", "fabric", "four", "five"];

export type VariantLike = Partial<Record<VariantField, string | null>> & {
  size_unit?: string | null;
};

export type ResolvedVariantAxis = {
  key: VariantAxisKey;
  field: VariantField;
  label: string;
  /** Distinct raw values, in first-seen order. */
  values: string[];
  /** True only for a real colour axis: render round swatches instead of chips. */
  swatch: boolean;
};

const COLOR_LABEL = /(لون|ألوان|الوان|colou?r)/i;

/**
 * A slot is drawn as colour swatches only when its label actually means
 * colour *and* at least one value is a colour we can paint. "medium", "V60"
 * or "Washed" in the colour column become chips.
 */
export function isColorSwatchAxis(label: string | null | undefined, values: string[]): boolean {
  if (!label || !COLOR_LABEL.test(label)) return false;
  return values.some((value) => Boolean(resolveColorHex(value)));
}

export function uniqueAxisValues(
  variants: VariantLike[] | null | undefined,
  field: VariantField,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const variant of variants ?? []) {
    const raw = variant?.[field];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out;
}

export type AxisDefaults = ReturnType<typeof variantAxisDefaultsFrom>;

export function describeVariantAxes({
  product,
  variants,
  addonDefaults,
  lang,
}: {
  product?: ProductVariantLabels | null;
  variants: VariantLike[] | null | undefined;
  addonDefaults: AxisDefaults;
  lang: "ar" | "en";
}): ResolvedVariantAxis[] {
  return VARIANT_AXIS_ORDER.map((key) => {
    const field = VARIANT_AXIS_FIELDS[key];
    const values = uniqueAxisValues(variants, field);
    const { label } = resolveVariantAxis({
      axis: key,
      product,
      addonDefaults,
      lang,
      hasValues: values.length > 0,
    });
    return { key, field, label, values, swatch: isColorSwatchAxis(label, values) };
  }).filter((axis) => axis.values.length > 0);
}

/** Localised display text for one option value on a given axis. */
export function formatAxisValue(
  axis: Pick<ResolvedVariantAxis, "field">,
  value: string,
  lang: "ar" | "en",
  variants?: VariantLike[] | null,
): string {
  if (axis.field === "size") {
    const unit = variants?.find((v) => v.size?.trim() === value)?.size_unit;
    return formatSizeWithUnit(value, unit, lang) || value;
  }
  return translateOptionValue(value, lang) || value;
}

/** Axis defaults for this store: its vertical plus installed addon packs. */
export function storeAxisDefaults(
  addons: BrandAddonRow[] | null | undefined,
  storeVertical?: string | null,
): AxisDefaults {
  return variantAxisDefaultsFrom(addons, storeVertical);
}

export function useStoreAxisDefaults(): AxisDefaults {
  const { addons } = useAddons();
  const { settings } = useStorefront();
  const vertical = settings?.store_vertical ?? null;
  return useMemo(() => storeAxisDefaults(addons, vertical), [addons, vertical]);
}

/** Resolved, display-ready axes for one product on the storefront. */
export function useVariantAxes(
  product: (ProductVariantLabels & { product_variants?: VariantLike[] | null }) | null | undefined,
  variants?: VariantLike[] | null,
): ResolvedVariantAxis[] {
  const defaults = useStoreAxisDefaults();
  const { lang } = useStorefront();
  return useMemo(
    () =>
      describeVariantAxes({
        product,
        variants: variants ?? product?.product_variants ?? [],
        addonDefaults: defaults,
        lang: lang === "ar" ? "ar" : "en",
      }),
    [product, variants, defaults, lang],
  );
}

/**
 * Chooses the variant for a new value on one axis: keep the other current
 * choices when such a variant exists, otherwise jump to the first variant
 * carrying that value.
 */
export function pickVariantForAxis<V extends VariantLike & { id: string }>(
  variants: V[],
  current: V | null | undefined,
  field: VariantField,
  value: string,
): V | undefined {
  const same = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
  const others = (Object.values(VARIANT_AXIS_FIELDS) as VariantField[]).filter((f) => f !== field);
  return (
    variants.find(
      (v) => same(v[field], value) && others.every((f) => !current?.[f] || same(v[f], current[f])),
    ) ?? variants.find((v) => same(v[field], value))
  );
}
