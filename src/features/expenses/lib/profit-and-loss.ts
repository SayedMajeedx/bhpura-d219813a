import { getItemPackagingCost } from "@/lib/bom-calculator";

/**
 * The profit and loss strip above the expenses list, worked out from the period's sold orders
 * (`ordersQueries.cogs`) and the expenses the view shows.
 */

type SoldOrder = {
  total?: number | string | null;
  payment_method?: string | null;
  fulfillment_status?: string | null;
  status?: string | null;
  order_items?: ReadonlyArray<{
    quantity?: number | string | null;
    unit_cost?: number | string | null;
  }> | null;
};

/** Stages at which an order's packaging has been used. */
const PACKAGING_USED_STAGES = [
  "fulfilled",
  "delivered",
  "completed",
  "shipped",
  "picked_up",
  "ready_for_pickup",
];

export type PackagingCatalog = {
  products: unknown[];
  variants: unknown[];
  bomItems: unknown[];
  materials: unknown[];
};

export function totalRevenueOf(orders: readonly SoldOrder[]): number {
  return orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
}

/**
 * What the sold goods cost: each line's cost snapshot times its quantity, plus the packaging of
 * orders that have left (when the store counts packaging by its bill of materials).
 */
export function costOfGoods(
  orders: readonly SoldOrder[],
  catalog: PackagingCatalog,
  bomEnabled: boolean,
): { productCogs: number; packagingBomCogs: number; totalCogs: number } {
  let prod = 0;
  let pkg = 0;

  orders.forEach((order) => {
    const isFulfilled = PACKAGING_USED_STAGES.includes(
      String(order.fulfillment_status || order.status || "").toLowerCase(),
    );
    (order.order_items ?? []).forEach((item) => {
      const pCost = Number(item.unit_cost ?? 0);
      const qty = Number(item.quantity ?? 1);
      prod += pCost * qty;
      if (isFulfilled && bomEnabled) {
        const bCost = getItemPackagingCost(
          item,
          catalog.products,
          catalog.variants,
          catalog.bomItems,
          catalog.materials,
        );
        pkg += bCost * qty;
      }
    });
  });
  return {
    productCogs: Number(prod.toFixed(3)),
    packagingBomCogs: Number(pkg.toFixed(3)),
    totalCogs: Number((prod + pkg).toFixed(3)),
  };
}

/** What the payment providers kept: the store's own percentage of each card and BenefitPay order. */
export function paymentProcessingFeesOf(
  orders: readonly SoldOrder[],
  cardFeePercent: number,
  benefitFeePercent: number,
): number {
  let sum = 0;
  orders.forEach((order) => {
    const totalVal = Number(order.total || 0);
    if (order.payment_method === "card") {
      sum += totalVal * (cardFeePercent / 100);
    } else if (order.payment_method === "benefit") {
      sum += totalVal * (benefitFeePercent / 100);
    }
  });
  return sum;
}

/** The running costs staff typed in: every expense that is not a stock purchase. */
export function manualOpexOf(
  expenses: ReadonlyArray<{ expense_type?: string | null; amount?: number | string | null }>,
): number {
  return expenses
    .filter((expense) => (expense.expense_type || "opex") === "opex")
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

export function netProfitOf(figures: {
  totalRevenue: number;
  totalCogs: number;
  manualOpex: number;
  processingFees: number;
}): { totalOpex: number; netProfit: number; marginPercentage: number } {
  const totalOpex = figures.manualOpex + figures.processingFees;
  const netProfit = figures.totalRevenue - (figures.totalCogs + totalOpex);
  const marginPercentage = figures.totalRevenue > 0 ? (netProfit / figures.totalRevenue) * 100 : 0;
  return { totalOpex, netProfit, marginPercentage };
}
