import { useState } from "react";
import { Check, Scissors, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStorefront } from "@/lib/storefront-context";
import { isCatalogMode } from "@/lib/storefront-mode";
import { useVariantAxes } from "@/lib/variant-axes";
import {
  choiceLabel,
  type QuickAddPlan,
  type QuickAddVariant,
} from "@/features/product-page/lib/quick-add";
import { useQuickAddActions } from "@/components/storefront/quick-add/use-quick-add";
import {
  PageIcon,
  pageWords,
  useCustomWord,
  useLowStockLine,
} from "@/components/storefront/quick-add/QuickAddParts";

interface QuickAddPopoverProps {
  product: any;
  variants?: any[];
  /** The card's `quickAddPlan`, read once by the card for this popover and its phone button. */
  plan: QuickAddPlan;
}

/**
 * A card's quick add on a laptop, as `quickAddPlan` reads the product: the size chips (or one
 * button naming the only size) put that piece in the bag and open it, a made-to-order piece's ready
 * size goes in as ready, and what only another page can take (measurements, details, a booking's
 * day) is one button to that page. A phone has its own button and sheet (`QuickAddSheet`).
 */
export function QuickAddPopover({ product, variants, plan }: QuickAddPopoverProps) {
  const { t, lang, settings } = useStorefront();
  const axes = useVariantAxes(product, variants);
  const actions = useQuickAddActions(product, plan);
  const customWord = useCustomWord();
  const lowStock = useLowStockLine();
  const [addedId, setAddedId] = useState<string | null>(null);

  // A catalog store has no bag: the card's own link to the product page remains.
  if (isCatalogMode(settings) || plan.kind === "none") return null;

  const add = (variant: QuickAddVariant) => {
    actions.add(variant);
    setAddedId(variant.id);
    setTimeout(() => setAddedId(null), 1400);
    actions.openBag();
  };

  const sizeWord = axes.find((axis) => axis.field === "size")?.label || t("المقاس", "Size");
  const addWords = (label: string | null) =>
    label
      ? t(`إضافة ${label} إلى السلة`, `Add ${label} to bag`)
      : t("إضافة إلى السلة", "Add to bag");
  // The pieces nearly gone, at the store's own low-stock level ("54: باقي قطعة واحدة فقط").
  const lowLines =
    plan.kind === "add"
      ? plan.choices
          .map((variant) => {
            const line = lowStock(variant);
            const label = choiceLabel(variant, lang);
            return line ? (plan.choices.length > 1 && label ? `${label}: ${line}` : line) : null;
          })
          .filter(Boolean)
          .slice(0, 2)
      : [];

  return (
    <div className="hidden lg:flex flex-col gap-1.5 w-full bg-background/95 backdrop-blur-md p-2 rounded-lg border border-border shadow-md">
      {plan.kind === "page" ? (
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={() => actions.openPage(plan.reason)}
          className="w-full h-8 text-xs font-semibold gap-1.5"
        >
          <PageIcon reason={plan.reason} className="h-3.5 w-3.5" />
          <span>{pageWords(plan.reason, customWord, t)}</span>
        </Button>
      ) : plan.choices.length === 1 ? (
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={() => add(plan.choices[0])}
          aria-label={addWords(choiceLabel(plan.choices[0], lang))}
          className="w-full h-8 text-xs font-semibold gap-1.5"
        >
          {addedId ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>{addedId ? t("تمت الإضافة", "Added") : t("أضف للسلة", "Add to bag")}</span>
          {choiceLabel(plan.choices[0], lang) && (
            <span className="rounded bg-primary-foreground/15 px-1.5 py-0.5" dir="auto">
              {choiceLabel(plan.choices[0], lang)}
            </span>
          )}
        </Button>
      ) : (
        <div className="flex flex-col gap-1" role="group" aria-label={sizeWord}>
          <span className="text-xs font-medium text-muted-foreground text-center">{sizeWord}</span>
          <div className="flex flex-wrap items-center justify-center gap-1 max-h-24 overflow-y-auto py-0.5">
            {plan.choices.map((variant) => {
              const label = choiceLabel(variant, lang) ?? t("قياسي", "Standard");
              const added = addedId === variant.id;
              return (
                <Button
                  key={variant.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => add(variant)}
                  aria-label={addWords(label)}
                  className={`h-auto rounded-md px-2.5 py-1 text-xs font-semibold border ${
                    added
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card hover:bg-primary/10 hover:border-primary border-border text-foreground"
                  }`}
                >
                  {added ? <Check className="h-3 w-3" aria-hidden="true" /> : label}
                </Button>
              );
            })}
          </div>
        </div>
      )}
      {lowLines.map((line) => (
        <p key={line} className="text-center text-xs font-medium text-foreground" dir="auto">
          {line}
        </p>
      ))}
      {plan.kind === "add" && plan.tailorToo && (
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => actions.openPage("tailor")}
          className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground gap-1"
        >
          <Scissors className="h-3 w-3" aria-hidden="true" />
          {t(`أو ${customWord}`, `Or ${customWord.toLowerCase()}`)}
        </Button>
      )}
    </div>
  );
}
