import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Package, ReceiptText, AlertCircle, CheckCircle2 } from "lucide-react";
import type { useT } from "@/lib/i18n";

import { DashboardActivityQueue } from "@/components/dashboard/DashboardActivityQueue";
import type { DashboardData } from "@/features/dashboard/hooks/use-dashboard-data";
import type { inventoryIntelFor } from "@/features/dashboard/lib/dashboard-metrics";

/** The activity queue, customer segments and the low-stock and missing-image alerts. */
export function ActivityAndStockRow({
  currency,
  inventoryIntel,
  isAr,
  locale,
  recentOrdersQ,
  slug,
  t,
}: {
  currency: DashboardData["currency"];
  inventoryIntel: ReturnType<typeof inventoryIntelFor>;
  isAr: boolean;
  locale: string;
  recentOrdersQ: DashboardData["recentOrdersQ"];
  slug: string;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
      <Card className="lg:col-span-3 p-5 border border-border shadow-xs rounded-2xl bg-card flex flex-col justify-between space-y-3 h-full">
        <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-4.5 w-4.5 text-primary" />
            <h3 className="font-bold text-base font-heading text-foreground">
              {t("dashboard.recentOrders")}
            </h3>
          </div>
          <Link
            to="/admin/b/$slug/orders"
            params={{ slug }}
            className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
          >
            {isAr ? "عرض كل الطلبات ←" : "View All Orders →"}
          </Link>
        </div>

        <DashboardActivityQueue
          lang={isAr ? "ar" : "en"}
          slug={slug}
          orders={recentOrdersQ.data ?? []}
          currency={currency}
          locale={locale}
        />
      </Card>

      <Card className="lg:col-span-2 p-5 border border-border shadow-xs rounded-2xl bg-card flex flex-col justify-between space-y-3 h-full">
        <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Package className="h-4.5 w-4.5 text-amber-500" />
            <h3 className="font-bold text-base font-heading text-foreground">
              {isAr ? "تنبيهات متغيرات المخزون" : "Variant Stock Alerts"}
            </h3>
          </div>
          <Link
            to="/admin/b/$slug/inventory"
            params={{ slug }}
            className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
          >
            {isAr ? "المخزون ←" : "Inventory →"}
          </Link>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {isAr
            ? `${inventoryIntel.lowStockCount} منتجات منخفضة إجمالًا، منها ${inventoryIntel.outOfStockVariantCount} خيارات مقاس أو لون نافدة. قد يبقى المنتج متوفرًا إذا كانت خيارات أخرى منه موجودة.`
            : `${inventoryIntel.lowStockCount} products are low overall, including ${inventoryIntel.outOfStockVariantCount} sold-out size or color options. A product can remain available when other options have stock.`}
        </p>

        {inventoryIntel.availableWithoutImages.length > 0 && (
          <div className="space-y-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3">
            <div className="flex items-center gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
              <AlertCircle className="h-4 w-4" />
              <span>
                {isAr
                  ? `${inventoryIntel.availableWithoutImages.length} منتجات متوفرة بلا صور`
                  : `${inventoryIntel.availableWithoutImages.length} available products have no images`}
              </span>
            </div>
            {inventoryIntel.availableWithoutImages.slice(0, 3).map((product) => (
              <Link
                key={product.id}
                to="/admin/b/$slug/inventory"
                params={{ slug }}
                className="flex items-center justify-between gap-2 rounded-lg bg-background/70 px-2.5 py-2 text-xs hover:bg-background"
              >
                <span className="truncate font-semibold">{product.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {product.stock} {isAr ? "متوفر" : "in stock"}
                </span>
              </Link>
            ))}
          </div>
        )}

        {inventoryIntel.lowStockVariants.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground bg-secondary/10 rounded-xl border border-dashed border-border space-y-1 my-auto">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
            <p className="font-bold text-foreground">
              {isAr ? "جميع المستويات مستقرة" : "Stock Levels Healthy"}
            </p>
            <p>
              {isAr
                ? "لا توجد بضائع منخفضة أو مشرفة على النفاد."
                : "All product stock levels are fully replenished."}
            </p>
          </div>
        ) : (
          <div className="space-y-2 my-auto">
            {inventoryIntel.lowStockVariants.map((item) => (
              <div
                key={item.id}
                className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-2 text-xs"
              >
                <span className="font-semibold text-foreground truncate max-w-[180px]">
                  {item.name}
                </span>
                <span className="text-xs shrink-0 font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                  {item.stock === 0
                    ? isAr
                      ? "نفد"
                      : "Out of stock"
                    : `${item.stock} ${isAr ? "وحدات" : "units"}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
