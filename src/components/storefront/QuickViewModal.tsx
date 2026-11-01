import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingBag,
  ArrowRight,
  ArrowLeft,
  Check,
  Minus,
  Plus,
  Scissors,
  CalendarDays,
  SlidersHorizontal,
} from "lucide-react";
import { ResponsiveImage } from "@/components/responsive-media";
import { useStoreModules, useStorefront, formatPrice } from "@/lib/storefront-context";
import { buildCartItem } from "@/lib/cart/add-to-cart";
import { openCartDrawer } from "@/lib/cart-drawer";
import { PRODUCT_PHOTO_CLASS, productCardRatio } from "@/lib/brand-templates/design-presets";
import { quickAddPlan, type QuickAddVariant } from "@/features/product-page/lib/quick-add";
import { resolveColorHex } from "@/lib/color-names";
import { storefrontQueries } from "@/lib/data/storefront";
import { SALE_BADGE_CLASS } from "@/lib/storefront-badges";
import {
  formatAxisValue,
  useVariantAxes,
  type VariantField,
  type VariantLike,
} from "@/lib/variant-axes";
import type { ProductVariantLabels } from "@/lib/addons/addon-registry";
import { toast } from "sonner";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { useLiveOffers } from "@/hooks/use-live-offers";
import { offeredPiecePrice } from "@/lib/offer-price";

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
type Picked = Partial<Record<VariantField, string>>;

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** Whether a piece carries every option picked so far. */
const fits = (variant: QuickViewVariant, picked: Picked) =>
  (Object.entries(picked) as [VariantField, string][]).every(([field, value]) =>
    same(variant[field], value),
  );

