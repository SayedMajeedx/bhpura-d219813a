import { Link } from "@tanstack/react-router";
import { CalendarClock, Sparkles, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TabsPill } from "@/components/motion/TabsPill";

export type DiscountKind = "codes" | "offers";

/**
 * The Discounts page's two kinds, one at a time: codes a shopper types, and the store's automatic
 * offers. A store that books also gets a way to its booking offers (early bird, last minute),
 * which are set on the bookings page.
 */
export function DiscountsKindSwitcher({
  lang,
  kind,
  onKindChange,
  counts,
  slug,
  bookings,
}: {
  lang: "ar" | "en";
  kind: DiscountKind;
  onKindChange: (kind: DiscountKind) => void;
  counts: { codes: number; offers: number };
  slug: string;
  bookings: boolean;
}) {
  const isAr = lang === "ar";
  const tabs = [
    {
      id: "codes" as const,
      label: isAr ? "رموز الخصم" : "Promo codes",
      icon: Tag,
      count: counts.codes,
    },
    {
      id: "offers" as const,
      label: isAr ? "عروض تلقائية" : "Automatic offers",
      icon: Sparkles,
      count: counts.offers,
    },
  ];
  return (
    <div className="space-y-2">
      <div
        role="tablist"
        aria-label={isAr ? "نوع الخصم" : "Kind of discount"}
        className="t-tabs relative grid grid-cols-2 gap-1.5 rounded-xl border border-border-subtle bg-muted/40 p-1 sm:inline-flex"
      >
        <TabsPill />
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = kind === tab.id;
          return (
            <Button
              key={tab.id}
              type="button"
              role="tab"
              variant="ghost"
              aria-selected={active}
              onClick={() => onKindChange(tab.id)}
              className={cn(
                "t-tab h-9 gap-1.5 rounded-lg px-3 text-sm font-semibold",
                active
                  ? "bg-background text-foreground shadow-xs hover:bg-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{tab.label}</span>
              <span className="rounded-full bg-muted px-1.5 text-xs">{tab.count}</span>
            </Button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {kind === "codes"
          ? isAr
            ? "رمز يكتبه المتسوق عند الدفع. إن وُجد عرض تلقائي أيضًا، فالأوفر للعميل يُطبَّق (تغيّر ذلك من العروض التلقائية)."
            : "A code the shopper types at checkout. When an automatic offer also applies, the one that saves more is used (change that under Automatic offers)."
          : isAr
            ? "تُطبَّق تلقائيًا على كل طلب من المتجر دون رمز."
            : "Applied automatically to every storefront order, with no code."}
      </p>
      {bookings && (
        <Link
          to="/admin/b/$slug/bookings"
          params={{ slug }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          {isAr
            ? "عروض الحجز (الحجز المبكر وفي اللحظة الأخيرة) تُضبط من صفحة الحجوزات ←"
            : "Booking offers (early bird, last minute) are set on the bookings page →"}
        </Link>
      )}
    </div>
  );
}
