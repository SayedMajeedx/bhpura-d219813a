
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Package,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface DashboardActionStripProps {
  slug: string;
  isAr: boolean;
  unfulfilledOrdersCount: number;
  lowStockCount: number;
  pendingReturnsCount: number;
  className?: string;
}

export function DashboardActionStrip({
  slug,
  isAr,
  unfulfilledOrdersCount,
  lowStockCount,
  pendingReturnsCount,
  className,
}: DashboardActionStripProps) {
  const totalActionItems = unfulfilledOrdersCount + lowStockCount + pendingReturnsCount;
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  const actionCards = [
    {
      id: "unfulfilled_orders",
      count: unfulfilledOrdersCount,
      title: isAr ? "طلبات بانتظار التجهيز والشحن" : "Orders Awaiting Fulfillment",
      description: isAr
        ? `${unfulfilledOrdersCount} طلب مدفوع أو مؤكد يحتاج التغليف وتجهيز البوليصة`
        : `${unfulfilledOrdersCount} paid/confirmed order(s) waiting for dispatch`,
      to: "/admin/b/$slug/orders" as const,
      search: { tab: "to_prepare", fulfillment_status: "unfulfilled" },
      actionLabel: isAr ? "بدء التجهيز" : "Fulfill Orders",
      icon: Package,
      badgeText: isAr ? "تجهيز فوري" : "Action Required",
      badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      accentBorder: "hover:border-amber-500/40",
      iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      id: "low_stock",
      count: lowStockCount,
      title: isAr ? "منتجات قاربت على النفاد" : "Low Stock & Depleted Items",
      description: isAr
        ? `${lowStockCount} منتج بمستوى مخزون حرج يتطلب إعادة الطلب`
        : `${lowStockCount} product(s) at or below critical reorder threshold`,
      to: "/admin/b/$slug/inventory" as const,
      search: { filter: "low", scope: "low" },
      actionLabel: isAr ? "مراجعة المخزون" : "Review Stock",
      icon: AlertTriangle,
      badgeText: isAr ? "مخزون حرج" : "Restock Alert",
      badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
      accentBorder: "hover:border-destructive/40",
      iconBg: "bg-destructive/10 text-destructive",
    },
    {
      id: "pending_returns",
      count: pendingReturnsCount,
      title: isAr ? "مرتجعات بانتظار الفحص" : "Returns Awaiting Inspection",
      description: isAr
        ? `${pendingReturnsCount} طلب استبدال أو استرجاع بانتظار فحص البضاعة`
        : `${pendingReturnsCount} return or exchange request(s) awaiting review`,
      to: "/admin/b/$slug/returns" as const,
      search: { status: "requested" },
      actionLabel: isAr ? "فحص الطلبات" : "Inspect Returns",
      icon: RotateCcw,
      badgeText: isAr ? "فحص واستبدال" : "Inspection Due",
      badgeClass: "bg-primary/10 text-primary border-primary/20",
      accentBorder: "hover:border-primary/40",
      iconBg: "bg-primary/10 text-primary",
    },
  ].filter((item) => item.count > 0);

  return (
    <section
      aria-label={isAr ? "مهام اليوم العاجلة" : "Today's Action Items"}
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-2xs transition-all",
        className,
      )}
    >
      {/* Header with Title and Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-border-subtle">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">
              {isAr ? "ما الذي يتطلب انتباهك اليوم؟" : "What Needs Attention Today?"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {totalActionItems > 0
                ? isAr
                  ? `لديك ${totalActionItems} مهمة تشغيلية بانتظار الإجراء للحفاظ على سرعة خدمة عملائك`
                  : `You have ${totalActionItems} operational task(s) awaiting your action to keep orders moving`
                : isAr
                  ? "جميع قوائم الانتظار منضبطة ولا توجد أي مهام معلقة"
                  : "All queues are clear and operations are up to date"}
            </p>
          </div>
        </div>

        {totalActionItems > 0 && (
          <span className="inline-flex items-center self-start sm:self-center px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-foreground border border-border-strong">
            {isAr ? `${totalActionItems} مهام معلّقة` : `${totalActionItems} actions pending`}
          </span>
        )}
      </div>

      {/* Task Breakdown Pills */}
      {totalActionItems > 0 && (
        <div className="flex flex-wrap items-center gap-2 pb-3 mb-1">
          {unfulfilledOrdersCount > 0 && (
            <Link
              to="/admin/b/$slug/orders"
              params={{ slug }}
              search={{ tab: "to_prepare", fulfillment_status: "unfulfilled" }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
            >
              <Package className="h-3.5 w-3.5 shrink-0" />
              <span>{isAr ? "طلبات بانتظار التجهيز" : "Orders to Prepare"}</span>
              <span className="font-mono font-bold">({unfulfilledOrdersCount})</span>
            </Link>
          )}

          {lowStockCount > 0 && (
            <Link
              to="/admin/b/$slug/inventory"
              params={{ slug }}
              search={{ filter: "low", scope: "low" }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 transition-colors"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{isAr ? "خيارات بمخزون حرج" : "Critical Stock Options"}</span>
              <span className="font-mono font-bold">({lowStockCount})</span>
            </Link>
          )}

          {pendingReturnsCount > 0 && (
            <Link
              to="/admin/b/$slug/orders"
              params={{ slug }}
              search={{ filter: "needs_action", tab: "all" }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
              <span>{isAr ? "طلبات إرجاع قيد المعالجة" : "Returns in Processing"}</span>
              <span className="font-mono font-bold">({pendingReturnsCount})</span>
            </Link>
          )}
        </div>
      )}

      {/* Action Cards Grid or All-Clear Celebration */}
      {actionCards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {actionCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                className={cn(
                  "flex flex-col justify-between p-3.5 rounded-xl border border-border-strong bg-background/50 transition-all duration-150 hover:shadow-xs",
                  card.accentBorder,
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                          card.iconBg,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-lg font-bold text-foreground font-mono">
                        {card.count}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-semibold px-2 py-0.5 rounded-full border",
                        card.badgeClass,
                      )}
                    >
                      {card.badgeText}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-foreground">{card.title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {card.description}
                    </p>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-border-subtle">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-full justify-between h-9 text-xs font-semibold border-border-strong hover:bg-muted"
                  >
                    <Link to={card.to as any} params={{ slug } as any} search={card.search as any}>
                      <span>{card.actionLabel}</span>
                      <ArrowIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Reassuring Empty State */
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">
                {isAr ? "كل أمورك جاهزة ومنتظمة اليوم!" : "All operational queues are clear today!"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "لا توجد طلبات معلقة للشحن، ولا تنبيهات لمخزون حرج، ولا مرتجعات بانتظار الفحص."
                  : "No unfulfilled orders, critical inventory alerts, or pending return inspections."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8.5 text-xs font-medium border-border-strong"
            >
              <Link to="/admin/b/$slug/orders" params={{ slug } as any}>
                {isAr ? "سجل الطلبات" : "Order History"}
              </Link>
            </Button>
            <Button asChild variant="default" size="sm" className="h-8.5 text-xs font-medium">
              <Link to="/admin/b/$slug/inventory" params={{ slug } as any}>
                {isAr ? "إدارة المخزون" : "Manage Stock"}
              </Link>
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
