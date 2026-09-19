import type { ComponentType, LazyExoticComponent } from "react";
import type { StoreVertical } from "@/lib/store-profile";
import type { SaaSFeatureKey } from "@/lib/saas-billing/saas-billing.types";

export type Bilingual = { ar: string; en: string };

export type AddonId =
  | "size-guides"
  | "fit-passport"
  | "made-to-order"
  | "fashion-core"
  | "abaya-pack"
  | "beauty-perfume"
  | "coffee-roastery"
  | "food-beverage"
  | "digital-products"
  | "gifts"
  | "print-stamps"
  | "jewelry";

export type AddonKind = "feature" | "pack";

/** إعدادات الـ add-on التي يحررها التاجر (تُخزَّن في brand_addons.settings). */
export type AddonSettingsField =
  | { key: string; type: "boolean"; label: Bilingual; default: boolean; public?: boolean }
  | {
      key: string;
      type: "text";
      label: Bilingual;
      default: string;
      public?: boolean;
      bilingual?: boolean;
    }
  | {
      key: string;
      type: "select";
      label: Bilingual;
      default: string;
      options: Array<{ value: string; label: Bilingual }>;
      public?: boolean;
    };

export type AddonSeedContext = {
  brandId: string;
  db: any; // supabaseAdmin (service role) — لا يُستخدم إلا داخل الخادم
  lang: "ar" | "en";
  settings: Record<string, any>;
};

/** Seed idempotent: يُنفَّذ مرة واحدة لكل براند (يُسجَّل key في seeded_keys). يعمل بصلاحيات service role في الخادم. */
export type AddonSeed = {
  key: string;
  description: Bilingual;
  run: (ctx: AddonSeedContext) => Promise<void>;
};

export type SlotPlacement =
  | "storefront.product.optionsAside" // بجانب عنوان المقاس (زر دليل المقاسات)
  | "storefront.product.afterOptions" // بعد المتغيرات/الحقول (Passport, تبديل جاهز/حسب الطلب)
  | "storefront.product.afterCta" // بعد زر الشراء (قسم دليل مقاسات inline)
  | "storefront.account.tab" // تبويب في حساب العميل
  | "storefront.footer.helpLink" // رابط في مجموعة المساعدة
  | "admin.settings.card" // بطاقة في تبويب إعدادات محدد
  | "admin.product.editorPanel" // لوحة في محرر المنتج
  | "admin.order.itemPanel" // لوحة داخل بند الطلب (وضع التحرير)
  | "admin.order.headerActions" // أزرار إجراءات في رأس الطلب
  | "admin.customer.panel" // بطاقة في صفحة العميل
  | "admin.readiness.check"; // بند جاهزية

export type SlotComponent<P = Record<string, unknown>> = {
  id: string; // فريد داخل الـ add-on
  addonId?: AddonId;
  placement: SlotPlacement;
  order?: number; // للترتيب بين add-ons (افتراضي 100)
  tab?: string; // لـ admin.settings.card: "business" | "storefront" | …
  component: LazyExoticComponent<ComponentType<P>>;
};

export type AddonNavItem = {
  id: string;
  to: string;
  labelAr: string;
  labelEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  icon: string; // اسم أيقونة lucide (يُحل في الشل)
  permission?: string;
  category: "today" | "products_stock" | "customers_growth" | "money_reports" | "store_setup";
};

export type AddonReadinessCheck = {
  id: string;
  label: Bilingual;
  description: Bilingual;
  evaluate: (ctx: { brandId: string; db: any }) => Promise<"ok" | "warn" | "missing">;
  actionTo?: string;
};

export type StoreVocabulary = Record<string, Bilingual>;

export type SizingPreset = {
  id: string;
  labelAr: string;
  labelEn: string;
  sizes: string[];
  unit: string;
};

export type AddonContributions = {
  slots?: SlotComponent<any>[];
  navItems?: AddonNavItem[];
  customFieldPresets?: Array<{ key: string; label: Bilingual; fields: unknown[] }>;
  sizingPresetOrder?: string[]; // (deprecated) ids من SIZING_PRESETS تُقدَّم أولاً
  sizingPresets?: SizingPreset[]; // قوالب مقاسات فعلية تسهم بها الحزمة
  vocabulary?: Partial<StoreVocabulary>;
  productionStages?: boolean; // يفعّل مراحل الورشة في الطلبات
  variantAxisDefaults?: {
    size?: Bilingual | null;
    color?: Bilingual | null;
    fabric?: Bilingual | null;
  }; // null = إخفاء
  settingsPatchOnInstall?: Record<string, unknown>; // أعمدة business_settings تُطبَّق مرة عند التثبيت
  aiContext?: (ctx: { brandName: string; lang: "ar" | "en" }) => string;
  readinessChecks?: AddonReadinessCheck[];
  trustBadgeSuggestions?: string[]; // ids من مكتبة trust-badges
};

export type AddonManifest = {
  id: AddonId;
  version: number;
  kind: AddonKind;
  name: Bilingual;
  description: Bilingual;
  whatItAdds: Bilingual[]; // تُعرض في بطاقة المتجر
  icon: string; // lucide icon name
  activities: StoreVertical[]; // "موصى به لـ"
  requires?: AddonId[];
  conflicts?: AddonId[];
  entitlementKey?: SaaSFeatureKey; // إن كان مدفوعاً
  settingsSchema?: AddonSettingsField[];
  contributions: AddonContributions;
  seeds?: AddonSeed[];
  upgrades?: Array<{ toVersion: number; seeds: AddonSeed[] }>;
  purge?: (ctx: AddonSeedContext) => Promise<void>; // حذف بيانات الـ add-on (اختياري، بتأكيد)
};

export type BrandAddonRow = {
  brand_id: string;
  addon_id: AddonId;
  status: "installed" | "disabled";
  version: number;
  settings: Record<string, any>;
  public_settings: Record<string, any>;
  seeded_keys: string[];
  source: "onboarding" | "manual" | "super_admin" | "migration";
  installed_at: string;
  updated_at: string;
};

export type PlatformAddonPolicy = {
  addon_id: AddonId;
  availability: "public" | "beta" | "internal" | "deprecated";
  allowed_brand_ids?: string[] | null;
  entitlement_key?: string | null;
  default_for_activities?: StoreVertical[];
  created_at?: string;
  updated_at?: string;
};

export type BrandAddonEvent = {
  id: string;
  brand_id: string;
  addon_id: AddonId;
  action: "install" | "disable" | "enable" | "remove" | "seed" | "upgrade" | "purge";
  actor_user_id?: string | null;
  source: string;
  details: Record<string, any>;
  created_at: string;
};
