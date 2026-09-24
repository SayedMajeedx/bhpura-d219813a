import { useMemo } from "react";
import { useAddons } from "@/components/addons/AddonsProvider";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import {
  resolveVariantAxis,
  variantAxisDefaultsFrom,
  type ProductVariantLabels,
  type VariantAxisConfig,
} from "@/lib/addons/addon-registry";

/**
 * Variant axis labels for this store: from the loaded addons, or from the
 * store profile's addons while the addon list is still empty.
 */
export function useInventoryAxisDefaults(brandId: string) {
  const { profile: storeProfile } = useAdminStoreProfile(brandId);
  const { addons } = useAddons();
  return useMemo(
    () => variantAxisDefaultsFrom(addons.length > 0 ? addons : storeProfile?.addons),
    [addons, storeProfile?.addons],
  );
}

export type VariantRowAxes = Record<
  "size" | "color" | "fabric" | "four" | "five",
  VariantAxisConfig
>;

/**
 * Axes for one variant row. An axis the store hides is still shown when this
 * variant has a value for it, so existing data is never invisible. Size keeps
 * the store setting as-is.
 */
export function resolveVariantRowAxes(
  product: ProductVariantLabels | null | undefined,
  addonDefaults: ReturnType<typeof variantAxisDefaultsFrom>,
  lang: "ar" | "en",
  variant: {
    color?: string | null;
    fabric?: string | null;
    option_four?: string | null;
    option_five?: string | null;
  },
): VariantRowAxes {
  const axis = (key: "size" | "color" | "fabric" | "four" | "five", value?: string | null) => {
    const raw = resolveVariantAxis({ axis: key, product, addonDefaults, lang });
    return { ...raw, visible: raw.visible || Boolean(value && value.trim()) };
  };
  return {
    size: resolveVariantAxis({ axis: "size", product, addonDefaults, lang }),
    color: axis("color", variant.color),
    fabric: axis("fabric", variant.fabric),
    four: axis("four", variant.option_four),
    five: axis("five", variant.option_five),
  };
}

/**
 * Axes for a product's whole variant list: like a single row, but an axis the
 * store hides is shown when any variant has a value for it.
 */
export function resolveVariantListAxes(
  product: ProductVariantLabels | null | undefined,
  addonDefaults: ReturnType<typeof variantAxisDefaultsFrom>,
  lang: "ar" | "en",
  variants: Array<{
    color?: string | null;
    fabric?: string | null;
    option_four?: string | null;
    option_five?: string | null;
  }>,
): VariantRowAxes {
  const firstValue = (pick: (v: (typeof variants)[number]) => string | null | undefined) =>
    variants.map(pick).find((value) => Boolean(value && value.trim()));
  return resolveVariantRowAxes(product, addonDefaults, lang, {
    color: firstValue((v) => v.color),
    fabric: firstValue((v) => v.fabric),
    option_four: firstValue((v) => v.option_four),
    option_five: firstValue((v) => v.option_five),
  });
}
