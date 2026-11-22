import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { requireSuperAdminRoute } from "@/lib/auth/super-admin-route";
import { PlatformPagesList } from "@/features/platform-pages/components/PlatformPagesList";

export const Route = createFileRoute("/_authenticated/admin/super/pages/")({
  beforeLoad: requireSuperAdminRoute,
  component: PlatformPagesRoute,
});

function PlatformPagesRoute() {
  const { lang } = useI18n();
  return <PlatformPagesList lang={lang === "ar" ? "ar" : "en"} />;
}
