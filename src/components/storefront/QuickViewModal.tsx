import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveImage } from "@/components/responsive-media";
import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { PRODUCT_PHOTO_CLASS, productCardRatio } from "@/lib/brand-templates/design-presets";
import { storefrontQueries } from "@/lib/data/storefront";
import { SALE_BADGE_CLASS } from "@/lib/storefront-badges";
import type { ProductVariantLabels } from "@/lib/addons/addon-registry";
import {
  fitsPicks,
  type Picked,
  type QuickAddVariant,
} from "@/features/product-page/lib/quick-add";
import {
  planChoices,
  useQuickAddActions,
  useQuickAddChoice,
  useQuickAddPlan,
  useQuickAddPrice,
  type QuickAddPage,
} from "@/components/storefront/quick-add/use-quick-add";
import {
  QuickAddButtons,
  QuickAddOptions,
  LowStockNote,
} from "@/components/storefront/quick-add/QuickAddParts";

export interface QuickViewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    name: string;
    name_ar?: string | null;
    name_en?: string | null;
    category?: string | null;
    base_price?: number | null;
    original_price?: number | null;
    image_url?: string | null;
    media?: any;
    is_made_to_order?: boolean | null;
    made_to_order_available?: number | null;
    made_to_order_paused_at?: string | null;
    unavailable_until?: string | null;
    category_unavailable_until?: string | null;
    item_kind?: string | null;
    custom_fields?: any[] | null;
    product_variants?: Array<{
      id: string;
      color?: string | null;
      size?: string | null;
      size_unit?: string | null;
      fabric?: string | null;
      option_four?: string | null;
      option_five?: string | null;
      selling_price?: number | null;
      original_price?: number | null;
      stock_main?: number | null;
      stock_incubator?: number | null;
      image_url?: string | null;
    }> | null;
  };
  brandSlug: string;
}

type QuickViewVariant = NonNullable<QuickViewModalProps["product"]["product_variants"]>[number];
/** A piece the quick view can add. */
type Piece = QuickViewVariant & QuickAddVariant;

/** The product's pictures: its main one, its gallery's, then its sizes' own. */
function pictures(product: QuickViewModalProps["product"], variants: QuickViewVariant[]) {
  const list: string[] = [];
  if (product.image_url) list.push(product.image_url);
  if (Array.isArray(product.media)) {
    for (const item of product.media) {
      if (item && item.type === "image" && item.url && !list.includes(item.url)) {
        list.push(item.url);
      }
    }
  }
  for (const v of variants) {
    if (v.image_url && !list.includes(v.image_url)) list.push(v.image_url);
  }
  return list;
}

/**
 * The quick view: the card's quick add (`quickAddPlan`) with the product's pictures, its price and a
 * quantity. Only the pieces that can be added are offered and nothing is chosen for the shopper.
 */
