import { isLowStock, isOutOfStock } from "@/lib/inventory-health";

/**
 * Whether and how a product can be bought: the one rule every surface reads (the inventory
 * list and its tabs, the dashboard, the order editor's product search, exports and the
 * storefront), so they can never disagree again.
 *
 * A product is sold in up to two ways, each with its own availability:
 *   - ready: pieces in stock (the store plus the incubator), per variant;
 *   - made to order: made when it is ordered, so ready stock does not limit it.
 * A service is neither: it has no stock at all.
 *
 * So zero ready stock means "out of stock" only for a product that is sold from stock. A
 * made-to-order piece with no ready stock is "made to order", not "out of stock".
 */

export type AvailabilityProduct = {
  is_made_to_order?: boolean | null;
  item_kind?: string | null;
};

export type AvailabilityVariant = {
  stock_main?: number | string | null;
  stock_incubator?: number | string | null;
};

export type AvailabilityStatus =
  /** A service: nothing to count. */
  | "service"
  /** Made when ordered; ready stock (if any) is extra. */
  | "made_to_order"
  | "available"
  | "low"
  | "out";

export type ProductAvailability = {
  status: AvailabilityStatus;
  /** Ready pieces across the product's variants (store plus incubator). */
  readyUnits: number;
  madeToOrder: boolean;
  /** A shopper can buy it now. */
  sellable: boolean;
  /** Ready stock is what decides whether it can be bought (false for made to order and services). */
  soldFromStock: boolean;
};

/**
 * Ready pieces across variants: the store plus the incubator. A variant never counts below
 * zero, so one bad figure cannot hide another variant's stock.
 */
export function readyUnitsOf(variants: readonly AvailabilityVariant[] | null | undefined): number {
  return (variants ?? []).reduce(
    (sum, variant) =>
      sum + Math.max(0, Number(variant.stock_main || 0) + Number(variant.stock_incubator || 0)),
    0,
  );
}

/** Whether ready stock is what decides if the product can be bought. */
export function isSoldFromStock(product: AvailabilityProduct): boolean {
  return !product.is_made_to_order && product.item_kind !== "service";
}

/**
 * The product's availability from its ready pieces. `expectedWeeklySales` only sharpens "low"
 * (stock that will not last the week), as on the inventory list.
 */
export function productAvailability(
  product: AvailabilityProduct,
  readyUnits: number,
  expectedWeeklySales = 0,
): ProductAvailability {
  const units = Math.max(0, Number(readyUnits) || 0);
  if (product.item_kind === "service") {
    return {
      status: "service",
      readyUnits: 0,
      madeToOrder: true,
      sellable: true,
      soldFromStock: false,
    };
  }
  if (product.is_made_to_order) {
    return {
      status: "made_to_order",
      readyUnits: units,
      madeToOrder: true,
      sellable: true,
      soldFromStock: false,
    };
  }
  const status: AvailabilityStatus = isOutOfStock(units)
    ? "out"
    : isLowStock(units, expectedWeeklySales)
      ? "low"
      : "available";
  return {
    status,
    readyUnits: units,
    madeToOrder: false,
    sellable: status !== "out",
    soldFromStock: true,
  };
}

/** The same, straight from the product's variants. */
export function availabilityOf(
  product: AvailabilityProduct,
  variants: readonly AvailabilityVariant[] | null | undefined,
  expectedWeeklySales = 0,
): ProductAvailability {
  return productAvailability(product, readyUnitsOf(variants), expectedWeeklySales);
}

export type AvailabilityTone = "out" | "low" | "ok" | "made_to_order" | "service";

/**
 * What a list shows for the product's stock: one headline (out of stock, N left, N available,
 * made to order) and, for a made-to-order piece that also has ready sizes, how many are ready.
 * `madeToOrder` is the store's own word ("Tailoring", "Made to order").
 */
export function availabilityBadge(
  availability: ProductAvailability,
  lang: "ar" | "en",
  labels: {
    unitsLabel: (units: number, kind: "low" | "available") => string;
    madeToOrder?: string;
  },
): { tone: AvailabilityTone; label: string; detail: string | null } {
  const isAr = lang === "ar";
  switch (availability.status) {
    case "service":
      return { tone: "service", label: isAr ? "خدمة" : "Service", detail: null };
    case "made_to_order":
      return {
        tone: "made_to_order",
        label: labels.madeToOrder || (isAr ? "حسب الطلب" : "Made to order"),
        detail:
          availability.readyUnits > 0
            ? isAr
              ? `جاهز: ${availability.readyUnits}`
              : `Ready: ${availability.readyUnits}`
            : null,
      };
    case "out":
      return { tone: "out", label: isAr ? "نفذت الكمية" : "Out of Stock", detail: null };
    case "low":
      return {
        tone: "low",
        label: labels.unitsLabel(availability.readyUnits, "low"),
        detail: null,
      };
    default:
      return {
        tone: "ok",
        label: labels.unitsLabel(availability.readyUnits, "available"),
        detail: null,
      };
  }
}
