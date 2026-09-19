import type { StoreVertical } from "@/lib/store-profile";
import type { ExtractedPalette, PaletteMood } from "@/lib/logo-palette";
import type { FontMoodPreset } from "@/components/settings/QuickThemeCustomizer";

export type WizardStep = "identity" | "palette" | "admin" | "review";

export interface BrandWizardData {
  // Step 1: Identity & Vertical
  name_en: string;
  name_ar: string;
  slug: string;
  isSlugManuallyEdited: boolean;
  store_vertical: StoreVertical;

  // Step 2: Logo & Palette
  logoFile: File | null;
  logoPreviewUrl: string | null;
  palette: ExtractedPalette | null;
  accentColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  mood: PaletteMood;
  fontPreset: FontMoodPreset;
  radius: string;

  // Step 3: Admin & Plan
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  owner_password: string;
  plan_type: "annual" | "trial";
  createMobileApp: boolean;
}

export interface PipelineStepStatus {
  id: "provision" | "upload_logo" | "finalize" | "mobile_app";
  labelAr: string;
  labelEn: string;
  status: "idle" | "running" | "success" | "error";
  errorMessage?: string;
}
