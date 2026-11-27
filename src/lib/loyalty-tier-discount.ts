/**
 * A loyalty tier's discount at checkout: the twin of the order builder's step
 * (`apply_store_offers` with `member_tier_discount`, migration 20261227100000), run against it by
 * `tests/loyalty-tier-discount-migration.test.ts`.
 *
 * The signed-in member gets the larger of their tier's percentage of the cart and what the promo
 * code and the store's offers take off together, never both (the owner's decision of
 * 2026-11-27). When the tier saves more it replaces them: the code is left unused, and a
 * free-delivery offer still stands (it is not a part of the discount).
 */

const fils = (n: number) => Math.round(Math.max(0, n) * 1000 + Number.EPSILON) / 1000;

export type TierDiscountOutcome = { code: number; offers: number; tier: number };

export function memberTierDiscount({
  subtotal,
  percent,
  code,
  offers,
}: {
  /** The cart's lines, before a gift's own lines (no discount reaches those). */
  subtotal: number;
  /** The member's tier discount, in percent (0: none). */
  percent: number;
  /** What the promo code takes off. */
  code: number;
  /** What the store's offers take off. */
  offers: number;
}): TierDiscountOutcome {
  const pct = Math.min(Math.max(Number(percent) || 0, 0), 100);
  const tier = pct > 0 ? fils((Math.max(subtotal, 0) * pct) / 100) : 0;
  if (tier > code + offers) return { code: 0, offers: 0, tier };
  return { code, offers, tier: 0 };
}

/** The summary's words for the member's discount: "Gold member (10%)", "عضوية ذهبي (10٪)". */
export function tierDiscountLabel(
  tier: { name_ar?: string | null; name_en?: string | null } | null | undefined,
  percent: number,
  lang: "ar" | "en",
): string {
  const pct = Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
  if (lang === "ar") {
    const name = tier?.name_ar || tier?.name_en;
    return name ? `خصم عضوية ${name} (${pct}٪)` : `خصم العضوية (${pct}٪)`;
  }
  const name = tier?.name_en || tier?.name_ar;
  return name ? `${name} member discount (${pct}%)` : `Member discount (${pct}%)`;
}

/** A tier's discount as a perk: "خصم 10٪ على كل طلب", "10% off every order" (null: none). */
export function tierDiscountPerk(percent: unknown, lang: "ar" | "en"): string | null {
  const value = Number(percent);
  if (!(value > 0)) return null;
  const pct = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return lang === "ar" ? `خصم ${pct}٪ على كل طلب` : `${pct}% off every order`;
}
