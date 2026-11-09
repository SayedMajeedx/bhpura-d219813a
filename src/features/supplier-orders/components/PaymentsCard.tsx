import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { formatDate, formatMoney } from "@/lib/format";
import { invalidateSupplierOrders } from "@/lib/data/supplier-orders";
import {
  supplierAccountQueries,
  voidSupplierAccountPayment,
} from "@/lib/data/supplier-orders/account";
import { paymentOf, type SupplierOrder } from "../lib/order-state";
import { methodLabel, paymentsOnOrder, type AccountPayment } from "../lib/supplier-account";
import { supplierOrderError } from "../lib/errors";

/**
 * What was paid to the supplier on this order: each payment with its day, how it was paid and
 * its reference, what it put on this order and the other orders it paid. A payment is taken back
 * whole (it may have paid other orders too, and the dialog says which).
 */
export function PaymentsCard({
  brandId,
  order,
  currency,
  lang,
}: {
  brandId: string;
  order: SupplierOrder;
  currency: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const uid = useId();
  const qc = useQueryClient();
  const pay = paymentOf(order);
  const paymentsQ = useQuery(supplierAccountQueries.payments(brandId));
  const rows = paymentsOnOrder(paymentsQ.data ?? [], order.id);
  const [undoing, setUndoing] = useState<{ payment: AccountPayment; others: string[] } | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const money = (n: number) => formatMoney(n, currency, lang);
  const locale = isAr ? "ar-BH" : "en-BH";

  const undo = async () => {
    if (!undoing || !reason.trim()) return;
    setBusy(true);
    try {
      await voidSupplierAccountPayment(undoing.payment.id, reason);
      await invalidateSupplierOrders(qc, brandId);
      toast.success(isAr ? "أُلغيت الدفعة" : "Payment taken back");
      setUndoing(null);
      setReason("");
    } catch (error) {
      toast.error(supplierOrderError(error, isAr));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-2 p-3 sm:p-4">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-xs text-muted-foreground">{isAr ? "الإجمالي" : "Total"}</dt>
          <dd className="font-bold tabular-nums">{money(pay.total)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{isAr ? "المدفوع" : "Paid"}</dt>
          <dd className="font-bold tabular-nums">{money(pay.paid)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{isAr ? "الباقي" : "Owed"}</dt>
          <dd
            className={
              pay.owed > 0
                ? "font-bold tabular-nums text-warning"
                : "font-bold tabular-nums text-success"
            }
          >
            {money(pay.owed)}
          </dd>
        </div>
      </dl>

      {rows.length > 0 && (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle text-sm">
          {rows.map(({ payment, here, others }) => {
            const voided = Boolean(payment.voided_at);
            return (
              <li key={payment.id} className="flex min-w-0 items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className={voided ? "text-muted-foreground line-through" : "font-semibold"}>
                    <span className="tabular-nums">{money(here)}</span>
                    <span className="ms-2 text-xs font-normal text-muted-foreground">
                      {formatDate(payment.paid_on, locale)} · {methodLabel(payment.method, lang)}
                    </span>
                  </p>
                  {here !== payment.amount && (
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? `من دفعة ${money(payment.amount)}`
                        : `Of a payment of ${money(payment.amount)}`}
                      {others.length > 0 &&
                        (isAr
                          ? ` دفعت أيضاً ${others.join("، ")}`
                          : `, which also paid ${others.join(", ")}`)}
                    </p>
                  )}
                  {(payment.reference || payment.note) && (
                    <p
                      dir="auto"
                      className="text-page-start break-words text-xs text-muted-foreground"
                    >
                      {[payment.reference, payment.note].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {voided && (
                    <p
                      dir="auto"
                      className="text-page-start break-words text-xs text-muted-foreground"
                    >
                      {isAr ? "أُلغيت: " : "Taken back: "}
                      {payment.void_reason}
                    </p>
                  )}
                </div>
                {!voided && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setUndoing({ payment, others })}
                    className="shrink-0 gap-1 text-muted-foreground"
                    aria-label={
                      isAr
                        ? `إلغاء دفعة ${money(payment.amount)}`
                        : `Take back the payment of ${money(payment.amount)}`
                    }
                  >
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{isAr ? "إلغاء" : "Take back"}</span>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={undoing !== null} onOpenChange={(next) => !next && setUndoing(null)}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-sm gap-3">
          <DialogHeader>
            <DialogTitle>
              {isAr
                ? `إلغاء دفعة ${undoing ? money(undoing.payment.amount) : ""}؟`
                : `Take back the payment of ${undoing ? money(undoing.payment.amount) : ""}?`}
            </DialogTitle>
            <DialogDescription>
              {undoing && undoing.others.length > 0
                ? isAr
                  ? `هذه الدفعة دفعت أيضاً ${undoing.others.join("، ")}، فتُلغى منها كلها. تبقى في السجل مع السبب، ولا تُحسب من المدفوع.`
                  : `This payment also paid ${undoing.others.join(", ")}, so it is taken back from all of them. It stays on record with the reason, and no longer counts as paid.`
                : isAr
                  ? "تبقى في السجل مع السبب، ولا تُحسب من المدفوع."
                  : "It stays on record with the reason, and no longer counts as paid."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-reason`}>{isAr ? "السبب" : "Reason"}</Label>
            <Input
              id={`${uid}-reason`}
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isAr ? "مثال: المبلغ خطأ" : "e.g. Wrong amount"}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setUndoing(null)}
              disabled={busy}
            >
              {isAr ? "تراجع" : "Keep it"}
            </Button>
            <Button
              type="button"
              onClick={undo}
              disabled={!reason.trim() || busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isAr ? "إلغاء الدفعة" : "Take it back"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
