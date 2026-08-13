export type ImageCropPresetKey =
  | "hero"
  | "promotionBanner"
  | "editorialBanner"
  | "editorialBackground"
  | "categoryCover"
  | "productPortrait"
  | "pageBanner"
  | "pageInline";

export type ImageCropPreset = {
  aspect: number;
  outputWidth: number;
  outputHeight: number;
  previewAspects?: Array<{
    labelEn: string;
    labelAr: string;
    aspect: number;
  }>;
};

/**
 * Canonical image contracts shared by uploaders and their storefront surfaces.
 * Keep these ratios aligned with the corresponding CSS containers.
 */
export const IMAGE_CROP_PRESETS: Record<ImageCropPresetKey, ImageCropPreset> = {
  hero: {
    aspect: 16 / 9,
    outputWidth: 1920,
    outputHeight: 1080,
    previewAspects: [
      { labelEn: "Desktop", labelAr: "سطح المكتب", aspect: 16 / 9 },
      { labelEn: "Tablet", labelAr: "الجهاز اللوحي", aspect: 4 / 3 },
      { labelEn: "Mobile", labelAr: "الهاتف", aspect: 3 / 4 },
    ],
  },
  promotionBanner: {
    aspect: 2,
    outputWidth: 1600,
    outputHeight: 800,
  },
  editorialBanner: {
    aspect: 2,
    outputWidth: 1600,
    outputHeight: 800,
    previewAspects: [
      { labelEn: "Wide screen", labelAr: "شاشة عريضة", aspect: 4 },
      { labelEn: "Tablet", labelAr: "الجهاز اللوحي", aspect: 2 },
      { labelEn: "Mobile", labelAr: "الهاتف", aspect: 4 / 3 },
    ],
  },
  editorialBackground: {
    aspect: 3,
    outputWidth: 1800,
    outputHeight: 600,
  },
  categoryCover: {
    aspect: 1,
    outputWidth: 1200,
    outputHeight: 1200,
  },
  productPortrait: {
    aspect: 3 / 4,
    outputWidth: 1200,
    outputHeight: 1600,
  },
  pageBanner: {
    aspect: 16 / 9,
    outputWidth: 1600,
    outputHeight: 900,
  },
  pageInline: {
    aspect: 4 / 3,
    outputWidth: 1200,
    outputHeight: 900,
  },
};

export function getImageCropPreset(key: ImageCropPresetKey): ImageCropPreset {
  return IMAGE_CROP_PRESETS[key];
}
