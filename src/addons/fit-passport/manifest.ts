import React from "react";
import type { AddonManifest } from "@/lib/addons/addon-types";

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
        component: React.lazy(() => import("./components/storefront/ProductFitPassportSlot")),
      },
      {
        id: "admin-customer-fit-passport-panel",
        addonId: "fit-passport",
        placement: "admin.customer.panel",
        order: 20,
        component: React.lazy(() => import("./components/admin/CustomerFitPassport")),
      },
    ],
  },
};
