import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Package, Users, CheckCircle2 } from "lucide-react";

import type {
  customerSegments,
  inventoryIntelFor,
} from "@/features/dashboard/lib/dashboard-metrics";

/** The "diagnostics" view: inventory and customer health in detail. */
export function DiagnosticsView({
  crmStats,
  inventoryIntel,
  isAr,
  slug,
}: {
  crmStats: ReturnType<typeof customerSegments>;
  inventoryIntel: ReturnType<typeof inventoryIntelFor>;
  isAr: boolean;
  slug: string;
}) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Inventory Diagnostics Detailed Panel */}
        <Card className="p-5 border border-border shadow-xs rounded-2xl bg-card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-amber-500" />
              <div>
                <h3 className="font-extrabold text-base text-foreground">
                  {isAr ? "تشخيص المخزون والبضائع" : "Inventory Stock Diagnostics"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isAr ? "تحديد المنتجات المنخفضة والراكدة" : "Low stock and dead stock alerts"}
                </p>
              </div>
            </div>
            <Link
              to="/admin/b/$slug/inventory"
              params={{ slug }}
              className="text-xs font-bold text-primary hover:underline"
            >
              {isAr ? "إدارة المخزون ←" : "Manage Stock →"}
            </Link>
          </div>

          {inventoryIntel.lowStockVariants.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground bg-emerald-500/10 rounded-xl border border-emerald-500/20 space-y-1">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
              <p className="font-bold text-foreground text-sm">
                {isAr ? "جميع المستويات مستقرة!" : "Stock Healthy!"}
              </p>
              <p>{isAr ? "لا توجد بضائع منخفضة." : "No low stock items detected."}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {inventoryIntel.lowStockVariants.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-bold text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {isAr ? "مستوى المخزون الحالي" : "Current stock quantity"}
                    </p>
                  </div>
                  <Link
                    to="/admin/b/$slug/inventory"
                    params={{ slug }}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/30 transition-colors"
                  >
                    {item.stock === 0
                      ? isAr
                        ? "نفذ — إكمال المخزون"
                        : "Out of Stock — Reorder"
                      : `${item.stock} ${isAr ? "وحدات المتبقية" : "units remaining"}`}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* CRM Customer Diagnostics Panel */}
        <Card className="p-5 border border-border shadow-xs rounded-2xl bg-card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-500" />
              <div>
                <h3 className="font-extrabold text-base text-foreground">
                  {isAr ? "تشخيص ورعاية العملاء (CRM)" : "CRM Customer Diagnostics"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? "متابعة العملاء المميزين والمعرضين للتسرب"
                    : "VIP retention & churn risk tracking"}
                </p>
              </div>
            </div>
            <Link
              to="/admin/b/$slug/customers"
              params={{ slug }}
              className="text-xs font-bold text-primary hover:underline"
            >
              {isAr ? "سجل العملاء ←" : "Customer List →"}
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-center space-y-1">
              <p className="text-2xl font-extrabold font-mono text-indigo-600 dark:text-indigo-400">
                {crmStats.vipCount}
              </p>
              <p className="text-xs font-bold text-foreground">
                {isAr ? "عملاء مميزون (VIP)" : "VIP Customers"}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center space-y-1">
              <p className="text-2xl font-extrabold font-mono text-rose-600 dark:text-rose-400">
                {crmStats.churnRiskCount}
              </p>
              <p className="text-xs font-bold text-foreground">
                {isAr ? "معرضون للتسرب" : "At Churn Risk"}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
