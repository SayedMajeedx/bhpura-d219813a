import React from "react";
import type { AddonManifest } from "@/lib/addons/addon-types";

export const sizeGuidesManifest: AddonManifest = {
  id: "size-guides",
  version: 1,
  kind: "feature",
  name: { ar: "أدلة المقاسات", en: "Size Guides" },
  description: {
    ar: "إنشاء واستوديو أدلة مقاسات مخصصة تظهر للعملاء في صفحة المنتج",
    en: "Create and manage custom size guides shown to customers on product pages",
  },
  whatItAdds: [
    { ar: "استوديو أدلة المقاسات في لوحة التحكم", en: "Size Guide Studio in admin panel" },
    {
      ar: "زر ونافذة دليل المقاسات في صفحة المنتج",
      en: "Size guide button and modal on product pages",
    },
    {
      ar: "قوالب قياس جاهزة للعبايات والملابس والخواتم والأحذية",
      en: "Ready-to-use sizing templates",
    },
  ],
  icon: "Ruler",
  activities: ["abayas", "fashion", "jewelry"],
  contributions: {
    navItems: [
      {
        id: "size-guides",
        to: "/admin/b/$slug/size-guides",
        labelAr: "أدلة المقاسات",
        labelEn: "Size Guides",
        descriptionAr: "إدارة أدلة المقاسات وجداول القياس للمتجر",
        descriptionEn: "Manage size guides and measurement tables",
        icon: "Ruler",
        category: "products_stock",
      },
    ],
    slots: [
      {
        id: "size-guide-modal",
        addonId: "size-guides",
        placement: "storefront.product.optionsAside",
        order: 10,
        component: React.lazy(() =>
          import("@/components/storefront/SizeGuideModal").then((m) => ({
            default: m.SizeGuideModal,
          })),
        ),
      },
    ],
  },
};
