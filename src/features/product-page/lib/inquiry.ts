import { isCatalogMode, shouldShowPrices, buildWhatsAppInquiryUrl } from "@/lib/storefront-mode";
import type { CustomField } from "@/features/product-page/types";

type Lang = "ar" | "en";

/** A product's own field as the shopper reads it; a field a store never named asks for its text. */
export function customFieldLabel(field: CustomField, lang: Lang): string {
  const label = lang === "ar" ? field.label_ar || field.label_en : field.label_en || field.label_ar;
  if (label) return label;
  if (/^f\d+$/.test(field.key)) {
    return lang === "ar" ? "النص المطلوب / تفاصيل إضافية" : "Required Text / Special Instructions";
  }
  return field.key;
}

/** A catalog asks by WhatsApp; a shop with WhatsApp on lets a shopper ask about this product. */
export function productInquiryUrl({
  settings,
  lang,
  brandName,
  productName,
  variantLabel,
  priceLabel,
}: {
  settings: Parameters<typeof isCatalogMode>[0] &
    Parameters<typeof shouldShowPrices>[0] & {
      whatsapp_enabled?: boolean | null;
      whatsapp_number?: string | null;
      catalog_inquiry_message_ar?: string | null;
      catalog_inquiry_message_en?: string | null;
    };
  lang: Lang;
  brandName: string;
  productName: string;
  variantLabel: string | null;
  priceLabel: string;
}): string | null {
  if (!isCatalogMode(settings) && !settings.whatsapp_enabled) return null;
  return buildWhatsAppInquiryUrl({
    number: settings.whatsapp_number,
    template:
      lang === "ar" ? settings.catalog_inquiry_message_ar : settings.catalog_inquiry_message_en,
    lang,
    ctx: {
      brandName,
      productName,
      productUrl: typeof window !== "undefined" ? window.location.href : "",
      variantLabel,
      priceLabel: shouldShowPrices(settings) ? priceLabel : undefined,
    },
  });
}
