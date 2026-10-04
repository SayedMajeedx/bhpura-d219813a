import React from "react";
import type { AddonManifest } from "@/lib/addons/addon-types";
import { FASHION_CUSTOMIZER_PRESETS } from "@/addons/fashion-core/presets";

/**
 * The ready-made Fit Passport field sets (`passport_*`): measurements a customer saves once and
 * applies to any product that asks for them. The product editor lists only what the installed
 * add-ons contribute, so they must be contributed here or they never appear.
 */
const PASSPORT_PRESETS = Object.entries(FASHION_CUSTOMIZER_PRESETS)
  .filter(([key]) => key.startsWith("passport_"))
  .map(([key, preset]) => ({
    key,
    label: { ar: preset.label_ar, en: preset.label_en },
    fields: preset.fields,
  }));

export const fitPassportManifest: AddonManifest = {
  id: "fit-passport",
  version: 1,
  kind: "feature",
  name: { ar: "Fit Passport (جواز المقاسات)", en: "Fit Passport" },
  description: {
    ar: "حفظ قياسات العميل المفصلة واستخدامها تلقائياً عند الطلب والتفصيل",
    en: "Save customer custom measurements and apply them automatically to orders",
  },
  whatItAdds: [
    {
      ar: "تبويب مقاساتي في حساب العميل بالمتجر",
      en: "My Measurements tab in customer storefront account",
    },
    {
      ar: "تطبيق القياسات المحفوظة بنقرة واحدة في صفحة المنتج",
      en: "Apply saved measurements in one click on product page",
    },
    {
      ar: "عرض وتحرير قياسات العميل في صفحة العميل وتفاصيل الطلب",
      en: "View and edit customer measurements in admin",
    },
  ],
  icon: "UserCheck",
  activities: ["abayas", "fashion"],
  contributions: {
    slots: [
      {
        id: "storefront-fit-passport-tab",
        addonId: "fit-passport",
        placement: "storefront.account.tab",
        order: 20,
        component: React.lazy(() => import("./components/storefront/StorefrontFitPassport")),
      },
      {
        id: "storefront-fit-passport-product-slot",
        addonId: "fit-passport",
        placement: "storefront.product.afterOptions",
        order: 10,
        component: React.lazy(() => import("./components/storefront/ProductFitPassportSection")),
      },
      {
        id: "admin-customer-fit-passport-panel",
        addonId: "fit-passport",
        placement: "admin.customer.panel",
        order: 20,
        component: React.lazy(() => import("./components/admin/CustomerFitPassport")),
      },
    ],
    customFieldPresets: [
      {
        key: "fit_measurements",
        label: {
          ar: "📏 قياسات تفصيلية مخصصة",
          en: "📏 Custom Detailed Measurements",
        },
        fields: [
          {
            key: "length",
            label_ar: "الطول",
            label_en: "Length",
            type: "number",
            options: [],
            required: true,
          },
          {
            key: "bust",
            label_ar: "الصدر",
            label_en: "Bust",
            type: "number",
            options: [],
            required: true,
          },
          {
            key: "sleeve",
            label_ar: "طول الكم",
            label_en: "Sleeve length",
            type: "number",
            options: [],
            required: true,
          },
          {
            key: "shoulder",
            label_ar: "عرض الكتف",
            label_en: "Shoulder",
            type: "number",
            options: [],
            required: true,
          },
        ],
      },
      ...PASSPORT_PRESETS,
    ],
  },
};
