import { getItemPackagingCost } from "@/lib/bom-calculator";
import { getOrderWorkflow } from "@/lib/order-workflow";
import { isLowStock } from "@/lib/inventory-health";
import type { DashboardData } from "@/features/dashboard/hooks/use-dashboard-data";

/**
 * The dashboard's figures, computed from the rows `useDashboardData` loads.
 * Headline financials come from the Reports accounting rows when present, so
 * the dashboard and Reports agree; the order-based sums are the fallback and
 * feed the daily chart.
 */

type Rows<K extends keyof DashboardData> = DashboardData[K] extends { data: infer T }
  ? NonNullable<T>
  : never;
export type DashboardOrders = Rows<"ordersQ">;

/** Paid orders that were not cancelled, refunded or archived: the revenue base. */
export function paidRevenueOrders(orders: DashboardOrders): DashboardOrders {
  return orders.filter((o) => {
    const status = String(o.status || "").toLowerCase();
    const fulfillment = String(o.fulfillment_status || "").toLowerCase();
    return (
      String(o.payment_status || "").toLowerCase() === "paid" &&
      !["cancelled", "canceled", "refunded", "archived_historical"].includes(status) &&
      !["cancelled", "canceled", "refunded"].includes(fulfillment)
    );
  });
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
 * Revenue, COGS (product, packaging BOM, incubator), OpEx (expenses, payment
 * fees, incubator commissions), profit and margin for the last 30 days, the
 * change against the 30 days before, and the daily sales series.
 */
export function dashboardFinancials({
  validRevenueOrders,
  expenseRows,
  incubatorSaleRows,
  variantRows,
  productRows,
  bomItemRows,
  packagingMaterialRows,
  settings,
  accountingRow,
  previousAccountingRow,
  locale,
  now,
}: {
  validRevenueOrders: DashboardOrders;
  expenseRows: Rows<"expensesQ">;
  incubatorSaleRows: Rows<"incubatorSalesQ">;
  variantRows: Rows<"variantsQ">;
  productRows: Rows<"productsQ">;
  bomItemRows: Rows<"bomItemsQ">;
  packagingMaterialRows: Rows<"packagingMaterialsQ">;
  settings: DashboardData["businessSettings"]["data"];
  accountingRow: DashboardData["accountingRow"];
  previousAccountingRow: DashboardData["previousAccountingRow"];
  locale: string;
  now: Date;
}) {
  const allOrders = validRevenueOrders;
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - 29);
  currentStart.setHours(0, 0, 0, 0);
  const priorStart = new Date(currentStart);
  priorStart.setDate(priorStart.getDate() - 30);
  const orders = allOrders.filter((o) => {
    const timestamp = Date.parse(o.created_at);
    return (
      Number.isFinite(timestamp) &&
      timestamp >= currentStart.getTime() &&
      timestamp <= now.getTime()
    );
  });
  const expenses = expenseRows.filter((expense: any) => {
    const rawDate = expense.expense_date || expense.created_at;
    const timestamp = rawDate ? Date.parse(rawDate) : NaN;
    return (
      Number.isFinite(timestamp) &&
      timestamp >= currentStart.getTime() &&
      timestamp <= now.getTime()
    );
  });
  const allIncubatorSales = incubatorSaleRows;
  const incubatorSales = allIncubatorSales.filter((sale: any) => {
    const timestamp = Date.parse(sale.sold_at);
    return (
      Number.isFinite(timestamp) &&
      timestamp >= currentStart.getTime() &&
      timestamp <= now.getTime()
    );
  });
  const variants = variantRows;

  const variantCostMap = new Map<string, number>();
  variants.forEach((v) => {
    variantCostMap.set(v.id, Number(v.cost_price || 0));
  });

  const orderRevenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const incubatorRevenue = incubatorSales.reduce(
    (sum: number, sale: any) => sum + Number(sale.gross_amount || 0),
    0,
  );
  const revenue = orderRevenue + incubatorRevenue;

  let productCogs = 0;
  let packagingBomCogs = 0;
  const prods = productRows;
  const boms = bomItemRows;
  const mats = packagingMaterialRows;

  orders.forEach((order) => {
    const isFulfilled = ["fulfilled", "delivered", "completed", "shipped", "picked_up"].includes(
      String(order.fulfillment_status || order.status || "").toLowerCase(),
    );
    (order.order_items ?? []).forEach((item: any) => {
      const itemCost =
        item.unit_cost != null && !isNaN(Number(item.unit_cost))
          ? Number(item.unit_cost)
          : (variantCostMap.get(item.variant_id) ?? 0);
      const qty = Number(item.quantity || 0);

      productCogs += itemCost * qty;
      if (isFulfilled && (settings as any)?.bom_enabled !== false) {
        const pkgCost = getItemPackagingCost(item, prods, variants, boms, mats);
        packagingBomCogs += pkgCost * qty;
      }
    });
  });

  const incubatorCogs = incubatorSales.reduce(
    (sum: number, sale: any) =>
      sum + Number(sale.product_cost_snapshot || 0) + Number(sale.packaging_cost_snapshot || 0),
    0,
  );
  const cogs = productCogs + packagingBomCogs + incubatorCogs;

  const cardFeePercent = Number((settings as any)?.card_processing_fee ?? 0);
  const benefitFeePercent = Number((settings as any)?.benefit_processing_fee ?? 0);

  let paymentProcessingFees = 0;
  orders.forEach((o) => {
    const totalVal = Number(o.total || 0);
    if (o.payment_method === "card") {
      paymentProcessingFees += totalVal * (cardFeePercent / 100);
    } else if (o.payment_method === "benefit") {
      paymentProcessingFees += totalVal * (benefitFeePercent / 100);
    }
  });

  // OpEx excludes bulk packaging asset purchases (expense_type === 'cogs')
  const manualOpex = expenses
    .filter((e: any) => (e.expense_type || "opex") === "opex")
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const incubatorCommissions = incubatorSales.reduce(
    (sum: number, sale: any) => sum + Number(sale.commission_amount || 0),
    0,
  );
  const opex = manualOpex + paymentProcessingFees + incubatorCommissions;
  const reportRevenue = Number(accountingRow?.net_revenue ?? revenue);
  const reportMerchRevenue = Number(
    accountingRow?.net_merchandise_after_returns ?? accountingRow?.net_merch_sales ?? revenue,
  );
  const reportCogs = Number(
    accountingRow?.known_cogs_after_returns ?? accountingRow?.known_cogs ?? cogs,
  );
  const reportOpex = Number(accountingRow?.expenses ?? opex);
  const grossProfit = reportMerchRevenue - reportCogs;
  const netProfit = grossProfit - reportOpex;
  const grossMarginPercent = reportMerchRevenue > 0 ? (grossProfit / reportMerchRevenue) * 100 : 0;
  const current30Orders = orders;
  const prior30Orders = allOrders.filter((o) => {
    const timestamp = Date.parse(o.created_at);
    return (
      Number.isFinite(timestamp) &&
      timestamp >= priorStart.getTime() &&
      timestamp < currentStart.getTime()
    );
  });
  const priorIncubatorSales = allIncubatorSales.filter((sale: any) => {
    const timestamp = Date.parse(sale.sold_at);
    return (
      Number.isFinite(timestamp) &&
      timestamp >= priorStart.getTime() &&
      timestamp < currentStart.getTime()
    );
  });
  const revenueWithIncubators = reportRevenue;
  const revenuePrior = Number(
    previousAccountingRow?.net_revenue ??
      prior30Orders.reduce((sum, o) => sum + Number(o.total || 0), 0) +
        priorIncubatorSales.reduce(
          (sum: number, sale: any) => sum + Number(sale.gross_amount || 0),
          0,
        ),
  );
  const revenueDeltaPct =
    revenuePrior > 0 ? ((revenueWithIncubators - revenuePrior) / revenuePrior) * 100 : null;

  const ordersCurrent =
    current30Orders.length +
    incubatorSales.reduce((sum: number, sale: any) => sum + Number(sale.quantity || 0), 0);
  const ordersPrior =
    prior30Orders.length +
    priorIncubatorSales.reduce((sum: number, sale: any) => sum + Number(sale.quantity || 0), 0);
  const ordersDeltaPct =
    ordersPrior > 0 ? ((ordersCurrent - ordersPrior) / ordersPrior) * 100 : null;

  const aovCurrent = ordersCurrent > 0 ? revenueWithIncubators / ordersCurrent : 0;
  const aovPrior = ordersPrior > 0 ? revenuePrior / ordersPrior : 0;
  const aovDeltaPct = aovPrior > 0 ? ((aovCurrent - aovPrior) / aovPrior) * 100 : null;

  // 30-Day Daily Sales Time Series Chart Data
  const chartDataMap = new Map<string, { date: string; sales: number; orders: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(currentStart);
    d.setDate(currentStart.getDate() + (29 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = d.toLocaleDateString(locale, { day: "numeric", month: "short" });
    chartDataMap.set(key, { date: label, sales: 0, orders: 0 });
  }

  orders.forEach((o) => {
    if (!o.created_at) return;
    const d = new Date(o.created_at);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (chartDataMap.has(key)) {
      const item = chartDataMap.get(key)!;
      item.sales += Number(o.total || 0);
      item.orders += 1;
    }
  });
  incubatorSales.forEach((sale: any) => {
    const d = new Date(sale.sold_at);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const item = chartDataMap.get(key);
    if (item) {
      item.sales += Number(sale.gross_amount || 0);
      item.orders += Number(sale.quantity || 0);
    }
  });

  const dailyChartSeries = Array.from(chartDataMap.values());

  return {
    revenue: reportRevenue,
    storeRevenue: orderRevenue,
    incubatorRevenue,
    cogs: reportCogs,
    opex: reportOpex,
    totalExpenses: reportCogs + reportOpex,
    netProfit,
    grossMarginPercent,
    revenueCurrent: revenueWithIncubators,
    revenueDeltaPct,
    ordersCurrent,
    ordersDeltaPct,
    aovCurrent,
    aovDeltaPct,
    dailyChartSeries,
  };
}

export type DashboardFinancials = ReturnType<typeof dashboardFinancials>;

/** VIPs (lifetime spend over 250) and customers idle for 60 days, with the idle VIPs. */
export function customerSegments(
  validRevenueOrders: DashboardOrders,
  customerRows: Rows<"customersQ">,
  now: Date,
) {
  const orders = validRevenueOrders;
  const customers = customerRows;

  const nowMs = now.getTime();
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

  const ordersByCustomer = new Map<string, typeof orders>();
  orders.forEach((o) => {
    if (o.customer_id) {
      if (!ordersByCustomer.has(o.customer_id)) {
        ordersByCustomer.set(o.customer_id, []);
      }
      ordersByCustomer.get(o.customer_id)!.push(o);
    }
  });

  let vipCount = 0;
  let churnRiskCount = 0;
  const churnRiskVips: Array<{ id: string; name: string }> = [];

  customers.forEach((c) => {
    const custOrders = ordersByCustomer.get(c.id) ?? [];
    const lifetimeSpend = custOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

    let lastOrderMs = 0;
    custOrders.forEach((o) => {
      const ms = new Date(o.created_at).getTime();
      if (ms > lastOrderMs) lastOrderMs = ms;
    });

    const isVip = lifetimeSpend > 250;
    const isIdle60 = lastOrderMs > 0 && nowMs - lastOrderMs > sixtyDaysMs;

    if (isVip) {
      vipCount++;
      if (isIdle60) {
        churnRiskVips.push({ id: c.id, name: c.name });
      }
    }

    if (isIdle60) {
      churnRiskCount++;
    }
  });

  return {
    vipCount,
    churnRiskCount,
    churnRiskVips,
  };
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
}: {
  productRows: Rows<"productsQ">;
  variantRows: Rows<"variantsQ">;
  validRevenueOrders: DashboardOrders;
  lang: string;
  now: Date;
}) {
  const products = productRows;
  const variants = variantRows;
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

  let deadStockCount = 0;
  variants.forEach((v) => {
    const qtySold = salesByVariant.get(v.id) || 0;
    if (qtySold === 0) {
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
    if (isLowStock(stock, weeklySales)) {
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
          ? ["received_from_workshop", "sent_to_workshop", "received_from_tailor", "sent_to_tailor"]
          : []),
      ].includes(workflow.fulfillment) &&
      (!workflow.awaitingPayment || workflow.isCod)
    );
  }).length;
}
