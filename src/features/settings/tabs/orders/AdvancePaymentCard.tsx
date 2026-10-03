import { useState } from "react";
import { Wallet } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import {
  ADVANCE_SCOPES,
  ADVANCE_SCOPE_LABELS,
  DEFAULT_ADVANCE_PERCENT,
  advanceForOrder,
  advanceLines,
  advancePercentError,
  advanceRuleFrom,
  type AdvanceOrder,
} from "@/lib/payments/advance-payment";

/** A sample order for the preview: a tailored item and a ready-made one, with a delivery fee. */
const SAMPLE_LINES = [
  { amount: 60, madeToOrder: true },
  { amount: 40, madeToOrder: false },
];
const sample = (fulfillment: AdvanceOrder["fulfillment"]): AdvanceOrder => ({
  total: fulfillment === "delivery" ? 105 : 100,
  shipping: fulfillment === "delivery" ? 5 : 0,
  fulfillment,
  lines: SAMPLE_LINES,
});

/**
 * The store's advance-payment rule: a switch, which orders it covers, and the share of
 * the covered part to pay online before the order is complete. Where it applies,
 * checkout hides cash on delivery and the database refuses it; the balance is collected
 * on delivery or at the event.
 */
export function AdvancePaymentCard() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;
  const enabled = bs.advance_payment_enabled === true;
  const percent = Number(bs.advance_payment_percent ?? DEFAULT_ADVANCE_PERCENT);

  // The text being typed; the setting changes only when it is a valid percentage.
  const [text, setText] = useState(String(percent));
  const error = enabled ? advancePercentError(text, isAr) : null;
  const canPayOnline = bs.card_enabled === true || bs.benefit_enabled === true;
  const currency = bs.currency || "BHD";
  const rule = advanceRuleFrom(bs);
  const money = (n: number) => formatMoney(n, currency);
  const previews = (["delivery", "pickup"] as const).map((fulfillment) => ({
    fulfillment,
    lines: advanceLines(advanceForOrder(sample(fulfillment), rule), { isAr, money }),
  }));

  return (
    <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Wallet className="size-4 text-primary" />
            <span>{isAr ? "الدفعة المقدمة" : "Advance payment"}</span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "اطلب من العميل دفع نسبة من المبلغ إلكترونياً لإتمام الطلب، ويُحصَّل الباقي عند الاستلام أو يوم المناسبة."
              : "Ask customers to pay a share of the amount online to complete the order; the rest is collected on delivery or on the day of the event."}
          </p>
        </div>
        <Switch
          aria-label={isAr ? "تفعيل الدفعة المقدمة" : "Require an advance payment"}
          checked={enabled}
          onCheckedChange={(checked) => setBs({ advance_payment_enabled: checked })}
        />
      </div>

      {enabled && (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium">{isAr ? "تنطبق على" : "Applies to"}</legend>
            <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
              {ADVANCE_SCOPES.map((scope) => {
                const label = ADVANCE_SCOPE_LABELS[scope];
                const active = rule.scope === scope;
                return (
                  <Button
                    key={scope}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    variant="outline"
                    onClick={() => setBs({ advance_payment_scope: scope })}
                    className={cn(
                      "h-auto flex-col items-start gap-1 whitespace-normal rounded-xl p-3 text-start font-normal",
                      active && "border-primary bg-primary/5 ring-1 ring-primary/40",
                    )}
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {isAr ? label.ar : label.en}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {isAr ? label.hintAr : label.hintEn}
                    </span>
                  </Button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="advance-payment-percent" className="text-xs font-medium">
              {isAr ? "نسبة الدفعة المقدمة (%)" : "Advance share (%)"}
            </Label>
            <Input
              id="advance-payment-percent"
              type="number"
              inputMode="decimal"
              min={1}
              max={100}
              step="1"
              dir="ltr"
              className="h-9 w-28 text-xs font-mono"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                if (!advancePercentError(event.target.value, isAr)) {
                  setBs({ advance_payment_percent: Number(event.target.value) });
                }
              }}
            />
            {error && (
              <p className="text-xs font-semibold text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          {!error && (
            <div className="space-y-2 rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
              <p className="font-semibold">
                {isAr
                  ? "مثال: قطعة مفصّلة 60 وقطعة جاهزة 40"
                  : "Example: a made-to-order item of 60 and a ready-made one of 40"}
              </p>
              {previews.map(({ fulfillment, lines }) => (
                <div key={fulfillment}>
                  <p className="font-medium">
                    {fulfillment === "delivery"
                      ? isAr
                        ? `توصيل (رسوم ${money(5)})`
                        : `Delivered (fee ${money(5)})`
                      : isAr
                        ? "استلام من الفرع"
                        : "Pickup"}
                  </p>
                  {lines.length > 0 ? (
                    lines.map((line) => (
                      <p key={line} className="text-muted-foreground">
                        {line}
                      </p>
                    ))
                  ) : (
                    <p className="text-muted-foreground">
                      {isAr ? "بدون دفعة مقدمة؛ الدفع كما هو." : "No advance; payment as usual."}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <ul className="list-disc space-y-1 ps-5 text-xs text-muted-foreground">
            <li>
              {isAr
                ? "حيث تنطبق الدفعة، يُخفى خيار الدفع عند الاستلام في صفحة الدفع ويرفضه النظام."
                : "Where the advance applies, cash on delivery is hidden at checkout and refused by the system."}
            </li>
            <li>
              {isAr
                ? "تُحصَّل الدفعة بالبطاقة، أو بتحويل بنفت باي بقيمة الدفعة فقط ثم تعتمد الإيصال."
                : "Cards are charged the advance; a BenefitPay transfer is for the advance only, which you confirm by approving the receipt."}
            </li>
            <li>
              {isAr
                ? "الطلبات التي تنشئها أنت من لوحة التحكم لا تتأثر."
                : "Orders you create yourself in the admin are not affected."}
            </li>
          </ul>

          {!canPayOnline && (
            <p
              className="rounded-lg border border-warning bg-warning-subtle p-3 text-xs text-foreground"
              role="alert"
            >
              {isAr
                ? "فعّل الدفع بالبطاقة أو بنفت باي أعلاه، وإلا لن يجد العملاء طريقة لدفع الدفعة المقدمة وإتمام الطلب."
                : "Turn on card or BenefitPay above, or customers will have no way to pay the advance and complete an order."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
