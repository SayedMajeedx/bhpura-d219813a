import { formatDuration } from "@/lib/bookings/format";

/**
 * A service's prices, as its editor shows them. A service has one fixed price
 * (one variant, any length the store allows) or a price per length (one
 * variant per length, `duration_minutes` set): the booking engine books a
 * duration-priced service at its length's variant (request_booking), and
 * everything after it (orders, tax, invoices) reads ordinary variant prices.
 * Different packages of a service (silver, gold) are separate services.
 */

export type PricingMode = "fixed" | "duration";

export type ServicePriceRow = {
  minutes: number;
  enabled: boolean;
  price: string;
  compareAt: string;
  /** The variant this length already has, if any. */
  variantId?: string;
};

export type ServicePricing = {
  mode: PricingMode;
  fixed: { price: string; compareAt: string; variantId?: string };
  rows: ServicePriceRow[];
};

type VariantLike = {
  id: string;
  selling_price: number | string | null;
  original_price?: number | string | null;
  duration_minutes?: number | null;
};

const text = (value: number | string | null | undefined) =>
  value === null || value === undefined || Number(value) === 0 ? "" : String(Number(value));

/** The editor's prices from a service's variants and the store's booking lengths. */
export function servicePricingFrom(
  variants: readonly VariantLike[],
  storeLengths: readonly number[],
): ServicePricing {
  const timed = variants.filter((variant) => typeof variant.duration_minutes === "number");
  const untimed = variants.find((variant) => typeof variant.duration_minutes !== "number");
  const lengths = [
    ...new Set([...storeLengths, ...timed.map((variant) => variant.duration_minutes as number)]),
  ].sort((a, b) => a - b);
  return {
    mode: timed.length > 0 ? "duration" : "fixed",
    fixed: {
      price: text(untimed?.selling_price),
      compareAt: text(untimed?.original_price),
      variantId: untimed?.id,
    },
    rows: lengths.map((minutes) => {
      const variant = timed.find((row) => row.duration_minutes === minutes);
      return {
        minutes,
        enabled: Boolean(variant),
        price: text(variant?.selling_price),
        compareAt: text(variant?.original_price),
        variantId: variant?.id,
      };
    }),
  };
}

const amount = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : 0;
};

/** The prices the service is offered at (its chosen lengths, or its fixed price). */
function offered(pricing: ServicePricing) {
  if (pricing.mode === "fixed") {
    return [{ minutes: null, ...pricing.fixed }];
  }
  return pricing.rows.filter((row) => row.enabled);
}

/** Why the prices can't be saved, or null. */
export function servicePricingError(pricing: ServicePricing, isAr: boolean): string | null {
  const rows = offered(pricing);
  if (rows.length === 0) {
    return isAr ? "اختر مدة واحدة على الأقل." : "Choose at least one length.";
  }
  if (rows.some((row) => amount(row.price) <= 0)) {
    return isAr ? "أدخل سعراً لكل مدة مختارة." : "Enter a price for every chosen length.";
  }
  if (rows.some((row) => row.compareAt !== "" && amount(row.compareAt) <= amount(row.price))) {
    return isAr
      ? "السعر قبل الخصم يجب أن يكون أعلى من السعر."
      : "The compare-at price must be above the price.";
  }
  return null;
}

/** The service's "from" price: its lowest offered price (the product's base price). */
export function serviceFromPrice(pricing: ServicePricing): number {
  const prices = offered(pricing)
    .map((row) => amount(row.price))
    .filter((price) => price > 0);
  return prices.length ? Math.min(...prices) : 0;
}

/**
 * What saving the prices does to the service's variants: the lengths (or the
 * fixed price) to create, the ones to update, and the variants to remove
 * (lengths no longer offered, or the other mode's variants).
 */
export function servicePricingChanges(
  pricing: ServicePricing,
  variants: readonly VariantLike[],
  isAr: boolean,
) {
  const keep = new Set<string>();
  const create: Array<{
    size: string;
    selling_price: number;
    original_price: number | null;
    duration_minutes: number | null;
  }> = [];
  const update: Array<{
    id: string;
    patch: { selling_price: number; original_price: number | null; size: string };
  }> = [];

  for (const row of offered(pricing)) {
    const values = {
      size: row.minutes ? formatDuration(row.minutes, isAr) : isAr ? "الخدمة" : "Service",
      selling_price: amount(row.price),
      original_price: row.compareAt === "" ? null : amount(row.compareAt),
    };
    if (row.variantId) {
      keep.add(row.variantId);
      update.push({ id: row.variantId, patch: values });
    } else {
      create.push({ ...values, duration_minutes: row.minutes });
    }
  }
  const remove = variants.map((variant) => variant.id).filter((id) => !keep.has(id));
  return { create, update, remove };
}
