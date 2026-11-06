import {
  READY_ORDER_STEPS,
  TAILORED_ORDER_STEPS,
  activeTrackStep,
} from "@/features/order-receipt/lib/order-track";

export function OrderTimelineTracker({
  status,
  paymentStatus,
  fulfillmentStatus,
  tailored = false,
  makingLabel = null,
  isAr,
  t,
}: {
  status: string;
  paymentStatus: string | null;
  fulfillmentStatus: string | null;
  /** The order holds a piece being made: its time at the workshop is a step of its own. */
  tailored?: boolean;
  /** The store's own word for that step ("قيد التفصيل"). */
  makingLabel?: string | null;
  isAr: boolean;
  t: any;
}) {
  const currentStatus = status.toLowerCase();
  const steps = tailored ? TAILORED_ORDER_STEPS : READY_ORDER_STEPS;
  const activeIndex = activeTrackStep({ status, paymentStatus, fulfillmentStatus, tailored });

  if (activeIndex === -1) {
    return (
      <div className="mt-4 flex items-center justify-center p-3 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30 text-xs font-medium gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
        <span>
          {currentStatus === "cancelled"
            ? t("تم إلغاء هذا الطلب", "This order was cancelled")
            : t("تم استرجاع مبلغ هذا الطلب", "This order was refunded")}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-5 pt-5 border-t border-border-subtle">
      <div className="relative flex justify-between w-full">
        {/* Connection bar */}
        <div className="absolute top-[14px] left-[5%] right-[5%] h-[2px] bg-muted -z-0">
          <div
            className="h-full bg-primary transition-[width] duration-(--motion-very-slow) ease-(--motion-ease-smooth)"
            style={{
              width: `${(activeIndex / (steps.length - 1)) * 100}%`,
              right: isAr ? 0 : "auto",
              left: isAr ? "auto" : 0,
            }}
          />
        </div>

        {/* Dynamic steps indicator */}
        {steps.map((step, idx) => {
          const isCompleted = idx <= activeIndex;
          const isActive = idx === activeIndex;
          return (
            <div key={step.key} className="flex flex-col items-center flex-1 relative z-10">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition duration-(--motion-medium) ${
                  isCompleted
                    ? "bg-primary text-primary-foreground border-primary shadow-xs scale-105"
                    : "bg-background text-muted-foreground border-muted"
                }`}
              >
                {isCompleted ? "✓" : idx + 1}
              </div>
              <span
                className={`text-xs mt-2 font-semibold transition-colors ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {(step.key === "making" && makingLabel) || (isAr ? step.labelAr : step.labelEn)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
