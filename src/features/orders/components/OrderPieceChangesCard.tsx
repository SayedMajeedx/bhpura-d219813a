import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, History, MessageCircle, Printer, Ruler } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { orderLineName } from "@/lib/order-line-name";
import { orderReleased } from "@/lib/order-released";
import { useProfileOptional } from "@/lib/profile-context";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";
import { ordersKeys } from "@/lib/data/orders";
import {
  lineRevisionQueries,
  markOrderLineSupplierTold,
  toLineRevisions,
} from "@/lib/data/orders/line-revisions";
import { supplierOrderKeys } from "@/lib/data/supplier-orders";
import { workshopQueries, type WorkshopPiece } from "@/lib/data/supplier-orders/workshop";
import { changeMessage, messageInLanguage } from "@/features/supplier-orders/lib/supplier-message";
import { alterationTarget } from "../lib/alterations";
import { sheetLanguageFor, type JobSheetLine, type JobSheetProduct } from "../lib/job-sheet";
import {
  changesSince,
  lineRevisionError,
  revisionChangeLine,
  revisionsOf,
  supplierBehind,
} from "../lib/line-revisions";
import { useAlterationSheet } from "../hooks/use-alteration-sheet";
import { ChangeDetailsDialog, productFieldsOf } from "./ChangeDetailsDialog";

type Lang = "ar" | "en";
type Item = JobSheetLine & { id?: string | null; revision?: number | null };
type OrderLike = {
  id: string;
  invoice_number?: number | null;
  order_date?: string | null;
  status?: string | null;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  customer_name_snapshot?: string | null;
  line_revisions?: unknown;
};

/**
 * Changing a custom order after it was placed (step 4 of `docs/workshop-flow-plan.md`): each
 * made-to-order piece with its revision, "Change measurements" (view mode too: it writes the
 * piece's answers alone, never the editor's other fields), its history (what changed, who, when),
 * and, while a supplier holds an earlier sheet, a warning with the revised sheet and the change
 * message, either of which records that the supplier was told. Order staff only.
 */
