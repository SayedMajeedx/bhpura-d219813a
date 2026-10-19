import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Scissors } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { supplierOrderQueries } from "@/lib/data/supplier-orders";
import { localToday } from "../lib/order-state";
import { supplierDashboardLine } from "../lib/payments";

/**
 * One line on the dashboard when a supplier's order is late or money is owed to suppliers, the
 * way in to the supplier orders. Nothing while it loads or when there is neither.
 */
export function SupplierOrdersDashboardLine({
  brandId,
  slug,
  currency,
  lang,
}: {
  brandId: string;
  slug: string;
  currency: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const ordersQ = useQuery(supplierOrderQueries.list(brandId));
  const line = ordersQ.data ? supplierDashboardLine(ordersQ.data, localToday()) : null;
  if (!line) return null;

  const parts: string[] = [];
  if (line.late > 0) {
    parts.push(
      isAr
        ? line.late === 1
          ? "طلبية مورد متأخرة"
          : line.late === 2
            ? "طلبيتا مورد متأخرتان"
            : `${line.late} طلبيات موردين متأخرة`
        : `${line.late} supplier ${line.late === 1 ? "order is" : "orders are"} late`,
    );
  }
  if (line.owed > 0) {
    const owed = formatMoney(line.owed, currency, lang);
    parts.push(isAr ? `عليك ${owed} للموردين` : `you owe suppliers ${owed}`);
  }
  const text = parts.join(" · ");

  return (
    <Link
      to="/admin/b/$slug/supplier-orders"
      params={{ slug }}
      className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs transition-colors hover:bg-muted/50"
    >
      <Scissors
        className={line.late > 0 ? "size-4 shrink-0 text-warning" : "size-4 shrink-0 text-primary"}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 text-sm font-medium first-letter:uppercase">{text}</span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
        aria-hidden="true"
      />
    </Link>
  );
}
