import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { piecesAwaitingChoice } from "../lib/after-sending";
import { customerOrderName } from "../lib/customer-pieces";
import type { SupplierOrder } from "../lib/order-state";
import { useOrderNumberFormat } from "@/hooks/use-order-number";

/**
 * Customers who cancelled while their piece was with a supplier: each piece waits for the store
 * to stop it or keep it for sale, on its supplier order. Nothing when there is none.
 */
export function CancelledPiecesNotice({
  orders,
  slug,
  lang,
}: {
  orders: readonly SupplierOrder[];
  slug: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const numberFormat = useOrderNumberFormat();
  const waiting = piecesAwaitingChoice(orders);
  if (waiting.length === 0) return null;

  return (
    <section
      aria-label={isAr ? "قطع ألغاها الزبائن" : "Pieces customers cancelled"}
      className="space-y-1.5 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm"
    >
      <p className="flex items-start gap-2 font-semibold">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        {isAr
          ? "ألغى زبائن طلباتهم وقطعهم عند الموردين: قرّر لكل قطعة، توقفها أو تحتفظ بها للبيع."
          : "Customers cancelled while their pieces were with suppliers: decide for each, stop it or keep it for sale."}
      </p>
      <ul className="space-y-1 ps-6">
        {waiting.map(({ order, line }) => (
          <li key={line.id} className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs">
            <span className="min-w-0 break-words">
              {customerOrderName(line.customer_order?.invoice_number ?? null, isAr, numberFormat)}
            </span>
            <Link
              to="/admin/b/$slug/supplier-orders/$id"
              params={{ slug, id: order.id }}
              className="inline-flex min-h-9 items-center font-mono font-semibold text-primary hover:underline"
            >
              {order.po_number}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
