import { Link } from "@tanstack/react-router";
import { ChevronRight, MessagesSquare } from "lucide-react";
import { useOutreachPage } from "@/features/outreach/hooks/use-outreach-page";
import { arCount } from "@/features/outreach/lib/outreach-messages";

const CLIENTS = {
  one: "عميل واحد يستحق",
  two: "عميلان يستحقان",
  few: "عملاء يستحقون",
  many: "عميلاً يستحقون",
};

/**
 * One line on the dashboard when clients are worth a message today, the way in to the list.
 * Nothing at all while it loads or when nobody is due: the dashboard keeps its quiet.
 */
export function OutreachDashboardLine({ slug, isAr }: { slug: string; isAr: boolean }) {
  const page = useOutreachPage(isAr ? "ar" : "en");
  const count = page.today.length;
  if (page.loadState !== "ready" || count === 0) return null;

  return (
    <Link
      to="/admin/b/$slug/outreach"
      params={{ slug }}
      className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs transition-colors hover:bg-muted/50"
    >
      <MessagesSquare className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm font-medium">
        {isAr
          ? `${arCount(count, CLIENTS)} رسالة اليوم`
          : `${count} ${count === 1 ? "client is" : "clients are"} worth a message today`}
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
        aria-hidden="true"
      />
    </Link>
  );
}
