import { formatDuration } from "@/lib/bookings/format";

/**
 * Pricing a service by how long it is booked: one variant per length the
 * store offers, the shortest at the base price and each extra hour at the
 * extra-hour price. The database books such a service at the variant for the
 * booking's length (request_booking), so orders, tax and invoices work from
 * ordinary variant prices.
 */

export type DurationPriceRow = { minutes: number; price: number; exists: boolean };

/** Round to the fils (BHD and the other 3-decimal currencies). */
const fils = (amount: number) => Math.round(amount * 1000) / 1000;

export function durationPriceRows({
  lengths,
  basePrice,
  extraHourPrice,
  existingMinutes,
}: {
  /** The store's booking lengths, shortest first. */
  lengths: readonly number[];
  basePrice: number;
  extraHourPrice: number;
  /** Lengths the service already has a variant for (kept as they are). */
  existingMinutes: readonly number[];
}): DurationPriceRow[] {
  if (lengths.length === 0) return [];
  const shortest = lengths[0];
  return lengths.map((minutes) => ({
    minutes,
    price: fils(basePrice + ((minutes - shortest) / 60) * extraHourPrice),
    exists: existingMinutes.includes(minutes),
  }));
}

/** The variants to create: the lengths without one yet, labelled in the store's language. */
export function durationVariants(
  productId: string,
  rows: readonly DurationPriceRow[],
  isAr: boolean,
) {
  return rows
    .filter((row) => !row.exists)
    .map((row) => ({
      product_id: productId,
      size: formatDuration(row.minutes, isAr),
      selling_price: row.price,
      duration_minutes: row.minutes,
    }));
}
