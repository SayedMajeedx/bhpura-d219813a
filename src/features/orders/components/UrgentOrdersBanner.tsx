import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

import { orderTabCounts } from "@/features/orders/lib/order-queue";
import type { Dispatch, SetStateAction } from "react";

/** Nudge to open the 'Needs attention' tab when orders are waiting on the team. */
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
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
      <div className="flex items-center gap-2.5">
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="text-xs font-medium">
          <span className="font-bold">
            {lang === "ar"
              ? `تنبيه: ${tabCounts.action_required} طلب يحتاج إجراءً فورياً`
              : `Attention: ${tabCounts.action_required} order(s) require immediate action`}
          </span>
          <span className="opacity-80 ms-1.5 hidden sm:inline">
            {lang === "ar"
              ? hasMadeToOrder
                ? "(تحصيل عند الاستلام، تسليم غير مكتمل، أو تفاصيل الطلب)"
                : "(تحصيل عند الاستلام، تسليم غير مكتمل، أو تأكيد الدفع)"
              : hasMadeToOrder
                ? "(COD collection, failed delivery, or custom specifications)"
                : "(COD collection, failed delivery, or payment verification)"}
          </span>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setTabFilter("action_required");
          setPage(1);
        }}
        className="h-7 text-xs font-bold border-amber-500/40 hover:bg-amber-500/20 text-amber-900 dark:text-amber-100 shrink-0"
      >
        {lang === "ar" ? "معالجة التنبيهات الآن" : "Resolve Exceptions Now"}
      </Button>
    </div>
  );
}
