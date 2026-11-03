import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Link2, Printer, Scissors, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate, formatMoney } from "@/lib/format";
import { useProfileOptional } from "@/lib/profile-context";
import { useOrderNumber } from "@/hooks/use-order-number";
import { logActivity } from "@/lib/activity-log";
import { whatsAppToCustomer } from "@/features/bookings/lib/booking-invoice";
import { getOrderCustomerName, getOrderCustomerPhone } from "@/lib/order-customer-snapshot";
import { ordersKeys } from "@/lib/data/orders";
import { alterationQueries, setAlterationStatus } from "@/lib/data/orders/alterations";
import { supplierOrderKeys } from "@/lib/data/supplier-orders";
import { workshopQueries } from "@/lib/data/supplier-orders/workshop";
import { tailorPieceLines } from "@/features/supplier-orders/lib/after-sending";
import { JobSheetPrintDialog } from "./JobSheetPrintDialog";
import { AlterPieceDialog, type AlterLine, type SentAlteration } from "./AlterPieceDialog";
import { useAlterationSheet, type AlterationSheet } from "../hooks/use-alteration-sheet";
import { alterationReceivedMessage } from "../lib/stage-messages";
import type { JobSheetLine, JobSheetProduct } from "../lib/job-sheet";
import {
  alterableLines,
  alterationActions,
  alterationError,
  alterationKindLabel,
  alterationStatusLabel,
  changeLine,
  isOut,
  type OrderAlteration,
} from "../lib/alterations";

type Item = JobSheetLine & {
  id?: string | null;
  description?: string | null;
  quantity?: number | null;
  product?: { item_kind?: string | null } | null;
};

type OrderLike = {
  id: string;
  invoice_number?: number | null;
  order_date?: string | null;
  status?: string | null;
  fulfillment_status?: string | null;
  related_order_id?: string | null;
  relation?: string | null;
  customer_name_snapshot?: string | null;
  customer_phone_snapshot?: string | null;
  customers?: { name?: string | null; phone?: string | null } | null;
};

/**
 * The order's alterations (step 3 of `docs/workshop-flow-plan.md`): each one with what it is,
 * where it is, by when and its price, and its next step (back from our workshop, handed over,
 * cancelled); "Alter a piece" for the pieces it may be sent for; and the link between an
 * alteration's own order and the order it altered. Order staff only; nothing when there is
 * nothing to show or offer.
 */
