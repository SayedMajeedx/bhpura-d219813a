export type ImageCropPresetKey =
  | "hero"
  | "promotionBanner"
  | "editorialBanner"
  | "editorialBackground"
  | "categoryCover"
  | "productPortrait"
  | "pageBanner"
  | "pageInline"
  | "logo";

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
    previewAspects: [
      { labelEn: "Banner card (2:1)", labelAr: "بطاقة البنر (2:1)", aspect: 2 },
      { labelEn: "Mobile view", labelAr: "عرض الهاتف", aspect: 16 / 9 },
    ],
  },
  editorialBanner: {
    aspect: 1920 / 820,
    outputWidth: 1920,
    outputHeight: 820,
    previewAspects: [
      {
        labelEn: "Desktop Wide (21:9)",
        labelAr: "شاشة الشاشات العريضة (21:9)",
        aspect: 1920 / 820,
      },
      { labelEn: "Tablet (16:9)", labelAr: "الجهاز اللوحي (16:9)", aspect: 16 / 9 },
      { labelEn: "Mobile (4:3)", labelAr: "الهاتف (4:3)", aspect: 4 / 3 },
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
    previewAspects: [
      { labelEn: "Square cover (1:1)", labelAr: "غلاف مربع (1:1)", aspect: 1 },
      { labelEn: "Menu badge", labelAr: "أيقونة القائمة", aspect: 1 },
    ],
  },
  productPortrait: {
    aspect: 3 / 4,
    outputWidth: 1200,
    outputHeight: 1600,
    previewAspects: [
      { labelEn: "Product Card (3:4)", labelAr: "بطاقة المنتج (3:4)", aspect: 3 / 4 },
      { labelEn: "Detail Gallery (3:4)", labelAr: "معرض التفاصيل (3:4)", aspect: 3 / 4 },
    ],
  },
  pageBanner: {
    aspect: 16 / 9,
    outputWidth: 1600,
    outputHeight: 900,
    previewAspects: [
      { labelEn: "Page Banner (16:9)", labelAr: "لافتة الصفحة (16:9)", aspect: 16 / 9 },
      { labelEn: "Header Fit", labelAr: "شريط العنوان", aspect: 21 / 9 },
    ],
  },
  pageInline: {
    aspect: 4 / 3,
    outputWidth: 1200,
    outputHeight: 900,
  },
  logo: {
    aspect: 1,
    outputWidth: 1200,
    outputHeight: 1200,
    previewAspects: [
      { labelEn: "Square Logo (1:1)", labelAr: "شعار مربع (1:1)", aspect: 1 },
      { labelEn: "Header Badge", labelAr: "شريط الهيدر", aspect: 1 },
    ],
  },
};

export function getImageCropPreset(key: ImageCropPresetKey): ImageCropPreset {
  return IMAGE_CROP_PRESETS[key];
}
