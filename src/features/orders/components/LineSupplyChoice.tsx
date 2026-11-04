import { Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { useVocabulary } from "@/hooks/use-vocabulary";
import type { OrderItem } from "@/features/orders/types";

type Supply = "main" | "incubator" | "custom";

/**
 * Where a line's piece comes from: the store's ready stock, a partner shop's, or made to order
 * (a store with the made-to-order module). Made to order takes no stock; its measurements and the
 * notes for the workshop are written in the line's own editor, which the hint opens. Before, a
 * line became made to order only once a measurement was typed, and never went back.
 */
export function LineSupplyChoice({
  it,
  mainStock,
  partnerStock,
  madeToOrderModule,
  isReadOnly,
  lang,
  vocabulary,
  onChoose,
  onOpenEditor,
}: {
  it: Pick<OrderItem, "location">;
  mainStock: number;
  partnerStock: number;
  madeToOrderModule: boolean;
  isReadOnly: boolean;
  lang: "ar" | "en";
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
  onChoose: (location: Supply) => void;
  onOpenEditor: () => void;
}) {
  const isAr = lang === "ar";
  const madeWord = vocabulary.made_to_order?.[lang] || (isAr ? "تفصيل حسب الطلب" : "Made to order");
  const options: Array<{ key: Supply; label: string }> = [
    { key: "main", label: isAr ? `المخزون الرئيسي (${mainStock})` : `Main stock (${mainStock})` },
    {
      key: "incubator",
      label: isAr ? `المحل الشريك (${partnerStock})` : `Partner shop (${partnerStock})`,
    },
    ...(madeToOrderModule ? [{ key: "custom" as const, label: madeWord }] : []),
  ];
  const current = (it.location ?? "main") as Supply;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{isAr ? "مصدر القطعة" : "Where the piece comes from"}</Label>
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={current === opt.key}
            disabled={isReadOnly}
            onClick={() => onChoose(opt.key)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-60 ${
              current === opt.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-secondary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {current === "custom" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
          <span className="text-foreground">
            {isAr
              ? "لا يُخصم من المخزون الجاهز. المقاسات وملاحظات الورشة من تعديل القطعة."
              : "Takes no ready stock. Its measurements and notes for the workshop are in the piece's editor."}
          </span>
          {!isReadOnly && (
            <Button type="button" size="sm" variant="outline" onClick={onOpenEditor}>
              <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
              {isAr ? "المقاسات والملاحظات" : "Measurements & notes"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
