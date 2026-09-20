import React, { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, ArrowRight, ArrowLeft, Check, Minus, Plus } from "lucide-react";
import { ResponsiveImage } from "@/components/responsive-media";
import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { buildCartItem, canQuickAddToCart } from "@/lib/cart/add-to-cart";
import { resolveColorHex, extractUniqueVariantColors } from "@/lib/color-names";
import { toast } from "sonner";

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
    custom_fields?: any[] | null;
    product_variants?: Array<{
      id: string;
      color?: string | null;
      size?: string | null;
      size_unit?: string | null;
      fabric?: string | null;
      selling_price?: number | null;
      original_price?: number | null;
      stock_main?: number | null;
      stock_incubator?: number | null;
      image_url?: string | null;
    }> | null;
  };
  brandSlug: string;
}

export function QuickViewModal({
  open,
  onOpenChange,
  product,
  brandSlug,
}: QuickViewModalProps) {
  const { lang, currency, addToCart, t } = useStorefront();
  const navigate = useNavigate();
  const isAr = lang === "ar";
  const NextIcon = isAr ? ArrowLeft : ArrowRight;

  const variants = product.product_variants || [];
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants.length > 0 ? variants[0].id : null,
  );
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

  const selectedVariant =
    variants.find((v) => v.id === selectedVariantId) || (variants.length > 0 ? variants[0] : null);

  const activePrice = Number(
    selectedVariant?.selling_price ?? product.base_price ?? 0,
  );
  const rawOriginal =
    selectedVariant?.original_price ?? product.original_price;
  const activeOriginalPrice =
    rawOriginal && Number(rawOriginal) > activePrice ? Number(rawOriginal) : null;

  const isBespoke =
    Boolean(product.is_made_to_order) ||
    (Array.isArray(product.custom_fields) && product.custom_fields.length > 0);

  const colors = extractUniqueVariantColors(variants);
  const sizes = Array.from(
    new Set(variants.map((v) => v.size).filter(Boolean)),
  ) as string[];

  const handleSelectColor = (colorName: string) => {
    const matching = variants.find(
      (v) => v.color?.trim().toLowerCase() === colorName.trim().toLowerCase(),
    );
    if (matching) {
      setSelectedVariantId(matching.id);
      if (matching.image_url) {
        const idx = mediaList.indexOf(matching.image_url);
        if (idx >= 0) setSelectedImageIdx(idx);
      }
    }
  };

  const handleSelectSize = (sizeStr: string) => {
    const currentColor = selectedVariant?.color;
    const matching =
      variants.find(
        (v) => v.size === sizeStr && (!currentColor || v.color === currentColor),
      ) || variants.find((v) => v.size === sizeStr);
    if (matching) setSelectedVariantId(matching.id);
  };

  const handleAddToCart = () => {
    if (isBespoke) {
      onOpenChange(false);
      navigate({
        to: "/$slug/product/$id",
        params: { slug: brandSlug, id: product.id },
      });
      return;
    }

    setIsAdding(true);
    try {
      const item = buildCartItem({
        product,
        variant: selectedVariant,
        qty,
        selectedColor: selectedVariant?.color,
        selectedSize: selectedVariant?.size,
      });

      addToCart(item);

      toast.success(
        isAr ? "تمت الإضافة إلى حقيبة التسوق" : "Added to shopping bag",
        {
          action: {
            label: isAr ? "عرض الحقيبة" : "View Bag",
            onClick: () => {
              onOpenChange(false);
              navigate({
                to: "/$slug/checkout",
                params: { slug: brandSlug },
              });
            },
          },
        },
      );
      onOpenChange(false);
    } catch {
      toast.error(
        isAr ? "حدث خطأ أثناء الإضافة" : "Could not add item to bag",
      );
    } finally {
      setIsAdding(false);
    }
  };

  const title = isAr
    ? product.name_ar || product.name
    : product.name_en || product.name;

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
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-muted/40">
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
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedImageIdx(idx)}
                    className={`h-2.5 rounded-full transition-all ${
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
                  <Badge variant="destructive" className="text-[10px] font-semibold">
                    {Math.round(((activeOriginalPrice - activePrice) / activeOriginalPrice) * 100)}% {isAr ? "خصم" : "OFF"}
                  </Badge>
                )}
              </div>

              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground font-display">
                {title}
              </h2>

              <div className="mt-3 flex items-baseline gap-2.5">
                <span className="text-lg font-bold text-foreground">
                  {formatPrice(activePrice, currency, lang)}
                </span>
                {activeOriginalPrice && (
                  <span className="text-sm text-muted-foreground line-through">
                    {formatPrice(activeOriginalPrice, currency, lang)}
                  </span>
                )}
              </div>

              {/* Color swatches */}
              {colors.length > 0 && (
                <div className="mt-5">
                  <label className="text-xs font-medium text-foreground">
                    {t("اللون", "Color")}:{" "}
                    <span className="font-normal text-muted-foreground">
                      {selectedVariant?.color || colors[0].name}
                    </span>
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {colors.map((c) => {
                      const isSelected = selectedVariant?.color === c.name;
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => handleSelectColor(c.name)}
                          className={`relative flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
                            isSelected
                              ? "border-primary ring-2 ring-primary ring-offset-2"
                              : "border-border hover:scale-105"
                          }`}
                          style={{ backgroundColor: c.hex || "#e5e7eb" }}
                          title={c.name}
                        >
                          {isSelected && (
                            <Check
                              className={`h-3.5 w-3.5 ${
                                c.hex && ["#ffffff", "#fffff0", "#fffdd0"].includes(c.hex.toLowerCase())
                                  ? "text-black"
                                  : "text-white"
                              }`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Size selection */}
              {sizes.length > 0 && (
                <div className="mt-4">
                  <label className="text-xs font-medium text-foreground">
                    {t("المقاس", "Size")}:{" "}
                    <span className="font-normal text-muted-foreground">
                      {selectedVariant?.size || sizes[0]}
                    </span>
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sizes.map((sz) => {
                      const isSelected = selectedVariant?.size === sz;
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => handleSelectSize(sz)}
                          className={`min-w-10 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-foreground hover:bg-muted"
                          }`}
                        >
                          {sz}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quantity selector */}
              {!isBespoke && (
                <div className="mt-5 flex items-center gap-3">
                  <span className="text-xs font-medium text-foreground">
                    {t("الكمية", "Quantity")}:
                  </span>
                  <div className="flex items-center rounded-lg border border-border">
                    <button
                      type="button"
                      disabled={qty <= 1}
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-8 text-center text-xs font-semibold">
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty((q) => q + 1)}
                      className="p-2 text-muted-foreground hover:text-foreground"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom buttons */}
            <div className="mt-6 flex flex-col gap-2">
              <Button
                variant="default"
                size="lg"
                onClick={handleAddToCart}
                disabled={isAdding}
                className="w-full gap-2 font-medium"
              >
                <ShoppingBag className="h-4 w-4" />
                {isBespoke
                  ? isAr
                    ? "تفاصيل ومقاسات الطلب"
                    : "Configure Custom Order"
                  : isAr
                    ? "إضافة إلى السلة"
                    : "Add to Bag"}
              </Button>

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
