import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarSync, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { bookingsKeys, bookingsQueries, setCalendarToken } from "@/lib/data/bookings";
import { calendarFeedUrl } from "@/lib/bookings/ics";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

/**
 * The store's bookings in its own calendar app: a private link to subscribe
 * to (Google, Apple, Outlook), copied, made, or reset so an old one stops
 * working.
 */
export function CalendarLinkDialog({ page }: { page: BookingsPage }) {
  const { isAr, brand } = page;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const token = useQuery({ ...bookingsQueries.calendarToken(brand.id), enabled: open }).data;
  const url =
    token && typeof window !== "undefined" ? calendarFeedUrl(window.location.origin, token) : "";

  const renew = useMutation({
    mutationFn: () => setCalendarToken(brand.id, crypto.randomUUID()),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: bookingsKeys.calendarToken(brand.id) });
      toast.success(
        token
          ? isAr
            ? "تم إنشاء رابط جديد؛ الرابط القديم توقف."
            : "New link made; the old one stopped working."
          : isAr
            ? "تم إنشاء رابط التقويم."
            : "Calendar link made.",
      );
    },
    onError: () => toast.error(isAr ? "تعذّر إنشاء الرابط." : "Could not make the link."),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(isAr ? "تم نسخ الرابط" : "Link copied");
    } catch {
      toast.error(isAr ? "تعذّر النسخ" : "Could not copy");
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <CalendarSync className="size-4" aria-hidden="true" />
        {isAr ? "ربط بالتقويم" : "Calendar link"}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !renew.isPending && setOpen(next)}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isAr ? "حجوزاتك في تقويمك" : "Your bookings in your calendar"}
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? "اشترك بهذا الرابط في تقويم Google أو Apple أو Outlook لترى الحجوزات المؤكدة وتتحدث تلقائياً."
                : "Subscribe to this link in Google, Apple or Outlook calendar to see confirmed bookings, kept up to date."}
            </DialogDescription>
          </DialogHeader>

          {url ? (
            <div className="space-y-3 text-sm">
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={url}
                  dir="ltr"
                  aria-label={isAr ? "رابط التقويم" : "Calendar link"}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button type="button" variant="outline" className="gap-1.5" onClick={copy}>
                  <Copy className="size-4" aria-hidden="true" />
                  {isAr ? "نسخ" : "Copy"}
                </Button>
              </div>
              <ul className="list-disc space-y-1 ps-5 text-xs text-muted-foreground">
                <li>
                  {isAr
                    ? "Google: تقويمات أخرى ← من عنوان URL."
                    : "Google Calendar: Other calendars → From URL."}
                </li>
                <li>
                  {isAr
                    ? "Apple: ملف ← اشتراك تقويم جديد."
                    : "Apple Calendar: File → New Calendar Subscription."}
                </li>
                <li>
                  {isAr
                    ? "من يملك الرابط يرى الحجوزات؛ أنشئ رابطاً جديداً إن شاركته بالخطأ."
                    : "Anyone with the link can see the bookings; make a new one if it was shared by mistake."}
                </li>
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isAr ? "لا يوجد رابط بعد." : "There is no link yet."}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant={url ? "outline" : "default"}
              className="gap-1.5"
              disabled={renew.isPending}
              onClick={() => renew.mutate()}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              {url
                ? isAr
                  ? "رابط جديد (يوقف القديم)"
                  : "New link (stops the old one)"
                : isAr
                  ? "إنشاء الرابط"
                  : "Make the link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
