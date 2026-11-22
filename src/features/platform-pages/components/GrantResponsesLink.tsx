import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { platformPagesAdminQueries } from "@/lib/data/platform-pages/admin";

/**
 * Where the grant survey's applications are now: the inbox of the platform page `grant`
 * (migration 20261219100000), with its words and form edited in the page's editor.
 */
export function GrantResponsesLink({ lang }: { lang: "ar" | "en" }) {
  const ar = lang === "ar";
  const { data: id } = useQuery(platformPagesAdminQueries.idBySlug("grant"));
  return (
    <div className="space-y-3 rounded-xl border border-border-subtle bg-card p-4 text-sm">
      <p className="text-muted-foreground">
        {ar
          ? "طلبات المنحة أصبحت ردود صفحة «grant» في صفحات المنصة: تُقرأ وتُصدَّر من صندوق الردود، ويُعدَّل الاستبيان من محرر الصفحة."
          : "Grant applications are now the responses of the page “grant” in Platform pages: read and exported from its inbox, and the survey edited in the page's editor."}
      </p>
      {id && (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/admin/super/responses/$id" params={{ id }}>
              <Inbox className="size-4" />
              {ar ? "صندوق الردود" : "Responses inbox"}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/super/pages/$id" params={{ id }}>
              {ar ? "تعديل الاستبيان" : "Edit the survey"}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
