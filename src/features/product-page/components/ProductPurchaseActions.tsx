import { useStorefront } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import {
  ShoppingBag,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  MessageCircle,
  Check,
} from "lucide-react";
import { MorphText } from "@/components/motion/MorphText";
import { IconSwap } from "@/components/motion/IconSwap";
import { useFlash } from "@/components/motion/use-flash";
import { isCatalogMode } from "@/lib/storefront-mode";
import { NotifyMeForm } from "@/components/storefront/NotifyMeForm";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { trackProductEngagement } from "@/lib/storefront-tracking";
import { toast } from "sonner";
import {
  type StorefrontProductDetail as Product,
  type StorefrontVariant as Variant,
} from "@/lib/data/storefront";

import type { Dispatch, SetStateAction } from "react";
import { lowStockLevel } from "@/lib/inventory-health";
import { lowStockLine } from "@/features/product-page/lib/stock-line";
import { offSaleUntil } from "@/lib/product-availability";
import { offSaleSentence } from "@/lib/opening-hours";

/**
 * The low-stock line, quantity, the Add to cart / Buy now buttons (or the inquiry button in
 * catalog mode) and the choice error. The delivery time is beside the price (`ProductTitleAndPrice`).
 */
export function ProductPurchaseActions({
  brand,
  doAdd,
  errorMsg,
  inquiryUrl,
  isTailoringActive,
  lang,
  maxStock,
  tailoringLeft = null,
  product,
  qty,
  selectedVariantOutOfStock,
  setQty,
  settings,
  t,
  variant,
  vocabulary,
}: {
  brand: ReturnType<typeof useStorefront>["brand"];
  doAdd: (thenBuy?: boolean) => boolean;
  errorMsg: string | null;
  inquiryUrl: string | null;
  isTailoringActive: boolean;
  lang: ReturnType<typeof useStorefront>["lang"];
  maxStock: number;
  /** Pieces of this product that can still be made to order (null: no limit). */
  tailoringLeft?: number | null;
  product: Product;
  qty: number;
  selectedVariantOutOfStock: boolean;
  setQty: Dispatch<SetStateAction<number>>;
  settings: ReturnType<typeof useStorefront>["settings"];
  t: ReturnType<typeof useStorefront>["t"];
  variant: Variant | null | undefined;
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
}) {
  const offSale = offSaleUntil(product);
  // The button says the piece is in the bag, where the tap was (text morph and icon swap).
  const [added, flashAdded] = useFlash();
  // A ready size is capped by its stock; a made-to-order piece by the store's limit, if it has one.
  const quantityCap = isTailoringActive ? (tailoringLeft ?? Number.POSITIVE_INFINITY) : maxStock;
  // Nearly gone, at the store's own level (stock-line.ts); a made-to-order piece has its badge.
  const lowStock =
    !isCatalogMode(settings) && variant && !isTailoringActive && !selectedVariantOutOfStock
      ? lowStockLine(maxStock, lowStockLevel(settings?.low_stock_threshold), lang)
      : null;
  return (
    <>
      {lowStock && (
        <p
          role="status"
          className="mb-3 flex items-center gap-1.5 text-sm font-medium text-foreground"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          {lowStock}
        </p>
      )}

      {!isCatalogMode(settings) && (variant || isTailoringActive) && (
        <div className="mb-4 flex items-center">
          <div>
            <div className="text-sm font-medium mb-2">{t("الكمية", "Quantity")}</div>
            <div className="inline-flex items-center border rounded-lg overflow-hidden">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("تقليل الكمية", "Decrease quantity")}
                className="h-11 w-11 rounded-none"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </Button>
              <span className="px-4 text-sm font-medium">{qty}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("زيادة الكمية", "Increase quantity")}
                className="h-11 w-11 rounded-none"
                disabled={qty >= quantityCap}
                onClick={() => setQty((q) => Math.min(quantityCap, q + 1))}
              >
                +
              </Button>
            </div>
          </div>
          {isTailoringActive && (
            <div className="ms-3 mt-6">
              <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-primary font-medium">
                {vocabulary.made_to_order?.[lang] || t("صنع حسب الطلب", "Made to order")}
                {tailoringLeft !== null &&
                  ` · ${t(`متبقي ${tailoringLeft}`, `${tailoringLeft} left`)}`}
              </span>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {isCatalogMode(settings) ? (
        <div className="hidden md:flex gap-2">
          <Button
            type="button"
            className="flex-1 h-12 font-semibold shadow-sm hover:opacity-90 bg-primary text-primary-foreground gap-2"
            onClick={() => {
              if (inquiryUrl) {
                void trackProductEngagement(brand.slug, product.id, "inquiry");
                window.open(inquiryUrl, "_blank", "noopener,noreferrer");
              } else {
                toast.error(
                  t(
                    "رقم التواصل عبر واتساب غير متوفر حالياً",
                    "WhatsApp contact number is not available",
                  ),
                );
              }
            }}
          >
            <MessageCircle className="h-5 w-5" />
            <span>{t("طلب عبر واتساب", "Inquire via WhatsApp")}</span>
          </Button>
        </div>
      ) : selectedVariantOutOfStock ? (
        offSale ? (
          <div
            role="status"
            className="rounded-xl border border-border bg-muted/40 p-4 text-center text-sm font-medium"
          >
            {offSaleSentence(offSale, settings?.opening_hours, new Date(), lang)}
          </div>
        ) : settings?.back_in_stock_enabled !== false ? (
          <div className="space-y-3">
            <NotifyMeForm brandId={brand.id} productId={product.id} variantId={variant?.id} />
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-center text-sm font-medium text-muted-foreground">
            {t("هذا المنتج غير متوفر حالياً", "This product is currently out of stock")}
          </div>
        )
      ) : (
        <div className="hidden md:flex gap-2">
          <Button
            className="flex-1 h-12 font-semibold shadow-sm hover:opacity-90 bg-primary text-primary-foreground gap-2"
            disabled={selectedVariantOutOfStock}
            aria-disabled={selectedVariantOutOfStock ? "true" : undefined}
            onClick={() => {
              if (doAdd(false)) flashAdded();
            }}
          >
            <IconSwap
              showSecond={added}
              first={
                isTailoringActive ? (
                  <Sparkles className="h-4 w-4" />
                ) : (
                  <ShoppingBag className="h-4 w-4" />
                )
              }
              second={<Check className="h-4 w-4" />}
            />
            <MorphText
              text={
                added
                  ? t("أُضيفت إلى السلة", "Added to cart")
                  : isTailoringActive
                    ? vocabulary.custom_order?.[lang]
                      ? lang === "ar"
                        ? `طلب ${vocabulary.custom_order[lang]} القطعة`
                        : `Order ${vocabulary.custom_order[lang]} Piece`
                      : t("طلب تجهيز القطعة", "Order Custom Piece")
                    : t("أضف للسلة", "Add to cart")
              }
            />
          </Button>
          <Button
            variant="outline"
            className="h-12 border-2 font-semibold hover:opacity-90"
            disabled={selectedVariantOutOfStock}
            aria-disabled={selectedVariantOutOfStock ? "true" : undefined}
            onClick={() => doAdd(true)}
          >
            {isTailoringActive
              ? vocabulary.custom_order?.[lang]
                ? lang === "ar"
                  ? `إتمام طلب ال${vocabulary.custom_order[lang]}`
                  : `Complete ${vocabulary.custom_order[lang]}`
                : t("إتمام الطلب الآن", "Complete Order Now")
              : t("اشتر الآن", "Buy now")}
          </Button>
        </div>
      )}
    </>
  );
}
