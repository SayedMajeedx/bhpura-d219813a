import {
  packageSaving,
  priceForPercentOff,
  separatePrice,
  type PackageLine,
  type PriceableService,
} from "@/lib/bookings/service-package";
import type { ServicePricing } from "@/features/inventory/lib/service-pricing";

/**
 * A package's prices next to what its services cost apart: one entry per
 * offered length (or its one fixed price), for the editor's summary and its
 * "price it at N% off" shortcut.
 */

export type PackagePriceRow = {
  /** The length in minutes; null for a fixed price. */
  minutes: number | null;
  separate: number | null;
  price: number;
  saving: { amount: number; percent: number } | null;
};

const amount = (text: string) => {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function packagePriceRows(
  pricing: ServicePricing,
  lines: readonly PackageLine[],
  services: readonly PriceableService[],
): PackagePriceRow[] {
  const offered =
    pricing.mode === "fixed"
      ? [{ minutes: null as number | null, price: pricing.fixed.price }]
      : pricing.rows
          .filter((row) => row.enabled)
          .map((row) => ({ minutes: row.minutes as number | null, price: row.price }));
  return offered.map(({ minutes, price }) => {
    const separate = separatePrice(lines, services, minutes);
    return {
      minutes,
      separate,
      price: amount(price),
      saving: packageSaving(separate, amount(price)),
    };
  });
}

/**
 * The prices that take `percent` off the services apart, for every offered
 * length that can be worked out (the services' price at that length is known);
 * the services' total is kept as the compare-at price, so the saving shows.
 */
export function applyPercentOff(
  pricing: ServicePricing,
  lines: readonly PackageLine[],
  services: readonly PriceableService[],
  percent: number,
): ServicePricing {
  const priced = (minutes: number | null) => {
    const separate = separatePrice(lines, services, minutes);
    return separate === null
      ? null
      : { price: String(priceForPercentOff(separate, percent)), compareAt: String(separate) };
  };
  if (pricing.mode === "fixed") {
    const next = priced(null);
    return next ? { ...pricing, fixed: { ...pricing.fixed, ...next } } : pricing;
  }
  return {
    ...pricing,
    rows: pricing.rows.map((row) => {
      if (!row.enabled) return row;
      const next = priced(row.minutes);
      return next ? { ...row, ...next } : row;
    }),
  };
}
