import { useId } from "react";
import { AlertTriangle, CheckCircle2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { billAmount, billSummary, settleBill, shareBill, type ShareBy } from "../lib/bill";
import { piecesLabel } from "../lib/order-state";
import type { SupplierOrderForm } from "../lib/order-form";

/**
 * The supplier's bill total. Knowing only the bill, the store shares it over the pieces (equally
 * or by selling price) and each product's cost per piece is filled in; having typed each piece's
 * cost, the bill is checked against the order and a difference becomes the rest of the bill.
 */
export function BillTotalCard({
  form,
  onForm,
  billText,
  onBillText,
  priceOf,
  currency,
  moneyLabel,
  lang,
}: {
  form: SupplierOrderForm;
  onForm: (form: SupplierOrderForm) => void;
  billText: string;
  onBillText: (text: string) => void;
  /** A product's selling price, for sharing the bill by price. */
  priceOf: (productId: string) => number;
  currency: string;
  moneyLabel: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const uid = useId();
  const money = (n: number) => formatMoney(n, currency, lang);
  const bill = billAmount(billText);
  const summary = bill !== null ? billSummary(form, bill) : null;
  const pricesKnown =
    form.products.length > 0 && form.products.every((p) => priceOf(p.productId) > 0);
  const typedBad = billText.trim() !== "" && bill === null;

  const share = (by: ShareBy) => {
    if (bill === null) return;
    const next = shareBill(form, bill, by, priceOf, isAr);
    if (next) onForm(next);
  };
  const settle = () => {
    if (bill === null) return;
    const next = settleBill(form, bill, isAr);
    if (next) onForm(next);
  };

  const shareButtons = (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={() => share("equal")}>
        {isAr ? "بالتساوي على القطع" : "Equally per piece"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => share("price")}
        disabled={!pricesKnown}
        title={
          pricesKnown
            ? undefined
            : isAr
              ? "لكل منتج سعر بيع أولاً"
              : "Every product needs a selling price first"
        }
      >
        {isAr ? "حسب سعر البيع" : "By selling price"}
      </Button>
    </div>
  );

  return (
    <Card className="space-y-3 p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-bold">{isAr ? "فاتورة المورد" : "Supplier's bill"}</h2>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "تعرف المبلغ الإجمالي فقط؟ اكتبه هنا ووزّعه على القطع. كتبت تكلفة كل قطعة؟ يتأكد النظام أنها تساوي الفاتورة."
              : "Know only the total? Type it here and share it over the pieces. Typed each piece's cost? It is checked against the bill."}
          </p>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${uid}-bill`}>
          {isAr ? `إجمالي الفاتورة (${moneyLabel})` : `Bill total (${moneyLabel})`}
        </Label>
        <Input
          id={`${uid}-bill`}
          inputMode="decimal"
          value={billText}
          placeholder="0.000"
          onChange={(e) => onBillText(e.target.value)}
          aria-invalid={typedBad || undefined}
          className="max-w-48 font-mono tabular-nums"
        />
        {typedBad && (
          <p className="text-xs text-destructive">
            {isAr ? "اكتب المبلغ رقماً أكبر من صفر." : "Type the amount as a number above zero."}
          </p>
        )}
      </div>

      {summary && bill !== null && (
        <div className="space-y-2 rounded-lg bg-muted/50 p-2.5 text-sm">
          {summary.count === 0 ? (
            <p className="text-muted-foreground">
              {isAr
                ? "أضف المنتجات وكم قطعة من كل مقاس، ثم وزّع الفاتورة عليها."
                : "Add the products and how many of each size, then share the bill over them."}
            </p>
          ) : (
            <>
              <dl className="space-y-0.5 tabular-nums">
                <Row label={isAr ? "القطع" : "Pieces"} value={money(summary.pieces)} />
                {summary.others > 0 && (
                  <Row label={isAr ? "تكاليف أخرى" : "Other costs"} value={money(summary.others)} />
                )}
                {summary.rest > 0 && (
                  <Row
                    label={isAr ? "باقي الفاتورة" : "Rest of the bill"}
                    value={money(summary.rest)}
                  />
                )}
                <Row
                  label={isAr ? "إجمالي الطلبية" : "Order total"}
                  value={money(summary.total)}
                  strong
                />
              </dl>

              {summary.pieces === 0 ? (
                <div className="space-y-2">
                  <p>
                    {isAr
                      ? `وزّع ${money(bill - summary.others)} على ${piecesLabel(summary.count, "ar")}:`
                      : `Share ${money(bill - summary.others)} over ${piecesLabel(summary.count, "en")}:`}
                  </p>
                  {shareButtons}
                </div>
              ) : summary.difference === 0 ? (
                <p className="flex items-center gap-1.5 font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {isAr ? "الطلبية تساوي الفاتورة." : "The order matches the bill."}
                </p>
              ) : summary.difference > 0 ? (
                <div className="space-y-2">
                  <p className="flex items-start gap-1.5 font-semibold text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {isAr
                      ? `${money(summary.difference)} في الفاتورة ليست في الطلبية بعد.`
                      : `${money(summary.difference)} on the bill is not in the order yet.`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={settle}>
                      {isAr ? "أضفه كباقي الفاتورة" : "Add it as the rest of the bill"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "يُوزَّع على القطع مثل أي تكلفة أخرى (قماش، توصيل). أو أعد توزيع الفاتورة كلها:"
                      : "It is shared over the pieces like any other cost (fabric, delivery). Or share the whole bill again:"}
                  </p>
                  {shareButtons}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="flex items-start gap-1.5 font-semibold text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {isAr
                      ? `الطلبية أكثر من الفاتورة بـ ${money(-summary.difference)}: راجع التكاليف، أو أعد توزيع الفاتورة:`
                      : `The order is ${money(-summary.difference)} more than the bill: check the costs, or share the bill again:`}
                  </p>
                  {shareButtons}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
      <dd className={strong ? "font-bold" : undefined}>{value}</dd>
    </div>
  );
}