export function OrderPieceChangesCard({
  brandId,
  order,
  items,
  products,
  unsaved = false,
  storeName,
  lang,
}: {
  brandId: string;
  order: OrderLike;
  items: readonly Item[];
  products: readonly JobSheetProduct[];
  /** The editor holds changes not saved yet: a change here would be overwritten by them. */
  unsaved?: boolean;
  storeName: string;
  lang: Lang;
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const profile = useProfileOptional();
  const canChange = Boolean(profile?.isAdmin || profile?.hasPermission("manage_orders"));
  const pieces = items.filter((it): it is Item & { id: string } =>
    Boolean(it.id && it.location === "custom"),
  );
  const revisions = useMemo(() => toLineRevisions(order.line_revisions), [order.line_revisions]);
  const piecesQ = useQuery({
    ...workshopQueries.orderPieces(brandId, order.id),
    enabled: canChange && pieces.length > 0,
  });
  const authorIds = useMemo(
    () => [...new Set(revisions.map((r) => r.changed_by).filter((id): id is string => !!id))],
    [revisions],
  );
  const authorsQ = useQuery({
    ...lineRevisionQueries.authors(brandId, authorIds),
    enabled: canChange && authorIds.length > 0,
  });
  const printSheet = useAlterationSheet({
    brandId,
    order,
    lines: items,
    products,
    storeName,
    customerName: order.customer_name_snapshot ?? null,
    revisions,
  });
  const [changing, setChanging] = useState<string | null>(null);

  if (!canChange || pieces.length === 0) return null;

  const released = orderReleased(order.status, order.payment_status);
  const handedOver = alterationTarget(order) === "linked_order";
  const productOf = (it: Item) => products.find((p) => p.id === it.product_id) ?? null;
  const nameOf = (it: Item, l: Lang) => orderLineName({ ...it, product: productOf(it) }, l) || "—";
  const withSupplier = (id: string): WorkshopPiece | undefined =>
    (piecesQ.data ?? []).find(
      (p) => p.orderItemId === id && p.purpose === "make" && p.receivedQuantity < p.quantity,
    );
  const arrived = (id: string) =>
    (piecesQ.data ?? []).some(
      (p) => p.orderItemId === id && p.purpose === "make" && p.receivedQuantity >= p.quantity,
    );
  const when = (at: string) =>
    formatDate(at, isAr ? "ar-BH-u-nu-latn" : "en-GB") +
    " " +
    new Date(at).toLocaleTimeString(isAr ? "ar-BH-u-nu-latn" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const told = async (id: string) => {
    try {
      await markOrderLineSupplierTold(id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ordersKeys.all(brandId) }),
        qc.invalidateQueries({ queryKey: supplierOrderKeys.all(brandId) }),
      ]);
    } catch (error) {
      toast.error(lineRevisionError(error, lang));
    }
  };

  const printRevised = (it: Item & { id: string }, piece: WorkshopPiece) => {
    printSheet(
      {
        sourceItemId: it.id,
        revised: true,
        where: {
          supplier: piece.vendorName,
          poNumber: piece.poNumber,
          expectedAt: piece.expectedAt,
        },
      },
      sheetLanguageFor({ vendorLang: piece.language, screenLang: lang }),
      lang,
    );
    void told(it.id);
  };

  const messageSupplier = async (it: Item & { id: string }, piece: WorkshopPiece) => {
    const latest = revisionsOf(revisions, it.id)[0];
    const text = messageInLanguage(
      sheetLanguageFor({ vendorLang: piece.language, screenLang: lang }),
      (l) =>
        changeMessage({
          vendorName: piece.vendorName,
          storeName,
          poNumber: piece.poNumber,
          title: nameOf(it, l),
          revision: Number(it.revision) || 1,
          changes: changesSince(revisions, it.id, piece.sheetRevision),
          note: latest?.note ?? null,
          lang: l,
        }),
    );
    const chat = whatsappChatUrl(piece.vendorPhone);
    if (chat) {
      window.open(`${chat}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    } else {
      try {
        await navigator.clipboard?.writeText(text);
        toast.success(
          isAr
            ? "نُسخت الرسالة: ليس للمورّد رقم واتساب."
            : "Message copied: the supplier has no WhatsApp number.",
        );
      } catch {
        toast.error(isAr ? "تعذّر نسخ الرسالة." : "Could not copy the message.");
        return;
      }
    }
    void told(it.id);
  };

  const editing = pieces.find((it) => it.id === changing) ?? null;

  return (
    <Card className="no-print p-3 sm:p-4">
      <h3 className="mb-2 flex items-center gap-2 font-bold">
        <Ruler className="h-4 w-4 text-primary" aria-hidden="true" />
        {isAr ? "المقاسات بعد الطلب" : "Measurements after the order"}
      </h3>
      <ul className="divide-y divide-border-subtle text-sm">
        {pieces.map((it) => {
          const piece = withSupplier(it.id);
          const behind = piece ? supplierBehind(it.revision, piece.sheetRevision) : false;
          const history = revisionsOf(revisions, it.id);
          const blocked = released
            ? isAr
              ? "الطلب ملغى."
              : "The order is cancelled."
            : handedOver || arrived(it.id)
              ? isAr
                ? "القطعة صُنعت: اطلب تعديلاً عليها."
                : "The piece is made: ask for an alteration instead."
              : unsaved
                ? isAr
                  ? "احفظ تعديلات الطلب أولاً."
                  : "Save the order's changes first."
                : null;
          return (
            <li key={it.id} className="space-y-2 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <p dir="auto" className="text-page-start min-w-0 flex-1 break-words font-semibold">
                  {nameOf(it, lang)}
                </p>
                {(Number(it.revision) || 1) > 1 && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
                    {isAr ? `النسخة ${it.revision}` : `Revision ${it.revision}`}
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={Boolean(blocked)}
                  title={blocked ?? undefined}
                  onClick={() => setChanging(it.id)}
                >
                  <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
                  {isAr ? "غيّر المقاسات" : "Change measurements"}
                </Button>
              </div>
              {blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}

              {piece && behind && (
                <div className="space-y-2 rounded-lg bg-warning/10 px-2.5 py-2 text-xs">
                  <p className="flex items-start gap-1.5 font-semibold">
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
                      aria-hidden="true"
                    />
                    <span dir="auto">
                      {isAr
                        ? `لدى ${piece.vendorName} الورقة السابقة (النسخة ${piece.sheetRevision}) على ${piece.poNumber}: أعطه النسخة ${it.revision}.`
                        : `${piece.vendorName} has the earlier sheet (revision ${piece.sheetRevision}) on ${piece.poNumber}: give them revision ${it.revision}.`}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => printRevised(it, piece)}>
                      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                      {isAr ? "اطبع الورقة المعدّلة" : "Print revised sheet"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void messageSupplier(it, piece)}
                    >
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      {isAr ? "راسل المورّد" : "Message the supplier"}
                    </Button>
                  </div>
                </div>
              )}

              {history.length > 0 && (
                <div className="rounded-lg border border-border-subtle p-2.5 text-xs">
                  <p className="mb-1 flex items-center gap-1.5 font-bold text-muted-foreground">
                    <History className="h-3.5 w-3.5" aria-hidden="true" />
                    {isAr ? "سجل التغييرات" : "Change history"}
                  </p>
                  <ol className="space-y-1.5">
                    {history.map((r) => {
                      const who = r.changed_by ? authorsQ.data?.[r.changed_by] : null;
                      return (
                        <li key={r.id} className="space-y-0.5">
                          <p className="font-semibold">
                            {isAr ? `النسخة ${r.revision}` : `Revision ${r.revision}`}
                            <span className="font-normal text-muted-foreground">
                              {" · "}
                              {when(r.changed_at)}
                              {who ? ` · ${who}` : ""}
                              {r.told_supplier_at
                                ? isAr
                                  ? " · أُبلغ المورّد"
                                  : " · supplier told"
                                : ""}
                            </span>
                          </p>
                          <ul className="ps-3">
                            {r.changes.map((c) => (
                              <li key={c.key} dir="auto" className="break-words">
                                {revisionChangeLine(c, lang)}
                              </li>
                            ))}
                          </ul>
                          {r.note && (
                            <p dir="auto" className="break-words text-muted-foreground">
                              {r.note}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {editing && (
        <ChangeDetailsDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setChanging(null)}
          brandId={brandId}
          line={{
            id: editing.id,
            title: nameOf(editing, lang),
            custom_field_values: editing.custom_field_values,
          }}
          productFields={productFieldsOf(productOf(editing) as { custom_fields?: unknown } | null)}
          lang={lang}
        />
      )}
    </Card>
  );
}
