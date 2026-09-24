import { useStorefront } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import { formatSizeWithUnit } from "@/lib/format";
import { ShoppingBag, Sparkles, MessageCircle, Bell } from "lucide-react";
import { isCatalogMode, shouldShowPrices } from "@/lib/storefront-mode";
import { useStickyCtaOffset } from "@/hooks/use-sticky-cta-offset";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { trackProductEngagement } from "@/lib/storefront-tracking";
import { toast } from "sonner";
import {
  type StorefrontProductDetail as Product,
  type StorefrontVariant as Variant,
} from "@/lib/data/storefront";

/** Phone-only sticky bar with the price and the buy actions. */
export function ProductMobileBuyBar({
  brand,
  doAdd,
  hasReadySizes,
  inquiryUrl,
  isTailoringActive,
  lang,
  priceLabel,
  primary,
  product,
  scrollToOptions,
  selectedVariantOutOfStock,
  settings,
  showSizeModeToggle,
  sizeMode,
  stickyCtaRef,
  t,
  variant,
  vocabulary,
}: {
  brand: ReturnType<typeof useStorefront>["brand"];
  doAdd: (thenBuy?: boolean) => void;
  hasReadySizes: boolean;
  inquiryUrl: string | null;
  isTailoringActive: boolean;
  lang: ReturnType<typeof useStorefront>["lang"];
  priceLabel: string;
  primary: string;
  product: Product;
  scrollToOptions: () => void;
  selectedVariantOutOfStock: boolean;
  settings: ReturnType<typeof useStorefront>["settings"];
  showSizeModeToggle: boolean;
  sizeMode: "ready" | "custom";
  stickyCtaRef: ReturnType<typeof useStickyCtaOffset<HTMLDivElement>>;
  t: ReturnType<typeof useStorefront>["t"];
  variant: Variant | null | undefined;
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
}) {
  return (
    <div
      ref={stickyCtaRef}
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur px-3 py-2 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.15)]"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="mx-auto max-w-6xl flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground truncate">
            {variant
              ? [
                  (showSizeModeToggle && sizeMode === "custom") ||
                  (!hasReadySizes && isTailoringActive)
                    ? vocabulary.custom_sizing?.[lang] || t("قياس خاص", "Custom Sizing")
                    : formatSizeWithUnit(variant.size, variant.size_unit, lang),
                  variant.color,
                  variant.fabric,
                ]
                  .filter(Boolean)
                  .join(" · ") || t("مختار", "Selected")
              : t("اختر الخيار", "Choose option")}
          </div>
          <div className="text-base font-semibold truncate" style={{ color: primary }}>
            {!shouldShowPrices(settings) ? (
              <span className="text-xs font-normal text-muted-foreground">
                {t("تواصل معنا للسعر", "Contact us for price")}
              </span>
            ) : (
              priceLabel
            )}
          </div>
        </div>
        {isCatalogMode(settings) ? (
          <Button
            type="button"
            className="h-11 px-4 font-semibold bg-primary text-primary-foreground gap-2"
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
            aria-label={t("طلب عبر واتساب", "Inquire via WhatsApp")}
          >
            <MessageCircle className="h-4 w-4" />
            <span>{t("طلب عبر واتساب", "Inquire")}</span>
          </Button>
        ) : selectedVariantOutOfStock ? (
          <Button
            type="button"
            className="flex-1 h-11 px-4 font-semibold bg-primary text-primary-foreground gap-2"
            onClick={scrollToOptions}
          >
            <Bell className="h-4 w-4" />
            <span>{t("أشعرني عند التوفر", "Notify When Available")}</span>
          </Button>
        ) : (
          <>
            <Button
              className="h-11 px-3 font-semibold bg-primary text-primary-foreground"
              disabled={selectedVariantOutOfStock}
              aria-disabled={selectedVariantOutOfStock ? "true" : undefined}
              onClick={() => doAdd(false)}
              aria-label={
                isTailoringActive
                  ? vocabulary.custom_order?.[lang]
                    ? lang === "ar"
                      ? `طلب ${vocabulary.custom_order[lang]} القطعة`
                      : `Order ${vocabulary.custom_order[lang]} Piece`
                    : t("طلب تجهيز القطعة", "Order Custom Piece")
                  : t("أضف للسلة", "Add to cart")
              }
            >
              {isTailoringActive ? (
                <Sparkles className="h-4 w-4" />
              ) : (
                <ShoppingBag className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="outline"
              className="h-11 px-4 font-semibold border-2"
              disabled={selectedVariantOutOfStock}
              aria-disabled={selectedVariantOutOfStock ? "true" : undefined}
              onClick={() => doAdd(true)}
            >
              {isTailoringActive
                ? vocabulary.custom_order?.[lang]
                  ? lang === "ar"
                    ? `إتمام طلب ال${vocabulary.custom_order[lang]}`
                    : `Complete ${vocabulary.custom_order[lang]}`
                  : t("إتمام الطلب", "Complete Order")
                : t("اشتر الآن", "Buy now")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
