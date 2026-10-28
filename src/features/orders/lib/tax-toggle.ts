/**
 * The order editor's one-tap tax switch. It offers what the store can really do: take the tax
 * off an order that carries it, or put the store's own rate on one that does not. A store with no
 * VAT number charges none (`chargedTaxRate`), so there is nothing to put back and the switch is
 * not offered; before, it put a fixed 10% on any order.
 */

type Lang = "ar" | "en";

export type TaxToggle = { next: number; label: string } | null;

export function taxToggle(currentRate: unknown, storeRate: number, lang: Lang): TaxToggle {
  const current = Number(currentRate) || 0;
  const ar = lang === "ar";
  if (current > 0) return { next: 0, label: ar ? "إعفاء من الضريبة" : "Make tax-exempt" };
  if (storeRate > 0) {
    return {
      next: storeRate,
      label: ar ? `احتساب الضريبة (${storeRate}%)` : `Charge tax (${storeRate}%)`,
    };
  }
  return null;
}
