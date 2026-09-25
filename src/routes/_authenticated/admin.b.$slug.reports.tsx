import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ensureSessionUser } from "@/lib/auth/ensure-session-user";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports")({
  beforeLoad: async ({ context: { queryClient }, params }) => {
    const user = await ensureSessionUser(queryClient);

    if (!user) throw redirect({ to: "/auth" });

    const profile = await queryClient.ensureQueryData(profilesQueries.caller(user.id));

    const role = profile?.role;
    const permissions = permissionsOf(profile);
    const allowed =
      (user.email || "").toLowerCase() === "majeed@hotmail.it" ||
      (profile?.status !== "disabled" &&
        (["admin", "super_admin", "brand_admin"].includes(role ?? "") ||
          (role === "staff" && permissions.includes("view_financials"))));

    if (!allowed) {
      throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug: params.slug } });
    }
  },
  component: ReportsLayout,
});

import { ReportsCommandHeader } from "@/components/reports/ReportsCommandHeader";
import { ReportsScopeSwitcher } from "@/components/reports/ReportsScopeSwitcher";
import { permissionsOf, profilesQueries } from "@/lib/data/profiles";

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
