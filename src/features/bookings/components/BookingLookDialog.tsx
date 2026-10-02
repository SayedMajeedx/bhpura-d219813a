import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gem, Palette, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  bookingPageOptionsKeys,
  bookingPageOptionsQueries,
  invalidateBookingPageOptions,
  saveBookingPageOptions,
} from "@/lib/data/booking-page-options";
import {
  DEFAULT_PACKAGE_STYLE,
  PACKAGE_STYLES,
  PACKAGE_STYLE_LABELS,
  packageCardClass,
  type PackageStyle,
} from "@/lib/bookings/package-style";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

/** A small live sample of a package card in one look (the same classes the storefront uses). */
function Sample({ style, isAr }: { style: PackageStyle; isAr: boolean }) {
  return (
    <span
      className={cn(
        packageCardClass(style),
        "flex min-h-24 w-full items-center gap-3 p-3",
        style === "ribbon" && "pt-8",
      )}
    >
      {style === "ribbon" && (
        <span className="pkg-tag" aria-hidden="true">
          <Gem className="size-3.5" />
          {isAr ? "باقة" : "PACKAGE"}
        </span>
      )}
      <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/30">
        <Gem className="size-6" aria-hidden="true" />
      </span>
      <span className="min-w-0 space-y-0.5 text-start">
        {style !== "ribbon" && (
          <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="size-3" aria-hidden="true" />
            {isAr ? "باقة" : "Package"}
          </span>
        )}
        <span className="block truncate font-display text-base text-foreground">
          {isAr ? "الباقة الماسية" : "Diamond package"}
        </span>
        <span className="block text-xs text-muted-foreground">
          {isAr ? "وفّر 25%" : "Save 25%"}
        </span>
      </span>
    </span>
  );
}

/** How packages stand out on the store's booking page: four looks, each shown live. */
export function BookingLookDialog({
  page,
  open,
  onOpenChange,
}: {
  page: BookingsPage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isAr, brand } = page;
  const qc = useQueryClient();
  const query = useQuery(bookingPageOptionsQueries.options(brand.id));
  // The stored look must be known before anything can be saved, or the default
  // would be written over it.
  const ready = query.isSuccess;
  const saved = query.data?.package_style;
  const [picked, setPicked] = useState<PackageStyle | null>(null);
  const current = picked ?? saved ?? DEFAULT_PACKAGE_STYLE;
  const save = useMutation({
    mutationFn: (style: PackageStyle) => saveBookingPageOptions(brand.id, { package_style: style }),
    onSuccess: async (_data, style) => {
      qc.setQueryData(bookingPageOptionsKeys.all(brand.id), { package_style: style });
      await invalidateBookingPageOptions(qc, brand.id);
      toast.success(isAr ? "تم حفظ الشكل" : "Look saved");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="size-4 text-primary" aria-hidden="true" />
            {isAr ? "شكل الباقات" : "Package look"}
          </DialogTitle>
          <DialogDescription>
            {isAr
              ? "كيف تظهر الباقات مميّزة عن الخدمات في صفحة الحجز وصفحتك الرئيسية. الألوان من لون علامتك."
              : "How packages stand out from services on your booking page and home page. Colours come from your brand colour."}
          </DialogDescription>
        </DialogHeader>
        <div
          role="radiogroup"
          aria-label={isAr ? "الشكل" : "Look"}
          className="grid gap-4 sm:grid-cols-2"
        >
          {PACKAGE_STYLES.map((style) => {
            const label = PACKAGE_STYLE_LABELS[style];
            const active = ready && current === style;
            return (
              <Button
                key={style}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!ready}
                variant="outline"
                onClick={() => setPicked(style)}
                className={cn(
                  "h-auto flex-col items-stretch gap-2 whitespace-normal rounded-2xl p-3 text-start font-normal",
                  active && "border-primary ring-2 ring-primary/40",
                )}
              >
                <Sample style={style} isAr={isAr} />
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {isAr ? label.ar : label.en}
                  </span>
                  {active && <Check className="size-4 text-primary" aria-hidden="true" />}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isAr ? label.hintAr : label.hintEn}
                </span>
              </Button>
            );
          })}
        </div>
        {query.isError && (
          <p className="text-xs font-semibold text-destructive" role="alert">
            {isAr
              ? "تعذّر تحميل الشكل الحالي. أعد المحاولة."
              : "Could not load the current look. Try again."}
          </p>
        )}
        <Button
          type="button"
          disabled={!ready || save.isPending}
          onClick={() => save.mutate(current)}
        >
          {isAr ? "حفظ الشكل" : "Save look"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
