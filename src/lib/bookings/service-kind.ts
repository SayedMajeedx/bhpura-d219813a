/**
 * The three kinds of thing a services store sells, so each can look like what it
 * is: a package (a service made of services), a rental (equipment hired by the
 * hour) and an ordinary service. A package is flagged on the product; a rental
 * is a product filed under a rentals category, the way merchants already keep
 * them (category `rentals`, or its Arabic name).
 */

export type ServiceKind = "package" | "rental" | "service";

const RENTAL_CATEGORY = /rental|\bhire\b|تأجير|ايجار|إيجار|ايجارات|إيجارات/i;

/** Whether a category (its slug or its name) is a rentals category. */
export function isRentalCategory(category: string | null | undefined): boolean {
  return Boolean(category) && RENTAL_CATEGORY.test(String(category));
}

/** What kind of thing a service is: a package first, then a rental by its category, else a service. */
export function serviceKindOf(product: {
  is_package?: boolean | null;
  category?: string | null;
}): ServiceKind {
  if (product.is_package) return "package";
  return isRentalCategory(product.category) ? "rental" : "service";
}

/** Services in groups, in the order a customer meets them: packages, rentals, then the rest. */
export function groupByKind<T extends { is_package?: boolean | null; category?: string | null }>(
  items: readonly T[],
): Record<ServiceKind, T[]> {
  const groups: Record<ServiceKind, T[]> = { package: [], rental: [], service: [] };
  for (const item of items) groups[serviceKindOf(item)].push(item);
  return groups;
}

export const SERVICE_KIND_LABELS: Record<
  ServiceKind,
  { ar: string; en: string; headingAr: string; headingEn: string }
> = {
  package: { ar: "باقة", en: "Package", headingAr: "الباقات", headingEn: "Packages" },
  rental: { ar: "تأجير", en: "Rental", headingAr: "خدمات التأجير", headingEn: "Rentals" },
  service: { ar: "خدمة", en: "Service", headingAr: "الخدمات", headingEn: "Services" },
};
