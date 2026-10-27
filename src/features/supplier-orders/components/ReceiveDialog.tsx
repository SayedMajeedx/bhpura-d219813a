import { useId, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { invalidateAfterReceipt, receiveSupplierOrder } from "@/lib/data/supplier-orders";
import { allRemaining, planReceive, receiveRows } from "../lib/receive-plan";
import { supplierOrderError } from "../lib/errors";
import { customerOrderName } from "../lib/customer-pieces";
import { piecesLabel, type SupplierOrder } from "../lib/order-state";
import type { SupplierCatalog } from "../hooks/use-supplier-catalog";
import { useOrderNumberFormat } from "@/hooks/use-order-number";

/** One press of "Receive": sent again (a retry, a double tap), it changes nothing. */
const newRequestId = () => crypto.randomUUID();

/**
 * What arrived from the supplier: how many of each size (all that is still to come, unless
 * typed otherwise), what that does to the stock and to each size's cost, and one press that adds
 * them to the stock.
 */
export function ReceiveDialog({
  open,
  onOpenChange,
  brandId,
  order,
  catalog,
  currency,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  order: SupplierOrder;
  catalog: SupplierCatalog;
  currency: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const numberFormat = useOrderNumberFormat();
  const uid = useId();
  const qc = useQueryClient();
  const rows = useMemo(() => receiveRows(order.items, catalog.shelf), [order.items, catalog.shelf]);
  const [typed, setTyped] = useState<Record<string, string>>(() => allRemaining(rows));
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [saving, setSaving] = useState(false);
  const plan = planReceive(rows, typed);
  const previews = plan.ok ? new Map(plan.preview.map((p) => [p.itemId, p])) : new Map();
  const pieces = plan.ok ? plan.lines.reduce((sum, l) => sum + l.quantity, 0) : 0;
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const reset = () => {
    setTyped(allRemaining(rows));
    setNote("");
    setRequestId(newRequestId());
  };

  const receive = async () => {
    if (!plan.ok) return;
    setSaving(true);
    try {
      const result = await receiveSupplierOrder(order.id, plan.lines, requestId, note);
      await invalidateAfterReceipt(qc, brandId);
      toast.success(
        result.status === "received"
          ? isAr
            ? "اكتمل استلام الطلبية وأُضيفت القطع للمخزون"
            : "Order received in full: the pieces are in stock"
          : isAr
            ? `أُضيفت ${piecesLabel(pieces, "ar")} للمخزون`
            : `${piecesLabel(pieces, "en")} added to stock`,
      );
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(supplierOrderError(error, isAr));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-lg gap-3">
        <DialogHeader>
          <DialogTitle>{isAr ? "استلام القطع" : "Receive pieces"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? "كم وصل من كل مقاس؟ تُضاف للمخزون وتُحفظ تكلفة كل مقاس."
              : "How many of each size arrived? They join the stock and each size's cost is recorded."}
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-[55vh] min-w-0 space-y-2 overflow-y-auto">
          {rows.map((row) => {
            const fieldId = `${uid}-${row.itemId}`;
            const preview = previews.get(row.itemId);
            const bad = !plan.ok && "itemId" in plan && plan.itemId === row.itemId;
            const variant = row.variantId ? catalog.variantById.get(row.variantId) : undefined;
            return (
              <li key={row.itemId} className="rounded-lg border border-border-subtle p-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <label htmlFor={fieldId} className="min-w-0 flex-1">
                    <span
                      dir="auto"
                      className="text-page-start line-clamp-2 break-words text-sm font-semibold"
                    >
                      {row.customer ? row.customer.label : catalog.productName(variant?.product_id)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {row.customer
                        ? customerOrderName(row.customer.invoice, isAr, numberFormat)
                        : catalog.sizeName(row.variantId)}
                      {" · "}
                      {isAr
                        ? `باقي ${row.remaining} من ${row.ordered}`
                        : `${row.remaining} of ${row.ordered} to come`}
                    </span>
                  </label>
                  <Input
                    id={fieldId}
                    inputMode="numeric"
                    value={typed[row.itemId] ?? ""}
                    onChange={(e) => setTyped((t) => ({ ...t, [row.itemId]: e.target.value }))}
                    aria-invalid={bad || undefined}
                    className="w-20 shrink-0 text-center font-mono tabular-nums"
                  />
                </div>
                {bad && (
                  <p className="mt-1 text-xs text-destructive">
                    {!plan.ok && plan.problem === "too_many"
                      ? isAr
                        ? `الباقي ${row.remaining} فقط.`
                        : `Only ${row.remaining} are still to come.`
                      : isAr
                        ? "عدد صحيح من القطع."
                        : "A whole number of pieces."}
                  </p>
                )}
                {preview && row.customer && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {isAr
                      ? "لا تدخل المخزون: هي مباعة للزبون. تكلفتها على طلبه "
                      : "Not added to stock: it is sold to the customer. Its cost on their order "}
                    <strong className="text-foreground">
                      {formatMoney(preview.costAfter, currency, lang)}
                    </strong>
                  </p>
                )}
                {preview && !row.customer && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      {isAr ? "المخزون" : "Stock"} {row.onHand}
                      <Arrow className="h-3 w-3" aria-hidden="true" />
                      <strong className="text-foreground">{preview.stockAfter}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {isAr ? "التكلفة" : "Cost"}{" "}
                      {row.costBefore > 0 ? formatMoney(row.costBefore, currency, lang) : "—"}
                      <Arrow className="h-3 w-3" aria-hidden="true" />
                      <strong className="text-foreground">
                        {formatMoney(preview.costAfter, currency, lang)}
                      </strong>
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="space-y-1">
          <Label htmlFor={`${uid}-note`}>{isAr ? "ملاحظة (اختياري)" : "Note (optional)"}</Label>
          <Input
            id={`${uid}-note`}
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isAr ? "مثال: الدفعة الأولى" : "e.g. First batch"}
          />
        </div>

        {!plan.ok && plan.problem === "nothing" && (
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "اكتب كم قطعة وصلت من مقاس واحد على الأقل."
              : "Type how many arrived of at least one size."}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button type="button" onClick={receive} disabled={!plan.ok || saving} className="gap-1.5">
            <PackageCheck className="h-4 w-4" aria-hidden="true" />
            {isAr
              ? `إضافة ${piecesLabel(pieces, "ar")} للمخزون`
              : `Add ${piecesLabel(pieces, "en")} to stock`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
