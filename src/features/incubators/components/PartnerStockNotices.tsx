import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, PackageOpen } from "lucide-react";
import { incubatorsQueries } from "@/lib/data/incubators";
import {
  partnerPickupLines,
  partnerStockMismatches,
  type PartnerHold,
  type PartnerStockRow,
  type PartnerTotalRow,
} from "@/features/incubators/lib/partner-stock";

/** The rows as the rules read them (joined columns narrowed). */
const asHolds = (rows: unknown[]) => rows as PartnerHold[];
const asTotals = (rows: unknown[]) => rows as PartnerTotalRow[];

/**
 * What a partner's page says above its stock:
 *
 * - the pieces online orders have taken from this partner and that are still on its shelf, to
 *   hand back (their count is already lowered, so they cannot be sold twice);
 * - a warning when a product's total at partners differs from what the partners hold. The
 *   database keeps the two equal, so this only appears for stock from before that rule.
 */
export function PartnerStockNotices({
  brandId,
  slug,
  incubatorId,
  stock,
  isAr,
}: {
  brandId: string;
  slug: string;
  incubatorId: string | null;
  /** Every partner's stock lines (not only this partner's). */
  stock: readonly PartnerStockRow[];
  isAr: boolean;
}) {
  const lang = isAr ? "ar" : "en";
  const holds = useQuery({ ...incubatorsQueries.orderHolds(brandId), select: asHolds });
  const totals = useQuery({ ...incubatorsQueries.partnerTotals(brandId), select: asTotals });
  const toHandBack = partnerPickupLines(holds.data ?? [], incubatorId, lang);
  // Compared only once the totals are known, or every piece would look unaccounted for.
  const mismatches = totals.data ? partnerStockMismatches(stock, totals.data, lang) : [];
  if (toHandBack.length === 0 && mismatches.length === 0) return null;

  return (
    <div className="space-y-3">
      {toHandBack.length > 0 && (
        <div
          role="status"
          className="rounded-xl border border-amber-300/70 bg-amber-50/80 p-3 text-start text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <p className="flex items-center gap-2 text-sm font-bold">
            <PackageOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
            {isAr
              ? "قطع محجوزة لطلبات المتجر: تُستلم من هذا المحل الشريك"
              : "Reserved by store orders: to collect from this partner"}
          </p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {toHandBack.map((line) => (
              <li key={line.key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 break-words font-semibold" dir="auto">
                  {line.quantity} × {line.piece}
                </span>
                <Link
                  to="/admin/b/$slug/orders/$id"
                  params={{ slug, id: line.orderId }}
                  className="font-semibold underline underline-offset-2"
                >
                  {isAr ? "الطلب" : "Order"} #{line.orderNumber || line.orderId.slice(0, 8)}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-100/80">
            {isAr
              ? "خُصمت من رصيد المحل الشريك عند الطلب، وتعود إليه تلقائياً إذا أُلغي الطلب."
              : "They left this partner's count when the order was placed, and return to it if the order is cancelled."}
          </p>
        </div>
      )}
      {mismatches.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-start"
        >
          <p className="flex items-center gap-2 text-sm font-bold text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {isAr
              ? "رصيد محلات الشركاء لا يطابق ما تحتفظ به محلات الشركاء"
              : "The total at partners does not match what the partners hold"}
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {mismatches.map((item) => (
              <li key={item.variantId} className="break-words" dir="auto">
                {item.piece}:{" "}
                {isAr
                  ? `المسجّل على المنتج ${item.onProduct}، وعند محلات الشركاء ${item.atPartners}`
                  : `the product says ${item.onProduct}, the partners hold ${item.atPartners}`}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {isAr
              ? "حوّل القطع غير المسجّلة إلى المحل الشريك الذي يحتفظ بها، أو أعدها إلى مخزون المحل."
              : "Transfer the unaccounted pieces to the partner that holds them, or return them to the store's stock."}
          </p>
        </div>
      )}
    </div>
  );
}
