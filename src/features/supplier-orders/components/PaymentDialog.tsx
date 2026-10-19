import { useId, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { invalidateSupplierOrders, setSupplierOrderPaid } from "@/lib/data/supplier-orders";
import { roundCost } from "../lib/landed-cost";
import { paymentOf, type SupplierOrder } from "../lib/order-state";
import { supplierOrderError } from "../lib/errors";

/** A payment to the supplier: added to what was paid, never more than is owed. */
export function PaymentDialog({
  open,
  onOpenChange,
  brandId,
  order,
  currency,
  moneyLabel,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  order: SupplierOrder;
  currency: string;
  moneyLabel: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const uid = useId();
  const qc = useQueryClient();
  const pay = paymentOf(order);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const value = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(value) && value > 0 && value <= pay.owed;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await setSupplierOrderPaid(brandId, order.id, roundCost(pay.paid + value));
      await invalidateSupplierOrders(qc, brandId);
      toast.success(isAr ? "سُجّلت الدفعة" : "Payment recorded");
      setAmount("");
      onOpenChange(false);
    } catch (error) {
      toast.error(supplierOrderError(error, isAr));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-sm gap-3">
        <DialogHeader>
          <DialogTitle>{isAr ? "تسجيل دفعة للمورد" : "Record a payment"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? `الباقي عليك ${formatMoney(pay.owed, currency, lang)} من ${formatMoney(pay.total, currency, lang)}.`
              : `You owe ${formatMoney(pay.owed, currency, lang)} of ${formatMoney(pay.total, currency, lang)}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor={uid}>
            {isAr ? `المبلغ المدفوع (${moneyLabel})` : `Amount paid (${moneyLabel})`}
          </Label>
          <div className="flex min-w-0 gap-2">
            <Input
              id={uid}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={(amount.trim() !== "" && !valid) || undefined}
              className="min-w-0 flex-1 font-mono tabular-nums"
              autoFocus
            />
            <Button type="button" variant="outline" onClick={() => setAmount(String(pay.owed))}>
              {isAr ? "كامل الباقي" : "All of it"}
            </Button>
          </div>
          {amount.trim() !== "" && !valid && (
            <p className="text-xs text-destructive">
              {isAr
                ? `اكتب مبلغاً أكبر من صفر ولا يزيد على ${formatMoney(pay.owed, currency, lang)}.`
                : `Type an amount above zero and up to ${formatMoney(pay.owed, currency, lang)}.`}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button type="button" onClick={save} disabled={!valid || saving}>
            {isAr ? "تسجيل الدفعة" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
