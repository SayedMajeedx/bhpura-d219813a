import { useState } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GiftCardOffer } from "@/lib/data/gift-cards/online";
import { amountInRange, typedAmount } from "../lib/gift-card-shop";

/**
 * The card's amount (the owner's request of 2026-11-12, after the gift card ad): a slider from
 * the store's least to its most in whole units, its value in a bubble over the thumb, and a field
 * to type the amount. A typed amount in the range moves the slider; one outside it says the range
 * and is not taken. The slider runs from the reading start, so the least sits at the right in
 * Arabic.
 */
export function GiftAmountPicker({
  offer,
  amount,
  onChange,
  money,
  invalid,
  lang,
  t,
}: {
  offer: Pick<GiftCardOffer, "minAmount" | "maxAmount">;
  amount: number | null;
  onChange: (amount: number | null) => void;
  money: (amount: number) => string;
  invalid: boolean;
  lang: "ar" | "en";
  t: (ar: string, en: string) => string;
}) {
  const [text, setText] = useState(amount === null ? "" : String(amount));
  const fixed = offer.minAmount === offer.maxAmount;
  const value = amount ?? offer.minAmount;
  const share =
    fixed || amount === null ? 0 : (value - offer.minAmount) / (offer.maxAmount - offer.minAmount);
  const typed = typedAmount(text);
  const outside = text.trim() !== "" && !amountInRange(typed, offer);
  const lo = money(offer.minAmount);
  const hi = money(offer.maxAmount);
  const rangeWords = t(`من ${lo} إلى ${hi}`, `From ${lo} to ${hi}`);
  // Inside a sentence: the same range, its first word in lower case (never the currency).
  const rangeInSentence = t(`من ${lo} إلى ${hi}`, `from ${lo} to ${hi}`);

  return (
    <div className="space-y-4">
      {!fixed && (
        <div className="pt-12">
          <SliderPrimitive.Root
            dir={lang === "ar" ? "rtl" : "ltr"}
            min={offer.minAmount}
            max={offer.maxAmount}
            step={1}
            value={[value]}
            onValueChange={([next]) => {
              // The slider moved: the field follows it.
              setText(String(next));
              onChange(next);
            }}
            className="relative flex h-11 w-full touch-none items-center select-none"
          >
            <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted">
              <SliderPrimitive.Range className="absolute h-full bg-primary" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb
              aria-valuetext={money(value)}
              aria-label={t("قيمة البطاقة", "Card amount")}
              className="relative block size-7 rounded-full border-2 border-primary bg-background shadow-sm transition-transform duration-(--motion-quick) focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none active:scale-110"
            >
              {/* The value over the thumb, kept inside the slider's ends. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-full mb-2 rounded-full bg-primary px-3 py-1.5 font-mono text-sm font-semibold whitespace-nowrap text-primary-foreground tabular-nums shadow-sm"
                style={{
                  insetInlineStart: "50%",
                  translate: `${lang === "ar" ? "" : "-"}${share * 100}% 0`,
                }}
              >
                {money(value)}
              </span>
            </SliderPrimitive.Thumb>
          </SliderPrimitive.Root>
          <div className="mt-1 flex justify-between font-mono text-xs text-muted-foreground tabular-nums">
            <span>{money(offer.minAmount)}</span>
            <span>{money(offer.maxAmount)}</span>
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="gift-amount-typed" className="text-xs">
          {t("أو اكتب القيمة", "Or type the amount")}
        </Label>
        <Input
          id="gift-amount-typed"
          value={text}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const n = typedAmount(next);
            onChange(amountInRange(n, offer) ? n : null);
          }}
          onBlur={() => {
            if (amount !== null) setText(String(amount));
          }}
          inputMode="numeric"
          dir="ltr"
          className="max-w-40 text-center font-mono tabular-nums"
          aria-invalid={invalid || outside}
          aria-describedby="gift-amount-range"
        />
        <p
          id="gift-amount-range"
          className={
            outside || invalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"
          }
        >
          {outside && typed !== null && !Number.isInteger(typed)
            ? t(
                `اكتب رقمًا صحيحًا، ${rangeInSentence}.`,
                `Write a whole number, ${rangeInSentence}.`,
              )
            : outside || invalid
              ? t(`اختر قيمة ${rangeInSentence}.`, `Choose an amount ${rangeInSentence}.`)
              : rangeWords}
        </p>
      </div>
    </div>
  );
}
