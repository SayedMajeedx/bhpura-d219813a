import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { accountingQueries, type CashMovementRow } from "@/lib/data/accounting";

const MOVEMENT_LABELS: Record<string, { ar: string; en: string }> = {
  order_payment: { ar: "تسوية طلب", en: "Order reconciled" },
  order_payment_reversal: { ar: "إلغاء تسوية", en: "Reconciliation undone" },
  transfer: { ar: "تحويل إلى البنك", en: "Transfer to bank" },
  manual_in: { ar: "إيداع يدوي", en: "Cash in" },
  manual_out: { ar: "سحب يدوي", en: "Cash out" },
};

/** Money into an account is positive; out of it (or reversed) is negative; transfers move it. */
export function movementSign(movement: Pick<CashMovementRow, "transaction_type">): 1 | -1 | 0 {
  if (movement.transaction_type === "transfer") return 0;
  return movement.transaction_type === "manual_out" ||
    movement.transaction_type === "order_payment_reversal"
    ? -1
    : 1;
}

/** The latest movements on the cash box and bank account: what changed the balances. */
export function CashMovementsList({
  brandId,
  isAr,
  accountNames,
}: {
  brandId: string;
  isAr: boolean;
  /** Account id -> display name, to say where money went. */
  accountNames: Map<string, string>;
}) {
  const movementsQ = useQuery(accountingQueries.cashMovements(brandId));
  const movements = movementsQ.data ?? [];

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        {isAr ? "آخر حركات السيولة" : "Recent cash movements"}
      </h3>
      {movements.length === 0 ? (
        <Card className="p-4 text-xs text-muted-foreground">
          {isAr
            ? "لا توجد حركات بعد. سجّل الرصيد الافتتاحي، أو قم بتسوية طلب مدفوع."
            : "No movements yet. Record an opening balance, or reconcile a paid order."}
        </Card>
      ) : (
        <div className="space-y-2">
          {movements.map((movement) => {
            const label = MOVEMENT_LABELS[movement.transaction_type] ?? {
              ar: movement.transaction_type,
              en: movement.transaction_type,
            };
            const accountId = movement.target_account_id ?? movement.source_account_id;
            const sign = movementSign(movement);
            return (
              <Card
                key={movement.id}
                className="p-3 border-border flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-foreground">
                    {isAr ? label.ar : label.en}
                    {accountId && sign !== 0 && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        • {accountNames.get(accountId) ?? ""}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {formatDate(movement.created_at)}
                    {movement.notes ? ` • ${movement.notes}` : ""}
                  </div>
                </div>
                <span
                  dir="ltr"
                  className={`text-xs font-extrabold shrink-0 ${
                    sign < 0 ? "text-destructive" : sign > 0 ? "text-success" : "text-foreground"
                  }`}
                >
                  {sign < 0 ? "−" : sign > 0 ? "+" : ""}
                  {formatMoney(Number(movement.amount), "BHD")}
                </span>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
