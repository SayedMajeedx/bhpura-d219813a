import { Button } from "@/components/ui/button";
import { AlertCircle, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";

import { orderTabCounts } from "@/features/orders/lib/order-queue";
import type { Dispatch, SetStateAction } from "react";

/**
 * Nudge to open the 'Needs attention' tab when orders are waiting on the team:
 * one line that is itself the way in, with the reasons beside it. From `sm` up
 * only: on a phone it repeated the first filter tab, right above it, which now
 * turns amber itself (`urgent` in `orderQueueTabs`), and pushed the orders down.
 */
export function UrgentOrdersBanner({
  hasMadeToOrder,
  lang,
  setPage,
  setTabFilter,
  tabCounts,
}: {
  hasMadeToOrder: boolean;
  lang: ReturnType<typeof useI18n>["lang"];
  setPage: Dispatch<SetStateAction<number>>;
  setTabFilter: Dispatch<
    SetStateAction<"all" | "unpaid" | "to_prepare" | "action_required" | "shipped" | "completed">
  >;
  tabCounts: ReturnType<typeof orderTabCounts>;
}) {
  const isAr = lang === "ar";
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        setTabFilter("action_required");
        setPage(1);
      }}
      className="h-auto w-full justify-between max-sm:hidden gap-3 whitespace-normal rounded-xl border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-start text-xs font-medium text-amber-900 hover:bg-amber-500/20 dark:text-amber-200"
    >
      <span className="flex min-w-0 items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="min-w-0 break-words">
          <span className="font-bold">
            {isAr
              ? `${tabCounts.action_required} طلب يحتاج إجراءً فورياً`
              : `${tabCounts.action_required} order(s) need action now`}
          </span>
          <span className="ms-1.5 hidden opacity-80 sm:inline">
            {isAr
              ? hasMadeToOrder
                ? "(تحصيل عند الاستلام، تسليم غير مكتمل، أو تفاصيل الطلب)"
                : "(تحصيل عند الاستلام، تسليم غير مكتمل، أو تأكيد الدفع)"
              : hasMadeToOrder
                ? "(COD collection, failed delivery, or custom specifications)"
                : "(COD collection, failed delivery, or payment verification)"}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 font-bold">
        {isAr ? "عرضها" : "Review"}
        <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
      </span>
    </Button>
  );
}
