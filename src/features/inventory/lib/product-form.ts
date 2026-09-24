import { PLACEHOLDER_SIZE_VALUES } from "@/lib/variant-sku-utils";
import type { CustomField, MediaItem, Product } from "@/features/inventory/types";

/**
 * Rules for the product editor: the form's starting values, validation, the
 * product columns saved from it, and the default variant a product gets when
 * it has none.
 */

export function productFormFrom(product: Product | null) {
  return {
    name_ar: product?.name_ar ?? "",
    name_en: product?.name_en ?? product?.name ?? "",
    description_ar: product?.description_ar ?? "",
    description_en: product?.description_en ?? product?.description ?? "",
    category: product?.category ?? "",
    base_price: product?.base_price ? String(product.base_price) : "0",
    cost_price: product?.cost_price ? String(product.cost_price) : "0",
    image_url: product?.image_url ?? "",
    is_active: product ? product.is_active : true,
    initial_stock: "0",
    featured_trending: product?.featured_trending ?? false,
    show_sale_badge: product?.show_sale_badge ?? true,
    media: (product?.media ?? []) as MediaItem[],
    custom_fields: (Array.isArray(product?.custom_fields)
      ? product!.custom_fields
      : []) as CustomField[],
    variant_label_size_ar: product?.variant_label_size_ar ?? "",
    variant_label_size_en: product?.variant_label_size_en ?? "",
    variant_label_color_ar: product?.variant_label_color_ar ?? "",
    variant_label_color_en: product?.variant_label_color_en ?? "",
    variant_label_fabric_ar: product?.variant_label_fabric_ar ?? "",
    variant_label_fabric_en: product?.variant_label_fabric_en ?? "",
    variant_label_four_ar: product?.variant_label_four_ar ?? "",
    variant_label_four_en: product?.variant_label_four_en ?? "",
    variant_label_five_ar: product?.variant_label_five_ar ?? "",
    variant_label_five_en: product?.variant_label_five_en ?? "",
    fabric_type: product?.fabric_type ?? "",
    occasion: product?.occasion ?? "",
    size_guide_id: product?.size_guide_id ?? null,
    size_guide_hidden: product?.size_guide_hidden ?? false,
    is_made_to_order: product?.is_made_to_order ?? false,
  };
}

export type ProductForm = ReturnType<typeof productFormFrom>;
export type ProductFormErrors = { name?: string; price?: string; cost?: string };
export type ProductDialogTab = "basic" | "media" | "customizer";

/** Option axes four and five start open when the product already names them. */
export function hasExtraAxisLabels(product: Product | null): boolean {
  return Boolean(
    product?.variant_label_four_ar ||
    product?.variant_label_four_en ||
    product?.variant_label_five_ar ||
    product?.variant_label_five_en,
  );
}

/** A name in either language, a price of 0 or more, and an empty or non-negative cost. */
export function validateProductForm(form: ProductForm, isAr: boolean): ProductFormErrors {
  const nameAr = form.name_ar.trim();
  const nameEn = form.name_en.trim();
  const basePrice = form.base_price.trim();

  const newErrors: ProductFormErrors = {};

  if (!nameAr && !nameEn) {
    newErrors.name = isAr
      ? "يجب إدخال اسم المنتج (بالعربية أو الإنجليزية)"
      : "Product name is required (Arabic or English)";
  }

  if (!basePrice || isNaN(Number(basePrice)) || Number(basePrice) < 0) {
    newErrors.price = isAr
      ? "يجب إدخال سعر صحيح أكبر من أو يساوي الصفر"
      : "A valid price greater than or equal to 0 is required";
  }
  if (form.cost_price.trim() && (isNaN(Number(form.cost_price)) || Number(form.cost_price) < 0)) {
    newErrors.cost = isAr
      ? "أدخل تكلفة صحيحة غير سالبة أو اترك الحقل فارغاً"
      : "Enter a valid non-negative cost or leave empty";
  }
  return newErrors;
}

