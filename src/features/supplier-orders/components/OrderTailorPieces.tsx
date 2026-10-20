import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { useProfileOptional } from "@/lib/profile-context";
import { supplierOrderQueries } from "@/lib/data/supplier-orders";
import { piecesBySupplierOrder } from "../lib/customer-pieces";
import { orderPieceStates, purposeLabel } from "../lib/after-sending";
import { piecesLabel } from "../lib/order-state";
import { SendBackDialog } from "./SendBackDialog";

type OrderLine = { id: string; description: string; quantity: number };

/**
 * On a customer's order: which supplier has its pieces, on which supplier order, what they cost
 * and how many have come back; a piece that came back can go back to a supplier, to be fixed
 * (free) or altered. Staff who may see costs only; nothing when no piece was sent.
 */
export function OrderTailorPieces({
  brandId,
  slug,
  orderId,
  lines,
  cancelled,
  currency,
  lang,
}: {
  brandId: string;
  slug: string;
  orderId: string;
  /** The order's saved lines. */
  lines: readonly OrderLine[];
  /** The order was cancelled: its pieces with suppliers wait for the store's choice there. */
  cancelled: boolean;
  currency: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const profile = useProfileOptional();
  const canViewFinancials = Boolean(profile?.canViewFinancials);
  const canSend =
    canViewFinancials && Boolean(profile?.isAdmin || profile?.hasPermission("manage_orders"));
  const lineIds = useMemo(() => lines.map((l) => l.id), [lines]);
  const piecesQ = useQuery({
    ...supplierOrderQueries.orderPieces(brandId, lineIds),
    enabled: canViewFinancials && lineIds.length > 0,
  });
  const groups = useMemo(() => piecesBySupplierOrder(piecesQ.data ?? []), [piecesQ.data]);
  const states = useMemo(() => orderPieceStates(lines, piecesQ.data ?? []), [lines, piecesQ.data]);
  const [sendingBack, setSendingBack] = useState<(typeof states)[number] | null>(null);
  if (!canViewFinancials || groups.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      <ul className="space-y-2">
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

      {cancelled ? (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-xs font-semibold">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          {isAr
            ? "الطلب ملغى: افتح طلبية المورد وقرّر لكل قطعة، توقفها أو تحتفظ بها للبيع."
            : "The order is cancelled: open the supplier order and decide for each piece, stop it or keep it for sale."}
        </p>
      ) : (
        <ul className="space-y-1">
          {states.map((state) => {
            const work = state.out ? purposeLabel(state.out.purpose, isAr) : null;
            return (
              <li
                key={state.line.id}
                className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs"
              >
                <span dir="auto" className="min-w-0 flex-1 break-words">
                  {state.line.description}
                  {state.out
                    ? work
                      ? ` · ${isAr ? `عند ${state.out.vendor_name} لل${work}` : `${work} at ${state.out.vendor_name}`}`
                      : ""
                    : ` · ${isAr ? "رجعت" : "back"}`}
                </span>
                {!state.out && canSend && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => setSendingBack(state)}
                    aria-label={
                      isAr
                        ? `أرجع ${state.line.description} للمورد`
                        : `Send ${state.line.description} back to the supplier`
                    }
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    {isAr ? "تصليح أو تعديل" : "Fix or alter"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {sendingBack && (
        <SendBackDialog
          open={Boolean(sendingBack)}
          onOpenChange={(next) => !next && setSendingBack(null)}
          brandId={brandId}
          orderId={orderId}
          line={sendingBack.line}
          defaultVendorId={sendingBack.lastVendorId}
          lang={lang}
        />
      )}
    </div>
  );
}
