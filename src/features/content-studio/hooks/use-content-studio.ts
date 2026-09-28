import { useMemo, useRef, useState } from "react";
import { useBrand } from "@/lib/brand-context";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useI18n } from "@/lib/i18n";
import {
  containsArabic,
  FORMATS,
  instagramHandle,
  THEMES,
} from "@/features/content-studio/lib/studio-content";
import { useStudioProduct } from "@/features/content-studio/hooks/use-studio-product";
import { useStudioCopy } from "@/features/content-studio/hooks/use-studio-copy";
import { useHeaderLayout } from "@/features/content-studio/hooks/use-header-layout";
import { usePreviewScale } from "@/features/content-studio/hooks/use-preview-scale";
import { useCreativeExport } from "@/features/content-studio/hooks/use-creative-export";
import { useStudioCaption } from "@/features/content-studio/hooks/use-studio-caption";
import { useTemplateScene } from "@/features/content-studio/hooks/use-template-scene";
import { useTemplateExport } from "@/features/content-studio/hooks/use-template-export";
import { templateById, type TemplateId } from "@/features/content-studio/templates";
import { studioSale } from "@/features/content-studio/lib/sale-price";
import { optionRun } from "@/features/content-studio/lib/option-run";
import { useInventoryAxisDefaults } from "@/features/inventory/hooks/use-inventory-axis-defaults";
import { describeVariantAxes } from "@/lib/variant-axes";

/**
 * Everything the content studio's sections read and change, from one call.
 */
export function useContentStudio(slug: string) {
  const brand = useBrand();
  const { profile: storeProfile } = useAdminStoreProfile(brand.id);
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brandNameEn = brand.name_en || (brand as any).name || "Brand";
  const brandSlugClean = brand.slug || slug || "brand";
  const defaultEditionLabel = `The ${brandNameEn} Edit`;

  const stageRef = useRef<HTMLDivElement>(null);
  const stageViewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { previewScale } = usePreviewScale(stageViewportRef);
  const [format, setFormat] = useState<keyof typeof FORMATS>("story");
  const [theme, setTheme] = useState<keyof typeof THEMES>("editorial");
  const [showPrice, setShowPrice] = useState(true);
  const [imageFit, setImageFit] = useState<"cover" | "contain">("cover");
  const [templateId, setTemplateId] = useState<TemplateId>("classic");
  const activeTemplate = templateById(templateId);
  const product = useStudioProduct(brand.id, isAr);
  const { selected, settingsQ } = product;
  const copy = useStudioCopy({ selected, isAr, brandNameEn, defaultEditionLabel });
  const { editionLabel, headline, body } = copy;

  const businessName =
    settingsQ.data?.business_name || (isAr ? brand.name_ar : brand.name_en) || brand.name_en;
  const logo = settingsQ.data?.logo_url || brand.logo_url;
  const phone = settingsQ.data?.phone || settingsQ.data?.whatsapp_number;
  const instagram = instagramHandle(settingsQ.data?.socials);
  const currency = settingsQ.data?.currency || "BHD";
  const currencySymbol = isAr
    ? currency === "BHD"
      ? "د.ب."
      : currency === "SAR"
        ? "ر.س."
        : currency === "KWD"
          ? "د.ك."
          : currency
    : currency;
  const palette = THEMES[theme];
  const editionIsAr = containsArabic(editionLabel);
  const headlineIsAr = containsArabic(headline);
  const bodyIsAr = containsArabic(body);
  const fallbackLineName = `${brandNameEn.toUpperCase()} LINE`;
  const productName = selected
    ? isAr
      ? selected.name_ar || selected.name
      : selected.name_en || selected.name
    : fallbackLineName;

  const creativeExport = useCreativeExport({
    stageRef,
    videoRef,
    photo: product.photo,
    isCurrentVideo: product.isCurrentVideo,
    brandSlugClean,
    selected,
    format,
    palette,
    headline,
    businessName,
    isAr,
  });
  const { productVariants, activeVariant } = product;
  const sale = useMemo(
    () => studioSale(productVariants, activeVariant),
    [productVariants, activeVariant],
  );
  // The option Swatch Run cycles through, labelled the way the inventory
  // labels this store's axes (a roastery's "colour" column is its roast).
  const axisDefaults = useInventoryAxisDefaults(brand.id);
  const run = useMemo(() => {
    const lang = isAr ? "ar" : "en";
    const axes = describeVariantAxes({
      variants: productVariants,
      addonDefaults: axisDefaults,
      lang,
    });
    return optionRun(axes, productVariants, lang);
  }, [productVariants, axisDefaults, isAr]);
  const { buildScene, photoReady } = useTemplateScene({
    format,
    isAr,
    theme,
    photo: product.photo,
    isCurrentVideo: product.isCurrentVideo,
    logo,
    businessName,
    instagram,
    phone,
    productName,
    headline,
    body,
    showPrice,
    effectivePrice: product.effectivePrice,
    currencySymbol,
    sale,
    run,
  });
  const templateExport = useTemplateExport({
    template: activeTemplate,
    buildScene,
    format,
    photo: product.photo,
    isCurrentVideo: product.isCurrentVideo,
    brandSlugClean,
    productFileName: selected?.name,
    headline,
    businessName,
    isAr,
  });
  const header = useHeaderLayout({ exporting: creativeExport.exporting, stageRef });
  const caption = useStudioCaption({
    selected,
    headline,
    body,
    selectedDescription: product.selectedDescription,
    variantsQ: product.variantsQ,
    currencySymbol,
    effectivePrice: product.effectivePrice,
    storeProfile,
    isAr,
  });

  return {
    slug,
    brand,
    storeProfile,
    isAr,
    brandNameEn,
    brandSlugClean,
    stageRef,
    stageViewportRef,
    videoRef,
    previewScale,
    format,
    setFormat,
    theme,
    setTheme,
    showPrice,
    setShowPrice,
    imageFit,
    setImageFit,
    businessName,
    logo,
    phone,
    instagram,
    currency,
    currencySymbol,
    palette,
    editionIsAr,
    headlineIsAr,
    bodyIsAr,
    fallbackLineName,
    productName,
    defaultEditionLabel,
    templateId,
    setTemplateId,
    sale,
    run,
    activeTemplate,
    buildScene,
    photoReady,
    ...templateExport,
    ...product,
    ...copy,
    ...creativeExport,
    ...header,
    ...caption,
  };
}

export type ContentStudio = ReturnType<typeof useContentStudio>;
