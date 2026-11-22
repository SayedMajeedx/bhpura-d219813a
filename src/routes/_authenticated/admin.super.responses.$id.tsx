import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { requireSuperAdminRoute } from "@/lib/auth/super-admin-route";
import { ResponsesInbox } from "@/features/platform-pages/components/ResponsesInbox";

/** A platform page's responses (`/admin/super/responses/<page id>`). */
export const Route = createFileRoute("/_authenticated/admin/super/responses/$id")({
  beforeLoad: requireSuperAdminRoute,
  component: ResponsesRoute,
});

function ResponsesRoute() {
  const { id } = Route.useParams();
  const { lang } = useI18n();
  return <ResponsesInbox pageId={id} lang={lang === "ar" ? "ar" : "en"} />;
}
