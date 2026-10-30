import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { buildCartItem } from "@/lib/cart/add-to-cart";
import { bundleBlock, companionVariant } from "@/lib/cart/bundle-offer";
import { cardPrice } from "@/lib/product-price";
import { toast } from "sonner";
import { Plus, Check, ShoppingBag, Sparkles, Image as ImageIcon } from "lucide-react";

/** A second piece's variant as the bundle prices and adds it. */
type BundleVariant = {
  id: string;
  size?: string | null;
  color?: string | null;
  selling_price?: number | null;
  original_price?: number | null;
  stock_main?: number | null;
  stock_incubator?: number | null;
};

interface BundleOfferProps {
  mainProduct: any;
  mainVariant?: any;
  /** The shopper is having the piece made to order: its details are taken by the page, not here. */
  madeToOrderChoice?: boolean;
  bundleItems: any[];
}

/**
 * "Complete your order": the piece on the page and a second one in one tap.
 * It adds only what the shopper chose and what can be bought (rules in
 * lib/cart/bundle-offer): until the piece's options are chosen it asks for
 * them, it steps aside while the piece is out of stock or made to order, and
 * it offers only second pieces it can name (one variant, or the shopper's size).
 */
export function BundleOffer({
  mainProduct,
  mainVariant,
  madeToOrderChoice = false,
  bundleItems = [],
}: BundleOfferProps) {
  const { addToCart, currency, lang, t } = useStorefront();
  const isAr = lang === "ar";
  const [selectedComplementaryId, setSelectedComplementaryId] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const block = bundleBlock({ mainProduct, mainVariant, madeToOrderChoice });
  // Out of stock (the page offers "notify me") or made to order: the bundle steps aside.
  if (block === "out" || block === "made_to_order") return null;
  const choosing = block === "choose";
  // Until the size is chosen every piece is shown; then only those one tap can name.
  const offered = bundleItems
    .map((item) => ({ item, variant: companionVariant<BundleVariant>(item, mainVariant) }))
    .filter((entry) => choosing || entry.variant);
  if (offered.length === 0) return null;

  const chosen = offered.find((entry) => entry.item.id === selectedComplementaryId) ?? offered[0];
  const selectedItem = chosen.item;

  // Until a size names the variant, a piece costs what its card says (`cardPrice`): the product's
  // `base_price` is not a price a shopper pays (Pura's Sabeeka read 30 here and 24 on its card).
  const mainPrice = Number(
    mainVariant?.selling_price ?? cardPrice(mainProduct, mainProduct.product_variants).from,
  );
  const compPrice = Number(
    chosen.variant?.selling_price ?? cardPrice(selectedItem, selectedItem.product_variants).from,
  );
  const bundleTotal = mainPrice + compPrice;

  const handleAddBundle = () => {
    if (choosing || !chosen.variant) return;
    // The main piece as chosen, in a ready size: a made-to-order product's line says so.
    const mainCartItem = buildCartItem({ product: mainProduct, variant: mainVariant, qty: 1 });
    addToCart(mainProduct.is_made_to_order ? { ...mainCartItem, tailored: false } : mainCartItem);
    addToCart(buildCartItem({ product: selectedItem, variant: chosen.variant, qty: 1 }));

    setAdded(true);
    toast.success(t("تمت إضافة العرض إلى السلة بنجاح!", "Bundle added to cart successfully!"));

    setTimeout(() => {
      setAdded(false);
    }, 1500);
  };

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 sm:p-5 my-6 space-y-4 shadow-xs">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          {t("أكمل طلبك", "Complete your order")}
        </h3>
      </div>

      {/* Product Pair Visual */}
      <div className="flex items-center gap-3">
        {/* Main Product Thumbnail: each product shares the row (min-w-0) so
            long names wrap onto a second line instead of pushing the pair off a phone screen. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="h-16 w-14 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
            {mainProduct.image_url ? (
              <img
                src={mainProduct.image_url}
                alt={mainProduct.name}
                width={240}
                height={240}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full grid place-items-center text-muted-foreground">
                <ImageIcon className="h-4 w-4" aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="min-w-0 text-start">
            <p className="text-xs font-medium line-clamp-2 break-words">
              {isAr
                ? mainProduct.name_ar || mainProduct.name
                : mainProduct.name_en || mainProduct.name}
            </p>
            <p className="text-xs font-semibold text-primary">
              {formatPrice(mainPrice, currency, lang)}
            </p>
          </div>
        </div>

        <Plus className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* Complementary Product Thumbnail */}
        {selectedItem && (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="h-16 w-14 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
              {selectedItem.image_url ? (
                <img
                  src={selectedItem.image_url}
                  alt={selectedItem.name}
                  width={240}
                  height={240}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full grid place-items-center text-muted-foreground">
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="min-w-0 text-start">
              <p className="text-xs font-medium line-clamp-2 break-words">
                {isAr
                  ? selectedItem.name_ar || selectedItem.name
                  : selectedItem.name_en || selectedItem.name}
              </p>
              <p className="text-xs font-semibold text-primary">
                {formatPrice(compPrice, currency, lang)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Alternative Matches Picker if > 1 complementary items */}
      {offered.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <span className="text-xs text-muted-foreground shrink-0">
            {t("أضف معه:", "Add with it:")}
          </span>
          {offered.map(({ item }) => {
            const isChosen = item.id === selectedItem.id;
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedComplementaryId(item.id)}
                className={`h-auto rounded-md text-xs px-2.5 py-1 rounded-md border font-medium transition shrink-0 ${
                  isChosen
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:border-primary/50"
                }`}
              >
                {isAr ? item.name_ar || item.name : item.name_en || item.name}
              </Button>
            );
          })}
        </div>
      )}

      {/* Total & Action */}
      <div className="pt-3 border-t border-border flex items-center justify-between gap-4">
        <div>
          <span className="text-xs text-muted-foreground block">
            {t("السعر معاً:", "Combined price:")}
          </span>
          <span className="text-sm font-bold text-foreground">
            {formatPrice(bundleTotal, currency, lang)}
          </span>
        </div>

        <Button
          type="button"
          size="sm"
          disabled={added || choosing}
          onClick={handleAddBundle}
          className="h-9 px-4 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
        >
          {choosing ? (
            <span>{t("اختر المقاس أولاً", "Choose your size first")}</span>
          ) : added ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>{t("تمت إضافة العرض", "Bundle added")}</span>
            </>
          ) : (
            <>
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>{t("إضافة العرض للسلة", "Add bundle to cart")}</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
