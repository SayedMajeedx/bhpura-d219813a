import type { CartItem } from "@/lib/storefront-context";

export interface AddToCartProductInput {
  id: string;
  name: string;
  name_ar?: string | null;
  name_en?: string | null;
  image_url?: string | null;
  media?: any;
  base_price?: number | null;
  original_price?: number | null;
  is_made_to_order?: boolean | null;
  custom_fields?: Array<{ key: string; required?: boolean }> | null;
}

export interface AddToCartVariantInput {
  id: string;
  product_id?: string;
  selling_price?: number | null;
  original_price?: number | null;
  price?: number | null;
  stock_main?: number | null;
  stock_incubator?: number | null;
  size?: string | null;
  size_unit?: string | null;
  color?: string | null;
  fabric?: string | null;
  image_url?: string | null;
}

export interface BuildCartItemOptions {
  product: AddToCartProductInput;
  variant?: AddToCartVariantInput | null;
  qty?: number;
  customFields?: CartItem["custom_fields"];
  selectedColor?: string | null;
  selectedSize?: string | null;
}

/**
 * Checks whether a product can be added via 1-click Quick Add without custom tailoring or file uploads.
 */
export function canQuickAddToCart(
  product: AddToCartProductInput & { product_variants?: any[] | null },
): boolean {
  if (product.is_made_to_order) {
    return false;
  }
  if (Array.isArray(product.custom_fields) && product.custom_fields.length > 0) {
    // If any custom field exists, user needs PDP to fill details/notes/files
    return false;
  }
  if (Array.isArray(product.product_variants) && product.product_variants.length > 1) {
    // Multiple variants require choosing size/color first
    return false;
  }
  return true;
}

/**
 * Builds a standardized CartItem ready for addToCart() in StorefrontContext.
 */
export function buildCartItem(
  optionsOrProduct: BuildCartItemOptions | AddToCartProductInput,
  maybeVariant?: AddToCartVariantInput | null,
  maybeQty?: number,
): CartItem {
  let product: AddToCartProductInput;
  let variant: AddToCartVariantInput | null | undefined;
  let qty = 1;
  let customFields: CartItem["custom_fields"];
  let selectedColor: string | null | undefined;
  let selectedSize: string | null | undefined;

  if ("product" in optionsOrProduct) {
    product = optionsOrProduct.product;
    variant = optionsOrProduct.variant;
    qty = optionsOrProduct.qty ?? 1;
    customFields = optionsOrProduct.customFields;
    selectedColor = optionsOrProduct.selectedColor;
    selectedSize = optionsOrProduct.selectedSize;
  } else {
    product = optionsOrProduct;
    variant = maybeVariant;
    qty = maybeQty ?? 1;
  }

  // Resolve price
  const price = Number(
    variant?.selling_price ?? variant?.price ?? product.base_price ?? 0,
  );
  const rawOriginalPrice = variant?.original_price ?? product.original_price;
  const original_price =
    rawOriginalPrice && Number(rawOriginalPrice) > price ? Number(rawOriginalPrice) : null;

  // Resolve media/image
  let image = variant?.image_url || null;
  if (!image && Array.isArray(product.media)) {
    const firstImg = product.media.find((m: any) => m && m.type === "image" && m.url);
    if (firstImg) image = firstImg.url;
  }
  if (!image && product.image_url) {
    image = product.image_url;
  }

  // Resolve stock limit
  const stockMain = Number(variant?.stock_main ?? 0);
  const stockIncubator = Number(variant?.stock_incubator ?? 0);
  const max_stock = stockMain + stockIncubator > 0 ? stockMain + stockIncubator : 999;

  return {
    cart_line_id: "",
    variant_id: variant?.id ?? null,
    product_id: product.id,
    name: product.name_ar || product.name_en || product.name,
    name_ar: product.name_ar,
    name_en: product.name_en,
    image,
    price,
    original_price,
    size: variant?.size || selectedSize || null,
    size_unit: variant?.size_unit || null,
    color: variant?.color || selectedColor || null,
    fabric: variant?.fabric || null,
    qty: Math.max(1, qty),
    max_stock,
    custom_fields: customFields || [],
  };
}
