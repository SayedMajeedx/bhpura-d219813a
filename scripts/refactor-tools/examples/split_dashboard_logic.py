"""Dashboard part 1: data + onboarding hooks, metrics and KPIs as pure functions (verbatim bodies)."""
import os
import re

ROUTE = "src/routes/_authenticated/admin.b.$slug.dashboard.tsx"
D = "src/features/dashboard"
s = open(ROUTE, encoding="utf-8").read()


def take(start, end, repl="", after=None):
    """Cut s from start to end (inclusive; end searched after `after` when given) and put repl there."""
    global s
    i = s.index(start)
    k = s.index(after, i) if after else i
    j = s.index(end, k) + len(end)
    block = s[i:j]
    s = s[:i] + repl + s[j:]
    return block


def memo_body(block):
    """Body of `const x = useMemo(() => {\\n BODY  }, [deps]);` ."""
    first = block.index("\n") + 1
    last = block.rindex("\n  }, [")
    return block[first : last + 1]


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8", newline="").write(text)


def ret(names):
    return "  return {\n" + "".join(f"    {n},\n" for n in names) + "  };\n"


def destructure(names, call):
    return "  const {\n" + "".join(f"    {n},\n" for n in names) + f"  }} = {call};\n"


# ---------------------------------------------------------------------------
# onboarding milestones
ONB = [
    "isPreviewed",
    "isManualSaleCompleted",
    "isOnboardingDismissed",
    "handleCopyStoreLink",
    "handlePreviewStorefront",
    "togglePreviewMilestone",
    "toggleSaleMilestone",
    "handleDismissOnboarding",
    "handleRestoreOnboarding",
]
onb = take(
    "  // Guided Onboarding Milestones State (Per-brand persistent tracking)\n",
    "\n  };\n",
    destructure(ONB, "useOnboardingMilestones({ brand, brandId, isAr })"),
    after="  const handleRestoreOnboarding = () => {\n",
)
write(
    f"{D}/hooks/use-onboarding-milestones.ts",
    '''import { useState } from "react";
import { toast } from "sonner";
import { getStorefrontUrl } from "@/lib/storefront-url";
import type { useBrand } from "@/lib/brand-context";

/**
 * The launch checklist's manual steps (store previewed or shared, first sale
 * recorded) and whether it is dismissed, kept per brand in localStorage.
 */
export function useOnboardingMilestones({
  brand,
  brandId,
  isAr,
}: {
  brand: ReturnType<typeof useBrand>;
  brandId: string;
  isAr: boolean;
}) {
'''
    + onb
    + "\n"
    + ret(ONB)
    + "}\n",
)

# ---------------------------------------------------------------------------
# data
DATA = [
    "businessSettings",
    "isCatalog",
    "catalogInquiriesQ",
    "currency",
    "reportingOverviewQ",
    "productsQ",
    "variantsQ",
    "bomItemsQ",
    "packagingMaterialsQ",
    "customersQ",
    "ordersQ",
    "recentOrdersQ",
    "expensesQ",
    "pendingReturnsQ",
    "incubatorSalesQ",
    "isLoading",
    "accountingRow",
    "previousAccountingRow",
]
periods = take(
    "  const dashboardPeriods = useMemo(() => {\n",
    "  const reportingTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;\n",
)
data = take(
    "  // 1. Fetch Business settings\n",
    "    ) ?? previousAccountingRows[0];\n",
    destructure(DATA, "useDashboardData({ brandId, slug, canViewFinancials })"),
)
write(
    f"{D}/hooks/use-dashboard-data.ts",
    '''import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCatalogInquiriesReporting, fetchReportingOverview } from "@/lib/reporting.functions";
import { isCatalogMode } from "@/lib/storefront-mode";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";

/**
 * Everything the dashboard reads: settings, the Reports accounting rows for
 * the last 30 days and the 30 before, catalog inquiries, products, variants,
 * packaging, customers, orders, expenses, pending returns and incubator
 * sales, kept fresh by realtime invalidation.
 */
export function useDashboardData({
  brandId,
  slug,
  canViewFinancials,
}: {
  brandId: string;
  slug: string;
  canViewFinancials: boolean;
}) {
'''
    + periods
    + "\n"
    + data
    + "\n"
    + ret(DATA)
    + "}\n\nexport type DashboardData = ReturnType<typeof useDashboardData>;\n",
)

