import type { CartItem } from "@/lib/storefront-context";

/**
 * A cart line's identity: the same variant, size, colour, fabric and filled custom fields are
 * one line (adding it again adds to its quantity).
 */
export function cartLineId(
  item: Pick<CartItem, "variant_id" | "size" | "color" | "fabric" | "custom_fields" | "tailored">,
): string {
  const fields = [...(item.custom_fields ?? [])]
    .map((field) => ({ key: field.key, value: field.value }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return JSON.stringify({
    variant: item.variant_id,
    size: item.size ?? "",
    color: item.color ?? "",
    fabric: item.fabric ?? "",
    fields,
    // Only a ready size on a made-to-order product adds to the id, so every other line keeps the
    // id it already had (a saved cart's lines still merge with the same item added again).
    ...(item.tailored === false ? { ready: true } : {}),
  });
}