export function QuickViewModal({
  open,
  onOpenChange,
  product: cardProduct,
  brandSlug,
}: QuickViewModalProps) {
  const { lang, currency, addToCart, t, brand, settings } = useStorefront();
  const modules = useStoreModules();
  // The store's own word for making to measure, as on the product page's toggle.
  const { vocabulary } = useVocabulary();
  const customWord = vocabulary.custom_sizing?.[lang] || t("قياس خاص", "Custom sizing");
  const offers = useLiveOffers();
  const navigate = useNavigate();
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
  // What can be added here is the card's rule (`quickAddPlan`): the ready pieces in stock, a
  // made-to-order piece's ready size as ready; what needs the product page goes there.
  const plan = quickAddPlan(product, variants as QuickAddVariant[], {
    madeToOrderModule: Boolean(modules.made_to_order),
  });
  const choices = (plan.kind === "add" ? plan.choices : []) as QuickViewVariant[];
  const [selection, setSelection] = useState<Picked>({});
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [isAdding, setIsAdding] = useState(false);

  // Extract all media images
  const mediaList: string[] = [];
  if (product.image_url) mediaList.push(product.image_url);
  if (Array.isArray(product.media)) {
    for (const item of product.media) {
      if (item && item.type === "image" && item.url && !mediaList.includes(item.url)) {
        mediaList.push(item.url);
      }
    }
  }
  for (const v of variants) {
    if (v.image_url && !mediaList.includes(v.image_url)) {
      mediaList.push(v.image_url);
    }
  }

  // Labels and swatch-vs-chip rendering come from the store's axis setup
  // (vertical, addon packs, per-product overrides), never from column names. Only the pieces that
  // can be added are offered.
  const axes = useVariantAxes(product, choices as VariantLike[]);

  // Nothing is chosen for the shopper: a piece is named once every option with more than one value
  // is chosen (an only piece is named at once).
  const openAxis = axes.find((axis) => axis.values.length > 1 && !selection[axis.field]);
  const selectedVariant =
    choices.length === 1
      ? choices[0]
      : openAxis
        ? null
        : (choices.find((variant) => fits(variant, selection)) ?? null);

  // The price shown: the chosen piece's, else the cheapest that can be added ("from").
  const cheapest = [...choices].sort(
    (a, b) => Number(a.selling_price ?? 0) - Number(b.selling_price ?? 0),
  )[0];
  const priceVariant = selectedVariant ?? cheapest ?? variants[0] ?? null;
  const pricesDiffer =
    !selectedVariant &&
    new Set(choices.map((variant) => Number(variant.selling_price ?? 0))).size > 1;
  // That piece's price after the store's offers (src/lib/offer-price.ts).
  const offered = priceVariant ? offeredPiecePrice(offers, product, priceVariant) : null;
  const activePrice = offered?.offer
    ? offered.price
    : Number(priceVariant?.selling_price ?? product.base_price ?? 0);
  const rawOriginal = offered?.offer
    ? offered.was
    : (priceVariant?.original_price ?? product.original_price);
  const activeOriginalPrice =
    rawOriginal && Number(rawOriginal) > activePrice ? Number(rawOriginal) : null;

  const handleSelectOption = (field: VariantField, value: string) => {
    // Keep the other choices that a piece still has with this value; drop the rest.
    const next: Picked = { [field]: value };
    for (const [other, picked] of Object.entries(selection) as [VariantField, string][]) {
      if (other === field) continue;
      if (choices.some((variant) => fits(variant, { ...next, [other]: picked }))) {
        next[other] = picked;
      }
    }
    setSelection(next);
    const shown = choices.find((variant) => fits(variant, next) && variant.image_url);
    if (shown?.image_url) {
      const idx = mediaList.indexOf(shown.image_url);
      if (idx >= 0) setSelectedImageIdx(idx);
    }
  };

  const openPage = (tailor: boolean) => {
    onOpenChange(false);
    navigate({
      to: "/$slug/product/$id",
      params: { slug: brandSlug, id: product.id },
      search: tailor ? { mode: "custom" } : {},
    });
  };

  const handleAddToCart = () => {
    if (plan.kind !== "add" || !selectedVariant) return;
    setIsAdding(true);
    try {
      const item = buildCartItem({
        product,
        variant: selectedVariant,
        qty,
        selectedColor: selectedVariant.color,
        selectedSize: selectedVariant.size,
        ...(plan.tailored !== undefined ? { tailored: plan.tailored } : {}),
      });

      addToCart(item);
      onOpenChange(false);
      // The bag opens on what was added once the dialog has closed, as the product page's button
      // does; a page with no drawer says so in a note.
      window.setTimeout(() => {
        if (openCartDrawer()) return;
        toast.success(t("تمت الإضافة إلى السلة", "Added to cart"), {
          action: {
            label: t("عرض السلة", "View bag"),
            onClick: () => {
              if (!openCartDrawer()) {
                navigate({ to: "/$slug/checkout", params: { slug: brandSlug } });
              }
            },
          },
        });
      }, 0);
    } catch {
      toast.error(t("حدث خطأ أثناء الإضافة", "Could not add item to bag"));
    } finally {
      setIsAdding(false);
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
                    key={idx}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedImageIdx(idx)}
                    className={`h-2.5 rounded-full hover:bg-transparent p-0 transition-[width,background-color] ${
                      idx === selectedImageIdx
                        ? "w-6 bg-primary"
                        : "w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                    }`}
                    aria-label={`Image ${idx + 1}`}
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
                {activeOriginalPrice && (
                  <Badge className={`border-transparent text-xs font-semibold ${SALE_BADGE_CLASS}`}>
                    {Math.round(((activeOriginalPrice - activePrice) / activeOriginalPrice) * 100)}%{" "}
                    {isAr ? "خصم" : "OFF"}
                  </Badge>
                )}
              </div>

              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground font-display">
                {title}
              </h2>

              <div className="mt-3 flex items-baseline gap-2.5">
                <span className="text-lg font-bold text-foreground">
                  {pricesDiffer && (
                    <span className="me-1 text-sm font-normal text-muted-foreground">
                      {t("من", "From")}
                    </span>
                  )}
                  {formatPrice(activePrice, currency, lang)}
                </span>
                {activeOriginalPrice && (
                  <span className="text-sm text-muted-foreground line-through">
                    {formatPrice(activeOriginalPrice, currency, lang)}
                  </span>
                )}
              </div>

              {/* Option axes (colour, size, grind, weight, …) */}
              {axes.map((axis) => {
                const current = (
                  selection[axis.field] ??
                  selectedVariant?.[axis.field] ??
                  ""
                ).trim();
                // A value no piece has with what else is picked is dimmed; choosing it starts over.
                const others: Picked = { ...selection };
                delete others[axis.field];
                return (
                  <div key={axis.key} className="mt-4 first:mt-5">
                    <div className="text-xs font-medium text-foreground">
                      {axis.label}:{" "}
                      <span className="font-normal text-muted-foreground">
                        {current ? formatAxisValue(axis, current, lang, variants) : ""}
                      </span>
                    </div>
                    <div
                      className="mt-2 flex flex-wrap gap-2"
                      role="radiogroup"
                      aria-label={axis.label}
                    >
                      {axis.values.map((value) => {
                        const isSelected = current.toLowerCase() === value.toLowerCase();
                        const display = formatAxisValue(axis, value, lang, variants);
                        const fitsPicks = choices.some((variant) =>
                          fits(variant, { ...others, [axis.field]: value }),
                        );
                        if (axis.swatch) {
                          const hex = resolveColorHex(value) || "#e5e7eb";
                          const light = ["#ffffff", "#fffff0", "#fffdd0", "#e5e7eb"].includes(
                            hex.toLowerCase(),
                          );
                          return (
                            <Button
                              key={value}
                              type="button"
                              variant="ghost"
                              size="icon"
                              role="radio"
                              aria-checked={isSelected}
                              aria-label={display}
                              title={display}
                              onClick={() => handleSelectOption(axis.field, value)}
                              className={`relative flex h-8 w-8 items-center justify-center rounded-full hover:bg-transparent border p-0 transition ${
                                isSelected
                                  ? "border-primary ring-2 ring-primary ring-offset-2"
                                  : "border-border hover:scale-105"
                              } ${fitsPicks ? "" : "opacity-40"}`}
                              style={{ backgroundColor: hex }}
                            >
                              {isSelected && (
                                <Check
                                  className={`h-3.5 w-3.5 ${light ? "text-black" : "text-white"}`}
                                />
                              )}
                            </Button>
                          );
                        }
                        return (
                          <Button
                            key={value}
                            type="button"
                            variant="ghost"
                            size="sm"
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() => handleSelectOption(axis.field, value)}
                            className={`h-auto min-w-10 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-card text-foreground hover:bg-muted"
                            } ${fitsPicks ? "" : "opacity-40 line-through"}`}
                          >
                            {display}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

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
              {plan.kind === "add" ? (
                <Button
                  variant="default"
                  size="lg"
                  onClick={handleAddToCart}
                  disabled={isAdding || !selectedVariant}
                  className="w-full gap-2 font-medium"
                >
                  <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                  {selectedVariant || !openAxis
                    ? t("إضافة إلى السلة", "Add to bag")
                    : t(`اختر ${openAxis.label}`, `Choose ${openAxis.label.toLowerCase()}`)}
                </Button>
              ) : plan.kind === "page" ? (
                <Button
                  variant="default"
                  size="lg"
                  onClick={() => openPage(plan.reason === "tailor")}
                  className="w-full gap-2 font-medium"
                >
                  {plan.reason === "tailor" ? (
                    <Scissors className="h-4 w-4" aria-hidden="true" />
                  ) : plan.reason === "book" ? (
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  )}
                  {plan.reason === "tailor"
                    ? customWord
                    : plan.reason === "book"
                      ? t("احجز", "Book")
                      : t("اختر التفاصيل", "Choose details")}
                </Button>
              ) : (
                <Button variant="default" size="lg" disabled className="w-full font-medium">
                  {t("غير متوفر الآن", "Not available now")}
                </Button>
              )}

              {plan.kind === "add" && plan.tailorToo && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => openPage(true)}
                  className="w-full gap-2 font-medium"
                >
                  <Scissors className="h-4 w-4" aria-hidden="true" />
                  {t(`أو ${customWord}`, `Or ${customWord.toLowerCase()}`)}
                </Button>
              )}

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
