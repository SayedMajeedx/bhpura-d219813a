import { createFileRoute, Outlet, redirect, Link, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, useT } from "@/lib/i18n";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Package, Users, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports")({
  beforeLoad: async ({ params }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });

    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("role, status, email, permissions")
      .eq("id", user.id)
      .maybeSingle();

    const email = (user.email || "").toLowerCase();
    const isFixedSuperAdmin = email === "majeed@hotmail.it";
    const role = profile?.role;
    const status = profile?.status ?? "active";
    const permissions = (profile?.permissions as string[]) || [];
    const hasFinancials = permissions.includes("view_financials");
    
    const allowed =
      isFixedSuperAdmin ||
      ((role === "admin" || role === "super_admin" || role === "brand_admin" || (role === "staff" && hasFinancials)) && status === "active");

    if (!allowed) {
      throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug: params.slug } });
    }
  },
  component: ReportsLayout,
});

function ReportsLayout() {
  const { lang } = useI18n();
  const t = useT();
  const location = useLocation();
  const { slug } = Route.useParams();

  const isSales = location.pathname.includes("/sales");
  const isProducts = location.pathname.includes("/products");
  const isCustomers = location.pathname.includes("/customers");
  const isExport = location.pathname.includes("/export");
  const isOverview = !isSales && !isProducts && !isCustomers && !isExport;

  const currentTab = isSales ? "sales" : isProducts ? "products" : isCustomers ? "customers" : isExport ? "export" : "overview";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display tracking-tight">
            {lang === "ar" ? "التقارير" : "Reports"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {lang === "ar" ? "تحليل أداء المتجر والمبيعات" : "Analyze your store performance and sales"}
          </p>
        </div>
      </div>

      <Tabs value={currentTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden no-scrollbar bg-transparent border-b rounded-none p-0 h-12">
          <TabsTrigger value="overview" asChild className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2">
            <Link to="/admin/b/$slug/reports" params={{ slug }} className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              {lang === "ar" ? "نظرة عامة" : "Overview"}
            </Link>
          </TabsTrigger>
          <TabsTrigger value="sales" asChild className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2">
            <Link to="/admin/b/$slug/reports/sales" params={{ slug }} className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {lang === "ar" ? "المبيعات" : "Sales"}
            </Link>
          </TabsTrigger>
          <TabsTrigger value="products" asChild className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2">
            <Link to="/admin/b/$slug/reports/products" params={{ slug }} className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              {lang === "ar" ? "المنتجات" : "Products"}
            </Link>
          </TabsTrigger>
          <TabsTrigger value="customers" asChild className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2">
            <Link to="/admin/b/$slug/reports/customers" params={{ slug }} className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              {lang === "ar" ? "العملاء" : "Customers"}
            </Link>
          </TabsTrigger>
          <TabsTrigger value="export" asChild className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2">
            <Link to="/admin/b/$slug/reports/export" params={{ slug }} className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              {lang === "ar" ? "تصدير البيانات" : "Export Data"}
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="pt-2">
        <Outlet />
      </div>
    </div>
  );
}
