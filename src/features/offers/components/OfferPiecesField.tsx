import { Button } from "@/components/ui/button";
import type { OfferPieces } from "@/lib/offers";
import { cn } from "@/lib/utils";

const CHOICES: Array<{
  value: OfferPieces;
  ar: string;
  en: string;
  hintAr: string;
  hintEn: string;
}> = [
  {
    value: "any",
    ar: "كل القطع",
    en: "Every piece",
    hintAr: "الجاهزة والمفصّلة حسب الطلب",
    hintEn: "Ready-made and made to order",
  },
  {
    value: "ready",
    ar: "القطع الجاهزة فقط",
    en: "Ready-made pieces only",
    hintAr: "لا يشمل التفصيل حسب المقاس",
    hintEn: "Never a piece made to measure",
  },
  {
    value: "made_to_order",
    ar: "التفصيل حسب الطلب فقط",
    en: "Made-to-order pieces only",
    hintAr: "لا يشمل المقاسات الجاهزة",
    hintEn: "Never a ready-made size",
  },
];

/**
 * Which pieces an offer is for (`store_offers.pieces`): a made-to-order product's ready size is a
 * ready piece, as the order writes it; a piece made to the customer's measurements is not.
 */
export function OfferPiecesField({
  isAr,
  value,
  onChange,
}: {
  isAr: boolean;
  value: OfferPieces;
  onChange: (value: OfferPieces) => void;
}) {
  const legend = isAr ? "القطع التي يشملها" : "Which pieces";
  return (
    <fieldset className="space-y-2 rounded-xl border border-border p-3">
      <legend className="px-1 text-xs font-semibold text-muted-foreground">{legend}</legend>
      <div role="group" aria-label={legend} className="grid gap-2 sm:grid-cols-3">
        {CHOICES.map((choice) => (
          <Button
            key={choice.value}
            type="button"
            variant="chip"
            aria-pressed={value === choice.value}
            className={cn(
              "h-auto flex-col items-start gap-0.5 border border-border px-3 py-2 text-start whitespace-normal",
              value === choice.value && "border-primary bg-primary/10 text-foreground",
            )}
            onClick={() => onChange(choice.value)}
          >
            <span className="text-sm font-medium">{isAr ? choice.ar : choice.en}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {isAr ? choice.hintAr : choice.hintEn}
            </span>
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
