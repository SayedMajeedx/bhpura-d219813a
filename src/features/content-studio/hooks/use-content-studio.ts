import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { offersQueries } from "@/lib/data/offers";
import { useBrand } from "@/lib/brand-context";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useI18n } from "@/lib/i18n";
import {
  containsArabic,
  FORMATS,
  instagramHandle,
} from "@/features/content-studio/lib/studio-content";
import {
  DEFAULT_STYLE,
  storeColoursFrom,
  studioStyles,
  type StyleKey,
} from "@/features/content-studio/lib/studio-styles";
import { useStudioProduct } from "@/features/content-studio/hooks/use-studio-product";
import { useStudioCopy } from "@/features/content-studio/hooks/use-studio-copy";
import { useStudioCaption } from "@/features/content-studio/hooks/use-studio-caption";
import { useTemplateScene } from "@/features/content-studio/hooks/use-template-scene";
import { useTemplateExport } from "@/features/content-studio/hooks/use-template-export";
import { useLookbook } from "@/features/content-studio/hooks/use-lookbook";
import { useDetailZoom } from "@/features/content-studio/hooks/use-detail-zoom";
import { useOccasion } from "@/features/content-studio/hooks/use-occasion";
import { useBatchExport } from "@/features/content-studio/hooks/use-batch-export";
import { useDrafts } from "@/features/content-studio/hooks/use-drafts";
import { useStoreFonts } from "@/features/content-studio/hooks/use-store-fonts";
import { useMoments } from "@/features/content-studio/hooks/use-moments";
import { useLaunch } from "@/features/content-studio/hooks/use-launch";
import { useHowToOrder } from "@/features/content-studio/hooks/use-how-to-order";
import { useMadeForYou } from "@/features/content-studio/hooks/use-made-for-you";
import {
  readDraftFormat,
  readDraftSettings,
  type DraftSettings,
} from "@/features/content-studio/lib/drafts";
import { firstImage } from "@/features/content-studio/lib/studio-content";
import type { ContentDraft } from "@/lib/data/content-drafts";
import {
  knownTemplateId,
  templateById,
  type TemplateId,
} from "@/features/content-studio/templates";
import { postName } from "@/features/content-studio/lib/post-name";
import { postCallToAction } from "@/features/content-studio/lib/studio-caption";
import { useRemembered } from "@/features/content-studio/hooks/use-remembered";
import { useMediaQuery } from "@/hooks/use-media-query";
import { offerEnds } from "@/lib/offers";
import { todayPosts } from "@/features/content-studio/lib/today";
import { shareChecks } from "@/features/content-studio/lib/share-checks";
import { studioOfferedSale } from "@/features/content-studio/lib/sale-price";
import { optionRun } from "@/features/content-studio/lib/option-run";
import { reelShotUrls } from "@/features/content-studio/lib/reel-shots";
import { useInventoryAxisDefaults } from "@/features/inventory/hooks/use-inventory-axis-defaults";
import { describeVariantAxes } from "@/lib/variant-axes";
import type { LogoTint } from "@/features/content-studio/engine/brand-mark";

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

  // What this device last made here (template, size), so the studio opens where the merchant left it.
  const remembered = useRemembered(brand.id);
  const [format, setFormatState] = useState<keyof typeof FORMATS>(remembered.format ?? "story");
  const setFormat = (next: keyof typeof FORMATS) => {
    setFormatState(next);
    remembered.save({ format: next });
  };
  const [theme, setTheme] = useState<StyleKey>(DEFAULT_STYLE);
  const [showPrice, setShowPrice] = useState(true);
  const [imageFit, setImageFit] = useState<"cover" | "contain">("cover");
  const [templateId, setTemplateIdState] = useState<TemplateId>(() =>
    knownTemplateId(remembered.templateId),
  );
  const setTemplateId = (next: TemplateId) => {
    setTemplateIdState(next);
    remembered.save({ templateId: next });
  };
  const activeTemplate = templateById(templateId);
  // The logo on animated templates: its size and colour.
  const [logoScale, setLogoScale] = useState(1);
  const [logoTint, setLogoTint] = useState<LogoTint>("auto");
  // Headlines in the studio's own faces (the templates' editorial serif), or the store's.
  const [headlineFont, setHeadlineFont] = useState<"studio" | "store">("studio");
  // A teaser may show a product the store has not put out yet; no other template may.
  const product = useStudioProduct(brand.id, isAr, { includeHidden: templateId === "coming-soon" });
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
  // The colour styles: the store's own (from its storefront colours) and the studio's.
  const settingsRow = settingsQ.data;
  const brandColour = brand.primary_color;
  const styles = useMemo(
    () => studioStyles(storeColoursFrom(settingsRow, { primary_color: brandColour })),
    [settingsRow, brandColour],
  );
  const palette = styles[theme];
  const editionIsAr = containsArabic(editionLabel);
  const headlineIsAr = containsArabic(headline);
  const bodyIsAr = containsArabic(body);
  const fallbackLineName = `${brandNameEn.toUpperCase()} LINE`;
  const fullName = selected
    ? isAr
      ? selected.name_ar || selected.name
      : selected.name_en || selected.name
    : fallbackLineName;
  // "عباية | وتر": the piece's name large, its kind small above it, never the divider.
  const named = postName(fullName);
  const productName = named.name;
  const { productVariants, activeVariant } = product;
  // The store's live automatic offers (a discount with no code) are part of the price it shows:
  // the post says what the shopper pays and when the offer ends, as the storefront does.
  const offersQ = useQuery(offersQueries.live(brand.slug));
  const liveOffers = useMemo(() => offersQ.data ?? [], [offersQ.data]);
  const offered = useMemo(
    () => studioOfferedSale(selected, productVariants, activeVariant, liveOffers),
    [selected, productVariants, activeVariant, liveOffers],
  );
  const sale = offered.sale;
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
  // Lookbook: several products, priced from their cheapest variant.
  const variantRows = product.variantsQ.data;
  const variantList = useMemo(() => variantRows ?? [], [variantRows]);
  const lookbook = useLookbook({
    templateId,
    products: product.products,
    variants: variantList,
    leadId: selected?.id,
    isAr,
    offers: liveOffers,
  });
  const detailZoom = useDetailZoom({
    active: templateId === "detail-zoom",
    selected,
    mediaUrl: product.photo,
  });
  const occasion = useOccasion({
    active: templateId === "occasion-pack",
    currency,
    isAr,
    handle: instagram,
    making: settingsQ.data?.delivery_estimate_tailored_ar,
  });
  // Reel Cut, Coming Soon and Made for You cut between the product's photos; the others never load them.
  const { productMediaList, photo: chosenPhoto } = product;
  const shotUrls = useMemo(
    () =>
      templateId === "reel-cut" || templateId === "coming-soon" || templateId === "made-for-you"
        ? reelShotUrls(productMediaList, chosenPhoto)
        : [],
    [templateId, productMediaList, chosenPhoto],
  );
  const moments = useMoments({
    templateId,
    brandId: brand.id,
    productId: selected?.id,
    productVariants,
    allVariants: variantList,
    axisDefaults,
    isAr,
    currencySymbol,
    liveOffer: offered.offer,
  });
  const launch = useLaunch({ active: templateId === "coming-soon", isAr });
  const madeForYou = useMadeForYou({
    active: templateId === "made-for-you",
    settings: settingsQ.data,
    vertical: storeProfile.vertical,
    isAr,
    productName,
  });
  const howToOrder = useHowToOrder({
    active: templateId === "how-to-order",
    settings: settingsQ.data,
    isAr,
    currencySymbol,
  });
  const momentScene = useMemo(
    () => ({
      deadline: moments.deadline,
      restock: moments.restock,
      rating: moments.rating,
      launch: launch.launch,
      orderSteps: howToOrder.orderSteps,
      making: madeForYou.making,
    }),
    [
      moments.deadline,
      moments.restock,
      moments.rating,
      launch.launch,
      howToOrder.orderSteps,
      madeForYou.making,
    ],
  );
  const storeFonts = useStoreFonts(settingsQ.data, headlineFont === "store");
  const caption = useStudioCaption({
    selected,
    headline,
    body,
    selectedDescription: product.selectedDescription,
    variantsQ: product.variantsQ,
    currencySymbol,
    // A post that hides its price has a caption that does too.
    effectivePrice: showPrice ? product.effectivePrice : null,
    // The price the post shows: the offer's, while one is on (the caption once said the full price).
    sale: showPrice ? sale : null,
    saleEnds: sale ? offerEnds({ ends_at: offered.endsAt }, isAr ? "ar" : "en") : null,
    making: isAr
      ? settingsQ.data?.delivery_estimate_tailored_ar
      : settingsQ.data?.delivery_estimate_tailored_en,
    brandId: brand.id,
    isAr,
    override: occasion.occasionCaptionText,
  });
  // What the post asks a viewer to do, in the store's voice; a greeting, a teaser and the
  // ordering steps say it their own way.
  const ownAsk =
    templateId === "occasion-pack" || templateId === "coming-soon" || templateId === "how-to-order";
  const cta = ownAsk ? null : postCallToAction(caption.captionVoice, isAr ? "ar" : "en");
  const { buildScene, photoReady } = useTemplateScene({
    format,
    isAr,
    style: palette,
    photo: product.photo,
    isCurrentVideo: product.isCurrentVideo,
    shotUrls,
    logo,
    businessName,
    instagram,
    phone,
    productName,
    productKind: named.kind,
    cta,
    headline,
    body,
    showPrice,
    effectivePrice: product.effectivePrice,
    currencySymbol,
    sale,
    saleEndsAt: offered.endsAt,
    selectedId: selected?.id ?? null,
    run,
    collection: lookbook.collection,
    detail: detailZoom.detail,
    occasion: occasion.occasionScene,
    moments: momentScene,
    logoScale,
    logoTint,
    displayFamilies: storeFonts.storeFamilies,
  });
  const templateExport = useTemplateExport({
    template: activeTemplate,
    buildScene,
    format,
    photo: product.photo,
    // A greeting uses no product media, so it never waits on the product video.
    isCurrentVideo: templateId === "occasion-pack" ? false : product.isCurrentVideo,
    brandSlugClean,
    productFileName: templateId === "occasion-pack" ? occasion.occasionId : selected?.name,
    headline: templateId === "occasion-pack" ? occasion.occasionGreeting : headline,
    businessName,
    isAr,
  });
  const batch = useBatchExport({
    template: activeTemplate,
    buildScene,
    products: product.products,
    variants: variantList,
    offers: liveOffers,
    axisDefaults,
    leadId: selected?.id,
    format,
    isAr,
    showPrice,
    currencySymbol,
    brandSlugClean,
    businessName,
  });
  // Saved drafts: what the studio keeps, and how a draft is put back.
  const drafts = useDrafts({
    brandId: brand.id,
    isAr,
    snapshot: (name) => {
      const settings: DraftSettings = {
        v: 1,
        theme,
        showPrice,
        imageFit,
        logoScale,
        logoTint,
        headlineFont,
        editionLabel,
        headline,
        body,
        variantId: product.selectedVariantId,
        mediaUrl: product.selectedMediaUrl,
        lookbookIds: [...lookbook.lookbookIds],
        detail:
          templateId === "detail-zoom"
            ? {
                ...detailZoom.detailPoint,
                label: detailZoom.detailLabel,
                note: detailZoom.detailNote,
              }
            : null,
        occasion:
          templateId === "occasion-pack"
            ? {
                id: occasion.occasionId,
                greeting: occasion.occasionGreeting,
                message: occasion.occasionMessage,
                offer: occasion.occasionOffer,
              }
            : null,
      };
      return {
        name,
        template_id: templateId,
        format,
        product_id: selected?.id ?? null,
        settings,
      };
    },
    apply: (draft: ContentDraft) => {
      const saved = readDraftSettings(draft.settings);
      const draftProduct = product.products.find((item) => item.id === draft.product_id);
      const next = draftProduct ?? selected;
      const productChanges = Boolean(draftProduct) && draftProduct?.id !== selected?.id;
      setTemplateId(knownTemplateId(draft.template_id));
      setFormat(readDraftFormat(draft.format));
      setTheme(saved.theme);
      setShowPrice(saved.showPrice);
      setImageFit(saved.imageFit);
      setLogoScale(saved.logoScale);
      setLogoTint(saved.logoTint);
      setHeadlineFont(saved.headlineFont);
      if (draftProduct) product.setProductId(draftProduct.id);
      product.setSelectedVariantId(saved.variantId);
      if (saved.mediaUrl) product.setSelectedMediaUrl(saved.mediaUrl);
      copy.restoreCopy(saved, productChanges);
      if (saved.lookbookIds.length > 0) lookbook.setLookbookIds(saved.lookbookIds);
      if (saved.detail && next) {
        detailZoom.restoreDetail(saved.detail, {
          mediaUrl: saved.mediaUrl ?? firstImage(next),
          productId: next.id,
        });
      }
      if (saved.occasion) occasion.restoreOccasion(saved.occasion);
    },
  });

  // What is worth posting today (an offer ending, an offer on, a new piece), and picking one.
  const allProducts = product.products;
  const today = useMemo(
    () =>
      todayPosts({
        offers: liveOffers,
        products: allProducts,
        now: new Date(),
        lang: isAr ? "ar" : "en",
      }),
    [liveOffers, allProducts, isAr],
  );
  const pickTodayPost = (post: (typeof today)[number]) => {
    setTemplateId(post.templateId);
    product.setProductId(post.productId);
  };
  const checks = shareChecks({
    templateId,
    saleEndsAt: offered.endsAt,
    hasSale: Boolean(sale && showPrice),
    hasPhoto: Boolean(product.photo),
    deadlineBacked: moments.deadlineBacked,
    now: new Date(),
    lang: isAr ? "ar" : "en",
  });

  // A wide screen keeps the post beside the controls, its export in the header; a narrower one
  // has them under the post. Drawn in one place only, never hidden in the other.
  const wide = useMediaQuery("(min-width: 1280px)");

  return {
    slug,
    wide,
    today,
    pickTodayPost,
    checks,
    brand,
    storeProfile,
    isAr,
    brandNameEn,
    brandSlugClean,
    format,
    setFormat,
    theme,
    setTheme,
    styles,
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
    productKind: named.kind,
    defaultEditionLabel,
    templateId,
    setTemplateId,
    sale,
    run,
    logoScale,
    setLogoScale,
    logoTint,
    setLogoTint,
    headlineFont,
    setHeadlineFont,
    storeFontsLabel: storeFonts.storeFontsLabel,
    activeTemplate,
    buildScene,
    photoReady,
    ...templateExport,
    ...lookbook,
    ...detailZoom,
    ...occasion,
    ...moments,
    ...launch,
    ...howToOrder,
    ...madeForYou,
    ...batch,
    ...drafts,
    ...product,
    ...copy,
    ...caption,
  };
}

export type ContentStudio = ReturnType<typeof useContentStudio>;
