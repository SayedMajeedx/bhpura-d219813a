import type { StoreVertical } from "@/lib/store-profile";
import type { DefaultCategorySpec } from "@/lib/addons/vertical-categories";

export type DesignPresetType = "editorial" | "fresh" | "tech";
export type DesignSpacingType = "airy" | "regular" | "dense";
export type DesignCardStyle = "borderless" | "bordered";

export interface BrandDesignConfig {
  preset: DesignPresetType;
  grid: 4 | 5;
  radius: string;
  sectionSpacing: DesignSpacingType;
  cardStyle: DesignCardStyle;
}

export interface BrandTemplate {
  vertical: StoreVertical;
  label: { ar: string; en: string };
  fontPresetId: "classic" | "modern" | "signature" | "strong" | "bubble";
  fontAr: string;
  fontEn: string;
  defaultPalette: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
  };
  design?: BrandDesignConfig;
  storefrontMode: "shop" | "catalog" | "booking" | "inquiry";
  catalogShowPrices: boolean;
  fulfillment: {
    delivery: boolean;
    pickup: boolean;
    digital: boolean;
    deliveryFee: number;
  };
  radius: string;
  trustBadges: Array<{
    icon: string;
    title_ar: string;
    title_en: string;
    subtitle_ar: string;
    subtitle_en: string;
  }>;
  starterModules: Record<string, boolean>;
  categories: DefaultCategorySpec[];
}
