import type { AddonManifest } from "@/lib/addons/addon-types";

export const madeToOrderManifest: AddonManifest = {
  id: "made-to-order",
  version: 1,
  kind: "feature",
  name: { ar: "التصنيع حسب الطلب والورشة", en: "Made to Order & Workshop" },
  description: {
    ar: "إدارة المنتجات المصنوعة حسب الطلب، ملاحظات الورشة، ومراحل الإرسال والاستلام",
    en: "Manage made-to-order products, workshop notes, and production workflow stages",
  },
  whatItAdds: [
    { ar: "تبديل جاهز/حسب الطلب لكل منتج", en: "Ready vs Made-to-order toggle per product" },
    {
      ar: "ملاحظات تفصيل وورشة مع كل بند في السلة والطلب",
      en: "Workshop and customization notes per item",
    },
    {
      ar: "مراحل دورة الورشة (تم الإرسال / تم الاستلام من الورشة)",
      en: "Workshop production stages tracking",
    },
  ],
  icon: "Scissors",
  activities: ["abayas", "fashion", "print", "jewelry"],
  contributions: {
    productionStages: true,
  },
};
