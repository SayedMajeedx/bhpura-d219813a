/**
 * The variant details an order line keeps: size, colour and fabric only (and whether it is made
 * to measure).
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
  /** Made to the customer's measurements (migration `20261118100000`): the line has no size. */
  made_to_measure?: true;
};

export function variantSpecs(value: unknown): VariantSpecs | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as {
    size?: unknown;
    color?: unknown;
    fabric?: unknown;
    made_to_measure?: unknown;
  };
  const text = (x: unknown) => (typeof x === "string" ? x : x == null ? null : String(x));
  return {
    size: text(v.size),
    color: text(v.color),
    fabric: text(v.fabric),
    ...(v.made_to_measure === true ? { made_to_measure: true as const } : {}),
  };
}
