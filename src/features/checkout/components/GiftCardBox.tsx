import { Gift, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/storefront-context";
import type { Storefront } from "@/features/checkout/types";
import type { CheckoutGiftCard } from "@/features/checkout/hooks/use-checkout-gift-card";
import type { GiftCardPay } from "@/features/checkout/lib/gift-card-pay";

const REFUSALS = {
  not_found: {
    ar: "لا توجد بطاقة هدية صالحة بهذا الرمز في المتجر.",
    en: "No usable gift card of this store has this code.",
  },
  currency: {
    ar: "البطاقة بعملة غير عملة المتجر.",
    en: "The card is in another currency than the store's.",
  },
  tries: {
    ar: "محاولات كثيرة: أعد المحاولة بعد قليل.",
    en: "Too many tries: try again in a while.",
  },
} as const;

/** The gift card field of the order summary, or the card applied with its balance. */
export function GiftCardBox({
  giftCard,
  currency,
  lang,
  t,
}: {
  giftCard: CheckoutGiftCard;
  currency: string;
  lang: Storefront["lang"];
  t: Storefront["t"];
}) {
  const { card, input, setInput, apply, remove, checking, refusal } = giftCard;
  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      {card ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Gift className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="font-mono" dir="ltr">
                {card.code}
              </span>{" "}
              <span className="text-muted-foreground">
                {t("الرصيد", "Balance")} {formatPrice(card.balance, currency, lang)}
              </span>
            </span>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={remove}>
            {t("إزالة", "Remove")}
          </Button>
        </div>
      ) : (
        <>
          <Label htmlFor="gift-card-code">{t("هل لديك بطاقة هدية؟", "Have a gift card?")}</Label>
          <div className="flex gap-2">
            <Input
              id="gift-card-code"
              name="gift-card-code"
              autoComplete="off"
              dir="ltr"
              className="h-11 font-mono uppercase"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void apply();
                }
              }}
              placeholder="XXXX-XXXX-XXXX"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void apply()}
              disabled={checking}
            >
              {checking && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t("تطبيق", "Apply")}
            </Button>
          </div>
          {refusal && (
            <p className="text-xs text-destructive" role="alert">
              {REFUSALS[refusal][lang === "ar" ? "ar" : "en"]}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Under the total: what the card pays, what is left, and what is still paid now. */
export function GiftCardLines({
  pay,
  code,
  method,
  appointment = false,
  currency,
  lang,
  t,
}: {
  pay: GiftCardPay;
  code: string;
  method: string;
  /** A booking's rest is paid on the day, not on delivery. */
  appointment?: boolean;
  currency: string;
  lang: Storefront["lang"];
  t: Storefront["t"];
}) {
  const money = (n: number) => formatPrice(n, currency, lang);
  return (
    <div className="space-y-1 text-sm" role="status">
      <div className="flex justify-between gap-3 font-medium">
        <span className="min-w-0 break-words">
          {t("بطاقة الهدية", "Gift card")}{" "}
          <span className="font-mono" dir="ltr">
            {code}
          </span>
        </span>
        <span className="shrink-0">− {money(pay.used)}</span>
      </div>
      <div className="flex justify-between gap-3 font-semibold">
        <span>{t("المتبقي للدفع", "Left to pay")}</span>
        <span>{money(pay.left)}</span>
      </div>
      {pay.coversNow ? (
        <p className="text-xs text-muted-foreground">
          {pay.left > 0
            ? appointment
              ? t(
                  "تدفع البطاقة كل ما يُطلب الآن، والباقي يوم الموعد.",
                  "The card pays all that is asked now; the rest is paid on the day of the booking.",
                )
              : t(
                  "تدفع البطاقة كل ما يُطلب الآن، والباقي عند الاستلام.",
                  "The card pays all that is asked now; the rest is paid on delivery.",
                )
            : t("تدفع البطاقة الطلب كله.", "The card pays the whole order.")}
          {method === "benefit" &&
            ` ${t("لا حاجة لإيصال تحويل.", "No transfer receipt is needed.")}`}
        </p>
      ) : (
        method !== "cod" &&
        pay.payNow < pay.left && (
          <div className="flex justify-between gap-3 text-muted-foreground">
            <span>{t("يُدفع الآن", "To pay now")}</span>
            <span>{money(pay.payNow)}</span>
          </div>
        )
      )}
    </div>
  );
}
