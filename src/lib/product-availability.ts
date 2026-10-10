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
 *
 * A store may limit how many pieces of a product it can still make
 * (`products.made_to_order_available`: null is no limit, a number is the pieces left), and may
 * pause making it for a while (`made_to_order_paused_at`). At zero, or while paused, the product
 * is not made to order: its ready pieces, if it has any, are all that is left to buy. The
 * database enforces the same when an order is placed (migrations 20261010110000, 20261010120000).
 */

export type AvailabilityProduct = {
  is_made_to_order?: boolean | null;
  item_kind?: string | null;
  /** Pieces that can still be made to order: null (or absent) is no limit. */
  made_to_order_available?: number | string | null;
  /** When the store paused making it to order (null or absent: not paused). */
  made_to_order_paused_at?: string | null;
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
  /** Pieces that can still be made to order; null when there is no limit (or it is not made to order). */
  madeToOrderLeft: number | null;
  /** A made-to-order product that cannot be ordered made to order now (limit used up, or paused). */
  madeToOrderClosed: boolean;
  /** The store paused making it to order. */
  madeToOrderPaused: boolean;
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

/**
 * How a made-to-order product stands: `left` is the pieces that can still be made (null: no
 * limit), `paused` that the store has paused making it, and `closed` that it cannot be ordered
 * made to order now (none left, or paused). A product that is not made to order has none.
 */
export function madeToOrderLimit(product: AvailabilityProduct | null | undefined): {
  left: number | null;
  paused: boolean;
  closed: boolean;
} {
  if (!product?.is_made_to_order) return { left: null, paused: false, closed: false };
  const raw = product.made_to_order_available;
  const left =
    raw === null || raw === undefined || raw === ""
      ? null
      : Math.max(0, Math.floor(Number(raw) || 0));
  const paused = Boolean(product.made_to_order_paused_at);
  return { left, paused, closed: paused || left === 0 };
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
      madeToOrderLeft: null,
      madeToOrderClosed: false,
      madeToOrderPaused: false,
      sellable: true,
      soldFromStock: false,
    };
  }
  const limit = madeToOrderLimit(product);
  if (product.is_made_to_order && !limit.closed) {
    return {
      status: "made_to_order",
      readyUnits: units,
      madeToOrder: true,
      madeToOrderLeft: limit.left,
      madeToOrderClosed: false,
      madeToOrderPaused: false,
      sellable: true,
      soldFromStock: false,
    };
  }
  // Sold from stock, or made to order with its limit used up: the ready pieces decide.
  const status: AvailabilityStatus = isOutOfStock(units)
    ? "out"
    : isLowStock(units, expectedWeeklySales)
      ? "low"
      : "available";
  return {
    status,
    readyUnits: units,
    madeToOrder: Boolean(product.is_made_to_order),
    madeToOrderLeft: limit.left,
    madeToOrderClosed: limit.closed,
    madeToOrderPaused: limit.paused,
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
 * made to order) and what else there is to know: how many pieces can still be made when the
 * store limits them, how many are ready beside a made-to-order piece, and that the limit is used
 * up. `madeToOrder` is the store's own word ("Tailoring", "Made to order").
 */
export function availabilityBadge(
  availability: ProductAvailability,
  lang: "ar" | "en",
  labels: {
    unitsLabel: (units: number, kind: "low" | "available") => string;
    madeToOrder?: string;
  },
): { tone: AvailabilityTone; label: string; details: string[] } {
  const isAr = lang === "ar";
  // Why a made-to-order product is closed: paused by the store, or its limit used up.
  const limitReached = availability.madeToOrderPaused
    ? isAr
      ? "حسب الطلب موقوف مؤقتاً"
      : "Made to order paused"
    : isAr
      ? "اكتمل العدد حسب الطلب"
      : "Made-to-order limit reached";
  switch (availability.status) {
    case "service":
      return { tone: "service", label: isAr ? "خدمة" : "Service", details: [] };
    case "made_to_order": {
      const details: string[] = [];
      if (availability.madeToOrderLeft !== null) {
        details.push(
          isAr
            ? `باقي ${availability.madeToOrderLeft} حسب الطلب`
            : `${availability.madeToOrderLeft} left to make`,
        );
      }
      if (availability.readyUnits > 0) {
        details.push(
          isAr ? `جاهز: ${availability.readyUnits}` : `Ready: ${availability.readyUnits}`,
        );
      }
      return {
        tone: "made_to_order",
        label: labels.madeToOrder || (isAr ? "حسب الطلب" : "Made to order"),
        details,
      };
    }
    case "out":
      return availability.madeToOrderClosed
        ? { tone: "out", label: limitReached, details: [] }
        : { tone: "out", label: isAr ? "نفذت الكمية" : "Out of Stock", details: [] };
    case "low":
      return {
        tone: "low",
        label: labels.unitsLabel(availability.readyUnits, "low"),
        details: availability.madeToOrderClosed ? [limitReached] : [],
      };
    default:
      return {
        tone: "ok",
        label: labels.unitsLabel(availability.readyUnits, "available"),
        details: availability.madeToOrderClosed ? [limitReached] : [],
      };
  }
}
