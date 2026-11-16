import { Link } from "@tanstack/react-router";
import { Banknote, ReceiptText, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { countOf } from "@/lib/arabic-count";
import type { TodayFigures } from "@/features/dashboard/lib/dashboard-today";

/**
 * Today, first: the orders placed today, today's net sales (for staff who see the finances) and
 * what is still to collect on the orders not finished yet. One slim row on every width.
 */
export function TodayStrip({
  today,
  loading,
  currency,
  locale,
  isAr,
  slug,
  isServices,
}: {
  today: TodayFigures | null;
  loading: boolean;
  currency: string;
  locale: string;
  isAr: boolean;
  slug: string;
  isServices: boolean;
}) {
  const lang = isAr ? "ar" : "en";
  const cells = [
    {
      key: "orders",
      icon: ReceiptText,
      label: isServices
        ? isAr
          ? "حجوزات وطلبات اليوم"
          : "Bookings & orders today"
        : isAr
          ? "طلبات اليوم"
          : "Orders today",
      value: today ? String(today.ordersToday) : "",
      note: null as string | null,
    },
    ...(today?.salesToday !== null && today?.salesToday !== undefined
      ? [
          {
            key: "sales",
            icon: TrendingUp,
            label: isAr ? "صافي مبيعات اليوم" : "Net sales today",
            value: formatMoney(today.salesToday, currency, locale),
            note: null,
          },
        ]
      : []),
    {
      key: "collect",
      icon: Banknote,
      label: isAr ? "متبقٍّ للتحصيل" : "Still to collect",
      value: today ? formatMoney(today.toCollect, currency, locale) : "",
      note:
        today && today.toCollectCount > 0
          ? isAr
            ? `على ${countOf(today.toCollectCount, "order", lang)} مفتوحة`
            : `on ${countOf(today.toCollectCount, "order", lang)} still open`
          : null,
    },
  ];

  return (
    <section
      aria-label={isAr ? "اليوم" : "Today"}
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-2xs ${cells.length === 3 ? "sm:grid-cols-3" : ""}`}
    >
      {cells.map((cell, index) => {
        const Icon = cell.icon;
        const content = (
          <>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {cell.label}
            </span>
            {loading || !today ? (
              <Skeleton className="mt-1.5 h-5 w-20" />
            ) : (
              <span className="mt-1 block font-mono text-lg font-semibold tabular-nums text-foreground">
                {cell.value}
              </span>
            )}
            {cell.note && <span className="block text-xs text-muted-foreground">{cell.note}</span>}
          </>
        );
        // Three cells on a phone: the third takes the row under the first two.
        const wide = cells.length === 3 && index === 2;
        const cellClass = `block min-w-0 bg-card px-4 py-3 ${wide ? "col-span-2 sm:col-span-1" : ""}`;
        return cell.key === "collect" ? (
          <Link
            key={cell.key}
            to="/admin/b/$slug/orders"
            params={{ slug }}
            className={`${cellClass} transition-colors duration-(--motion-quick) hover:bg-muted/40`}
          >
            {content}
          </Link>
        ) : (
          <div key={cell.key} className={cellClass}>
            {content}
          </div>
        );
      })}
    </section>
  );
}
