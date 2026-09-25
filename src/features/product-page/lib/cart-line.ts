import type { useStorefront } from "@/lib/storefront-context";
import { formatPrice } from "@/lib/storefront-context";
import type { useVocabulary } from "@/hooks/use-vocabulary";
import { formatCustomField } from "@/lib/addons/custom-fields";
import { isPlaceholderVariant } from "@/lib/variant-sku-utils";
import type {
  fetchCustomizationOptions,
  StorefrontProductDetail as Product,
  StorefrontVariant as Variant,
} from "@/lib/data/storefront";
import type { CustomField, PdpMediaItem } from "@/features/product-page/types";
import { parsePriceDelta } from "@/features/product-page/lib/variant-options";

/**
 * Pure rules for "Add to cart" on the product page: what blocks it, which
 * variant is added, and the cart line (options, customizations, add-ons,
 * tailoring notes, size label and stock cap).
 */

type Storefront = ReturnType<typeof useStorefront>;

/**
 * Why the current choice cannot go in the cart, or null. With the ready/custom
 * toggle: ready needs an in-stock size, custom needs measurements and required
 * fields. Without it: an in-stock option (unless the product is custom-only),
 * measurements when tailoring, and required fields.
 */
export function productSelectionError({
  showSizeModeToggle,
  sizeMode,
  hasVariants,
  variant,
  hasMeasurementFields,
  measurementsApplied,
  visibleCustomFields,
  cfValues,
  hasCustomFields,
  uniqueSizes,
  isTailoringActive,
  cfLabel,
  t,
}: {
  showSizeModeToggle: boolean;
  sizeMode: "ready" | "custom";
  hasVariants: boolean;
  variant: Variant | null | undefined;
  hasMeasurementFields: boolean;
  measurementsApplied: boolean;
  visibleCustomFields: CustomField[];
  cfValues: Record<string, string>;
  hasCustomFields: boolean;
  uniqueSizes: string[];
  isTailoringActive: boolean;
  cfLabel: (f: CustomField) => string;
  t: Storefront["t"];
}): string | null {
  if (showSizeModeToggle) {
    if (sizeMode === "ready") {
      if (hasVariants && !variant) {
        return t("يرجى اختيار مقاس جاهز أولاً", "Please select a ready size first");
      }
      if (variant && Number(variant.stock_main || 0) + Number(variant.stock_incubator || 0) <= 0) {
        return t("هذا المقاس غير متوفر حالياً", "This size is out of stock");
      }
    } else {
      if (hasMeasurementFields && !measurementsApplied) {
        return t(
          "يرجى تطبيق المقاسات المطلوبة لإكمال الطلب",
          "Please apply the required measurements to continue",
        );
      }
      for (const f of visibleCustomFields) {
        if (f.required && !(cfValues[f.key] ?? "").trim()) {
          return t(`الحقل مطلوب: ${cfLabel(f)}`, `Required field: ${cfLabel(f)}`);
        }
      }
    }
  } else {
    const isPureCustom = hasCustomFields && uniqueSizes.length === 0;
    if (!isPureCustom) {
      if (hasVariants && !variant) {
        return t("يرجى اختيار مقاس/خيار أولاً", "Please select a size or option first");
      }
      if (variant && Number(variant.stock_main || 0) + Number(variant.stock_incubator || 0) <= 0) {
        return t("هذا الخيار غير متوفر حالياً", "This option is out of stock");
      }
    }
    if (isTailoringActive && hasMeasurementFields && !measurementsApplied) {
      return t(
        "يرجى تطبيق المقاسات المطلوبة لإكمال الطلب",
        "Please apply the required measurements to continue",
      );
    }
    for (const f of visibleCustomFields) {
      if (f.required && !(cfValues[f.key] ?? "").trim()) {
        return t(`الحقل مطلوب: ${cfLabel(f)}`, `Required field: ${cfLabel(f)}`);
      }
    }
  }
  return null;
}

/** Made-to-order lines fall back to the closest variant so the order keeps a product row. */
export function cartTargetVariant({
  isTailoringActive,
  variant,
  matchingVariants,
  variants,
  selectedColor,
}: {
  isTailoringActive: boolean;
  variant: Variant | null | undefined;
  matchingVariants: Variant[];
  variants: Variant[];
  selectedColor: string | null;
}): Variant | null | undefined {
  return isTailoringActive
    ? variant ||
        matchingVariants[0] ||
        variants.find((v) => !selectedColor || v.color === selectedColor) ||
        variants[0] ||
        null
    : variant;
}

