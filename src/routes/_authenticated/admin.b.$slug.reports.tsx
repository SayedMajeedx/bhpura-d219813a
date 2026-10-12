import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports")({
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
