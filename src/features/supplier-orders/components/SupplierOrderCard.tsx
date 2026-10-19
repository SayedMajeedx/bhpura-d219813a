import { Link } from "@tanstack/react-router";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { useBrand } from "@/lib/brand-context";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isLate, paymentOf, piecesLabel, piecesOf, type SupplierOrder } from "../lib/order-state";
import { SupplierOrderStatusBadge } from "./SupplierOrderStatusBadge";

/** One order in the list: who, what is still to come, what is still owed. */
export function SupplierOrderCard({
  order,
  today,
  currency,
  lang,
}: {
  order: SupplierOrder;
  today: string;
  currency: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const brand = useBrand();
  const pieces = piecesOf(order);
  const pay = paymentOf(order);
  const late = isLate(order, today);
  const share = pieces.ordered > 0 ? Math.round((pieces.received / pieces.ordered) * 100) : 0;
  const Chevron = isAr ? ChevronLeft : ChevronRight;

  return (
    <Link
      to="/admin/b/$slug/supplier-orders/$id"
      params={{ slug: brand.slug, id: order.id }}
      className="group block rounded-xl border border-border-subtle bg-card p-3 shadow-2xs transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span dir="auto" className="text-page-start line-clamp-2 break-words font-bold">
              {order.vendor_name || (isAr ? "مورد" : "Supplier")}
            </span>
            <SupplierOrderStatusBadge status={order.status} late={late} isAr={isAr} />
          </div>
          <p className="text-xs text-muted-foreground">
            <span dir="ltr" className="font-mono">
              {order.po_number}
            </span>
            {" · "}
            {piecesLabel(pieces.ordered, lang)}
            {order.expected_at && order.status !== "received" && order.status !== "cancelled" && (
              <span className={cn("ms-2 inline-flex items-center gap-1", late && "text-warning")}>
                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                {isAr ? "موعد الوصول " : "Due "}
                {formatDate(order.expected_at, isAr ? "ar-BH" : "en-BH")}
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-end">
          <p className="font-bold tabular-nums">{formatMoney(pay.total, currency, lang)}</p>
          {pay.owed > 0 && order.status !== "draft" && (
            <p className="text-xs font-semibold text-warning tabular-nums">
              {isAr ? "باقي " : "Owed "}
              {formatMoney(pay.owed, currency, lang)}
            </p>
          )}
        </div>
        <Chevron
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
          aria-hidden="true"
        />
      </div>

      {(order.status === "ordered" || order.status === "partially_received") &&
        pieces.ordered > 0 && (
          <div className="mt-3 space-y-1">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={pieces.ordered}
              aria-valuenow={pieces.received}
              aria-label={isAr ? "ما وصل من القطع" : "Pieces arrived"}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? `وصل ${pieces.received} من ${pieces.ordered} · باقي ${pieces.remaining}`
                : `${pieces.received} of ${pieces.ordered} arrived · ${pieces.remaining} to come`}
            </p>
          </div>
        )}
    </Link>
  );
}
