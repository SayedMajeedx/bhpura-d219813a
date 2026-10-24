import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronDown, Sparkles, Shirt, Truck, Ruler } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { deliveryInfo } from "@/lib/delivery-info";
import type { EstimateKinds } from "@/lib/delivery-estimate";
import { returnsQueries } from "@/lib/data/returns";
import { DeliveryInfoDetails } from "@/components/storefront/DeliveryInfoDetails";
import { DEFAULT_VOCABULARY, getVerticalVocabularyOverrides } from "@/lib/store-vocabulary";
import { verticalLineage } from "@/lib/verticals/registry";
import type { StoreVertical } from "@/lib/store-profile";
import { useStoreAxisDefaults } from "@/lib/variant-axes";
import { resolveVariantAxis } from "@/lib/addons/addon-registry";
import type { StorefrontProductDetail } from "@/lib/data/storefront";
import {
  detailGroups,
  detailsSection,
  productDetailLines,
} from "@/features/product-page/lib/product-details";
import { ProductDetailsBody } from "@/features/product-page/components/ProductDetailsBody";

interface ProductAccordionProps {
  description?: string | null;
  /** The product, for its own details (fabric, occasion) in the store's words. */
  product?: StorefrontProductDetail | null;
  /** Which pieces this product is sold as, so the delivery time said is the one that applies. */
  deliveryKinds?: EstimateKinds;
  onOpenSizeGuide?: () => void;
  hasSizeGuide?: boolean;
  /** A service's booking terms: shown in place of shipping, returns and care. */
  bookingTerms?: string | null;
}

export function ProductAccordion({
  description,
  product = null,
  deliveryKinds = { ready: true, tailored: false },
  onOpenSizeGuide,
  hasSizeGuide = false,
  bookingTerms = null,
}: ProductAccordionProps) {
  const { brand, lang, t, settings } = useStorefront();
  const isAr = lang === "ar";
  const storeVertical = (
    settings?.store_vertical ||
    (brand as any)?.store_vertical ||
    "general"
  ).toLowerCase();
  // Abayas are fashion: the family decides, not the exact name.
  const isApparelVertical = verticalLineage(storeVertical as StoreVertical).includes("fashion");
  // Section titles come from the per-vertical vocabulary so a coffee roastery
  // sees "Ingredients & Details" / "Size & Weight Guide" rather than fabric and
  // dress sizes. DEFAULT_VOCABULARY covers verticals with no override.
  const vocab = {
    ...DEFAULT_VOCABULARY,
    ...getVerticalVocabularyOverrides(storeVertical),
  };
  const vocabText = (key: keyof typeof vocab) => (isAr ? vocab[key].ar : vocab[key].en);

  const axisDefaults = useStoreAxisDefaults();
  const details = detailsSection({
    lines: productDetailLines({
      fabricType: product?.fabric_type,
      // The store's word for the fabric axis, whether or not a variant uses it.
      fabricLabel: resolveVariantAxis({
        axis: "fabric",
        product,
        addonDefaults: axisDefaults,
        lang: isAr ? "ar" : "en",
      }).label,
      occasion: product?.occasion,
      facts: product?.details,
      vertical: storeVertical,
      lang: isAr ? "ar" : "en",
    }),
    // Care is the store's own text; nothing is said when it wrote none.
    careText: isAr ? settings?.fabric_care_ar : settings?.fabric_care_en,
    specsLabel: vocabText("specifications_label"),
    careLabel: vocabText("care_instructions_label"),
  });
  const hasDescription = Boolean(description?.trim());

  // The first section with something in it starts open.
  const [openItems, setOpenItems] = useState<Record<string, boolean>>(() => ({
    [hasDescription ? "description" : "fabric"]: true,
  }));

  const toggleItem = (key: string) => {
    setOpenItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // What the store says about delivery and returns: its own settings, its return policy and its
  // policy pages, put into words in one place (`deliveryInfo`). Nothing is said that no setting says.
  const returnPolicyQ = useQuery({ ...returnsQueries.policy(brand.id), staleTime: 5 * 60_000 });
  const delivery = deliveryInfo({
    settings,
    lang,
    kinds: deliveryKinds,
    returnPolicy: returnPolicyQ.data ?? null,
    pages: settings?.pages ?? null,
    formatMoney: (amount) => formatPrice(amount, settings?.currency || "BHD", lang),
  });

  const sections = [
    // A product with no description has no empty section saying so.
    hasDescription
      ? {
          id: "description",
          title: t("الوصف والتفاصيل", "Description & Details"),
          icon: Sparkles,
          content: (
            <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed opacity-90 whitespace-pre-line">
              {description}
            </div>
          ),
        }
      : null,
    details && !bookingTerms
      ? {
          id: "fabric",
          title: details.title,
          icon: isApparelVertical ? Shirt : Sparkles,
          content: (
            <ProductDetailsBody
              groups={detailGroups(details.lines, storeVertical)}
              care={details.care}
            />
          ),
        }
      : null,
    bookingTerms
      ? {
          id: "booking",
          title: t("الحجز والإلغاء", "Booking & cancellation"),
          icon: CalendarDays,
          content: (
            <p className="text-xs leading-relaxed opacity-90 whitespace-pre-line">{bookingTerms}</p>
          ),
        }
      : delivery.hasAnything
        ? {
            id: "shipping",
            title: t("الشحن والاسترجاع", "Shipping & Returns"),
            icon: Truck,
            content: <DeliveryInfoDetails info={delivery} slug={brand.slug} />,
          }
        : null,
    ...(hasSizeGuide && onOpenSizeGuide && !bookingTerms
      ? [
          {
            id: "sizeGuide",
            title: vocabText("sizing_guide"),
            icon: Ruler,
            content: (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {t(
                    "تعرّف على القياسات الدقيقة بالسنتيمتر والبوصة لاختيار المقاس المثالي.",
                    "Review exact centimeter and inch measurements to pick your perfect fit.",
                  )}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onOpenSizeGuide}
                  className="h-auto rounded-md text-xs font-semibold text-primary underline underline-offset-4 hover:opacity-80"
                >
                  {t("فتح جدول المقاسات الكامل", "Open Full Size Guide")}
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ].filter((section) => section !== null);

  return (
    <div className="divide-y divide-border/70 border-y border-border my-6">
      {sections.map((section) => {
        const isOpen = Boolean(openItems[section.id]);
        const IconComponent = section.icon;

        return (
          <div key={section.id} className="py-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => toggleItem(section.id)}
              aria-expanded={isOpen}
              className="h-auto rounded-md w-full flex items-center justify-between py-3 text-start text-xs font-semibold text-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm"
            >
              <span className="flex items-center gap-2">
                <IconComponent className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{section.title}</span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </Button>

            {isOpen && (
              <div className="pb-3.5 pt-1 text-foreground/90 animate-in fade-in slide-in-from-top-1 duration-150">
                {section.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
