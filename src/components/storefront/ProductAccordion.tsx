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

interface ProductAccordionProps {
  description?: string | null;
  fabricCare?: string | null;
  /** Which pieces this product is sold as, so the delivery time said is the one that applies. */
  deliveryKinds?: EstimateKinds;
  onOpenSizeGuide?: () => void;
  hasSizeGuide?: boolean;
  /** A service's booking terms: shown in place of shipping, returns and care. */
  bookingTerms?: string | null;
}

export function ProductAccordion({
  description,
  fabricCare,
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
  const isApparelVertical = ["fashion", "clothing", "apparel"].includes(storeVertical);
  // Section titles come from the per-vertical vocabulary so a coffee roastery
  // sees "Ingredients & Details" / "Size & Weight Guide" rather than fabric and
  // dress sizes. DEFAULT_VOCABULARY covers verticals with no override.
  const vocab = {
    ...DEFAULT_VOCABULARY,
    ...getVerticalVocabularyOverrides(storeVertical),
  };
  const vocabText = (key: keyof typeof vocab) => (isAr ? vocab[key].ar : vocab[key].en);

  const [openItems, setOpenItems] = useState<Record<string, boolean>>({
    description: true, // Default open for initial scannability
    fabric: false,
    shipping: false,
    sizeGuide: false,
  });

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

  const defaultFabricCare = isApparelVertical
    ? isAr
      ? "يُغسل باليد بماء بارد أو تنظيف جاف (Dry Clean). يُكوى بالبخار بدرجة حرارة منخفضة للحفاظ على جودة القماش."
      : "Hand wash cold or dry clean only. Steam iron at low temperature to preserve fabric texture."
    : null;

  const effectiveFabric =
    fabricCare || (isAr ? settings?.fabric_care_ar : settings?.fabric_care_en) || defaultFabricCare;

  const sections = [
    {
      id: "description",
      title: t("الوصف والتفاصيل", "Description & Details"),
      icon: Sparkles,
      content: description ? (
        <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed opacity-90 whitespace-pre-line">
          {description}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("لا يوجد وصف إضافي", "No additional description")}
        </p>
      ),
    },
    ...(effectiveFabric && !bookingTerms
      ? [
          {
            id: "fabric",
            title: `${vocabText("specifications_label")} · ${vocabText("care_instructions_label")}`,
            icon: isApparelVertical ? Shirt : Sparkles,
            content: (
              <p className="text-xs leading-relaxed opacity-90 whitespace-pre-line">
                {effectiveFabric}
              </p>
            ),
          },
        ]
      : []),
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
        const isOpen = openItems[section.id];
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
