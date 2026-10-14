import { currencyScale } from "@/features/settings/tabs/orders/advance-templates";
import { DEFAULT_LOYALTY_TIERS, type LoyaltyTier } from "@/lib/loyalty.types";

/**
 * What the loyalty page says about a store's programme, from what the database holds.
 *
 * A store has no programme until its settings are saved (`brand_loyalty_programs`), and the
 * database then gives no points: the page once read a missing row as on (`is_enabled ?? true`),
 * so it said «مفعّل» to every store while no customer earned a point (found 2026-10-14).
 */
export type LoyaltyProgramState = "not_set_up" | "on" | "off";

export function loyaltyProgramState(
  program: { is_enabled?: boolean | null } | null | undefined,
): LoyaltyProgramState {
  if (!program) return "not_set_up";
  return program.is_enabled === false ? "off" : "on";
}

/**
 * The tiers a store starts from, in its own currency: the spend each needs is scaled the way the
 * advance-payment templates scale their amounts, free shipping is a perk only of a store that
 * ships, and a tier promises nothing the system does not do (no discount, no written perks: the
 * multiplier and free shipping are shown from the tier itself). Spend alone qualifies.
 */
export function starterLoyaltyTiers(
  currency: string | null | undefined,
  ships: boolean,
): Omit<LoyaltyTier, "id" | "brand_id" | "created_at" | "updated_at">[] {
  const scale = currencyScale(currency);
  const round = (value: number) => (value >= 20 ? Math.round(value / 5) * 5 : Math.round(value));
  return DEFAULT_LOYALTY_TIERS.map((tier) => ({
    ...tier,
    min_spend: round(Number(tier.min_spend) * scale),
    min_points: 0,
    discount_percent: 0,
    free_shipping: ships && tier.free_shipping,
    perks_ar: [],
    perks_en: [],
  }));
}

export type LoyaltyMember = {
  customerId: string;
  name: string;
  phone: string | null;
  available: number;
  held: number;
  lifetime: number;
  tierKey: string;
};

/**
 * The programme's members as the page lists them: the most points first, then the name; a search
 * matches the name or the phone (spaces and a leading + ignored).
 */
export function loyaltyMembers(
  rows: readonly {
    customer_id: string;
    active_points: number | null;
    pending_points: number | null;
    lifetime_points: number | null;
    current_tier_key: string | null;
    customers: { name: string | null; phone: string | null } | null;
  }[],
  search = "",
): LoyaltyMember[] {
  const digits = (value: string) => value.replace(/[\s+]/g, "");
  const query = search.trim().toLowerCase();
  return rows
    .map((row) => ({
      customerId: row.customer_id,
      name: row.customers?.name?.trim() || "",
      phone: row.customers?.phone ?? null,
      available: row.active_points ?? 0,
      held: row.pending_points ?? 0,
      lifetime: row.lifetime_points ?? 0,
      tierKey: row.current_tier_key || "bronze",
    }))
    .filter(
      (member) =>
        !query ||
        member.name.toLowerCase().includes(query) ||
        (member.phone ? digits(member.phone).includes(digits(query)) : false),
    )
    .sort(
      (a, b) => b.available + b.held - (a.available + a.held) || a.name.localeCompare(b.name, "ar"),
    );
}

/**
 * The tier a shopper's account page names, or null: only a programme that is on, an account the
 * shopper has, and a tier the store saved. The page once worked out its own ("Gold VIP" from 350
 * spent) beside the store's real tiers.
 */
export function shopperLoyaltyTier<T extends { tier_key: string }>(
  program: { is_enabled?: boolean | null } | null | undefined,
  account: { current_tier_key?: string | null } | null | undefined,
  tiers: readonly T[],
): T | null {
  if (loyaltyProgramState(program) !== "on" || !account || tiers.length === 0) return null;
  return tiers.find((tier) => tier.tier_key === (account.current_tier_key || "bronze")) ?? null;
}
