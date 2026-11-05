import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBrandOptional } from "@/lib/brand-context";
import { useProfileOptional } from "@/lib/profile-context";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { workshopQueries } from "@/lib/data/supplier-orders/workshop";
import { invalidateOrders } from "@/lib/data/orders";
import type { SheetLang, SheetWhere } from "@/features/orders/lib/job-sheet";
import { linesToSend, type CustomerLine } from "../lib/customer-pieces";
import { SendToTailorDialog } from "./SendToTailorDialog";

/**
 * "Put on a supplier order" beside the order's job sheet (the owner's report of 2026-11-04: a
 * piece printed for the workshop was never recorded on the supplier's order). The order's
 * "Send to workshop" step shows only at its stage; this is offered whatever the stage, while a
 * workshop piece of the order is on no supplier's order, and goes through the same send
 * (`send_order_to_supplier`, which moves the stage only from an earlier one). Order staff only;
 * nothing for a cancelled order.
 */
export function RecordWithSupplierButton({
  brandId,
  orderId,
  lines,
  released,
  title,
  onSent,
  onPrintSheet,
  onTellCustomer,
  lang,
}: {
  brandId: string;
  orderId: string;
  lines: readonly CustomerLine[];
  /** Cancelled, refunded, voided or failed: nothing goes. */
  released: boolean;
  /** The send's words in this store. */
  title: string;
  /** After the send: refresh the order. */
  onSent?: () => Promise<void> | void;
  onPrintSheet?: (sheetLang: SheetLang, where: SheetWhere) => void;
  onTellCustomer?: () => void;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const profile = useProfileOptional();
  const sends = Boolean(profile?.isAdmin || profile?.hasPermission("manage_orders"));
  const [open, setOpen] = useState(false);
  const piecesQ = useQuery({
    ...workshopQueries.orderPieces(brandId, orderId),
    enabled: sends && !released,
    retry: false,
  });
  const unrecorded = useMemo(() => {
    if (!piecesQ.data) return [];
    return linesToSend(lines, new Set(piecesQ.data.map((p) => p.orderItemId)));
  }, [lines, piecesQ.data]);
  // Kept while open: the panel after the send stays once nothing is left to record.
  if (!open && (!sends || released || unrecorded.length === 0)) return null;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="h-9 gap-1.5 text-xs">
        <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
        {isAr ? "سجّل في طلبية المورّد" : "Put on a supplier order"}
      </Button>
      {open && (
        <RecordDialog
          {...{ brandId, orderId, lines, title, onSent, onPrintSheet, onTellCustomer, lang }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** The send itself, mounted while open. */
function RecordDialog({
  brandId,
  orderId,
  lines,
  title,
  onSent,
  onPrintSheet,
  onTellCustomer,
  lang,
  onClose,
}: Omit<Parameters<typeof RecordWithSupplierButton>[0], "released"> & { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const slug = useBrandOptional()?.slug;
  const currency = useStoreCurrency(brandId);
  return (
    <SendToTailorDialog
      open
      onOpenChange={(next) => !next && onClose()}
      brandId={brandId}
      groups={[{ orderId, lines }]}
      currency={currency}
      lang={lang}
      title={title}
      onSent={async () => {
        // The stage may have moved (from an earlier one), and the pieces are now recorded.
        await invalidateOrders(qc, brandId);
        await onSent?.();
      }}
      onPrintSheet={onPrintSheet ? (sheetLang, where) => onPrintSheet(sheetLang, where) : undefined}
      onTellCustomer={onTellCustomer}
      onOpenSupplierOrder={
        slug
          ? (id) =>
              void navigate({ to: "/admin/b/$slug/supplier-orders/$id", params: { slug, id } })
          : undefined
      }
    />
  );
}