# ---------------------------------------------------------------------------
# metrics
valid = take(
    "  // Filter confirmed/completed orders for revenue reporting\n  const validRevenueOrders = useMemo(() => {\n",
    "  }, [ordersQ.data]);\n",
    "  // Filter confirmed/completed orders for revenue reporting\n"
    "  const validRevenueOrders = useMemo(() => paidRevenueOrders(ordersQ.data ?? []), [ordersQ.data]);\n",
)
valid_body = memo_body(valid[valid.index("  const validRevenueOrders") :]).replace(
    "(ordersQ.data ?? [])", "orders"
)

action = take(
    "  const actionNeededOrders = useMemo(() => {\n",
    "  }, [ordersQ.data, hasMadeToOrder]);\n",
    "  const actionNeededOrders = useMemo(\n"
    "    () => ordersNeedingAction(ordersQ.data ?? [], hasMadeToOrder),\n"
    "    [ordersQ.data, hasMadeToOrder],\n  );\n",
)
action_body = memo_body(action).replace("(ordersQ.data ?? [])", "orders")

fin = take(
    "  const financials = useMemo(() => {\n",
    "    locale,\n  ]);\n",
    """  const financials = useMemo(
    () =>
      dashboardFinancials({
        validRevenueOrders,
        expenseRows: expensesQ.data ?? [],
        incubatorSaleRows: incubatorSalesQ.data ?? [],
        variantRows: variantsQ.data ?? [],
        productRows: productsQ.data ?? [],
        bomItemRows: bomItemsQ.data ?? [],
        packagingMaterialRows: packagingMaterialsQ.data ?? [],
        settings: businessSettings.data,
        accountingRow,
        previousAccountingRow,
        locale,
        now: new Date(),
      }),
    [
      validRevenueOrders,
      expensesQ.data,
      incubatorSalesQ.data,
      variantsQ.data,
      productsQ.data,
      bomItemsQ.data,
      packagingMaterialsQ.data,
      businessSettings.data,
      accountingRow,
      previousAccountingRow,
      locale,
    ],
  );
""",
)
fin_body = memo_body(fin)
for a, b in [
    ("    const now = new Date();\n", ""),
    ("(expensesQ.data ?? [])", "expenseRows"),
    ("incubatorSalesQ.data ?? []", "incubatorSaleRows"),
    ("variantsQ.data ?? []", "variantRows"),
    ("productsQ.data ?? []", "productRows"),
    ("bomItemsQ.data ?? []", "bomItemRows"),
    ("packagingMaterialsQ.data ?? []", "packagingMaterialRows"),
    ("(businessSettings.data as any)", "(settings as any)"),
]:
    assert a in fin_body, a
    fin_body = fin_body.replace(a, b)
assert "Q.data" not in fin_body and "businessSettings" not in fin_body

crm = take(
    "  const crmStats = useMemo(() => {\n",
    "  }, [validRevenueOrders, customersQ.data]);\n",
    "  const crmStats = useMemo(\n"
    "    () => customerSegments(validRevenueOrders, customersQ.data ?? [], new Date()),\n"
    "    [validRevenueOrders, customersQ.data],\n  );\n",
)
crm_body = memo_body(crm)
for a, b in [
    ("customersQ.data ?? []", "customerRows"),
    ("    const nowMs = new Date().getTime();\n", "    const nowMs = now.getTime();\n"),
]:
    assert a in crm_body, a
    crm_body = crm_body.replace(a, b)

inv = take(
    "  const inventoryIntel = useMemo(() => {\n",
    "  }, [productsQ.data, variantsQ.data, validRevenueOrders, lang]);\n",
    """  const inventoryIntel = useMemo(
    () =>
      inventoryIntelFor({
        productRows: productsQ.data ?? [],
        variantRows: variantsQ.data ?? [],
        validRevenueOrders,
        lang,
        now: new Date(),
      }),
    [productsQ.data, variantsQ.data, validRevenueOrders, lang],
  );
""",
)
inv_body = memo_body(inv)
for a, b in [
    ("productsQ.data ?? []", "productRows"),
    ("variantsQ.data ?? []", "variantRows"),
    ("    const past45Days = new Date();\n", "    const past45Days = new Date(now);\n"),
    ("(new Date().getTime() - variantCreatedAt.getTime())", "(now.getTime() - variantCreatedAt.getTime())"),
]:
    assert a in inv_body, a
    inv_body = inv_body.replace(a, b)
