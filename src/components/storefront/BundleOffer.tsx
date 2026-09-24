import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { buildCartItem } from "@/lib/cart/add-to-cart";
import { toast } from "sonner";
import { Plus, Check, ShoppingBag, Sparkles } from "lucide-react";

interface BundleOfferProps {
  mainProduct: any;
  mainVariant?: any;
  bundleItems: any[];
}

export function BundleOffer({ mainProduct, mainVariant, bundleItems = [] }: BundleOfferProps) {
  const { addToCart, currency, lang, t } = useStorefront();
  const isAr = lang === "ar";

  // Select first complementary item by default
  const [selectedComplementaryId, setSelectedComplementaryId] = useState<string | null>(() => {
    return bundleItems.length > 0 ? bundleItems[0].id : null;
  });

  const [added, setAdded] = useState(false);

  if (!bundleItems || bundleItems.length === 0) {
    return null;
  }

  const selectedItem = bundleItems.find((item) => item.id === selectedComplementaryId);

  const mainPrice = Number(
    mainVariant?.selling_price ?? mainVariant?.price ?? mainProduct.base_price ?? 0,
  );

  const compPrice = selectedItem
    ? Number(selectedItem.product_variants?.[0]?.selling_price ?? selectedItem.base_price ?? 0)
    : 0;

  const bundleTotal = mainPrice + compPrice;

  const handleAddBundle = () => {
    // 1. Add main product
    const mainCartItem = buildCartItem({
      product: mainProduct,
      variant: mainVariant,
      qty: 1,
    });
    addToCart(mainCartItem);

    // 2. Add complementary product if selected
    if (selectedItem) {
      const compVariant = selectedItem.product_variants?.[0] || null;
      const compCartItem = buildCartItem({
        product: selectedItem,
        variant: compVariant,
        qty: 1,
      });
      addToCart(compCartItem);
    }

    setAdded(true);
    toast.success(
      selectedItem
        ? t("تمت إضافة العرض إلى السلة بنجاح!", "Bundle added to cart successfully!")
        : t("تمت الإضافة إلى السلة", "Added to cart"),
    );

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
        {/* Main Product Thumbnail */}
        <div className="flex items-center gap-2">
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
              <div className="h-full w-full grid place-items-center text-xs text-muted-foreground">
                Item
              </div>
            )}
          </div>
          <div className="text-start max-w-[120px]">
            <p className="text-xs font-medium truncate">
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
          <div className="flex items-center gap-2">
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
                <div className="h-full w-full grid place-items-center text-xs text-muted-foreground">
                  Match
                </div>
              )}
            </div>
            <div className="text-start max-w-[120px]">
              <p className="text-xs font-medium truncate">
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
      {bundleItems.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <span className="text-xs text-muted-foreground shrink-0">
            {t("أضف معه:", "Add with it:")}
          </span>
          {bundleItems.map((item) => {
            const isChosen = item.id === selectedComplementaryId;
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedComplementaryId(item.id)}
                className={`h-auto rounded-md text-xs px-2.5 py-1 rounded-md border font-medium transition-all shrink-0 ${
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
          disabled={added}
          onClick={handleAddBundle}
          className="h-9 px-4 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
        >
          {added ? (
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
