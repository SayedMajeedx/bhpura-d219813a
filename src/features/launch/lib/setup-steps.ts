/**
 * The setup steps of a store's launch checklist: what Settings checks before a store opens (its
 * logo, colour, kind of store, products, payment, delivery, policies; a catalog store's WhatsApp;
 * a services store's own steps). The launch checklist adds the add-ons' checks and the two steps
 * that take a store live (`launch-steps.ts`); the dashboard and Settings draw the same list.
 */
import type React from "react";
import {
  Sparkles,
  Store,
  Package,
  CreditCard,
  Truck,
  FileText,
  Image,
  MessageCircle,
} from "lucide-react";
import type { SettingsTabId } from "@/features/settings/registry";
import { normalizeWhatsAppDigits } from "@/lib/storefront-mode";
import { arNoun } from "@/lib/arabic-count";
import {
  servicesReadinessItems,
  type ServicesReadinessFacts,
} from "@/features/settings/lib/services-readiness";

export interface BusinessSettingsData {
  logo_url?: string | null;
  cod_enabled?: boolean | null;
  card_enabled?: boolean | null;
  benefit_enabled?: boolean | null;
  delivery_enabled?: boolean | null;
  pickup_enabled?: boolean | null;
  delivery_fee?: number | string | null;
  shipping_zones?: any[] | null;
  pages?: any;
  storefront_mode?: string | null;
  whatsapp_number?: string | null;
  brand_palette?: any | null;
  storefront_accent_color?: string | null;
}

export interface ReadinessEvaluationInput {
  logoUrl?: string | null;
  activeProductsCount: number;
  businessSettings?: BusinessSettingsData | null;
  brandLogoUrl?: string | null;
  brandPalette?: any | null;
  storeVertical?: string | null;
  lang?: "ar" | "en";
  hasReturnPolicy?: boolean;
  /** A services store: it has no shipping to set up and no goods to take back. */
  services?: boolean;
  /** What a services store's own steps read (contact, booking terms, questions, photos). */
  servicesFacts?: ServicesReadinessFacts;
}

export interface ReadinessItem {
  id:
    | "logo"
    | "palette"
    | "vertical"
    | "products"
    | "payments"
    | "fulfillment"
    | "policies"
    | "whatsapp"
    | (string & {});
  icon: React.ElementType;
  title: string;
  description: string;
  isComplete: boolean;
  actionType: "tab" | "link";
  tabId?: SettingsTabId;
  group?: string;
  href?: string;
  /** An admin page under the store where the step is done ("bookings", "inventory"). */
  page?: string;
  actionLabel: string;
  editLabel: string;
}

