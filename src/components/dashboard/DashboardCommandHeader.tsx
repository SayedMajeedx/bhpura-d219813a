import { LayoutDashboard, ReceiptText, Package } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface DashboardCommandHeaderProps {
  lang: "ar" | "en";
  slug: string;
  brandName: string;
  orderCount: number;
}

export function DashboardCommandHeader({
  lang,
  slug,
  brandName,
  orderCount,
}: DashboardCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-4 sm:p-5 shadow-sm">
      {/* Background Mesh */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/10 pointer-events-none" />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary tracking-wide">
            <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
            <span>{isAr ? "مركز قيادة التجار" : "COMMERCE COMMAND CENTER"}</span>
            <span className="ms-1 px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold">
              {brandName}
            </span>
          </div>

          <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl flex items-center gap-2">
            <span>{isAr ? "لوحة الأداء والعمليات" : "Performance & Operations"}</span>
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-muted text-foreground border border-border/60 rounded-full">
              {orderCount} {isAr ? "طلب" : "orders"}
            </span>
          </h1>

          <p className="text-xs text-muted-foreground max-w-xl">
            {isAr
              ? "متابعة المبيعات الفوريّة، الأرباح، متوسط قيمة الطلبات، والمخزون في مكان واحد."
              : "Real-time commerce telemetry, profit analytics, order velocity, and inventory diagnostics."}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          <Link
            to="/admin/b/$slug/orders/$id"
            params={{ slug, id: "new" }}
            className="inline-flex h-9 items-center rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-1.5"
          >
            <ReceiptText className="h-3.5 w-3.5" />
            <span>{isAr ? "+ طلب جديد" : "+ New Order"}</span>
          </Link>

          <Link
            to="/admin/b/$slug/inventory"
            params={{ slug }}
            search={{ new: true } as any}
            className="inline-flex h-9 items-center rounded-xl border border-border/60 bg-card/80 px-3.5 text-xs font-bold text-foreground shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-1.5"
          >
            <Package className="h-3.5 w-3.5 text-primary" />
            <span>{isAr ? "+ إضافة منتج" : "+ Add Product"}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