export function OrderAlterationsCard({
  brandId,
  slug,
  order,
  items: rawItems,
  products,
  settings,
  unsaved = false,
  storeName: brandName,
  currency,
  lang,
}: {
  brandId: string;
  slug: string;
  order: OrderLike;
  items: readonly Item[];
  products: readonly (JobSheetProduct & { id: string })[];
  /** The store's settings: whether it does alterations, and its name. */
  settings?: { offers_alterations?: boolean | null; business_name?: string | null } | null;
  /**
   * The order has changes not saved yet: an alteration adds a line to the order on the server,
   * which a later save of these edits would undo, so it waits for the save.
   */
  unsaved?: boolean;
  storeName: string;
  currency: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const offersAlterations = Boolean(settings?.offers_alterations);
  const storeName = (settings?.business_name ?? "").trim() || brandName;
  const items = useMemo(
    () => rawItems.map((it) => ({ ...it, product: products.find((p) => p.id === it.product_id) })),
    [rawItems, products],
  );
  const qc = useQueryClient();
  const profile = useProfileOptional();
  const canSend = Boolean(profile?.isAdmin || profile?.hasPermission("manage_orders"));
  const numberOf = useOrderNumber(brandId);
  const alterationsQ = useQuery({
    ...alterationQueries.forOrder(brandId, order.id),
    enabled: canSend,
  });
  const piecesQ = useQuery({
    ...workshopQueries.orderPieces(brandId, order.id),
    enabled: canSend,
  });
  const alterations = useMemo(() => alterationsQ.data ?? [], [alterationsQ.data]);
  const lines: AlterLine[] = useMemo(
    () =>
      tailorPieceLines(items).map((line) => {
        const item = items.find((i) => i.id === line.id);
        return {
          ...line,
          location: item?.location ?? null,
          custom_field_values: item?.custom_field_values,
        };
      }),
    [items],
  );
  const pieces = useMemo(
    () =>
      alterableLines(lines, {
        offersAlterations,
        alterations,
        madeLineIds: (piecesQ.data ?? [])
          .filter((p) => p.purpose === "make")
          .map((p) => p.orderItemId),
      }),
    [lines, offersAlterations, alterations, piecesQ.data],
  );
  const linkedIds = useMemo(() => {
    const ids = new Set<string>();
    if (order.related_order_id) ids.add(order.related_order_id);
    for (const a of alterations) {
      if (a.order_id !== order.id) ids.add(a.order_id);
      if (a.source_order_id !== order.id) ids.add(a.source_order_id);
    }
    return [...ids];
  }, [alterations, order.id, order.related_order_id]);
  const numbersQ = useQuery(alterationQueries.numbers(brandId, linkedIds));
  const numbers = numbersQ.data ?? {};

  const [altering, setAltering] = useState<string | null | undefined>(undefined);
  const [printing, setPrinting] = useState<AlterationSheet | null>(null);
  const customerName = getOrderCustomerName(order) || null;
  const print = useAlterationSheet({
    brandId,
    order,
    lines: items,
    products,
    storeName,
    customerName,
  });

  const where = (a: OrderAlteration) => {
    if (a.made_by === "in_house") return { supplier: null, poNumber: null, expectedAt: a.due_at };
    const line = (piecesQ.data ?? []).find((p) => p.itemId === a.purchase_order_item_id);
    return {
      supplier: line?.vendorName ?? null,
      poNumber: line?.poNumber ?? null,
      expectedAt: a.due_at ?? line?.expectedAt ?? null,
    };
  };
  const pieceName = (id: string) =>
    lines.find((l) => l.id === id)?.description || (isAr ? "قطعة" : "A piece");
  const day = (d: string | null | undefined) => (d ? formatDate(d, isAr ? "ar-BH" : "en-GB") : "");

  const tellCustomer = (sent: Pick<SentAlteration, "sourceItemId" | "kind" | "where">) => {
    const link = whatsAppToCustomer(
      getOrderCustomerPhone(order),
      alterationReceivedMessage({
        isAr,
        brandName: storeName,
        customerName,
        piece: pieceName(sent.sourceItemId),
        kind: sent.kind,
        readyOn: day(sent.where.expectedAt),
      }),
    );
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
    void logActivity({
      action: "workshop_follow_up",
      order_id: order.id,
      en: "Opened WhatsApp to tell the customer the piece was received for alteration",
      ar: "فتح واتساب لإبلاغ العميل باستلام القطعة للتعديل",
    });
  };
  const reachable = Boolean(whatsAppToCustomer(getOrderCustomerPhone(order), "-"));

  const move = async (a: OrderAlteration, status: "back" | "handed_over" | "cancelled") => {
    if (status === "cancelled") {
      const ok = await confirmDialog({
        title: isAr ? "إلغاء التعديل؟" : "Cancel the alteration?",
        description:
          a.customer_charge > 0
            ? isAr
              ? "يُرفع سعره عن الطلب (أو يُلغى طلبه المرتبط)، وتُحذف القطعة من طلبية المورد. ما دفعه العميل يرده المتجر."
              : "Its price comes off the order (or its linked order is cancelled), and the piece leaves the supplier's order. The store returns what the customer paid."
            : isAr
              ? "تُحذف القطعة من طلبية المورد."
              : "The piece leaves the supplier's order.",
        destructive: true,
        confirmLabel: isAr ? "ألغِ التعديل" : "Cancel it",
      });
      if (!ok) return;
    }
    try {
      await setAlterationStatus(a.id, status);
      void logActivity({
        action: "order_alteration",
        order_id: a.source_order_id,
        en: `Alteration of ${pieceName(a.source_item_id)}: ${alterationStatusLabel(status, "en")}`,
        ar: `تعديل ${pieceName(a.source_item_id)}: ${alterationStatusLabel(status, "ar")}`,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ordersKeys.all(brandId) }),
        qc.invalidateQueries({ queryKey: supplierOrderKeys.all(brandId) }),
      ]);
    } catch (error) {
      toast.error(
        alterationError(String((error as { message?: unknown } | null)?.message ?? ""), lang),
      );
    }
  };

  if (!canSend || alterationsQ.isLoading) return null;
  const offered = pieces.some((p) => p.alteration || p.fix);
  const relatedTo = order.relation === "alteration" ? order.related_order_id : null;
  if (alterations.length === 0 && !offered && !relatedTo) return null;
  // Not printed with the order's page.
  const orderLink = (id: string) => (
    <Link
      to="/admin/b/$slug/orders/$id"
      params={{ slug, id }}
      className="font-mono font-semibold text-primary hover:underline"
    >
      {numberOf(numbers[id], id)}
    </Link>
  );

  return (
    <Card className="no-print mb-6 rounded-xl border border-border-strong bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
          <Scissors className="h-5 w-5 text-primary" aria-hidden="true" />
          {isAr ? "التعديلات" : "Alterations"}
        </h3>
        {offered && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={unsaved}
            onClick={() => setAltering(null)}
          >
            <Scissors className="h-4 w-4" aria-hidden="true" />
            {isAr ? "تعديل قطعة" : "Alter a piece"}
          </Button>
        )}
      </div>

      {offered && unsaved && (
        <p className="mb-3 text-xs text-muted-foreground">
          {isAr
            ? "احفظ تغييرات الطلب أولاً، ثم أرسل القطعة للتعديل."
            : "Save the order's changes first, then send the piece."}
        </p>
      )}

      {relatedTo && (
        <p className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
          <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {isAr ? "تعديل للطلب" : "Alteration of"} {orderLink(relatedTo)}
        </p>
      )}

      {alterations.length > 0 ? (
        <ul className="space-y-2">
          {alterations.map((a) => {
            const at = where(a);
            const actions = alterationActions(a);
            const linkedHere = a.order_id !== order.id && a.source_order_id === order.id;
            return (
              <li
                key={a.id}
                className="space-y-2 rounded-xl border border-border-subtle p-3 text-sm"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span dir="auto" className="min-w-0 flex-1 break-words font-semibold">
                    {alterationKindLabel(a.kind, lang)} · {pieceName(a.source_item_id)}
                  </span>
                  <span
                    className={
                      isOut(a.status)
                        ? "rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold"
                        : "rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
                    }
                  >
                    {alterationStatusLabel(a.status, lang)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {at.supplier
                    ? isAr
                      ? `عند ${at.supplier}${at.poNumber ? ` على ${at.poNumber}` : ""}`
                      : `With ${at.supplier}${at.poNumber ? ` on ${at.poNumber}` : ""}`
                    : isAr
                      ? "في ورشتنا"
                      : "In our workshop"}
                  {a.due_at && ` · ${isAr ? "جاهزة" : "ready"} ${day(a.due_at)}`}
                  {" · "}
                  {a.kind === "fix"
                    ? isAr
                      ? "مجاني"
                      : "Free"
                    : formatMoney(a.customer_charge, currency, lang)}
                </p>
                {(a.changes.length > 0 || a.note) && (
                  <ul className="space-y-0.5 text-xs" dir="auto">
                    {a.changes.map((c, i) => (
                      <li key={i}>{changeLine(c, lang)}</li>
                    ))}
                    {a.note && <li>{a.note}</li>}
                  </ul>
                )}
                {linkedHere && (
                  <p className="text-xs">
                    {isAr ? "سعره على الطلب" : "Charged on"} {orderLink(a.order_id)}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {lines.some((l) => l.id === a.source_item_id) && a.status !== "cancelled" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPrinting({
                          sourceItemId: a.source_item_id,
                          kind: a.kind,
                          changes: a.changes,
                          note: a.note,
                          where: at,
                        })
                      }
                    >
                      <Printer className="h-4 w-4" aria-hidden="true" />
                      {isAr ? "الورقة" : "Sheet"}
                    </Button>
                  )}
                  {actions.back && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => move(a, "back")}
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      {isAr ? "رجعت من الورشة" : "Back from the workshop"}
                    </Button>
                  )}
                  {actions.handOver && (
                    <Button type="button" size="sm" onClick={() => move(a, "handed_over")}>
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      {isAr ? "سُلّمت للعميل" : "Handed over"}
                    </Button>
                  )}
                  {actions.cancel && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => move(a, "cancelled")}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      {isAr ? "إلغاء" : "Cancel"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        offered && (
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "تقصير أو تضييق أو تصليح قطعة من هذا الطلب، عند مورد أو في ورشتك، بسعر للعميل أو مجاناً."
              : "Take up, take in or fix a piece of this order, with a supplier or in your workshop, at a price for the customer or free."}
          </p>
        )
      )}

      {altering !== undefined && (
        <AlterPieceDialog
          open
          onOpenChange={(next) => !next && setAltering(undefined)}
          brandId={brandId}
          order={order}
          orderNumber={numberOf(order.invoice_number, order.id)}
          storeName={storeName}
          pieces={pieces}
          initialPieceId={altering}
          lang={lang}
          onPrint={(sent, sheetLang) => print(sent, sheetLang, lang)}
          onTellCustomer={reachable ? tellCustomer : undefined}
        />
      )}

      {printing && (
        <JobSheetPrintDialog
          open
          onOpenChange={(next) => !next && setPrinting(null)}
          defaultLang={lang}
          lang={lang}
          onPrint={(chosen) => print(printing, chosen, lang)}
        />
      )}
    </Card>
  );
}
