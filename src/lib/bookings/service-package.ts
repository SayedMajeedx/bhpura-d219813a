/**
 * Packages: a service made of other services at its own price
 * (products.is_package, service_package_items; migration 20261002120000).
 * The database holds each included service's capacity when a package is
 * booked; these are the pure rules around that: the editor's lines and their
 * validation, what the services cost apart, the saving, and the price that
 * gives a chosen discount.
 */

export type PackageLine = { product_id: string; quantity: number };

export const MAX_PACKAGE_QUANTITY = 20;

/** What an included service costs, for its variants (a service priced by length at that length). */
export type PriceableService = {
  id: string;
  variants: ReadonlyArray<{
    selling_price: number | string | null;
    duration_minutes?: number | null;
  }>;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The lines as saved rows give them, in their saved order. */
export function packageLinesFrom(
  rows: ReadonlyArray<{ product_id: string; quantity: number; sort_order?: number | null }>,
): PackageLine[] {
  return [...rows]
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((row) => ({ product_id: row.product_id, quantity: row.quantity }));
}

/** Why the package can't be saved, or null. */
export function packageError(lines: readonly PackageLine[], isAr: boolean): string | null {
  if (lines.length === 0) {
    return isAr
      ? "اختر خدمة واحدة على الأقل للباقة."
      : "Choose at least one service for the package.";
  }
  if (new Set(lines.map((line) => line.product_id)).size !== lines.length) {
    return isAr ? "خدمة مكررة في الباقة." : "A service is in the package twice.";
  }
  if (
    lines.some(
      (line) =>
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > MAX_PACKAGE_QUANTITY,
    )
  ) {
    return isAr
      ? `الكمية من 1 إلى ${MAX_PACKAGE_QUANTITY}.`
      : `Quantity is 1 to ${MAX_PACKAGE_QUANTITY}.`;
  }
  return null;
}

/** One service's price at a length: the length's variant when it is priced by length, else its cheapest. */
export function servicePriceAt(service: PriceableService, minutes: number | null): number | null {
  const timed = service.variants.filter((variant) => typeof variant.duration_minutes === "number");
  const pool =
    timed.length > 0
      ? timed.filter((variant) => minutes !== null && variant.duration_minutes === minutes)
      : service.variants;
  const prices = pool.map((variant) => Number(variant.selling_price ?? 0)).filter((p) => p > 0);
  if (timed.length > 0 && minutes === null) {
    const all = timed.map((variant) => Number(variant.selling_price ?? 0)).filter((p) => p > 0);
    return all.length ? Math.min(...all) : null;
  }
  return prices.length ? Math.min(...prices) : null;
}

/**
 * What the included services cost apart at a length (null length: their "from"
 * prices). A service with no price at that length makes the sum unknown (null).
 */
export function separatePrice(
  lines: readonly PackageLine[],
  services: readonly PriceableService[],
  minutes: number | null,
): number | null {
  if (lines.length === 0) return null;
  let sum = 0;
  for (const line of lines) {
    const service = services.find((candidate) => candidate.id === line.product_id);
    const price = service ? servicePriceAt(service, minutes) : null;
    if (price === null) return null;
    sum += price * line.quantity;
  }
  return round3(sum);
}

/** What a package price saves against the services apart. */
export function packageSaving(
  separate: number | null,
  price: number,
): { amount: number; percent: number } | null {
  if (separate === null || separate <= 0 || price <= 0 || price >= separate) return null;
  return {
    amount: round3(separate - price),
    percent: Math.round(((separate - price) / separate) * 100),
  };
}

/** The package price that takes `percent` off the services apart. */
export function priceForPercentOff(separate: number, percent: number): number {
  return round3(separate * (1 - percent / 100));
}

/** The included lines in words: "Photo booth, Prints × 2". */
export function packageLinesText(
  lines: readonly PackageLine[],
  names: (productId: string) => string,
  isAr: boolean,
): string {
  return lines
    .map((line) => {
      const name = names(line.product_id);
      return line.quantity > 1 ? `${name} × ${line.quantity}` : name;
    })
    .filter(Boolean)
    .join(isAr ? "، " : ", ");
}
