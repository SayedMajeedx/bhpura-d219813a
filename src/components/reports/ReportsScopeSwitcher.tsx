import { Link, useLocation } from "@tanstack/react-router";
import { BarChart3, TrendingUp, Package, Users, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportsScopeSwitcherProps {
  lang: "ar" | "en";
  slug: string;
}

const navItems = [
  {
    id: "overview",
    path: "/admin/b/$slug/reports",
    icon: BarChart3,
    en: "Overview",
    ar: "نظرة عامة",
  },
  {
    id: "sales",
    path: "/admin/b/$slug/reports/sales",
    icon: TrendingUp,
    en: "Sales",
    ar: "المبيعات",
  },
  {
    id: "products",
    path: "/admin/b/$slug/reports/products",
    icon: Package,
    en: "Products",
    ar: "المنتجات",
  },
  {
    id: "customers",
    path: "/admin/b/$slug/reports/customers",
    icon: Users,
    en: "Customers",
    ar: "العملاء",
  },
  {
    id: "export",
    path: "/admin/b/$slug/reports/export",
    icon: Download,
    en: "Export",
    ar: "التصدير",
  },
] as const;

export function ReportsScopeSwitcher({ lang, slug }: ReportsScopeSwitcherProps) {
  const isAr = lang === "ar";
  const location = useLocation();

  const activeId =
    navItems.find((item) =>
      item.id === "overview"
        ? location.pathname.endsWith("/reports") || location.pathname.endsWith("/reports/")
        : location.pathname.includes(`/reports/${item.id}`),
    )?.id ?? "overview";

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-muted/40 border border-border/60 rounded-xl scrollbar-none">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeId === item.id;

        return (
          <Link
            key={item.id}
            to={item.path}
            params={{ slug }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200",
              isActive
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{isAr ? item.ar : item.en}</span>
          </Link>
        );
      })}
    </div>
  );
}
