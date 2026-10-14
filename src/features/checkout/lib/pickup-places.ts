import type { CartItem } from "@/lib/storefront-context";
import type { PickupPartner, PickupPartners } from "@/lib/data/checkout";

export type { PickupPartner, PickupPartners };

/**
 * Where a shopper can collect an order: the store's branches, and the partners' shops that hold
 * every piece of the cart (the database decides which, storefront_pickup_partners). Partners do
 * not use the system: the store arranges the pickup with them by hand.
 */

/**
 * The cart as the database reads it: each line's piece and quantity, and whether it is made to
 * order (a booked service, a made-to-order product not taken in a ready size, or a line with no
 * piece of the catalog): such a line is made at the store, never collected at a partner.
 */
export function pickupCartItems(cart: readonly CartItem[], madeToOrderIds: ReadonlySet<string>) {
  return cart.map((item) => ({
    variant_id: item.variant_id?.trim() || null,
    quantity: Math.max(1, Math.floor(Number(item.qty) || 1)),
    made_to_order:
      !item.variant_id?.trim() ||
      Boolean(item.booking) ||
      (madeToOrderIds.has(item.product_id) && item.tailored !== false),
  }));
}

/**
 * The store's branches a cart can be collected at. When a partner holds every piece and the
 * store's own stock does not cover the cart, the pieces are at the partner: the partner is the
 * place, and the branch is not offered (it was, so a shopper could choose a branch the piece was
 * never at). A cart no single partner holds whole is collected at a branch, the pieces brought
 * there first (the owner's choice; `branchPickupNote`).
 */
export function pickupBranchesOffered<T>(branches: readonly T[], info: PickupPartners): T[] {
  return info.from_partner && info.partners.length > 0 ? [] : [...branches];
}

const arabicDays = (n: number) =>
  n === 1 ? "يوم واحد" : n === 2 ? "يومين" : n <= 10 ? `${n} أيام` : `${n} يوماً`;

/**
 * What a shopper reads under the store's branch when some pieces are at a partner's shop: they
 * are brought to the branch first. A time is said only when the store wrote one for the partner.
 */
export function branchPickupNote(info: PickupPartners, lang: "ar" | "en"): string | null {
  if (!info.from_partner) return null;
  const days = info.transfer_days;
  if (lang === "ar") {
    return days && days > 0
      ? `بعض قطع طلبك عند محل شريك، ونجلبها للفرع خلال ${arabicDays(days)} قبل استلامك.`
      : "بعض قطع طلبك عند محل شريك، ونجلبها للفرع قبل استلامك.";
  }
  return days && days > 0
    ? `Some of your pieces are at a partner's shop: we bring them to the branch within ${days} ${days === 1 ? "day" : "days"} before you collect.`
    : "Some of your pieces are at a partner's shop: we bring them to the branch before you collect.";
}

/** A partner's address and notes in the shopper's language, falling back to the other one. */
export function partnerPickupText(partner: PickupPartner, lang: "ar" | "en") {
  const pick = (ar: string | null, en: string | null) =>
    (lang === "ar" ? ar || en : en || ar)?.trim() || null;
  return {
    address: pick(partner.address_ar, partner.address_en),
    notes: pick(partner.notes_ar, partner.notes_en),
  };
}
