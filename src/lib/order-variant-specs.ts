/**
 * The variant details an order line keeps: size, colour and fabric only.
 *
 * `order_items.selected_variant` is shown on invoices and receipts, including
 * the public invoice link, so it must never carry a whole `product_variants`
 * row (cost price, stock, barcode...). Every writer and the public reader pass
 * values through here.
 */
export type VariantSpecs = {
  size: string | null;
  color: string | null;
  fabric: string | null;
};

export function variantSpecs(value: unknown): VariantSpecs | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as { size?: unknown; color?: unknown; fabric?: unknown };
  const text = (x: unknown) => (typeof x === "string" ? x : x == null ? null : String(x));
  return { size: text(v.size), color: text(v.color), fabric: text(v.fabric) };
}
