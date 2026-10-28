import {
  Box,
  Check,
  CheckCircle2,
  Clock,
  PackageCheck,
  Scissors,
  Store,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { stageMenuEntries, type StageKey } from "@/features/orders/lib/stage-menu";
import type { useVocabulary } from "@/hooks/use-vocabulary";

type Lang = "ar" | "en";

/** What each stage reads as, for the kind of order it is offered on. */
function labelOf(
  key: StageKey,
  method: string,
  lang: Lang,
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"],
): string {
  const ar = lang === "ar";
  switch (key) {
    case "workshop_sent":
      return vocabulary.sent_to_workshop[lang] || (ar ? "تم الإرسال للورشة" : "Sent to Workshop");
    case "workshop_received":
      return (
        vocabulary.received_from_workshop[lang] ||
        (ar ? "تم الاستلام من الورشة" : "Receive from Workshop")
      );
    case "packing":
      return ar ? "بدء التعبئة والتغليف" : "Start Packing";
    case "ready_pickup":
      return ar ? "جاهز للاستلام (المحل)" : "Ready for Pickup";
    case "shipped":
      return ar ? "تم الشحن والتسليم للمندوب" : "Mark Shipped";
    case "complete":
      if (method === "appointment") return ar ? "تم تنفيذ الخدمة" : "Service done";
      if (method === "digital")
        return ar ? "تم تسليم الطلب الرقمي" : "Mark digital order delivered";
      return ar ? "إكمال وتسليم الطلب" : "Complete Order";
    case "hold":
      return ar ? "قيد الانتظار" : "On Hold / Pending";
    case "cancel":
      return method === "appointment"
        ? ar
          ? "إلغاء الحجز والطلب"
          : "Cancel the booking and order"
        : ar
          ? "إلغاء الطلب"
          : "Cancel Order";
  }
}

const ICON: Record<StageKey, { icon: LucideIcon; tone: string }> = {
  workshop_sent: { icon: Scissors, tone: "text-purple-600" },
  workshop_received: { icon: PackageCheck, tone: "text-teal-600" },
  packing: { icon: Box, tone: "text-amber-600" },
  ready_pickup: { icon: Store, tone: "text-indigo-600" },
  shipped: { icon: Truck, tone: "text-sky-600" },
  complete: { icon: CheckCircle2, tone: "text-emerald-600" },
  hold: { icon: Clock, tone: "text-slate-500" },
  cancel: { icon: XCircle, tone: "text-destructive" },
};

/**
 * The order page's stage menu: only the stages this kind of order can be in (`stageMenuEntries`),
 * the current one ticked. Choosing one asks the caller to confirm it.
 */
export function OrderStageMenuItems({
  currentStage,
  lang,
  method,
  onChoose,
  vocabulary,
  workshop,
}: {
  currentStage: string | null | undefined;
  lang: Lang;
  method: string | null | undefined;
  onChoose: (status: string, fulfillmentStatus: string) => void;
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
  workshop: boolean;
}) {
  const kind = String(method ?? "delivery").toLowerCase();
  const entries = stageMenuEntries(
    { fulfillment_method: kind, fulfillment_status: currentStage },
    { workshop },
  );
  return (
    <>
      {entries.map((entry) => {
        const { icon: Icon, tone } = ICON[entry.key];
        const current = currentStage === entry.fulfillmentStatus;
        return (
          <div key={entry.key}>
            {entry.key === "hold" && kind !== "appointment" && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={() => onChoose(entry.status, entry.fulfillmentStatus)}
              className={cn(
                "flex cursor-pointer items-center justify-between",
                entry.key === "cancel" && "text-destructive focus:text-destructive",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn("h-4 w-4 shrink-0", tone)} aria-hidden="true" />
                <span className="text-xs font-medium">
                  {labelOf(entry.key, kind, lang, vocabulary)}
                </span>
              </div>
              {current && (
                <Check
                  className={cn(
                    "h-3.5 w-3.5",
                    entry.key === "cancel" ? "text-destructive" : "text-primary",
                  )}
                  aria-hidden="true"
                />
              )}
            </DropdownMenuItem>
          </div>
        );
      })}
    </>
  );
}
