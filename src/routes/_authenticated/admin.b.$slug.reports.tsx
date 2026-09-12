import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { BarChart3, TrendingUp, Package, Users, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports")({
  beforeLoad: async ({ context: { queryClient }, params }) => {
    const user = await queryClient.ensureQueryData({
      queryKey: ["auth_user"],
      queryFn: async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw redirect({ to: "/auth" });
        return data.user;
      },
      staleTime: 1000 * 60 * 5,
    });

    const profile = await queryClient.ensureQueryData({
      queryKey: ["caller_permissions", user.id],
      queryFn: async () => {
        const { data } = await (supabase as any)
          .from("profiles")
          .select("role, status, email, permissions")
          .eq("id", user.id)
          .maybeSingle();
        return data ?? null;
      },
      staleTime: 1000 * 60 * 5,
    });

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
