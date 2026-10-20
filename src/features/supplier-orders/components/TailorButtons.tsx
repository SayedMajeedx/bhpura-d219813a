import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useProfileOptional } from "@/lib/profile-context";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import {
  invalidateAfterReceipt,
  receiveSupplierOrder,
  supplierOrderQueries,
} from "@/lib/data/supplier-orders";
import type { CustomerLine } from "../lib/customer-pieces";
import { supplierOrderError } from "../lib/errors";
import { SendToTailorDialog } from "./SendToTailorDialog";

/** Staff who may put a customer's piece on a tailor's account: they handle orders and costs. */
function useTracksTailor() {
  const profile = useProfileOptional();
  return Boolean(profile?.hasPermission("manage_orders") && profile.canViewFinancials);
}

/**
 * "Send to workshop" on a customer's order. For staff who see the finances it opens the send
 * (which tailor, which order, each piece's price); for anyone else it moves the stage, as before.
 */
export function SendToTailorButton({
  brandId,
  orderId,
  lines,
  lang,
  className,
  children,
  onPlainSend,
  onSent,
  title,
}: {
  /** The send's words in this store, as its button says them. */
  title: string;
  brandId: string;
  orderId: string;
  lines: readonly CustomerLine[];
  lang: "ar" | "en";
  className?: string;
  children: ReactNode;
  onPlainSend: () => Promise<void> | void;
  onSent: () => Promise<void> | void;
}) {
  const tracks = useTracksTailor();
  if (!tracks) {
    return (
      <Button className={className} onClick={() => onPlainSend()}>
        {children}
      </Button>
    );
  }
  return (
    <TrackedSend
      {...{ brandId, orderId, lines, lang, className, children, onPlainSend, onSent, title }}
    />
  );
}

function TrackedSend({
  brandId,
  orderId,
  lines,
  lang,
  className,
  children,
  onPlainSend,
  onSent,
  title,
}: Parameters<typeof SendToTailorButton>[0]) {
  const currency = useStoreCurrency(brandId);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        {children}
      </Button>
      {open && (
        <SendToTailorDialog
          open={open}
          onOpenChange={setOpen}
          brandId={brandId}
          orderId={orderId}
          lines={lines}
          currency={currency}
          lang={lang}
          onSent={onSent}
          onPlainSend={onPlainSend}
          title={title}
        />
      )}
    </>
  );
}

/**
 * "Received from workshop" on a customer's order. When its pieces are on a supplier's order,
 * they are received there (the order lines take their real cost, nothing joins the stock, and
 * the database moves the order on); otherwise it moves the stage, as before.
 */
export function ReceiveFromTailorButton({
  brandId,
  lines,
  lang,
  className,
  children,
  onPlainReceive,
  onReceived,
}: {
  brandId: string;
  lines: readonly CustomerLine[];
  lang: "ar" | "en";
  className?: string;
  children: ReactNode;
  onPlainReceive: () => Promise<void> | void;
  onReceived: () => Promise<void> | void;
}) {
  const tracks = useTracksTailor();
  if (!tracks) {
    return (
      <Button className={className} onClick={() => onPlainReceive()}>
        {children}
      </Button>
    );
  }
  return (
    <TrackedReceive
      {...{ brandId, lines, lang, className, children, onPlainReceive, onReceived }}
    />
  );
}

function TrackedReceive({
  brandId,
  lines,
  lang,
  className,
  children,
  onPlainReceive,
  onReceived,
}: Parameters<typeof ReceiveFromTailorButton>[0]) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const isAr = lang === "ar";

  const receive = async () => {
    setBusy(true);
    try {
      const ids = lines.map((l) => l.id).filter(Boolean) as string[];
      const pieces = await qc.fetchQuery(supplierOrderQueries.orderPieces(brandId, ids));
      const waiting = pieces.filter((p) => p.received_quantity < p.quantity);
      if (waiting.length === 0) return await onPlainReceive();
      const byOrder = new Map<string, Array<{ item_id: string; quantity: number }>>();
      for (const piece of waiting) {
        const list = byOrder.get(piece.po_id) ?? [];
        list.push({ item_id: piece.id, quantity: piece.quantity - piece.received_quantity });
        byOrder.set(piece.po_id, list);
      }
      for (const [poId, request] of byOrder) {
        await receiveSupplierOrder(poId, request, crypto.randomUUID());
      }
      await invalidateAfterReceipt(qc, brandId);
      await onReceived();
    } catch (error) {
      toast.error(supplierOrderError(error, isAr));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button className={className} onClick={receive} disabled={busy}>
      {children}
    </Button>
  );
}
