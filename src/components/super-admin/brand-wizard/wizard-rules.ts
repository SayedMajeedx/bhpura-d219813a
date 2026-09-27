import type { ProvisionBrandPayload } from "@/lib/brand-provisioning";
import { getBrandTemplate } from "@/lib/brand-templates";
import type { BrandWizardData } from "./types";

/**
 * Why the owner step cannot continue, or null. Every brand gets a real owner
 * (name and email); an initial password, when given, needs 8 characters.
 */
export function ownerStepError(data: BrandWizardData, isAr: boolean): string | null {
  if (!data.owner_name.trim()) {
    return isAr ? "يرجى كتابة اسم مدير البراند" : "Owner name is required";
  }
  if (!data.owner_email.trim() || !data.owner_email.includes("@")) {
    return isAr ? "يرجى كتابة بريد إلكتروني صالح" : "Valid owner email is required";
  }
  if (data.owner_password && data.owner_password.length < 8) {
    return isAr
      ? "كلمة المرور يجب أن تتكون من 8 خانات على الأقل"
      : "Password must be at least 8 characters";
  }
  return null;
}

/**
 * The provision-brand request: the trimmed brand and owner identity, the chosen
 * plan (the trial length is the platform's, set server-side), the look, and the
 * vertical template's defaults.
 */
export function provisionPayloadFrom(data: BrandWizardData): ProvisionBrandPayload {
  const template = getBrandTemplate(data.store_vertical);
  return {
    slug: data.slug.trim().toLowerCase(),
    name_en: data.name_en.trim(),
    name_ar: data.name_ar.trim() || null,
    owner_name: data.owner_name.trim(),
    owner_email: data.owner_email.trim(),
    owner_phone: data.owner_phone.trim() || null,
    owner_password: data.owner_password || undefined,
    plan_type: data.plan_type,
    business_type: template.label.en,
    store_vertical: data.store_vertical,
    storefront_accent_color: data.accentColor,
    storefront_background_color: data.backgroundColor,
    brand_palette: data.palette || {
      primary: data.accentColor,
      secondary: data.secondaryColor,
      text: data.textColor,
      background: data.backgroundColor,
    },
    storefront_font_ar: data.fontPreset.fontAr,
    storefront_font_en: data.fontPreset.fontEn,
    storefront_radius: data.radius,
    template_defaults: {
      fulfillment: template.fulfillment,
      storefront_mode: template.storefrontMode,
      catalog_show_prices: template.catalogShowPrices,
      trust_badges: template.trustBadges,
    },
  };
}
