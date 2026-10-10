import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { MadeToOrderPanel } from "@/features/inventory/components/MadeToOrderPanel";
import { SALE_MODES, saleModeOf, type SaleMode } from "@/features/inventory/lib/sale-mode";
import type { Product } from "@/features/inventory/types";

/**
 * "How is this piece sold?": from ready stock, or made to order (which may also have ready
 * sizes). One question in the product's basics, with everything about making to order (the
 * limit, a pause, the record) right under it.
 */
export function SaleModeSection({
  brandId,
  product,
  isAr,
  madeToOrder,
  onMadeToOrder,
  draftLimit,
  onDraftLimit,
}: {
  brandId: string;
  /** The product being edited (null while a new one is created). */
  product: Pick<Product, "id" | "made_to_order_available" | "made_to_order_paused_at"> | null;
  isAr: boolean;
  madeToOrder: boolean;
  onMadeToOrder: (madeToOrder: boolean) => void;
  draftLimit: string;
  onDraftLimit: (text: string) => void;
}) {
  const { vocabulary } = useVocabulary();
  const lang = isAr ? "ar" : "en";
  const active: SaleMode = saleModeOf({ is_made_to_order: madeToOrder });
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-bold text-muted-foreground">
        {isAr ? "كيف تُباع هذه القطعة؟" : "How is this piece sold?"}
      </legend>
      <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
        {SALE_MODES.map(({ mode, title, hint }) => {
          const selected = active === mode;
          // The store's own word for made to order ("Tailoring", "Made to order").
          const label =
            mode === "made_to_order"
              ? vocabulary.made_to_order?.[lang] || title[lang]
              : title[lang];
          return (
            <Button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              variant="outline"
              onClick={() => onMadeToOrder(mode === "made_to_order")}
              className={cn(
                "h-auto flex-col items-start gap-1 whitespace-normal rounded-xl p-3 text-start font-normal",
                selected && "border-primary bg-primary/5 ring-1 ring-primary/40",
              )}
            >
              <span className="text-sm font-semibold text-foreground">{label}</span>
              <span className="text-xs text-muted-foreground">{hint[lang]}</span>
            </Button>
          );
        })}
      </div>
      {madeToOrder && (
        <MadeToOrderPanel
          brandId={brandId}
          product={product}
          isAr={isAr}
          draftLimit={draftLimit}
          onDraftLimit={onDraftLimit}
        />
      )}
    </fieldset>
  );
}
