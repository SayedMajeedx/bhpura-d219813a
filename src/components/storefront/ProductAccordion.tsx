import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, Sparkles, Shirt, Truck, Ruler } from "lucide-react";
import { useStorefront } from "@/lib/storefront-context";

interface ProductAccordionProps {
  description?: string | null;
  fabricCare?: string | null;
  shippingPolicy?: string | null;
  returnPolicy?: string | null;
  onOpenSizeGuide?: () => void;
  hasSizeGuide?: boolean;
}

export function ProductAccordion({
  description,
  fabricCare,
  shippingPolicy,
  returnPolicy,
  onOpenSizeGuide,
  hasSizeGuide = false,
}: ProductAccordionProps) {
  const { lang, t, settings } = useStorefront();
  const isAr = lang === "ar";

  const [openItems, setOpenItems] = useState<Record<string, boolean>>({
    description: true, // Default open for initial scannability
    fabric: false,
    shipping: false,
    sizeGuide: false,
  });

  const toggleItem = (key: string) => {
    setOpenItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const defaultShipping = isAr
    ? settings?.shipping_policy_ar ||
      "توصيل سريع خلال 2-4 أيام عمل في جميع دول مجلس التعاون الخليجي. خدمة الاسترجاع متاحة خلال 14 يوماً من استلام الطلب وفقاً للشروط."
    : settings?.shipping_policy_en ||
      "Fast delivery within 2–4 business days across all GCC countries. Returns available within 14 days of receipt per terms.";

  const effectiveShipping = shippingPolicy || defaultShipping;

  const defaultFabricCare = isAr
    ? "يُغسل باليد بماء بارد أو تنظيف جاف (Dry Clean). يُكوى بالبخار بدرجة حرارة منخفضة للحفاظ على جودة القماش."
    : "Hand wash cold or dry clean only. Steam iron at low temperature to preserve fabric texture.";

  const effectiveFabric = fabricCare || defaultFabricCare;

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
    {
      id: "fabric",
      title: t("الخامة والعناية", "Fabric & Care"),
      icon: Shirt,
      content: (
        <p className="text-xs leading-relaxed opacity-90 whitespace-pre-line">{effectiveFabric}</p>
      ),
    },
    {
      id: "shipping",
      title: t("الشحن والاسترجاع", "Shipping & Returns"),
      icon: Truck,
      content: (
        <div className="space-y-2 text-xs leading-relaxed opacity-90">
          <p>{effectiveShipping}</p>
          {returnPolicy && <p className="pt-1 border-t border-border opacity-80">{returnPolicy}</p>}
        </div>
      ),
    },
    ...(hasSizeGuide && onOpenSizeGuide
      ? [
          {
            id: "sizeGuide",
            title: t("دليل المقاسات", "Size Guide"),
            icon: Ruler,
            content: (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {t(
                    "تعرفي على القياسات الدقيقة بالسنتيمتر والبوصة لكل تشكيلة لتختاري المقاس المثالي.",
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
  ];

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
