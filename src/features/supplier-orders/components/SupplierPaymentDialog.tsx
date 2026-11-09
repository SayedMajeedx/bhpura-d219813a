import { useId, useMemo, useState } from "react";
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
import { invalidateSupplierOrders } from "@/lib/data/supplier-orders";
import { recordSupplierAccountPayment } from "@/lib/data/supplier-orders/account";
import { roundCost } from "../lib/landed-cost";
import { localToday, type SupplierOrder } from "../lib/order-state";
import {
  PAYMENT_METHODS,
  accountPaymentProblem,
  methodLabel,
  owedOrders,
  spreadPayment,
  type PaymentMethod,
} from "../lib/supplier-account";
import { supplierOrderError } from "../lib/errors";

/**
 * A payment to a supplier, as it happened: one amount on one day, by one means, spread on the
 * orders the store chooses or on the oldest that owe, the rest kept as the supplier's credit.
 * Opened from the suppliers' list, or from an order (which is then chosen first).
 */
export function SupplierPaymentDialog({
  open,
  onOpenChange,
  brandId,
  vendor,
  orders,
  credit,
  firstOrderId,
  currency,
  moneyLabel,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  vendor: { id: string; name: string };
  orders: readonly SupplierOrder[];
  credit: number;
  /** The order the dialog was opened from: paid first. */
  firstOrderId?: string;
  currency: string;
  moneyLabel: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const uid = useId();
  const qc = useQueryClient();
  const today = localToday();
  const owed = useMemo(() => owedOrders(orders, vendor.id), [orders, vendor.id]);
  const owedTotal = roundCost(owed.reduce((sum, o) => sum + o.owed, 0));
  const first = owed.find((o) => o.id === firstOrderId) ?? null;

  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [choosing, setChoosing] = useState(Boolean(first));
  const [typedParts, setTypedParts] = useState<Record<string, string>>({});
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const money = (n: number) => formatMoney(n, currency, lang);

  const value = Number(amount.trim());
  // The order the dialog came from takes the payment first, up to what it owes, until a part
  // is typed for it.
  const chosen = useMemo(() => {
    if (!choosing) return {};
    const parts: Record<string, number> = {};
    for (const order of owed) {
      const typed = typedParts[order.id];
      if (typed !== undefined) {
        const part = Number(typed.trim());
        if (typed.trim() !== "") parts[order.id] = Number.isFinite(part) ? part : -1;
      } else if (order.id === first?.id && Number.isFinite(value) && value > 0) {
        parts[order.id] = roundCost(Math.min(value, order.owed));
      }
    }
    return parts;
  }, [choosing, owed, typedParts, first, value]);
  const problem = accountPaymentProblem({ amount, paidOn, method, chosen, owed, today });
  const spread = spreadPayment(Number.isFinite(value) ? value : 0, owed, chosen);

  const reset = () => {
    setAmount("");
    setPaidOn(localToday());
    setMethod(null);
    setReference("");
    setNote("");
    setChoosing(Boolean(first));
    setTypedParts({});
    setRequestId(crypto.randomUUID());
  };

  const save = async () => {
    if (problem || !method) return;
    setSaving(true);
    try {
      await recordSupplierAccountPayment({
        vendorId: vendor.id,
        amount: value,
        paidOn,
        method,
        reference: reference || null,
        note: note || null,
        allocations: Object.entries(chosen)
          .filter(([, part]) => part > 0)
          .map(([poId, part]) => ({ poId, amount: part })),
        requestId,
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
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="max-h-[90dvh] max-w-md gap-3 overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle dir="auto" className="text-page-start break-words">
            {isAr ? `دفعة لـ ${vendor.name}` : `Payment to ${vendor.name}`}
          </DialogTitle>
          <DialogDescription>
            {owedTotal > 0
              ? isAr
                ? `عليك ${money(owedTotal)} لهذا المورد.`
                : `You owe this supplier ${money(owedTotal)}.`
              : isAr
                ? "لا شيء عليك لهذا المورد الآن: الدفعة تبقى رصيداً لك عنده."
                : "You owe this supplier nothing now: the payment stays as your credit with them."}
            {credit > 0 &&
              (isAr
                ? ` ولك عنده رصيد ${money(credit)}.`
                : ` You have ${money(credit)} credit with them.`)}
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
            {owedTotal > 0 && (
              <Button type="button" variant="outline" onClick={() => setAmount(String(owedTotal))}>
                {isAr ? "كل الباقي" : "All owed"}
              </Button>
            )}
          </div>
          {typed && problem === "amount" && (
            <p className="text-xs text-destructive">
              {isAr
                ? "اكتب مبلغاً أكبر من صفر، بثلاث خانات عشرية على الأكثر."
                : "Type an amount above zero, with at most three decimals."}
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
            <Label htmlFor={`${uid}-ref`}>
              {isAr ? "رقم المرجع (اختياري)" : "Reference (optional)"}
            </Label>
            <Input
              id={`${uid}-ref`}
              value={reference}
              maxLength={100}
              onChange={(e) => setReference(e.target.value)}
              dir="auto"
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

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">{isAr ? "طريقة الدفع" : "Paid by"}</legend>
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={method === m ? "default" : "outline"}
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className="rounded-full"
              >
                {methodLabel(m, lang)}
              </Button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1">
          <Label htmlFor={`${uid}-note`}>{isAr ? "ملاحظة" : "Note"}</Label>
          <Input
            id={`${uid}-note`}
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            dir="auto"
          />
        </div>

        {owed.length > 0 && (
          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">
              {isAr ? "على أي طلبيات؟" : "Which orders does it pay?"}
            </legend>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {[
                [false, isAr ? "الأقدم أولاً" : "Oldest first"] as const,
                [true, isAr ? "أختار بنفسي" : "I choose"] as const,
              ].map(([pick, label]) => (
                <Button
                  key={label}
                  type="button"
                  size="sm"
                  variant={choosing === pick ? "default" : "outline"}
                  role="radio"
                  aria-checked={choosing === pick}
                  onClick={() => setChoosing(pick)}
                  className="rounded-full"
                >
                  {label}
                </Button>
              ))}
            </div>
            <ul className="space-y-1.5 text-sm">
              {owed.map((order) => {
                const line = spread.lines.find((l) => l.id === order.id);
                return (
                  <li key={order.id} className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-mono">{order.po_number}</span>
                      <span className="ms-2 text-xs text-muted-foreground">
                        {isAr ? `عليك ${money(order.owed)}` : `owes ${money(order.owed)}`}
                      </span>
                    </span>
                    {choosing ? (
                      <Input
                        aria-label={
                          isAr ? `المدفوع على ${order.po_number}` : `Paid on ${order.po_number}`
                        }
                        inputMode="decimal"
                        value={
                          typedParts[order.id] ?? (chosen[order.id] ? String(chosen[order.id]) : "")
                        }
                        onChange={(e) =>
                          setTypedParts((parts) => ({ ...parts, [order.id]: e.target.value }))
                        }
                        className="h-8 w-24 font-mono tabular-nums"
                      />
                    ) : null}
                    <span className="w-24 text-end font-mono tabular-nums">
                      {line ? money(line.amount) : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {problem === "chosen" && (
              <p className="text-xs text-destructive">
                {isAr
                  ? "ما كتبته لطلبية أكثر مما عليها، أو المجموع أكثر من الدفعة."
                  : "A part is more than its order owes, or the parts add up to more than the payment."}
              </p>
            )}
          </fieldset>
        )}
        {spread.credit > 0 && (
          <p className="rounded-lg bg-muted p-2 text-xs">
            {isAr
              ? `يبقى ${money(spread.credit)} رصيداً لك عند المورد، يُخصم تلقائياً من طلبيته القادمة.`
              : `${money(spread.credit)} stays as your credit with the supplier, taken off their next order by itself.`}
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