assert "new Date()" not in inv_body

unf = take(
    "  const unfulfilledOrdersCount = useMemo(() => {\n",
    "  }, [ordersQ.data, hasMadeToOrder]);\n",
    "  const unfulfilledOrdersCount = useMemo(\n"
    "    () => ordersToPrepareCount(ordersQ.data ?? [], hasMadeToOrder),\n"
    "    [ordersQ.data, hasMadeToOrder],\n  );\n",
)
unf_body = memo_body(unf).replace("(ordersQ.data ?? [])", "orders")

write(
    f"{D}/lib/dashboard-metrics.ts",
    '''import { getItemPackagingCost } from "@/lib/bom-calculator";
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
'''
    + valid_body
    + '''}

/** Up to 5 open orders whose workflow needs the merchant's attention. */
export function ordersNeedingAction(orders: DashboardOrders, hasMadeToOrder: boolean) {
'''
    + action_body
    + '''}

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
'''
    + fin_body
    + '''}

export type DashboardFinancials = ReturnType<typeof dashboardFinancials>;

/** VIPs (lifetime spend over 250) and customers idle for 60 days, with the idle VIPs. */
export function customerSegments(
  validRevenueOrders: DashboardOrders,
  customerRows: Rows<"customersQ">,
  now: Date,
) {
'''
    + crm_body
    + '''}

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
'''
    + inv_body
    + '''}

/** Orders waiting to be prepared, matching the orders page "to prepare" tab. */
export function ordersToPrepareCount(orders: DashboardOrders, hasMadeToOrder: boolean): number {
'''
    + unf_body
    + "}\n",
)

# ---------------------------------------------------------------------------
# KPI cards
kpi = take(
    "  const primaryKpis = isCatalog\n",
    "      ];\n",
    """  const primaryKpis = primaryKpisFor({
    isCatalog,
    isAr,
    catalogInquiries: catalogInquiriesQ.data,
    financials,
    canViewFinancials,
    currency,
    locale,
  });
""",
)
kpi_expr = kpi[len("  const primaryKpis = ") :].rstrip("\n").rstrip(";")
kpi_expr = kpi_expr.replace("catalogInquiriesQ.data", "catalogInquiries")
write(
    f"{D}/lib/dashboard-kpis.ts",
    '''import { MessageCircle, Package, PiggyBank, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { DashboardData } from "@/features/dashboard/hooks/use-dashboard-data";
import type { DashboardFinancials } from "@/features/dashboard/lib/dashboard-metrics";

/**
 * The headline cards: WhatsApp inquiries, views, top product and manual sales
 * for catalog stores; otherwise revenue and profit, AOV and gross margin (for
 * people who may see financials) and the sales count.
 */
export function primaryKpisFor({
  isCatalog,
  isAr,
  catalogInquiries,
  financials,
  canViewFinancials,
  currency,
  locale,
}: {
  isCatalog: boolean;
  isAr: boolean;
  catalogInquiries: DashboardData["catalogInquiriesQ"]["data"];
  financials: DashboardFinancials;
  canViewFinancials: boolean;
  currency: string;
  locale: string;
}) {
  return '''
    + kpi_expr
    + ";\n}\n",
)

# ---------------------------------------------------------------------------
anchor = 'import { DashboardActionStrip } from "@/components/dashboard/DashboardActionStrip";'
assert s.count(anchor) == 1
s = s.replace(
    anchor,
    anchor
    + """
import { useDashboardData } from "@/features/dashboard/hooks/use-dashboard-data";
import { useOnboardingMilestones } from "@/features/dashboard/hooks/use-onboarding-milestones";
import {
  customerSegments,
  dashboardFinancials,
  inventoryIntelFor,
  ordersNeedingAction,
  ordersToPrepareCount,
  paidRevenueOrders,
} from "@/features/dashboard/lib/dashboard-metrics";
import { primaryKpisFor } from "@/features/dashboard/lib/dashboard-kpis";""",
)
open(ROUTE, "w", encoding="utf-8", newline="").write(s)
print("ok")