/** The first image in the gallery, else the legacy image URL. */
export function primaryImageUrl(form: ProductForm): string | null {
  const primaryMediaImage = form.media.find((m) => m.type === "image" || !m.type)?.url;
  return primaryMediaImage || (form.image_url.trim() ? form.image_url.trim() : null);
}

/**
 * Kept as the single place to strip fit-passport fields before saving; it
 * currently returns them unchanged.
 */
export function cleanPassportCustomFields(fields: CustomField[]) {
  return fields;
}

/**
 * Product columns saved from the form, for both create and update. The legacy
 * `name`/`description` columns take the English value, else the Arabic one.
 */
export function productColumnsFrom(form: ProductForm) {
  const nameAr = form.name_ar.trim();
  const nameEn = form.name_en.trim();
  return {
    name: nameEn || nameAr,
    name_ar: nameAr || null,
    name_en: nameEn || null,
    description: form.description_en.trim() || form.description_ar.trim() || null,
    description_ar: form.description_ar.trim() || null,
    description_en: form.description_en.trim() || null,
    category: form.category && form.category.trim() !== "" ? form.category.trim() : null,
    base_price: form.base_price ? Number(form.base_price) : 0,
    // TODO (Tech Debt / Financial Reporting): Currently defaults to 0 due to database NOT NULL constraint.
    // In a future migration, alter column to nullable to distinguish between 'unknown cost' (null) and 'zero cost' (0),
    // preventing false 100% gross profit margins on financial reports/expenses screens.
    cost_price: form.cost_price ? Number(form.cost_price) : 0,
    image_url: primaryImageUrl(form),
    is_active: form.is_active,
    featured_trending: form.featured_trending,
    show_sale_badge: form.show_sale_badge,
    media: form.media,
    custom_fields: cleanPassportCustomFields(form.custom_fields ?? []),
    variant_label_size_ar: (form.variant_label_size_ar || "").trim() || null,
    variant_label_size_en: (form.variant_label_size_en || "").trim() || null,
    variant_label_color_ar: (form.variant_label_color_ar || "").trim() || null,
    variant_label_color_en: (form.variant_label_color_en || "").trim() || null,
    variant_label_fabric_ar: (form.variant_label_fabric_ar || "").trim() || null,
    variant_label_fabric_en: (form.variant_label_fabric_en || "").trim() || null,
    variant_label_four_ar: (form.variant_label_four_ar || "").trim() || null,
    variant_label_four_en: (form.variant_label_four_en || "").trim() || null,
    variant_label_five_ar: (form.variant_label_five_ar || "").trim() || null,
    variant_label_five_en: (form.variant_label_five_en || "").trim() || null,
    fabric_type: (form.fabric_type || "").trim() || null,
    occasion: (form.occasion || "").trim() || null,
    size_guide_id: form.size_guide_hidden ? null : form.size_guide_id || null,
    size_guide_hidden: Boolean(form.size_guide_hidden),
    is_made_to_order: Boolean(form.is_made_to_order),
  };
}

/**
 * The standard variant created for a product with none, so it can be sold
 * right away: placeholder size, the form's price, cost, fabric and opening stock.
 */
export function defaultVariantValues(form: ProductForm, isAr: boolean) {
  const initialQty = Math.max(0, parseInt(form.initial_stock || "0", 10) || 0);
  const baseP = form.base_price ? Number(form.base_price) : 0;
  const costP = form.cost_price ? Number(form.cost_price) : 0;
  return {
    size: isAr ? PLACEHOLDER_SIZE_VALUES[0] : PLACEHOLDER_SIZE_VALUES[1],
    color: null,
    fabric: (form.fabric_type || "").trim() || null,
    cost_price: costP,
    selling_price: baseP,
    stock_main: initialQty,
    stock_incubator: 0,
    stock: initialQty,
    sku: null,
    barcode: null,
    image_url: primaryImageUrl(form) || null,
  };
}
