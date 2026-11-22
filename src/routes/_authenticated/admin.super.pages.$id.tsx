import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { requireSuperAdminRoute } from "@/lib/auth/super-admin-route";
import { PageEditor } from "@/features/platform-pages/components/PageEditor";

export const Route = createFileRoute("/_authenticated/admin/super/pages/$id")({
  beforeLoad: requireSuperAdminRoute,
  component: PlatformPageEditorRoute,
});

function PlatformPageEditorRoute() {
  const { id } = Route.useParams();
  const { lang } = useI18n();
  return <PageEditor id={id} lang={lang === "ar" ? "ar" : "en"} />;
}