export function evaluateStoreReadiness(input: ReadinessEvaluationInput) {
  const isAr = input.lang !== "en";
  const bData = input.businessSettings;

  // 1. Logo
  const resolvedLogoUrl =
    input.logoUrl && input.logoUrl.trim().length > 0
      ? input.logoUrl.trim()
      : bData?.logo_url && bData.logo_url.trim().length > 0
        ? bData.logo_url.trim()
        : input.brandLogoUrl && input.brandLogoUrl.trim().length > 0
          ? input.brandLogoUrl.trim()
          : null;
  const hasLogo = Boolean(resolvedLogoUrl);

  // 2. Products
  const activeProducts = input.activeProductsCount ?? 0;
  const hasProducts = activeProducts > 0;

  // 3. Payments
  const hasPayments = Boolean(
    bData && (bData.cod_enabled || bData.card_enabled || bData.benefit_enabled),
  );

  // 4. Fulfillment
  const hasFulfillment = Boolean(
    bData &&
    (bData.delivery_enabled ||
      bData.pickup_enabled ||
      (Array.isArray(bData.shipping_zones) && bData.shipping_zones.length > 0) ||
      (bData.delivery_fee != null &&
        Number(bData.delivery_fee) >= 0 &&
        bData.delivery_enabled !== false)),
  );

  // 5. CMS / Policy Pages
  const rawPages = bData?.pages;
  const pagesList: any[] = Array.isArray(rawPages)
    ? rawPages
    : Array.isArray((rawPages as any)?.items)
      ? (rawPages as any).items
      : Array.isArray((rawPages as any)?.pages)
        ? (rawPages as any).pages
        : [];

  const validPages = pagesList.filter(
    (p) =>
      p &&
      (Boolean(p.slug) ||
        Boolean(p.title_ar) ||
        Boolean(p.title_en) ||
        Boolean(p.content_ar) ||
        Boolean(p.content_en)),
  );
  const hasPolicies = validPages.length > 0 || Boolean(input.hasReturnPolicy);

  // 6. Brand palette set (extracted from the logo or chosen manually).
  const paletteMeta = input.brandPalette ?? bData?.brand_palette ?? null;
  const paletteSource: string | null = paletteMeta?.source ?? paletteMeta?.meta?.source ?? null;
  const hasExtractedPalette = Boolean(
    paletteSource === "logo" || paletteSource === "manual" || bData?.storefront_accent_color,
  );

  // 7. Store vertical specified
  const hasVertical = Boolean(
    input.storeVertical && input.storeVertical !== "general" && input.storeVertical !== "other",
  );

  const isCatalog = bData?.storefront_mode === "catalog";
  const whatsappDigits = normalizeWhatsAppDigits(bData?.whatsapp_number);
  const hasWhatsApp = whatsappDigits.length > 0;

  const items: ReadinessItem[] = isCatalog
    ? [
        {
          id: "logo",
          icon: Image,
          title: isAr ? "رفع شعار المتجر الرسمي" : "Upload official store logo",
          description: isAr
            ? hasLogo
              ? "تم تعيين وتحديث شعار المتجر الرسمي بنجاح"
              : "يظهر الشعار في ترويسة المتجر والكتالوج"
            : hasLogo
              ? "Official store logo uploaded and configured"
              : "Appears in storefront header and catalog",
          isComplete: hasLogo,
          actionType: "tab",
          tabId: "identity",
          group: "basics",
          actionLabel: isAr ? "إعداد الشعار" : "Configure Logo",
          editLabel: isAr ? "تعديل" : "Edit",
        },
        {
          id: "palette",
          icon: Sparkles,
          title: isAr ? "لون العلامة محدد" : "Brand colour set",
          description: isAr
            ? hasExtractedPalette
              ? "لوحة ألوان المتجر جاهزة"
              : "اختر لون العلامة أو استخرجه من الشعار بضغطة واحدة"
            : hasExtractedPalette
              ? "Storefront palette is ready"
              : "Pick the brand colour or extract it from the logo in one click",
          isComplete: hasExtractedPalette,
          actionType: "tab",
          tabId: "identity",
          group: "palette",
          actionLabel: isAr ? "استخراج الألوان" : "Extract Colors",
          editLabel: isAr ? "تعديل" : "Edit",
        },
        {
          id: "vertical",
          icon: Store,
          title: isAr ? "تحديد نوع النشاط التجاري" : "Store business vertical selected",
          description: isAr
            ? hasVertical
              ? `النشاط التجاري محدد: ${input.storeVertical}`
              : "حدد نشاط متجرك لتجهيز التصنيفات وقوالب العرض المناسبة"
            : hasVertical
              ? `Vertical configured: ${input.storeVertical}`
              : "Select business vertical for tailored starter packs & taxonomy",
          isComplete: hasVertical,
          actionType: "tab",
          tabId: "identity",
          group: "vertical",
          actionLabel: isAr ? "تحديد النشاط" : "Select Vertical",
          editLabel: isAr ? "تعديل" : "Edit",
        },
        {
          id: "products",
          icon: Package,
          title: isAr ? "إضافة وتفعيل منتج واحد على الأقل" : "Add and activate at least 1 product",
          description: isAr
            ? hasProducts
              ? `جاهز للعرض في الكتالوج الآن: ${arNoun(activeProducts, "product")}`
              : "أضف وتفعيل أول منتج للظهور في الكتالوج"
            : hasProducts
              ? `${activeProducts} active product(s) ready for showcase`
              : "Add and activate your first product to showcase",
          isComplete: hasProducts,
          actionType: "link",
          actionLabel: isAr ? "إدارة المنتجات" : "Manage Products",
          editLabel: isAr ? "عرض" : "View",
        },
        {
          id: "whatsapp",
          icon: MessageCircle,
          title: isAr ? "ربط وتفعيل رقم الواتساب" : "Configure official WhatsApp number",
          description: isAr
            ? hasWhatsApp
              ? "تم ضبط رقم الواتساب المخصص لاستقبال استفسارات وطلبات الكتالوج"
              : "أضف رقم الواتساب لتلقي استفسارات وطلبات العملاء مباشرة من الكتالوج"
            : hasWhatsApp
              ? "Official WhatsApp number configured for catalog inquiries"
              : "Configure WhatsApp number to receive customer product inquiries",
          isComplete: hasWhatsApp,
          actionType: "tab",
          tabId: "storefront",
          group: "mode",
          actionLabel: isAr ? "إعداد الكتالوج" : "Catalog Settings",
          editLabel: isAr ? "تعديل" : "Edit",
        },
        {
          id: "policies",
          icon: FileText,
          title: isAr ? "نشر صفحة الشروط أو سياسة الإرجاع" : "Publish return policy or terms page",
          description: isAr
            ? hasPolicies
              ? `${arNoun(validPages.length, "page")} منشورة تشمل الشروط والسياسات`
              : "توضيح حقوق العميل وسياسة الاستبدال يبني الثقة في المتجر"
            : hasPolicies
              ? `${validPages.length} published page(s) with store policies`
              : "Clear refund and delivery terms builds customer trust",
          isComplete: hasPolicies,
          actionType: "link",
          actionLabel: isAr ? "إدارة الصفحات" : "Manage Pages",
          editLabel: isAr ? "إدارة" : "Manage",
        },
      ]
    : [
        {
          id: "logo",
          icon: Image,
          title: isAr ? "رفع شعار المتجر الرسمي" : "Upload official store logo",
          description: isAr
            ? hasLogo
              ? "تم تعيين وتحديث شعار المتجر الرسمي بنجاح"
              : "يظهر الشعار في ترويسة المتجر والفواتير والإيصالات الحرارية"
            : hasLogo
              ? "Official store logo uploaded and configured"
              : "Appears in storefront header, customer invoices, and receipts",
          isComplete: hasLogo,
          actionType: "tab",
          tabId: "identity",
          group: "basics",
          actionLabel: isAr ? "إعداد الشعار" : "Configure Logo",
          editLabel: isAr ? "تعديل" : "Edit",
        },
        {
          id: "palette",
          icon: Sparkles,
          title: isAr ? "لون العلامة محدد" : "Brand colour set",
          description: isAr
            ? hasExtractedPalette
              ? "لوحة ألوان المتجر جاهزة"
              : "اختر لون العلامة أو استخرجه من الشعار بضغطة واحدة"
            : hasExtractedPalette
              ? "Storefront palette is ready"
              : "Pick the brand colour or extract it from the logo in one click",
          isComplete: hasExtractedPalette,
          actionType: "tab",
          tabId: "identity",
          group: "palette",
          actionLabel: isAr ? "استخراج الألوان" : "Extract Colors",
          editLabel: isAr ? "تعديل" : "Edit",
        },
        {
          id: "vertical",
          icon: Store,
          title: isAr ? "تحديد نوع النشاط التجاري" : "Store business vertical selected",
          description: isAr
            ? hasVertical
              ? `النشاط التجاري محدد: ${input.storeVertical}`
              : "حدد نشاط متجرك لتجهيز التصنيفات وقوالب العرض المناسبة"
            : hasVertical
              ? `Vertical configured: ${input.storeVertical}`
              : "Select business vertical for tailored starter packs & taxonomy",
          isComplete: hasVertical,
          actionType: "tab",
          tabId: "identity",
          group: "vertical",
          actionLabel: isAr ? "تحديد النشاط" : "Select Vertical",
          editLabel: isAr ? "تعديل" : "Edit",
        },
        {
          id: "products",
          icon: Package,
          title: isAr ? "إضافة وتفعيل منتج واحد على الأقل" : "Add and activate at least 1 product",
          description: isAr
            ? hasProducts
              ? `جاهز للبيع الآن: ${arNoun(activeProducts, "product")}`
              : "أضف وتفعيل أول منتج لبدء استقبال الطلبات"
            : hasProducts
              ? `${activeProducts} active product(s) ready for purchase`
              : "Add and activate your first product to start selling",
          isComplete: hasProducts,
          actionType: "link",
          actionLabel: isAr ? "إدارة المنتجات" : "Manage Products",
          editLabel: isAr ? "عرض" : "View",
        },
        {
          id: "payments",
          icon: CreditCard,
          title: isAr ? "تفعيل وسيلة دفع واحدة على الأقل" : "Configure at least 1 payment method",
          description: isAr
            ? hasPayments
              ? bData?.cod_enabled && bData?.card_enabled && bData?.benefit_enabled
                ? "تم تفعيل الدفع عند الاستلام والبطاقات ومحفظة بنفت"
                : bData?.cod_enabled && bData?.card_enabled
                  ? "تم تفعيل الدفع عند الاستلام والبطاقات الائتمانية"
                  : "تم تفعيل وتجهيز وسائل الدفع بنجاح"
              : "تفعيل الدفع عند الاستلام (COD)، بطاقة، أو محفظة بنفت"
            : hasPayments
              ? "Payment methods configured and active"
              : "Enable Cash on Delivery (COD), Card, or BenefitPay",
          isComplete: hasPayments,
          actionType: "tab",
          tabId: "orders",
          group: "payments",
          actionLabel: isAr ? "إعداد الدفع" : "Setup Payments",
          editLabel: isAr ? "تعديل" : "Edit",
        },
        {
          id: "fulfillment",
          icon: Truck,
          title: isAr
            ? "تحديد مناطق ورسوم الشحن والتوصيل"
            : "Define shipping zones and delivery fees",
          description: isAr
            ? hasFulfillment
              ? bData?.delivery_enabled && bData?.pickup_enabled
                ? "تم تفعيل التوصيل والاستلام المحلي ومناطق الشحن"
                : bData?.delivery_enabled
                  ? "تم تفعيل التوصيل ورسوم الشحن بنجاح"
                  : "تم إعداد خيارات التسليم والشحن"
              : "حدد رسوم التوصيل المحلي أو الاستلام من الفرع"
            : hasFulfillment
              ? "Delivery, pickup, and shipping zones active"
              : "Specify local delivery fees, pickup locations, or zones",
          isComplete: hasFulfillment,
          actionType: "tab",
          tabId: "orders",
          group: "fulfillment",
          actionLabel: isAr ? "إعداد الشحن" : "Configure Shipping",
          editLabel: isAr ? "تعديل" : "Edit",
        },
        {
          id: "policies",
          icon: FileText,
          title: isAr ? "نشر صفحة الشروط أو سياسة الإرجاع" : "Publish return policy or terms page",
          description: isAr
            ? hasPolicies
              ? `${arNoun(validPages.length, "page")} منشورة تشمل الشروط والسياسات`
              : "توضيح حقوق العميل وسياسة الاستبدال يبني الثقة في المتجر"
            : hasPolicies
              ? `${validPages.length} published page(s) with store policies`
              : "Clear refund and delivery terms builds customer trust",
          isComplete: hasPolicies,
          actionType: "link",
          actionLabel: isAr ? "إدارة الصفحات" : "Manage Pages",
          editLabel: isAr ? "إدارة" : "Manage",
        },
      ];

  const forStore = input.services
    ? items
        .filter((it) => it.id !== "fulfillment")
        .map((it) =>
          it.id === "policies"
            ? {
                ...it,
                title: isAr
                  ? "نشر صفحة الشروط وسياسة الإلغاء"
                  : "Publish your terms and cancellation policy",
                description: isAr
                  ? hasPolicies
                    ? `${arNoun(validPages.length, "page")} منشورة تشمل الشروط والسياسات`
                    : "توضيح شروط الحجز والإلغاء والدفعة المقدمة يبني الثقة في خدماتك"
                  : hasPolicies
                    ? `${validPages.length} published page(s) with your terms`
                    : "Clear booking, cancellation and deposit terms build trust in your services",
              }
            : it,
        )
    : items;
  // A services store's own steps: a way to reach it, booking terms, questions, photos.
  if (input.services && input.servicesFacts) {
    for (const step of servicesReadinessItems(input.servicesFacts, isAr)) {
      forStore.push({
        id: step.id,
        icon: step.icon,
        title: step.title,
        description: step.description,
        isComplete: step.isComplete,
        actionType: step.tab ? "tab" : "link",
        tabId: step.tab?.tabId,
        group: step.tab?.group,
        page: step.page,
        actionLabel: isAr ? "إكمال" : "Complete",
        editLabel: isAr ? "تعديل" : "Edit",
      });
    }
  }
  const visibleItems = forStore;
  const completedCount = visibleItems.filter((it) => it.isComplete).length;
  const totalCount = visibleItems.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);
  const isAllComplete = completedCount === totalCount;

  return {
    hasLogo,
    hasProducts,
    activeProducts,
    hasPayments,
    hasFulfillment,
    hasPolicies,
    hasWhatsApp,
    isCatalog,
    pagesCount: validPages.length,
    items: visibleItems,
    completedCount,
    totalCount,
    progressPercent,
    isAllComplete,
  };
}
