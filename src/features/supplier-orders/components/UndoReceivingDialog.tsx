import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { cn } from "@/lib/utils";
import {
  invalidateAfterReceipt,
  undoSupplierReceipts,
  type SupplierReceipt,
} from "@/lib/data/supplier-orders";
import { supplierOrderError } from "../lib/errors";
import { piecesLabel } from "../lib/order-state";
import { undoneMessage, undoStock, type UndoMode } from "../lib/undo-receiving";
import type { SupplierCatalog } from "../hooks/use-supplier-catalog";

/**
 * Takes receipts of a supplier order back: one, or all that can be (`receipts`). Their pieces
 * leave the store's stock and each size's cost goes back to what it was, unless it changed since.
 * When some of the pieces already left the store (sold, counted out, moved to a partner), the
 * merchant chooses: take out what is left of them, or leave the stock as it is.
 */
export function UndoReceivingDialog({
  open,
  onOpenChange,
  brandId,
  orderId,
  receipts,
  catalog,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  orderId: string;
  receipts: SupplierReceipt[];
  catalog: SupplierCatalog;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const stock = useMemo(
    () => undoStock(receipts, (id) => catalog.variantById.get(id)?.stock_main ?? 0),
    [receipts, catalog.variantById],
  );
  const [mode, setMode] = useState<UndoMode>("take_out");
  const [saving, setSaving] = useState(false);
  // One press of the button: sent again (a slow network), it changes nothing.
  const press = useRef<string>(crypto.randomUUID());
  useEffect(() => {
    if (!open) return;
    press.current = crypto.randomUUID();
    setMode(stock.short ? "what_is_left" : "take_out");
  }, [open, stock.short]);

  const undo = async () => {
    setSaving(true);
    try {
      const result = await undoSupplierReceipts(
        orderId,
        receipts.map((r) => r.id),
        mode,
        press.current,
      );
      await invalidateAfterReceipt(qc, brandId);
      toast.success(undoneMessage(result, mode, lang));
      onOpenChange(false);
    } catch (error) {
      toast.error(supplierOrderError(error, isAr));
    } finally {
      setSaving(false);
    }
  };

  const options: Array<{ value: UndoMode; title: string; body: string }> = [
    {
      value: "what_is_left",
      title: isAr ? "أخرج ما بقي منها" : "Take out what is left",
      body:
        stock.held > 0
          ? isAr
            ? `يخرج من المخزون ما بقي في المتجر منها: ${piecesLabel(stock.held, lang)}.`
            : `What the store still holds of them leaves the stock: ${piecesLabel(stock.held, lang)}.`
          : isAr
            ? "لم يبقَ منها شيء في المتجر، فلا يتغير المخزون."
            : "None of them is left in the store, so the stock does not change.",
    },
    {
      value: "leave",
      title: isAr ? "اترك المخزون كما هو" : "Leave the stock as it is",
      body: isAr
        ? "يُلغى سجل الاستلام وحده، ولا تخرج أي قطعة من المخزون."
        : "Only the record of receiving is undone; no piece leaves the stock.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {receipts.length > 1
              ? isAr
                ? "إلغاء استلام الطلبية؟"
                : "Undo this order's receiving?"
              : isAr
                ? "إلغاء هذا الاستلام؟"
                : "Undo this receipt?"}
          </DialogTitle>
          <DialogDescription>
            {stock.short
              ? isAr
                ? `القطع المستلمة: ${piecesLabel(stock.pieces, lang)}، وما بقي منها في المتجر: ${piecesLabel(stock.held, lang)}. الباقي خرج من قبل (بيع أو جُرد أو نُقل).`
                : `${piecesLabel(stock.pieces, lang)} arrived, and the store still holds ${piecesLabel(stock.held, lang)} of them: the rest has gone already (sold, counted out or moved).`
              : isAr
                ? `تخرج من المخزون: ${piecesLabel(stock.pieces, lang)}، وتعود تكلفة كل مقاس إلى ما كانت عليه قبل الاستلام إن لم تتغير بعده.`
                : `Leaving the stock: ${piecesLabel(stock.pieces, lang)}. Each size's cost goes back to what it was before, unless it changed since.`}{" "}
            {isAr
              ? "تبقى الطلبية بدفعاتها، وتعود بانتظار الاستلام حين لا يبقى منها شيء مستلم: تُعدّل أو تُلغى أو تُحذف."
              : "The order keeps its payments, and once nothing of it is received it awaits delivery again: it can be changed, cancelled or deleted."}
          </DialogDescription>
        </DialogHeader>

        {stock.short && (
          <fieldset className="space-y-2">
            <legend className="sr-only">
              {isAr ? "ماذا يحدث للمخزون" : "What happens to the stock"}
            </legend>
            {options.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                  mode === option.value ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="undo-receiving"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{option.title}</span>
                  <span className="block text-xs text-muted-foreground">{option.body}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {isAr ? "تراجع" : "Keep it"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void undo()}
            disabled={saving || receipts.length === 0}
          >
            {isAr ? "إلغاء الاستلام" : "Undo receiving"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
