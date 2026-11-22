import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { requireSuperAdminRoute } from "@/lib/auth/super-admin-route";
import { SuperAdminHome } from "@/features/super-admin-home/components/SuperAdminHome";

/** The super admin's home (`/admin` sends a super admin here). */
export const Route = createFileRoute("/_authenticated/admin/brands")({
  beforeLoad: requireSuperAdminRoute,
  component: SuperAdminHomeRoute,
});

function SuperAdminHomeRoute() {
  const { lang } = useI18n();
  return <SuperAdminHome lang={lang === "ar" ? "ar" : "en"} />;
}
