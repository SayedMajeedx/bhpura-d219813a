import { getOrderWorkflow } from "@/lib/order-workflow";
import { isLowStock } from "@/lib/inventory-health";
import { isSoldFromStock } from "@/lib/product-availability";
import { countsAsSold } from "@/lib/data/orders/sold-orders";
import { buildCustomerCrmStats } from "@/lib/commerce-metrics";
import { customerGroup } from "@/features/customers/lib/customer-value";
import type { DashboardData } from "@/features/dashboard/hooks/use-dashboard-data";

/**
 * The dashboard's operational readings from the rows `useDashboardData` loads: the orders that
 * count as sold, what needs action, customers' groups and stock health. Its money figures are
 * the Reports' own (`dashboard-figures.ts`), never added up here.
 */

type Rows<K extends keyof DashboardData> = DashboardData[K] extends { data: infer T }
  ? NonNullable<T>
  : never;
export type DashboardOrders = Rows<"ordersQ">;

/**
 * The orders that are revenue: every order that counts as sold, paid in full or not yet (an
 * advance, cash still to collect), as the Reports overview counts them (`order_counts_as_sold`).
 * Only paid orders counted before, so an order paid by its advance was missing.
 */
export function revenueOrders(orders: DashboardOrders): DashboardOrders {
  return orders.filter((o) => countsAsSold(o.status));
}

/** Up to 5 open orders whose workflow needs the merchant's attention. */
export function ordersNeedingAction(orders: DashboardOrders, hasMadeToOrder: boolean) {
  return orders
    .filter((o) => {
      const wf = getOrderWorkflow(o, { productionStages: hasMadeToOrder });
      return wf.needsAttention && !wf.terminal;
    })
    .slice(0, 5);
}

/**
 * Appointments whose time has come: the service is to be carried out and any balance collected
 * (the orders page's "needs attention" holds them too). Needs each order's `fulfillment_method`
 * and booking start, which the finance rows carry.
 */
export function appointmentsToCompleteCount(orders: DashboardOrders): number {
  return orders.filter((o) => {
    const wf = getOrderWorkflow(o);
    return (
      !wf.terminal &&
      (wf.nextAction === "complete_service" || wf.nextAction === "collect_and_complete_service")
    );
  }).length;
}

/**
 * VIPs and customers at risk by the customers page's own rule (`buildCustomerCrmStats`,
 * `customerGroup`: the store's VIP amount in its own currency), with the VIPs gone quiet for
 * 60 days. The dashboard once had its own rule: over 250 in any currency.
 */
export function customerSegments(
  validRevenueOrders: DashboardOrders,
  customerRows: Rows<"customersQ">,
  now: Date,
  currency: string,
) {
  const stats = buildCustomerCrmStats(validRevenueOrders, now.getTime(), currency);
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
  let vipCount = 0;
  let churnRiskCount = 0;
  const churnRiskVips: Array<{ id: string; name: string }> = [];
  for (const customer of customerRows) {
    const own = stats.get(customer.id);
    const group = customerGroup(own);
    if (group === "vip") {
      vipCount++;
      const last = own?.lastOrderDate ? Date.parse(own.lastOrderDate) : 0;
      if (last > 0 && now.getTime() - last > sixtyDaysMs) {
        churnRiskVips.push({ id: customer.id, name: customer.name });
      }
    } else if (group === "churn") {
      churnRiskCount++;
    }
  }
  return { vipCount, churnRiskCount: churnRiskCount + churnRiskVips.length, churnRiskVips };
}

/**
 * Stock health from the last 45 days of sales: dead stock, low stock by
 * weekly velocity, the 5 variants closest to running out, and active
 * in-stock products with no image.
 */
