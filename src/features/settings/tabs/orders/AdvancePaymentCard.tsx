import { useState } from "react";
import { Wallet } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/format";
import {
  DEFAULT_ADVANCE_PERCENT,
  advanceLines,
  advancePercentError,
  advanceRuleFrom,
  advanceSplit,
} from "@/lib/payments/advance-payment";

/** What the example order for the preview costs. */
const EXAMPLE_TOTAL = 100;

/**
 * The store's advance-payment rule: a switch and the share of an order to pay
 * online before it is complete. While it is on, checkout hides cash on delivery
 * and the database refuses it; the balance is collected on delivery or at the event.
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
  const preview = advanceLines(advanceSplit(EXAMPLE_TOTAL, advanceRuleFrom(bs)), {
    isAr,
    money: (n) => formatMoney(n, currency),
  });

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
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="advance-payment-percent" className="text-xs font-medium">
              {isAr ? "نسبة الدفعة المقدمة (%)" : "Advance share of the order (%)"}
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

          {!error && preview.length > 0 && (
            <div className="rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
              <p className="mb-1 font-semibold">
                {isAr
                  ? `مثال: طلب بقيمة ${formatMoney(EXAMPLE_TOTAL, currency)}`
                  : `Example: an order of ${formatMoney(EXAMPLE_TOTAL, currency)}`}
              </p>
              {preview.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}

          <ul className="list-disc space-y-1 ps-5 text-xs text-muted-foreground">
            <li>
              {isAr
                ? "يُخفى خيار الدفع عند الاستلام في صفحة الدفع، ويرفضه النظام."
                : "Cash on delivery is hidden at checkout and refused by the system."}
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
