import { useState } from "react";
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
  invalidateSupplierOrders,
  releaseCustomerPiece,
} from "@/lib/data/supplier-orders";
import { releaseChoices } from "../lib/after-sending";
import { supplierOrderError } from "../lib/errors";
import type { SupplierOrderLine } from "../lib/order-state";

/**
 * The customer cancelled after their piece went to the supplier: the store decides, each time.
 * Stop it with the supplier (before it arrives; nothing is owed for it), or keep it for sale: it
 * becomes a size of the store's, joining the stock when it arrives (or now, if it has).
 */
export function CancelledPieceDialog({
  open,
  onOpenChange,
  brandId,
  line,
  sizeName,
  canStock,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  line: SupplierOrderLine;
  /** The piece's size, as the store names it. */
  sizeName: string;
  /** Whether this person may put pieces in stock (`manage_inventory`). */
  canStock: boolean;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const allowed = releaseChoices(line);
  const arrived = line.received_quantity > 0;
  const [choice, setChoice] = useState<"stop" | "stock" | null>(
    allowed.stop ? "stop" : allowed.stock && canStock ? "stock" : null,
  );
  const [saving, setSaving] = useState(false);

  const options = [
    {
      value: "stop" as const,
      show: allowed.stop,
      enabled: true,
      title: isAr ? "أوقفها عند المورد" : "Stop it with the supplier",
      body: isAr
        ? "تُشال من الطلبية ولا يُستحق له شيء عنها. اتفق معه أولاً إن كان بدأ فيها."
        : "It comes off the order and nothing is owed for it. Agree with them first if they started on it.",
    },
    {
      value: "stock" as const,
      show: allowed.stock,
      enabled: canStock,
      title: isAr ? "احتفظ بها للبيع" : "Keep it for sale",
      body: arrived
        ? isAr
          ? `تدخل المخزون الآن بمقاس ${sizeName}، بتكلفتها.`
          : `It joins the stock now in size ${sizeName}, at what it cost.`
        : isAr
          ? `تكمل عند المورد، وتدخل المخزون بمقاس ${sizeName} عند وصولها.`
          : `The supplier finishes it; it joins the stock in size ${sizeName} when it arrives.`,
      note: canStock
        ? null
        : isAr
          ? "يحتاج صلاحية إدارة المخزون."
          : "Needs the permission to manage stock.",
    },
  ].filter((option) => option.show);

  const save = async () => {
    if (!choice) return;
    setSaving(true);
    try {
      await releaseCustomerPiece(line.id, choice);
      await invalidateSupplierOrders(qc, brandId);
      if (choice === "stock") await invalidateAfterReceipt(qc, brandId);
      toast.success(
        choice === "stop"
          ? isAr
            ? "أُوقفت القطعة عند المورد"
            : "The piece was stopped with the supplier"
          : isAr
            ? "القطعة محفوظة للبيع"
            : "The piece is kept for sale",
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(supplierOrderError(error, isAr));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isAr ? "ألغى الزبون طلبه" : "The customer cancelled"}</DialogTitle>
          <DialogDescription>
            <span dir="auto" className="break-words">
              {line.description}
            </span>
            {" · "}
            {arrived
              ? isAr
                ? "وصلت من المورد."
                : "It has arrived from the supplier."
              : isAr
                ? "ما زالت عند المورد."
                : "It is still with the supplier."}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="sr-only">{isAr ? "ماذا تفعل بها" : "What to do with it"}</legend>
          {options.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3",
                option.enabled ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                choice === option.value ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <input
                type="radio"
                name="cancelled-piece"
                value={option.value}
                checked={choice === option.value}
                disabled={!option.enabled}
                onChange={() => setChoice(option.value)}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{option.title}</span>
                <span className="block text-xs text-muted-foreground">{option.body}</span>
                {"note" in option && option.note && (
                  <span className="block text-xs text-warning">{option.note}</span>
                )}
              </span>
            </label>
          ))}
          {options.length === 0 && (
            <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
              {isAr
                ? "وصلت القطعة ولا مقاس لها في المتجر: لا يمكن إيقافها ولا إدخالها المخزون."
                : "The piece has arrived and has none of the store's sizes: it can be neither stopped nor stocked."}
            </p>
          )}
        </fieldset>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {isAr ? "لاحقاً" : "Later"}
          </Button>
          <Button type="button" onClick={save} disabled={saving || !choice}>
            {isAr ? "احفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