/** The cart line for the current choice (the caller has already validated it). */
export function productCartLine({
  showSizeModeToggle,
  sizeMode,
  visibleCustomFields,
  cfValues,
  measurementsApplied,
  isMeasurementField,
  lang,
  applicableAddons,
  selectedAddonIds,
  currency,
  t,
  tailoringNotes,
  vocabulary,
  targetVariant,
  isTailoringActive,
  product,
  displayName,
  media,
  displayPrice,
  originalPriceWithAddons,
  selectedColor,
  selectedFabric,
  selectedOptionFour,
  selectedOptionFive,
  qty,
}: {
  showSizeModeToggle: boolean;
  sizeMode: "ready" | "custom";
  visibleCustomFields: CustomField[];
  cfValues: Record<string, string>;
  measurementsApplied: boolean;
  isMeasurementField: (key: string) => boolean;
  lang: Storefront["lang"];
  applicableAddons: Awaited<ReturnType<typeof fetchCustomizationOptions>>;
  selectedAddonIds: string[];
  currency: string;
  t: Storefront["t"];
  tailoringNotes: string;
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
  targetVariant: Variant | null | undefined;
  isTailoringActive: boolean;
  product: Product;
  displayName: string;
  media: PdpMediaItem[];
  displayPrice: number;
  originalPriceWithAddons: number;
  selectedColor: string | null;
  selectedFabric: string | null;
  selectedOptionFour: string | null;
  selectedOptionFive: string | null;
  qty: number;
}) {
  const activeCustomFields = showSizeModeToggle && sizeMode === "ready" ? [] : visibleCustomFields;
  const custom = activeCustomFields
    .map((f) => {
      const val = (cfValues[f.key] ?? "").trim();
      const price_delta = parsePriceDelta(val);
      return {
        key: f.key,
        label_ar: f.label_ar,
        label_en: f.label_en,
        value: val,
        type: f.type,
        price_delta,
      };
    })
    .filter((v) => v.value.length > 0);

  if (measurementsApplied) {
    Object.entries(cfValues).forEach(([k, v]) => {
      if (isMeasurementField(k) && v && !custom.some((c) => c.key === k)) {
        const fmtAr = formatCustomField({ key: k, value: String(v) }, "ar");
        const fmtEn = formatCustomField({ key: k, value: String(v) }, "en");
        if (fmtAr && fmtEn) {
          custom.push({
            key: k,
            label_ar: fmtAr.label,
            label_en: fmtEn.label,
            value: lang === "ar" ? fmtAr.value : fmtEn.value,
            type: "text",
            price_delta: 0,
          });
        }
      }
    });
  }

  const chosenAddons = applicableAddons.filter((a: any) => selectedAddonIds.includes(a.id));
  for (const addon of chosenAddons) {
    const delta = Number(addon.price_delta || 0);
    custom.push({
      key: `addon_${addon.id}`,
      label_ar: addon.name,
      label_en: addon.name,
      value: delta > 0 ? `+ ${formatPrice(delta, currency, lang)}` : t("مجاني", "Free"),
      type: "select",
      price_delta: delta,
    });
  }

  if (tailoringNotes.trim()) {
    custom.push({
      key: "tailoring_notes",
      label_ar:
        vocabulary.workshop_notes_label?.[lang] ||
        (lang === "ar" ? "ملاحظات وتفاصيل التجهيز" : "Production & Workshop Notes"),
      label_en:
        vocabulary.workshop_notes_label?.[lang] ||
        (lang === "ar" ? "ملاحظات وتفاصيل التجهيز" : "Production & Workshop Notes"),
      value: tailoringNotes.trim(),
      type: "text",
      price_delta: 0,
    });
  }

  const fileField = activeCustomFields.find((f) => f.type === "file");
  const file_url = fileField ? (cfValues[fileField.key] ?? "").trim() : "";
  const textField = activeCustomFields.find((f) => f.type === "text");
  const custom_text = textField ? (cfValues[textField.key] ?? "").trim() : "";

  const selected_customizations = {
    options: custom.map((c) => ({
      name: lang === "ar" ? c.label_ar || c.label_en : c.label_en || c.label_ar,
      value: c.value,
      price_delta: c.price_delta,
    })),
    custom_text: tailoringNotes.trim() || custom_text,
    file_url,
  };

  const effectiveSize =
    showSizeModeToggle && sizeMode === "custom"
      ? vocabulary.custom_sizing?.[lang] || t("قياسات خاصة / حسب الطلب", "Custom Sizing")
      : targetVariant?.size && !isPlaceholderVariant(targetVariant)
        ? targetVariant.size
        : isTailoringActive
          ? vocabulary.custom_sizing?.[lang] ||
            vocabulary.custom_order?.[lang] ||
            t("حسب الطلب", "Made to order")
          : targetVariant?.size || null;

  return {
    cart_line_id: "",
    variant_id: targetVariant?.id ?? null,
    product_id: product.id,
    name: displayName,
    name_ar: product.name_ar,
    name_en: product.name_en,
    image:
      targetVariant?.image_url ||
      media.find((m) => m.type === "image")?.url ||
      product.image_url ||
      null,
    price: displayPrice,
    original_price: originalPriceWithAddons > displayPrice ? originalPriceWithAddons : null,
    size: effectiveSize,
    size_unit: targetVariant?.size_unit || null,
    color: targetVariant?.color || selectedColor || null,
    fabric: targetVariant?.fabric || selectedFabric || null,
    option_four: targetVariant?.option_four || selectedOptionFour || null,
    option_five: targetVariant?.option_five || selectedOptionFive || null,
    qty,
    max_stock: isTailoringActive
      ? 999
      : Number(targetVariant?.stock_main ?? 0) + Number(targetVariant?.stock_incubator ?? 0) || 999,
    custom_fields: custom,
    selected_customizations,
  };
}
