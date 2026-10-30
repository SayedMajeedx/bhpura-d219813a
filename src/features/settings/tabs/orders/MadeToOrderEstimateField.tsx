import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { useVocabulary } from "@/hooks/use-vocabulary";

/**
 * How long a piece made to order takes, in the simple view beside the ready pieces' time (both in
 * the reader's language; the advanced fold keeps both languages of each). The product page says it
 * beside the price of a piece the shopper is having made (`productDeliveryLine`) and checkout says
 * it for a cart that holds one. It sat in the advanced fold only, so a made-to-order boutique never
 * found it and its pieces read the ready time.
 */
export function MadeToOrderEstimateField({ lang }: { lang: "ar" | "en" }) {
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;
  const { vocabulary } = useVocabulary();
  const id = useId();
  const word = vocabulary.made_to_order?.[lang] || (isAr ? "صنع حسب الطلب" : "Made to order");
  const value = isAr ? bs.delivery_estimate_tailored_ar : bs.delivery_estimate_tailored_en;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium">
        {isAr ? `وقت القطع (${word})` : `Time for pieces (${word})`}
      </Label>
      <Input
        id={id}
        className="text-xs h-9"
        value={value ?? ""}
        placeholder={
          isAr ? "التجهيز والتوصيل خلال 7 - 10 أيام" : "Made and delivered in 7 - 10 days"
        }
        onChange={(e) =>
          setBs(
            isAr
              ? { delivery_estimate_tailored_ar: e.target.value || null }
              : { delivery_estimate_tailored_en: e.target.value || null },
          )
        }
      />
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "يظهر بجانب السعر في القطعة التي تُجهَّز حسب الطلب، وفي الدفع. إن تُرك فارغاً يظهر وقت القطع الجاهزة."
          : "Shown beside the price of a piece being made for the shopper, and at checkout. Empty: the ready pieces' time shows."}
      </p>
    </div>
  );
}