export function QuickViewModal({
  open,
  onOpenChange,
  product: cardProduct,
  brandSlug,
}: QuickViewModalProps) {
  const { lang, currency, t, brand, settings } = useStorefront();
  const isAr = lang === "ar";
  const NextIcon = isAr ? ArrowLeft : ArrowRight;

  // Cards carry a trimmed product (no per-product option labels, units or
  // extra option columns). Load the same record the product page uses, sharing
  // its cache, and show the card data until it arrives.
  const { data: fullProduct } = useQuery({
    ...storefrontQueries.product(brand, cardProduct.id),
    enabled: open,
  });
  const product = {
    ...cardProduct,
    ...((fullProduct as Partial<QuickViewModalProps["product"]> | null) ?? {}),
  } as QuickViewModalProps["product"] & ProductVariantLabels;

  const variants: QuickViewVariant[] = product.product_variants || [];
  const plan = useQuickAddPlan(product, variants);
  const choices = planChoices<Piece>(plan);
  const choice = useQuickAddChoice(product, choices);
  const selectedVariant = choice.selected;
  const { price, was, from } = useQuickAddPrice(
    product,
    choices,
    selectedVariant,
    variants[0] ?? null,
  );
  const actions = useQuickAddActions(product, plan);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const mediaList = pictures(product, variants);

  const showPicked = (picked: Picked) => {
    const shown = choices.find((variant) => fitsPicks(variant, picked) && variant.image_url);
    const idx = shown?.image_url ? mediaList.indexOf(shown.image_url) : -1;
    if (idx >= 0) setSelectedImageIdx(idx);
  };

  const openPage = (page: QuickAddPage) => {
    onOpenChange(false);
    actions.openPage(page);
  };

  const handleAddToCart = () => {
    if (plan.kind !== "add" || !selectedVariant) return;
    try {
      actions.add(selectedVariant, qty);
      onOpenChange(false);
      // The bag opens on what was added once the dialog has closed.
      window.setTimeout(actions.openBag, 0);
    } catch {
      toast.error(t("حدث خطأ أثناء الإضافة", "Could not add item to bag"));
    }
  };

  const title = isAr ? product.name_ar || product.name : product.name_en || product.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden p-0 sm:rounded-2xl border border-border bg-card">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          {isAr ? "معاينة سريعة للمنتج" : "Product quick view dialog"}
        </DialogDescription>

        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Media gallery */}
          <div className="flex flex-col bg-muted/20 p-4 border-b md:border-b-0 md:border-e border-border">
            <div
              className={`relative ${PRODUCT_PHOTO_CLASS[productCardRatio(settings)]} w-full overflow-hidden rounded-xl bg-muted/40`}
            >
              <ResponsiveImage
                src={mediaList[selectedImageIdx] || product.image_url || "/placeholder.svg"}
                alt={title}
                preset="card"
                className="h-full w-full object-cover"
                sizes="(max-width: 768px) 100vw, 380px"
              />
            </div>

            {/* Thumbnail dots */}
            {mediaList.length > 1 && (
              <div className="mt-3 flex items-center justify-center gap-2">
                {mediaList.slice(0, 5).map((img, idx) => (
                  <Button
                    key={img}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedImageIdx(idx)}
                    className={`h-2.5 rounded-full hover:bg-transparent p-0 transition-[width,background-color] ${
                      idx === selectedImageIdx
                        ? "w-6 bg-primary"
                        : "w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                    }`}
                    aria-label={t(`الصورة ${idx + 1}`, `Image ${idx + 1}`)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Details & Actions */}
          <div className="flex flex-col justify-between p-6">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {product.category || (isAr ? "مختارات حصرية" : "Exclusive")}
                </span>
                {was && (
                  <Badge className={`border-transparent text-xs font-semibold ${SALE_BADGE_CLASS}`}>
                    {Math.round(((was - price) / was) * 100)}% {isAr ? "خصم" : "OFF"}
                  </Badge>
                )}
              </div>

              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground font-display">
                {title}
              </h2>

              <div className="mt-3 flex items-baseline gap-2.5">
                <span className="text-lg font-bold text-foreground">
                  {from && (
                    <span className="me-1 text-sm font-normal text-muted-foreground">
                      {t("من", "From")}
                    </span>
                  )}
                  {formatPrice(price, currency, lang)}
                </span>
                {was && (
                  <span className="text-sm text-muted-foreground line-through">
                    {formatPrice(was, currency, lang)}
                  </span>
                )}
              </div>

              {/* Option axes (colour, size, grind, weight, …) */}
              {choice.axes.length > 0 && (
                <div className="mt-5">
                  <QuickAddOptions
                    choice={choice}
                    choices={choices}
                    onPicked={(field, value) =>
                      showPicked({ ...choice.picked, [field]: value } as Picked)
                    }
                  />
                </div>
              )}
              <LowStockNote variant={selectedVariant} />

              {/* Quantity selector */}
              {plan.kind === "add" && (
                <div className="mt-5 flex items-center gap-3">
                  <span className="text-xs font-medium text-foreground">
                    {t("الكمية", "Quantity")}:
                  </span>
                  <div className="flex items-center rounded-lg border border-border">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={qty <= 1}
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      className="h-auto rounded-md p-2 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      aria-label={t("تقليل الكمية", "Decrease quantity")}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="min-w-8 text-center text-xs font-semibold">{qty}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setQty((q) => q + 1)}
                      className="h-auto rounded-md p-2 text-muted-foreground hover:text-foreground"
                      aria-label={t("زيادة الكمية", "Increase quantity")}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom buttons */}
            <div className="mt-6 flex flex-col gap-2">
              <QuickAddButtons
                plan={plan}
                choice={choice}
                onAdd={handleAddToCart}
                onOpenPage={openPage}
              />
              <Link
                to="/$slug/product/$id"
                params={{ slug: brandSlug, id: product.id }}
                onClick={() => onOpenChange(false)}
                className="mt-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>{t("عرض كافة التفاصيل والمواصفات", "View full product details")}</span>
                <NextIcon className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
