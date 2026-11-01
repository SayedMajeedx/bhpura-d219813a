import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Scissors, ShoppingBag, CalendarDays, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStoreModules, useStorefront } from "@/lib/storefront-context";
import { buildCartItem } from "@/lib/cart/add-to-cart";
import { openCartDrawer } from "@/lib/cart-drawer";
import { isCatalogMode } from "@/lib/storefront-mode";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { useVariantAxes } from "@/lib/variant-axes";
import {
  choiceLabel,
  quickAddPlan,
  type QuickAddVariant,
} from "@/features/product-page/lib/quick-add";

interface QuickAddPopoverProps {
  product: any;
  variants?: any[];
}

/**
 * A card's quick add, as `quickAddPlan` reads the product: the size chips (or one button naming
 * the only size) put that piece in the bag and open it, a made-to-order piece's ready size goes in
 * as ready, and what only the product page can take (measurements, details, a booking's day) is
 * one button to that page, opened on tailoring when it is for tailoring.
 */
export function QuickAddPopover({ product, variants = [] }: QuickAddPopoverProps) {
  const { brand, addToCart, t, lang, settings } = useStorefront();
  const modules = useStoreModules();
  // The store's own word for making to measure, as on the product page's toggle.
  const { vocabulary } = useVocabulary();
  const customWord = vocabulary.custom_sizing?.[lang] || t("قياس خاص", "Custom sizing");
  const navigate = useNavigate();
  const axes = useVariantAxes(product, variants);
  const [addedId, setAddedId] = useState<string | null>(null);
  const plan = useMemo(
    () =>
      quickAddPlan(product, variants as QuickAddVariant[], {
        madeToOrderModule: Boolean(modules.made_to_order),
      }),
    [product, variants, modules.made_to_order],
  );

  // A catalog store has no bag: the card's own link to the product page remains.
  if (isCatalogMode(settings) || plan.kind === "none") return null;

  const openPage = (tailor: boolean) =>
    navigate({
      to: "/$slug/product/$id",
      params: { slug: brand.slug, id: product.id },
      search: tailor ? { mode: "custom" } : {},
    });

  const add = (variant: QuickAddVariant) => {
    addToCart(
      buildCartItem({
        product,
        variant,
        qty: 1,
        ...(plan.kind === "add" && plan.tailored !== undefined ? { tailored: plan.tailored } : {}),
      }),
    );
    setAddedId(variant.id);
    setTimeout(() => setAddedId(null), 1400);
    // The bag opens on what was added, as the product page's button does.
    if (!openCartDrawer()) toast.success(t("تمت الإضافة إلى السلة", "Added to cart"));
  };

  const sizeWord = axes.find((axis) => axis.field === "size")?.label || t("المقاس", "Size");
  const addWords = (label: string | null) =>
    label
      ? t(`إضافة ${label} إلى السلة`, `Add ${label} to bag`)
      : t("إضافة إلى السلة", "Add to bag");

  return (
    <div className="hidden lg:flex flex-col gap-1.5 w-full bg-background/95 backdrop-blur-md p-2 rounded-lg border border-border shadow-md">
      {plan.kind === "page" ? (
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={() => openPage(plan.reason === "tailor")}
          className="w-full h-8 text-xs font-semibold gap-1.5"
        >
          {plan.reason === "tailor" ? (
            <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
          ) : plan.reason === "book" ? (
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>
            {plan.reason === "tailor"
              ? customWord
              : plan.reason === "book"
                ? t("احجز", "Book")
                : t("اختر التفاصيل", "Choose details")}
          </span>
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
      {plan.kind === "add" && plan.tailorToo && (
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => openPage(true)}
          className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground gap-1"
        >
          <Scissors className="h-3 w-3" aria-hidden="true" />
          {t(`أو ${customWord}`, `Or ${customWord.toLowerCase()}`)}
        </Button>
      )}
    </div>
  );
}
