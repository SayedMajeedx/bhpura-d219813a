import React, { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useStorefront } from "@/lib/storefront-context";
import { buildCartItem, canQuickAddToCart } from "@/lib/cart/add-to-cart";
import { toast } from "sonner";
import { ShoppingBag, Check } from "lucide-react";

interface QuickAddPopoverProps {
  product: any;
  variants?: any[];
  onOpenQuickView?: () => void;
}

export function QuickAddPopover({ product, variants = [], onOpenQuickView }: QuickAddPopoverProps) {
  const { brand, addToCart, t, lang } = useStorefront();
  const navigate = useNavigate();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  // If product requires bespoke tailoring or custom fields, direct to PDP
  const canQuick = canQuickAddToCart(product);

  const availableVariants = variants.filter((v) => {
    const stock = Number(v.stock_main ?? 0) + Number(v.stock_incubator ?? 0);
    return stock > 0;
  });

  const handleSelectVariant = (v: any) => {
    if (!canQuick) {
      navigate({
        to: "/$slug/product/$id",
        params: { slug: brand.slug, id: product.id },
      });
      return;
    }

    setSelectedVariantId(v.id);
    const cartItem = buildCartItem({
      product,
      variant: v,
      qty: 1,
    });
    addToCart(cartItem);
    setJustAdded(true);
    toast.success(t("تمت الإضافة إلى السلة", "Added to cart"));

    setTimeout(() => {
      setJustAdded(false);
      setSelectedVariantId(null);
    }, 1200);
  };

  const handleDirectAdd = () => {
    if (!canQuick || availableVariants.length > 1) {
      if (onOpenQuickView) {
        onOpenQuickView();
      } else {
        navigate({
          to: "/$slug/product/$id",
          params: { slug: brand.slug, id: product.id },
        });
      }
      return;
    }

    const singleVariant = availableVariants[0] || null;
    const cartItem = buildCartItem({
      product,
      variant: singleVariant,
      qty: 1,
    });
    addToCart(cartItem);
    setJustAdded(true);
    toast.success(t("تمت الإضافة إلى السلة", "Added to cart"));

    setTimeout(() => {
      setJustAdded(false);
    }, 1200);
  };

  // Extract unique size options if multiple variants
  const hasMultipleSizes =
    availableVariants.length > 1 && availableVariants.some((v) => Boolean(v.size));

  return (
    <div
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="hidden lg:flex flex-col gap-1.5 w-full bg-background/95 backdrop-blur-md p-2 rounded-lg border border-border shadow-md transition-all duration-200"
    >
      {hasMultipleSizes ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground text-center">
            {t("اختر المقاس للإضافة السريعة", "Select size for quick add")}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-1 max-h-24 overflow-y-auto py-0.5">
            {availableVariants.map((v) => {
              const label = v.size || v.name || t("مقاس موحد", "One Size");
              const isAdded = justAdded && selectedVariantId === v.id;
              return (
                <Button
                  key={v.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSelectVariant(v)}
                  className={`h-auto rounded-md px-2.5 py-1 text-xs font-semibold rounded-md border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                    isAdded
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card hover:bg-primary/10 hover:border-primary border-border text-foreground"
                  }`}
                >
                  {isAdded ? <Check className="h-3 w-3 inline" /> : label}
                </Button>
              );
            })}
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={handleDirectAdd}
          className="w-full h-8 text-xs font-semibold gap-1.5"
        >
          {justAdded ? (
            <>
              <Check className="h-3.5 w-3.5 text-primary-foreground" />
              <span>{t("تمت الإضافة", "Added")}</span>
            </>
          ) : (
            <>
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>{t("إضافة سريعة", "Quick Add")}</span>
            </>
          )}
        </Button>
      )}
    </div>
  );
}
