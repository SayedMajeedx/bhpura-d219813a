import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { invalidateStoreStatus, setOrdersPause, storeStatusQueries } from "@/lib/data/store-status";
import { arNoun } from "@/lib/arabic-count";
import { momentLabel, orderIntake, readHours } from "@/lib/opening-hours";
import { getFriendlyErrorMessage, cn } from "@/lib/utils";

/** The pauses offered, in minutes; null: until the store reopens. */
export const PAUSE_CHOICES: Array<number | null> = [15, 30, 60, null];

/** The moment a pause of so many minutes ends ("infinity": until reopened). */
export const pauseUntil = (minutes: number | null, now: Date) =>
  minutes === null ? "infinity" : new Date(now.getTime() + minutes * 60_000).toISOString();

/**
 * On the dashboard: whether the store is taking orders now, and a busy pause in one tap (15, 30
 * or 60 minutes, or until reopened) or reopening. The pause stops new storefront orders and
 * bookings in the database; staff orders go on. Its hours are shown as the shopper reads them.
 */
export function StoreStatusCard({
  brandId,
  isAr,
  canChange,
}: {
  brandId: string;
  isAr: boolean;
  canChange: boolean;
}) {
  const qc = useQueryClient();
  const lang = isAr ? "ar" : "en";
  const status = useQuery(storeStatusQueries.detail(brandId)).data;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const pause = useMutation({
    mutationFn: (until: string | null) => setOrdersPause(brandId, until),
    onSuccess: async (_data, until) => {
      setNow(new Date());
      await invalidateStoreStatus(qc, brandId);
      toast.success(
        until
          ? isAr
            ? "أُوقفت الطلبات الجديدة."
            : "New orders are paused."
          : isAr
            ? "عاد المتجر يستقبل الطلبات."
            : "The store is taking orders again.",
      );
    },
    onError: (error) =>
      toast.error(getFriendlyErrorMessage(error) || (isAr ? "تعذر الحفظ." : "Could not save.")),
  });
  if (!status) return null;

  const intake = orderIntake(status, now);
  const tz = readHours(status.opening_hours).timezone;
  const when = (iso: string) => momentLabel(iso, tz, now, lang);
  let line: string;
  if (intake.state === "paused") {
    line = intake.until
      ? isAr
        ? `الطلبات الجديدة متوقفة حتى ${when(intake.until)}`
        : `New orders paused until ${when(intake.until)}`
      : isAr
        ? "الطلبات الجديدة متوقفة حتى تعيد فتحها"
        : "New orders paused until you reopen";
  } else if (intake.state === "closed") {
    const opens = intake.opens ? when(intake.opens) : null;
    line = intake.accepting
      ? isAr
        ? `خارج ساعات العمل: الطلبات تصل وتُجهَّز${opens ? ` من ${opens}` : ""}`
        : `Outside opening hours: orders come in and are handled${opens ? ` from ${opens}` : ""}`
      : isAr
        ? `مغلق حسب ساعات العمل${opens ? `، يفتح ${opens}` : ""}`
        : `Closed by opening hours${opens ? `, opens ${opens}` : ""}`;
  } else {
    line = isAr ? "المتجر يستقبل الطلبات" : "The store is taking orders";
  }
  const paused = intake.state === "paused";

  return (
    <section
      aria-label={isAr ? "حالة استقبال الطلبات" : "Order intake"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs",
        paused && "border-warning/40 bg-warning/10",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5 text-sm font-medium">
        {paused ? (
          <PauseCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        ) : (
          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="min-w-0">{line}</span>
      </span>
      {canChange &&
        (paused ? (
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={pause.isPending}
            onClick={() => pause.mutate(null)}
          >
            <PlayCircle className="h-4 w-4" aria-hidden />
            {isAr ? "استقبل الطلبات الآن" : "Reopen now"}
          </Button>
        ) : (
          <div
            role="group"
            aria-label={isAr ? "أوقف الطلبات الجديدة" : "Pause new orders"}
            className="flex flex-wrap items-center gap-1.5"
          >
            <span className="text-xs text-muted-foreground">{isAr ? "مشغول؟" : "Busy?"}</span>
            {PAUSE_CHOICES.map((minutes) => (
              <Button
                key={String(minutes)}
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={pause.isPending}
                onClick={() => pause.mutate(pauseUntil(minutes, new Date()))}
              >
                {minutes === null
                  ? isAr
                    ? "حتى أعيد الفتح"
                    : "Until I reopen"
                  : minutes === 60
                    ? isAr
                      ? "ساعة"
                      : "1 hour"
                    : isAr
                      ? arNoun(minutes, "minute")
                      : `${minutes} min`}
              </Button>
            ))}
          </div>
        ))}
    </section>
  );
}
