import { createFileRoute, Outlet, redirect, Link, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { BarChart3, TrendingUp, Package, Users, Download, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports")({
  beforeLoad: async ({ params }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });

    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("role, status, email, permissions")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role;
    const permissions = (profile?.permissions as string[]) || [];
    const allowed =
      (user.email || "").toLowerCase() === "majeed@hotmail.it" ||
      (profile?.status !== "disabled" &&
        (["admin", "super_admin", "brand_admin"].includes(role) ||
          (role === "staff" && permissions.includes("view_financials"))));

    if (!allowed) {
      throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug: params.slug } });
    }
  },
  component: ReportsLayout,
});

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

import { ReportsCommandHeader } from "@/components/reports/ReportsCommandHeader";
import { ReportsScopeSwitcher } from "@/components/reports/ReportsScopeSwitcher";

function ReportsLayout() {
  const { lang } = useI18n();
  const { slug } = Route.useParams();

  return (
    <div className="space-y-3.5">
      <ReportsCommandHeader lang={lang === "ar" ? "ar" : "en"} />
      <ReportsScopeSwitcher lang={lang === "ar" ? "ar" : "en"} slug={slug} />
      <Outlet />
    </div>
  );
}