export function inventoryIntelFor({
  productRows,
  variantRows,
  validRevenueOrders,
  lang,
  now,
  lowStockUnits,
}: {
  productRows: Rows<"productsQ">;
  variantRows: Rows<"variantsQ">;
  validRevenueOrders: DashboardOrders;
  lang: string;
  now: Date;
  /** The store's own low-stock level; the default when left out. */
  lowStockUnits?: number;
}) {
  // Made-to-order items and services have no stock to run low, sell slowly or
  // go dead: they are left out of every stock figure.
  const products = productRows.filter(isSoldFromStock);
  const trackedProductIds = new Set(products.map((product) => product.id));
  const variants = variantRows.filter((variant) => trackedProductIds.has(variant.product_id));
  const orders = validRevenueOrders;

  const past45Days = new Date(now);
  past45Days.setDate(past45Days.getDate() - 45);
  const past45DaysMs = past45Days.getTime();

  const salesByVariant = new Map<string, number>();

  orders.forEach((order) => {
    const orderTime = new Date(order.created_at).getTime();
    if (orderTime >= past45DaysMs) {
      (order.order_items ?? []).forEach((item: any) => {
        if (item.variant_id) {
          salesByVariant.set(
            item.variant_id,
            (salesByVariant.get(item.variant_id) ?? 0) + Number(item.quantity || 0),
          );
        }
      });
    }
  });

  const getVariantStock = (v: any) => Number(v.stock_main || 0) + Number(v.stock_incubator || 0);

  const getVariantDailyVelocity = (v: any) => {
    const qtySold = salesByVariant.get(v.id) || 0;
    const variantCreatedAt = v.created_at ? new Date(v.created_at) : null;
    const daysElapsed = variantCreatedAt
      ? Math.max(
          1,
          Math.min(
            45,
            Math.ceil((now.getTime() - variantCreatedAt.getTime()) / (1000 * 60 * 60 * 24)),
          ),
        )
      : 45;
    return qtySold / daysElapsed;
  };

  // Dead stock is pieces on the shelf that did not sell: a sold-out size is not dead stock.
  let deadStockCount = 0;
  variants.forEach((v) => {
    const qtySold = salesByVariant.get(v.id) || 0;
    if (qtySold === 0 && getVariantStock(v) > 0) {
      deadStockCount++;
    }
  });

  const productStockMap = new Map<string, number>();
  const productWeeklySalesMap = new Map<string, number>();

  products.forEach((product) => {
    const pVariants = variants.filter((v) => v.product_id === product.id);
    const stock = pVariants.reduce((sum, v) => sum + getVariantStock(v), 0);
    productStockMap.set(product.id, stock);

    const productDailyVelocity = pVariants.reduce((sum, v) => sum + getVariantDailyVelocity(v), 0);
    productWeeklySalesMap.set(product.id, productDailyVelocity * 7);
  });

  let lowStockCount = 0;
  products.forEach((product) => {
    const stock = productStockMap.get(product.id) ?? 0;
    const weeklySales = productWeeklySalesMap.get(product.id) ?? 0;
    if (isLowStock(stock, weeklySales, lowStockUnits)) {
      lowStockCount++;
    }
  });

  const availableWithoutImages = products
    .filter((product) => {
      if (!product.is_active || (productStockMap.get(product.id) ?? 0) <= 0) return false;
      const media = Array.isArray(product.media) ? product.media : [];
      const hasMedia = media.some((item: any) =>
        typeof item === "string" ? Boolean(item.trim()) : Boolean(item?.url || item?.src),
      );
      return !product.image_url && !hasMedia;
    })
    .map((product) => ({
      id: product.id,
      name: lang === "ar" ? product.name_ar || product.name : product.name_en || product.name,
      stock: productStockMap.get(product.id) ?? 0,
    }));

  const lowStockVariants: Array<{
    id: string;
    name: string;
    stock: number;
    daysLeft: number;
  }> = [];

  variants.forEach((v) => {
    const product = products.find((p) => p.id === v.product_id);
    if (!product) return;

    const stock = getVariantStock(v);
    const dailyVelocity = getVariantDailyVelocity(v);
    if (dailyVelocity > 0) {
      const daysLeft = Math.ceil(stock / dailyVelocity);
      if (daysLeft <= 14) {
        const sizeText = v.size ? ` (${v.size})` : "";
        const colorText = v.color ? ` - ${v.color}` : "";
        const pName =
          lang === "ar" ? product.name_ar || product.name : product.name_en || product.name;
        lowStockVariants.push({
          id: v.id,
          name: `${pName}${sizeText}${colorText}`,
          stock,
          daysLeft,
        });
      }
    } else if (stock === 0) {
      const sizeText = v.size ? ` (${v.size})` : "";
      const colorText = v.color ? ` - ${v.color}` : "";
      const pName =
        lang === "ar" ? product.name_ar || product.name : product.name_en || product.name;
      lowStockVariants.push({
        id: v.id,
        name: `${pName}${sizeText}${colorText}`,
        stock: 0,
        daysLeft: 0,
      });
    }
  });

  return {
    deadStockCount,
    lowStockCount,
    outOfStockVariantCount: lowStockVariants.filter((item) => item.stock === 0).length,
    lowStockVariants: lowStockVariants.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5),
    availableWithoutImages,
  };
}

/** Orders waiting to be prepared, matching the orders page "to prepare" tab. */
export function ordersToPrepareCount(orders: DashboardOrders, hasMadeToOrder: boolean): number {
  return orders.filter((o: any) => {
    const workflow = getOrderWorkflow(o, { productionStages: hasMadeToOrder });
    return (
      !workflow.terminal &&
      [
        "pending",
        "packing",
        "on_hold",
        "needs_packing",
        ...(hasMadeToOrder
          ? [
              "awaiting_tailor",
              "received_from_workshop",
              "sent_to_workshop",
              "received_from_tailor",
              "sent_to_tailor",
            ]
          : []),
      ].includes(workflow.fulfillment) &&
      (!workflow.awaitingPayment || workflow.isCod)
    );
  }).length;
}
