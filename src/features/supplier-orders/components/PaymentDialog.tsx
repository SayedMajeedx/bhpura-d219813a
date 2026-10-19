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
import { invalidateSupplierOrders, recordSupplierPayment } from "@/lib/data/supplier-orders";
import { localToday, paymentOf, type SupplierOrder } from "../lib/order-state";
import { paymentProblem } from "../lib/payments";
import { supplierOrderError } from "../lib/errors";

/** A payment to the supplier: its amount (never more than is owed), its day and a note. */
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
  const today = localToday();
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const problem = paymentProblem({ amount, paidOn, owed: pay.owed, today });
  const money = (n: number) => formatMoney(n, currency, lang);

  const reset = () => {
    setAmount("");
    setPaidOn(localToday());
    setNote("");
    setRequestId(crypto.randomUUID());
  };

  const save = async () => {
    if (problem) return;
    setSaving(true);
    try {
      await recordSupplierPayment(order.id, {
        amount: Number(amount),
        paidOn,
        requestId,
        note: note || null,
      });
      await invalidateSupplierOrders(qc, brandId);
      toast.success(isAr ? "سُجّلت الدفعة" : "Payment recorded");
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(supplierOrderError(error, isAr));
    } finally {
      setSaving(false);
    }
  };

  const typed = amount.trim() !== "";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-sm gap-3">
        <DialogHeader>
          <DialogTitle>{isAr ? "تسجيل دفعة للمورد" : "Record a payment"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? `الباقي عليك ${money(pay.owed)} من ${money(pay.total)}.`
              : `You owe ${money(pay.owed)} of ${money(pay.total)}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-amount`}>
            {isAr ? `المبلغ المدفوع (${moneyLabel})` : `Amount paid (${moneyLabel})`}
          </Label>
          <div className="flex min-w-0 gap-2">
            <Input
              id={`${uid}-amount`}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={(typed && problem === "amount") || undefined}
              className="min-w-0 flex-1 font-mono tabular-nums"
              autoFocus
            />
            <Button type="button" variant="outline" onClick={() => setAmount(String(pay.owed))}>
              {isAr ? "كامل الباقي" : "All of it"}
            </Button>
          </div>
          {typed && problem === "amount" && (
            <p className="text-xs text-destructive">
              {isAr
                ? `اكتب مبلغاً أكبر من صفر ولا يزيد على ${money(pay.owed)}.`
                : `Type an amount above zero and up to ${money(pay.owed)}.`}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 space-y-1">
            <Label htmlFor={`${uid}-date`}>{isAr ? "تاريخ الدفع" : "Paid on"}</Label>
            <Input
              id={`${uid}-date`}
              type="date"
              value={paidOn}
              max={today}
              onChange={(e) => setPaidOn(e.target.value)}
              aria-invalid={problem === "date" || undefined}
            />
          </div>
          <div className="min-w-0 space-y-1">
            <Label htmlFor={`${uid}-note`}>{isAr ? "ملاحظة" : "Note"}</Label>
            <Input
              id={`${uid}-note`}
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isAr ? "نقداً، تحويل…" : "Cash, transfer…"}
            />
          </div>
        </div>
        {problem === "date" && (
          <p className="text-xs text-destructive">
            {isAr
              ? "اختر يوم الدفع، اليوم أو قبله."
              : "Choose the day it was paid: today or before."}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button type="button" onClick={save} disabled={Boolean(problem) || saving}>
            {isAr ? "تسجيل الدفعة" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
