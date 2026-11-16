import { westernNumeralLocale } from "@/lib/format";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Package,
  RotateCcw,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { countOf } from "@/lib/arabic-count";
import { getOrderCustomerName } from "@/lib/order-customer-snapshot";
import { useOrderNumber } from "@/hooks/use-order-number";
import type { AttentionKind } from "@/features/dashboard/lib/dashboard-today";
import type { ordersNeedingAction } from "@/features/dashboard/lib/dashboard-metrics";

/**
 * What needs a person now, in one list: the counts (orders to prepare, appointments whose time
 * has come, returns to inspect, products low on stock), each opening where it is done, then the
 * orders waiting on the store. The dashboard said it three times: a strip of pills, a grid of
 * cards repeating the pills, and a feed of orders further down.
 */
export function AttentionList({
  lines,
  orders,
  loading,
  isAr,
  slug,
  locale,
}: {
  lines: ReadonlyArray<{ kind: AttentionKind; count: number }>;
  orders: ReturnType<typeof ordersNeedingAction>;
  loading: boolean;
  isAr: boolean;
  slug: string;
  locale: string;
}) {
  const lang = isAr ? "ar" : "en";
  const orderNo = useOrderNumber();
  const Chevron = isAr ? ChevronLeft : ChevronRight;
  const heading = isAr ? "يحتاج انتباهك" : "Needs your attention";

  if (loading) {
    return (
      <section
        role="status"
        aria-label={heading}
        className="space-y-2 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-2xs"
      >
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </section>
    );
  }

  if (lines.length === 0 && orders.length === 0) {
    return (
      <section
        aria-label={heading}
        className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
        <p className="text-sm font-medium text-foreground">
          {isAr ? "لا شيء يحتاج انتباهك الآن" : "Nothing needs your attention now"}
        </p>
      </section>
    );
  }

  const row =
    "flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-sm transition-colors duration-(--motion-quick) hover:bg-muted/40";
  return (
    <section
      aria-label={heading}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs"
    >
      <h2 className="border-b border-border-subtle px-4 py-2.5 text-sm font-semibold">{heading}</h2>
      <ul className="divide-y divide-border-subtle">
        {lines.map((line) => {
          const words = LINE_WORDS[line.kind];
          const Icon = words.icon;
          return (
            <li key={line.kind}>
              <Link to={words.to} params={{ slug }} search={words.search} className={row}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${line.kind === "low_stock" ? "text-destructive" : "text-warning"}`}
                    aria-hidden
                  />
                  <span className="min-w-0">{words[lang]}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                  <span className="font-mono font-semibold text-foreground">
                    {countOf(line.count, words.noun, lang)}
                  </span>
                  <Chevron className="h-4 w-4" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
        {orders.map((order) => (
          <li key={order.id}>
            <Link to="/admin/b/$slug/orders/$id" params={{ slug, id: order.id }} className={row}>
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">
                  {orderNo(order.invoice_number)} ·{" "}
                  {getOrderCustomerName(order) || (isAr ? "عميل" : "Customer")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {new Date(order.created_at).toLocaleDateString(westernNumeralLocale(locale), {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="font-mono font-semibold text-foreground">
                  {formatMoney(Number(order.total), order.currency ?? "BHD", locale)}
                </span>
                <Chevron className="h-4 w-4 text-muted-foreground" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const LINE_WORDS = {
  appointments: {
    ar: "مواعيد حان وقتها",
    en: "Appointments whose time has come",
    noun: "appointment",
    icon: CalendarCheck,
    to: "/admin/b/$slug/orders",
    search: { tab: "action_required" },
  },
  prepare: {
    ar: "طلبات بانتظار التجهيز",
    en: "Orders to prepare",
    noun: "order",
    icon: Package,
    to: "/admin/b/$slug/orders",
    search: { tab: "to_prepare", fulfillment_status: "unfulfilled" },
  },
  returns: {
    ar: "مرتجعات بانتظار الفحص",
    en: "Returns to inspect",
    noun: "return",
    icon: RotateCcw,
    to: "/admin/b/$slug/returns",
    search: { status: "requested" },
  },
  low_stock: {
    ar: "منتجات قاربت على النفاد",
    en: "Products running low",
    noun: "product",
    icon: AlertTriangle,
    to: "/admin/b/$slug/inventory",
    search: { filter: "low", scope: "low" },
  },
} as const;
