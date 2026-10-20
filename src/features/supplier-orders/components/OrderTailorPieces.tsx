import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Scissors } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";
import { useProfileOptional } from "@/lib/profile-context";
import { supplierOrderQueries } from "@/lib/data/supplier-orders";
import { piecesBySupplierOrder } from "../lib/customer-pieces";
import { piecesLabel } from "../lib/order-state";

/**
 * On a customer's order: which tailor has its pieces, on which supplier order, what they cost and
 * how many have come back. Staff who may see costs only; nothing when no piece was sent.
 */
export function OrderTailorPieces({
  brandId,
  slug,
  lineIds,
  currency,
  lang,
}: {
  brandId: string;
  slug: string;
  lineIds: readonly string[];
  currency: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const canViewFinancials = Boolean(useProfileOptional()?.canViewFinancials);
  const piecesQ = useQuery({
    ...supplierOrderQueries.orderPieces(brandId, lineIds),
    enabled: canViewFinancials && lineIds.length > 0,
  });
  const groups = useMemo(() => piecesBySupplierOrder(piecesQ.data ?? []), [piecesQ.data]);
  if (!canViewFinancials || groups.length === 0) return null;

  return (
    <ul className="mb-4 space-y-2">
      {groups.map((group) => (
        <li
          key={group.poId}
          className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border-subtle p-3 text-sm"
        >
          <Scissors className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span dir="auto" className="break-words font-semibold">
              {isAr ? `عند ${group.vendorName}` : `With ${group.vendorName}`}
            </span>
            <span className="block text-xs text-muted-foreground">
              {isAr
                ? `وصل ${group.arrived} من ${piecesLabel(group.pieces, "ar")}`
                : `${group.arrived} of ${piecesLabel(group.pieces, "en")} back`}
              {" · "}
              {formatMoney(group.cost, currency, lang)}
              {group.expectedAt && group.arrived < group.pieces && (
                <>
                  {" · "}
                  {isAr ? "موعدها " : "due "}
                  {formatDate(group.expectedAt, isAr ? "ar-BH" : "en-BH")}
                </>
              )}
            </span>
          </span>
          <Link
            to="/admin/b/$slug/supplier-orders/$id"
            params={{ slug, id: group.poId }}
            className="inline-flex min-h-9 shrink-0 items-center font-mono text-xs font-semibold text-primary hover:underline"
          >
            {group.poNumber}
          </Link>
        </li>
      ))}
    </ul>
  );
}
