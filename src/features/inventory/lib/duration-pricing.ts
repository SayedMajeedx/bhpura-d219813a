/**
 * Filling a service's prices by length (its editor's "Fill prices"): the
 * shortest length at the base price and each extra hour at the extra-hour
 * price. The database books such a service at the variant for the
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
