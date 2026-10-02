import { serviceIncludesFrom } from "@/lib/bookings/service-details";
import {
  packageSaving,
  separatePrice,
  servicePriceAt,
  type PackageLine,
  type PriceableService,
} from "@/lib/bookings/service-package";
import { extraFor, serviceDurations } from "@/features/storefront-booking/lib/booking-flow";
import type { ProductRow } from "@/lib/data/storefront";

/**
 * The home page of a services store: its services as cards, its packages as
 * offers (price before and after, the saving, what is in them). Pure rules
 * only; the components just draw what these return.
 */

/** A store whose catalog is only services: its home page is the services page. */
export function isServicesStore(bookingsOn: boolean, products: readonly ProductRow[]): boolean {
  return bookingsOn && products.length > 0 && products.every((p) => p.item_kind === "service");
}

/** The services and the packages, each in the order the store lists them. */
export function splitServices(products: readonly ProductRow[]) {
  const services = products.filter((p) => p.item_kind === "service");
  return {
    services: services.filter((p) => !p.is_package),
    packages: services.filter((p) => p.is_package),
  };
}

const asPriceable = (product: ProductRow): PriceableService => ({
  id: product.id,
  variants: product.product_variants,
});

/** The "from" price of a service, or null when it has none. */
export const fromPriceOf = (product: ProductRow): number | null =>
  servicePriceAt(asPriceable(product), null);

/** The lengths it is booked for, in minutes (empty when any length will do). */
export const lengthsOf = (product: ProductRow): number[] =>
  serviceDurations({ ...product, name: "", name_ar: null, name_en: null, image_url: null });

/** "1 hour", "90 min", "2 hours": a length as the customer reads it. */
export function minutesText(minutes: number, isAr: boolean): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    if (isAr) return hours === 1 ? "ساعة" : hours === 2 ? "ساعتان" : `${hours} ساعات`;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return isAr ? `${minutes} دقيقة` : `${minutes} min`;
}

/** "1 hour to 3 hours", or one length, or "" when it has none. */
export function lengthRangeText(product: ProductRow, isAr: boolean): string {
  const lengths = lengthsOf(product);
  if (lengths.length === 0) return "";
  const first = lengths[0];
  const last = lengths[lengths.length - 1];
  if (first === last) return minutesText(first, isAr);
  return isAr
    ? `من ${minutesText(first, true)} إلى ${minutesText(last, true)}`
    : `${minutesText(first, false)} to ${minutesText(last, false)}`;
}

/** What a service includes, as lines in the reader's language (a line in one language only shows as it is). */
export function includeLinesOf(product: ProductRow, isAr: boolean): string[] {
  return serviceIncludesFrom(product.service_includes)
    .map((line) => (isAr ? line.ar || line.en : line.en || line.ar).trim())
    .filter(Boolean);
}

/** The extra hour's price when the service can be booked longer than its longest length. */
export function extraHourPriceOf(product: ProductRow): number | null {
  const rate = Number(product.extra_hour_price ?? 0);
  return rate > 0 &&
    extraFor({ ...product, name: "", name_ar: null, name_en: null, image_url: null }, 24 * 60) > 0
    ? rate
    : null;
}

/** The pictures of a service for its details view: the cover first, then its other images (no videos), each once. */
export function serviceImages(product: ProductRow): string[] {
  const media = Array.isArray(product.media)
    ? (product.media as Array<Record<string, unknown> | null>)
    : [];
  const urls = media.flatMap((item) =>
    item && item.type !== "video" && typeof item.url === "string" ? [item.url] : [],
  );
  return [...new Set([...(product.image_url ? [product.image_url] : []), ...urls])];
}

/** What each length costs, shortest first (empty for a service not priced by length). */
export function lengthPrices(product: ProductRow): Array<{ minutes: number; price: number }> {
  return product.product_variants
    .flatMap((variant) =>
      typeof variant.duration_minutes === "number" && variant.duration_minutes > 0
        ? [{ minutes: variant.duration_minutes, price: Number(variant.selling_price) }]
        : [],
    )
    .sort((a, b) => a.minutes - b.minutes);
}

export type PackageOffer = {
  /** What the package costs (its "from" price). */
  price: number;
  /** What its services cost apart, or null when one has no price. */
  apart: number | null;
  /** What it saves, or null when it saves nothing. */
  saving: { amount: number; percent: number } | null;
  /** The included services, named for the reader, with how many. */
  includes: Array<{ id: string; name: string; quantity: number }>;
};

/** A package's offer: its price against its services apart. Null for a package with no price or no services. */
export function packageOffer(
  pkg: ProductRow,
  lines: readonly PackageLine[],
  products: readonly ProductRow[],
  nameOf: (product: ProductRow) => string,
): PackageOffer | null {
  const price = fromPriceOf(pkg);
  if (price === null || lines.length === 0) return null;
  const apart = separatePrice(lines, products.map(asPriceable), null);
  const includes = lines.flatMap((line) => {
    const service = products.find((p) => p.id === line.product_id);
    return service ? [{ id: service.id, name: nameOf(service), quantity: line.quantity }] : [];
  });
  return { price, apart, saving: packageSaving(apart, price), includes };
}
