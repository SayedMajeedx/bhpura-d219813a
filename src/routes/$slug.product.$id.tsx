import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  useStorefront,
  formatPrice,
  pickName,
  pickDescription,
  useStoreModules,
} from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo, useRef, useEffect } from "react";
import { formatSizeWithUnit } from "@/lib/format";
import { useVariantTranslations } from "@/lib/use-variant-translations";
import { Sparkles } from "lucide-react";
import { isCatalogMode, shouldShowPrices, buildWhatsAppInquiryUrl } from "@/lib/storefront-mode";
import { useStickyCtaOffset } from "@/hooks/use-sticky-cta-offset";
import { AddonSlot } from "@/components/addons/AddonSlot";
import { useAddons } from "@/components/addons/AddonsProvider";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { variantAxisDefaultsFrom, resolveAllVariantAxes } from "@/lib/addons/addon-registry";
import { isColorSwatchAxis } from "@/lib/variant-axes";
import { trackProductEngagement } from "@/lib/storefront-tracking";
import { toast } from "sonner";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import {
  fetchActiveBrandIdentity,
  fetchBestSellerRows,
  fetchProductDetail,
  fetchRecommendationCatalog,
  storefrontKeys,
  storefrontQueries,
  type RecommendationProduct,
  type StorefrontProductDetail as Product,
  type StorefrontVariant as Variant,
} from "@/lib/data/storefront";
import {
  matchingVariantsFor,
  offeredSizes,
  outOfStockByValue,
  parsePriceDelta,
  sortVariants,
  uniqueOptionValues,
  withOfferedAxes,
  type VariantSelection,
} from "@/features/product-page/lib/variant-options";
import {
  discountPercentFor,
  displayPriceFor,
  matchingPriceRange,
  originalPriceFor,
} from "@/features/product-page/lib/pdp-pricing";
import type { CustomField } from "@/features/product-page/types";
import { productMediaList } from "@/features/product-page/lib/product-media";
import {
  PDP_BEST_SELLER_LIMIT,
  useProductRecommendations,
} from "@/features/product-page/hooks/use-product-recommendations";
import {
  cartTargetVariant,
  productCartLine,
  productSelectionError,
} from "@/features/product-page/lib/cart-line";
import { ProductGallery } from "@/features/product-page/components/ProductGallery";
import { ProductOptionPickers } from "@/features/product-page/components/ProductOptionPickers";
import { ProductAddonsPicker } from "@/features/product-page/components/ProductAddonsPicker";
import { ProductCustomFields } from "@/features/product-page/components/ProductCustomFields";
import { ProductMobileBuyBar } from "@/features/product-page/components/ProductMobileBuyBar";
import { buildProductSchema, buildBreadcrumbsSchema } from "@/lib/seo/structured-data";
import { ProductAccordion } from "@/components/storefront/ProductAccordion";
import { BundleOffer } from "@/components/storefront/BundleOffer";
import { RecentlyViewed, recordRecentlyViewed } from "@/components/storefront/RecentlyViewed";
import { getProductRecentPurchaseCount } from "@/lib/storefront-social-proof";

import { RecommendationRail } from "@/features/product-page/components/RecommendationRail";
import { ProductPurchaseActions } from "@/features/product-page/components/ProductPurchaseActions";
import { useVariantSelectionSync } from "@/features/product-page/hooks/use-variant-selection-sync";
import { ProductTitleAndPrice } from "@/features/product-page/components/ProductTitleAndPrice";
export const Route = createFileRoute("/$slug/product/$id")({
  loader: async ({ params, location }) => {
    let initialLang: "ar" | "en" = "ar";
    const searchParams = location?.search as any;
    const queryLang = searchParams?.lang;
    if (queryLang === "en" || queryLang === "ar") {
      initialLang = queryLang;
    } else if (typeof window === "undefined") {
      try {
        const { getStorefrontInitialLang } = await import("@/lib/storefront-cookies.functions");
        const cookieLang = await getStorefrontInitialLang({ data: { slug: params.slug } });
        if (cookieLang === "en" || cookieLang === "ar") {
          initialLang = cookieLang;
        }
      } catch {
        /* fallback to default */
      }
    } else {
      try {
        const cookieMatch =
          document.cookie.match(new RegExp(`(?:^|; )boutq_lang_${params.slug}=([^;]*)`)) ||
          document.cookie.match(/(?:^|; )boutq_lang=([^;]*)/);
        if (cookieMatch && (cookieMatch[1] === "en" || cookieMatch[1] === "ar")) {
          initialLang = cookieMatch[1] as "ar" | "en";
        }
      } catch {
        /* fallback */
      }
    }

    const brand = await fetchActiveBrandIdentity(params.slug);
    if (!brand)
      return { product: null, recommendationCatalog: [], bestSellerRows: [], initialLang };

    const [product, recommendationCatalog, bestSellerRows] = await Promise.all([
      fetchProductDetail(brand.id, params.id),
      fetchRecommendationCatalog(brand.id),
      fetchBestSellerRows(brand.slug, PDP_BEST_SELLER_LIMIT),
    ]);

    return { brand, product, recommendationCatalog, bestSellerRows, initialLang };
  },
  head: ({ loaderData, params }) => {
    const product = loaderData?.product as any;
    const brand = (loaderData as any)?.brand;
    if (!product) return {};

    const lang = (loaderData as any)?.initialLang || "ar";
    const name = (lang === "ar" ? product.name_ar : product.name_en) || product.name || "";
    const rawDesc =
      (lang === "ar"
        ? product.description_ar || product.description || product.description_en
        : product.description_en || product.description || product.description_ar) || name;
    const description = rawDesc.replace(/\s+/g, " ").trim().slice(0, 160);
    const title = `${name} | ${String(params?.slug || "").toUpperCase()}`;
    const image = product.image_url || undefined;

    const productSchema = buildProductSchema(
      {
        id: product.id,
        name_en: product.name_en || product.name,
        name_ar: product.name_ar || product.name,
        description_en: product.description_en || product.description,
        description_ar: product.description_ar || product.description,
        price: Number(product.base_price ?? product.product_variants?.[0]?.selling_price ?? 0),
        sale_price: product.original_price ? Number(product.base_price) : undefined,
        sku: product.product_variants?.[0]?.id || product.id,
        primary_image_url: product.image_url,
        images: Array.isArray(product.media)
          ? product.media.map((m: any) => (typeof m === "string" ? m : m?.url)).filter(Boolean)
          : product.image_url
            ? [product.image_url]
            : [],
        is_active: true,
      },
      brand || { slug: params.slug },
      undefined,
      lang,
    );

    const breadcrumbsSchema = buildBreadcrumbsSchema([
      { name: lang === "ar" ? "الرئيسية" : "Home", url: `https://boutq.store/${params.slug}` },
      { name, url: `https://boutq.store/${params.slug}/product/${params.id}` },
    ]);

    return {
      htmlAttrs: {
        lang,
        dir: lang === "ar" ? "rtl" : "ltr",
      },
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        ...(image ? [{ property: "og:image", content: image }] : []),
        { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        ...(image ? [{ name: "twitter:image", content: image }] : []),
      ],
      links: [
        {
          rel: "canonical",
          href: `https://boutq.store/${params.slug}/product/${params.id}`,
        },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(productSchema),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify(breadcrumbsSchema),
        },
      ],
    };
  },
  component: ProductDetail,
});

function ProductDetail({ splatId }: { splatId?: string } = {}) {
  const loaderData = Route.useLoaderData() as
    | {
        product: Product | null;
        recommendationCatalog: RecommendationProduct[];
        bestSellerRows: Array<{ product_id: string; units_sold: number }>;
      }
    | undefined;
  const params = Route.useParams() as any;
  const id = splatId || params?.id || params?._splat || params?.["_"] || params?.["$"] || "";
  const { brand, settings, currency, lang, t, addToCart, isWishlisted, toggleWishlist } =
    useStorefront();
  const { addons } = useAddons();
  const { vocabulary } = useVocabulary();
  const modules = useStoreModules();
  const navigate = useNavigate();
  const [mediaIdx, setMediaIdx] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [cfValues, setCfValues] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedFabric, setSelectedFabric] = useState<string | null>(null);
  const [selectedOptionFour, setSelectedOptionFour] = useState<string | null>(null);
  const [selectedOptionFive, setSelectedOptionFive] = useState<string | null>(null);
  const [sizeMode, setSizeMode] = useState<"ready" | "custom">("ready");
  const [measurementsApplied, setMeasurementsApplied] = useState(false);
  const [tailoringNotes, setTailoringNotes] = useState("");
  const [uploadingField, setUploadingField] = useState<Record<string, boolean>>({});
  const optionsRef = useRef<HTMLDivElement | null>(null);
  const galleryTouchStartX = useRef<number | null>(null);

  // Links shared with a corrupted id ("…-b5/a-33d84/9e04b8": a "7" turned into
  // "/") are repaired from the full path and tried after the id itself.
  const repairedId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const match = window.location.pathname.match(/\/product\/(.+)$/i);
    const suffix = match?.[1] ? decodeURIComponent(match[1]) : id;
    const repaired = suffix.replace(/\//g, "7").trim();
    return repaired && repaired !== id ? repaired : null;
  }, [id]);

  const { data: product, isLoading } = useQuery({
    ...storefrontQueries.product(brand, id, repairedId ? [repairedId] : []),
    initialData: loaderData?.product ?? undefined,
  });

  // When the repaired id found the product, show the canonical URL.
  useEffect(() => {
    if (!product || !repairedId || product.id !== repairedId) return;
    if (typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState(null, "", `/${brand.slug}/product/${product.id}`);
    }
  }, [product, repairedId, brand.slug]);

  useEffect(() => {
    if (!product) return;
    if (brand?.slug && product?.id) {
      recordRecentlyViewed(brand.slug, product.id);
    }
    const first = product.product_variants?.[0];
    trackStorefrontEvent(
      "view_item",
      {
        currency,
        value: Number(first?.selling_price ?? 0),
        content_ids: [product.id],
        content_type: "product",
        items: [
          {
            item_id: product.id,
            item_name: pickName(lang, product),
            price: Number(first?.selling_price ?? 0),
          },
        ],
      },
      product.id,
    );
  }, [product, currency, lang, brand?.slug]);

  const stickyCtaRef = useStickyCtaOffset<HTMLDivElement>();

  const socialProofQuery = useQuery({
    queryKey: storefrontKeys.socialProof(brand.slug, product?.id),
    queryFn: async () => {
      if (!brand?.id || !product?.id) return null;
      return getProductRecentPurchaseCount(
        brand.id,
        product.id,
        7,
        settings?.social_proof_threshold ?? 3,
      );
    },
    enabled: Boolean(
      brand?.id &&
      product?.id &&
      settings?.storefront_design_version === 2 &&
      settings?.social_proof_enabled !== false,
    ),
    staleTime: 10 * 60_000,
  });

  const { relatedProducts, bestSellingProducts } = useProductRecommendations({
    brand,
    product,
    initialCatalog: loaderData?.recommendationCatalog ?? undefined,
    initialBestSellerRows: loaderData?.bestSellerRows ?? undefined,
  });

  const variants = useMemo<Variant[]>(() => {
    return sortVariants(product?.product_variants ?? []);
  }, [product]);
  const variant = variantId ? variants.find((v) => v.id === variantId) : null;

  const media = useMemo(
    () => productMediaList(product, variant?.image_url),
    [product, variant?.image_url],
  );

  useEffect(() => {
    if (variant?.image_url) {
      const idx = media.findIndex((m) => m.url === variant.image_url);
      if (idx !== -1) setMediaIdx(idx);
    }
  }, [variant?.image_url, media]);

  const uniqueColors = useMemo(() => uniqueOptionValues(variants, (v) => v.color), [variants]);

  const uniqueSizes = useMemo(() => offeredSizes(variants), [variants]);

  const uniqueFabrics = useMemo(() => uniqueOptionValues(variants, (v) => v.fabric), [variants]);

  const uniqueFour = useMemo(() => uniqueOptionValues(variants, (v) => v.option_four), [variants]);

  const uniqueFive = useMemo(() => uniqueOptionValues(variants, (v) => v.option_five), [variants]);

  const allOptionTerms = useMemo(() => {
    return [...uniqueSizes, ...uniqueColors, ...uniqueFabrics, ...uniqueFour, ...uniqueFive];
  }, [uniqueSizes, uniqueColors, uniqueFabrics, uniqueFour, uniqueFive]);

  useVariantTranslations(allOptionTerms, lang === "ar" ? "ar" : "en");

  const storeVertical = settings?.store_vertical ?? null;
  const addonAxisDefaults = useMemo(
    () => variantAxisDefaultsFrom(addons, storeVertical),
    [addons, storeVertical],
  );
  const resolvedAxes = useMemo(
    () =>
      withOfferedAxes(
        resolveAllVariantAxes({
          product,
          addonDefaults: addonAxisDefaults,
          lang: lang === "ar" ? "ar" : "en",
        }),
        {
          size: uniqueSizes,
          color: uniqueColors,
          fabric: uniqueFabrics,
          four: uniqueFour,
          five: uniqueFive,
        },
      ),
    [
      product,
      addonAxisDefaults,
      lang,
      uniqueSizes,
      uniqueColors,
      uniqueFabrics,
      uniqueFour,
      uniqueFive,
    ],
  );

  // Dynamic out of stock maps for each option dimension, checking current other active options
  const optionSelection = useMemo<VariantSelection>(
    () => ({
      size: selectedSize,
      color: selectedColor,
      fabric: selectedFabric,
      four: selectedOptionFour,
      five: selectedOptionFive,
    }),
    [selectedSize, selectedColor, selectedFabric, selectedOptionFour, selectedOptionFive],
  );
  const isColorOutOfStock = useMemo(
    () => outOfStockByValue(variants, "color", uniqueColors, optionSelection),
    [variants, uniqueColors, optionSelection],
  );

  const isSizeOutOfStock = useMemo(
    () => outOfStockByValue(variants, "size", uniqueSizes, optionSelection),
    [variants, uniqueSizes, optionSelection],
  );

  const isFabricOutOfStock = useMemo(
    () => outOfStockByValue(variants, "fabric", uniqueFabrics, optionSelection),
    [variants, uniqueFabrics, optionSelection],
  );

  const isVisualColorAxis = useMemo(
    () => isColorSwatchAxis(resolvedAxes.color.label, uniqueColors),
    [resolvedAxes.color.label, uniqueColors],
  );

  useVariantSelectionSync({
    variants,
    variantId,
    setVariantId,
    uniqueSizes,
    uniqueColors,
    uniqueFabrics,
    uniqueFour,
    uniqueFive,
    selectedSize,
    setSelectedSize,
    selectedColor,
    setSelectedColor,
    selectedFabric,
    setSelectedFabric,
    selectedOptionFour,
    setSelectedOptionFour,
    selectedOptionFive,
    setSelectedOptionFive,
  });

  // Dynamic image swapping based on selected color name matching media filename/URL
  useEffect(() => {
    if (!selectedColor) return;
    const colorLower = selectedColor.toLowerCase();
    const idx = media.findIndex((m) => {
      if (m.type !== "image") return false;
      const urlLower = m.url.toLowerCase();
      return urlLower.includes(colorLower) || urlLower.includes(encodeURIComponent(colorLower));
    });
    if (idx !== -1) {
      setMediaIdx(idx);
    }
  }, [selectedColor, media]);

  const customFields = useMemo<CustomField[]>(
    () => (Array.isArray(product?.custom_fields) ? (product!.custom_fields as CustomField[]) : []),
    [product],
  );
  const isMeasurementField = (key: string) =>
    key.startsWith("fit_") ||
    key === "custom_measurements" ||
    key.includes("measurement") ||
    key.startsWith("sizing_") ||
    key.includes("passport");

  const hasMeasurementFields = customFields.some((f) => isMeasurementField(f.key));
  const visibleCustomFields = hasMeasurementFields
    ? customFields.filter((field) => !isMeasurementField(field.key))
    : customFields;

  useEffect(() => {
    if (!product?.id) return;
    const key = `product-view:${product.id}:${new Date().toISOString().slice(0, 10)}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage can be unavailable (private mode, quota) — safe to continue either way.
    }
    void trackProductEngagement(brand.slug, product.id, "view");
  }, [brand.slug, product?.id]);

  const { data: customizationOptions = [] } = useQuery({
    ...storefrontQueries.customizationOptions(brand),
    enabled: Boolean(brand.id),
  });

  const applicableAddons = useMemo(() => {
    if (!product?.id || !customizationOptions.length) return [];
    return customizationOptions.filter((c: any) => {
      const pIds = c.product_ids;
      if (!pIds || !Array.isArray(pIds) || pIds.length === 0) return true;
      return pIds.includes(product.id);
    });
  }, [product?.id, customizationOptions]);

  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);

  const toggleAddon = (id: string) => {
    setSelectedAddonIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectedAddOnPrice = useMemo(() => {
    let total = 0;
    for (const f of customFields) {
      const val = cfValues[f.key];
      if (val) {
        total += parsePriceDelta(val);
      }
    }
    for (const addonId of selectedAddonIds) {
      const opt = applicableAddons.find((a: any) => a.id === addonId);
      if (opt) {
        total += Number(opt.price_delta || 0);
      }
    }
    return total;
  }, [customFields, cfValues, selectedAddonIds, applicableAddons]);

  const basePrice = Number(product?.base_price || 0);

  // Find all variants that match the currently selected attributes (even if partially selected)
  const matchingVariants = useMemo(
    () => matchingVariantsFor(variants, optionSelection),
    [variants, optionSelection],
  );

  // Compute prices for matching variants
  const matchingPrices = useMemo(() => {
    return matchingVariants.map((v) => Number(v.selling_price || basePrice) + selectedAddOnPrice);
  }, [matchingVariants, basePrice, selectedAddOnPrice]);

  // Derived flags + effect run before any early return so hook order is stable.
  const isMadeToOrder = Boolean(product?.is_made_to_order);
  const hasReadySizes = uniqueSizes.length > 0;
  const hasCustomFields = customFields.length > 0;
  const showSizeModeToggle =
    modules.made_to_order && hasReadySizes && hasCustomFields && isMadeToOrder;
  const isTailoringActive =
    isMadeToOrder && ((showSizeModeToggle && sizeMode === "custom") || !showSizeModeToggle);

  useEffect(() => {
    if (isMadeToOrder && !hasReadySizes) {
      setSizeMode("custom");
    }
  }, [isMadeToOrder, hasReadySizes]);

  if (isLoading && !product) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 grid md:grid-cols-2 gap-8">
        <Skeleton className="aspect-[3/4] rounded-xl" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <Card className="p-8">
          <p className="mb-4">{t("لم يتم العثور على المنتج.", "Product not found.")}</p>
          <Link to="/$slug" params={{ slug: brand.slug }} className="underline">
            {t("العودة للمتجر", "Back to store")}
          </Link>
        </Card>
      </div>
    );
  }

  const hasVariants = variants.length > 0;

  const { min: minMatchingPrice, max: maxMatchingPrice } = matchingPriceRange(
    matchingPrices,
    basePrice,
    selectedAddOnPrice,
  );

  // The unique matched variant's price, else the lowest matching price.
  const displayPrice = displayPriceFor(
    matchingVariants,
    basePrice,
    selectedAddOnPrice,
    minMatchingPrice,
  );

  const maxStock = Number(variant?.stock_main ?? 0) + Number(variant?.stock_incubator ?? 0);

  const displayName = pickName(lang, product);
  const displayDescription = pickDescription(lang, product);

  const cfLabel = (f: CustomField) => {
    const label = lang === "ar" ? f.label_ar || f.label_en : f.label_en || f.label_ar;
    if (label) return label;
    if (/^f\d+$/.test(f.key)) {
      return lang === "ar"
        ? "النص المطلوب / تفاصيل إضافية"
        : "Required Text / Special Instructions";
    }
    return f.key;
  };

  const primary = settings.primary_color || "#111111";

  const scrollToOptions = () => {
    optionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const selectedVariantOutOfStock = Boolean(!isTailoringActive && variant && maxStock <= 0);

  const validate = (): string | null =>
    productSelectionError({
      showSizeModeToggle,
      sizeMode,
      hasVariants,
      variant,
      hasMeasurementFields,
      measurementsApplied,
      visibleCustomFields,
      cfValues,
      hasCustomFields,
      uniqueSizes,
      isTailoringActive,
      cfLabel,
      t,
    });

  const doAdd = (thenBuy = false) => {
    if (isCatalogMode(settings)) return;
    const err = validate();
    if (err) {
      setErrorMsg(err);
      toast.error(err);
      scrollToOptions();
      return;
    }
    const targetVariant = cartTargetVariant({
      isTailoringActive,
      variant,
      matchingVariants,
      variants,
      selectedColor,
    });

    if (!targetVariant && hasVariants && !isTailoringActive) {
      const msg = t("يرجى اختيار خيار أولاً", "Please select an option first");
      setErrorMsg(msg);
      toast.error(msg);
      scrollToOptions();
      return;
    }
    setErrorMsg(null);

    if (tailoringNotes.trim()) {
      try {
        localStorage.setItem(`pura_guest_tailoring_notes_${brand.slug}`, tailoringNotes.trim());
      } catch {
        // localStorage can be unavailable (private mode, quota) — draft just won't persist.
      }
    }

    addToCart(
      productCartLine({
        showSizeModeToggle,
        sizeMode,
        visibleCustomFields,
        cfValues,
        measurementsApplied,
        isMeasurementField,
        lang,
        applicableAddons,
        selectedAddonIds,
        currency,
        t,
        tailoringNotes,
        vocabulary,
        targetVariant,
        isTailoringActive,
        product,
        displayName,
        media,
        displayPrice,
        originalPriceWithAddons,
        selectedColor,
        selectedFabric,
        selectedOptionFour,
        selectedOptionFive,
        qty,
      }) as any,
    );
    if (thenBuy) {
      navigate({ to: "/$slug/checkout", params: { slug: brand.slug } });
    } else {
      toast.success(t("تمت الإضافة إلى السلة", "Added to cart"));
    }
  };

  const isRange = minMatchingPrice !== maxMatchingPrice;
  const priceLabel = isRange
    ? `${formatPrice(minMatchingPrice, currency, lang)} – ${formatPrice(maxMatchingPrice, currency, lang)}`
    : displayPrice > 0
      ? formatPrice(displayPrice, currency, lang)
      : t("السعر عند الطلب", "Price on request");

  // Calculate original price only when displaying a single price
  const originalPrice = originalPriceFor({
    isRange,
    variant,
    basePrice,
    productOriginalPrice: Number((product as any).original_price || 0),
  });
  const originalPriceWithAddons = originalPrice > 0 ? originalPrice + selectedAddOnPrice : 0;
  const discountPercent = discountPercentFor(originalPriceWithAddons, displayPrice);

  const inquiryUrl = isCatalogMode(settings)
    ? buildWhatsAppInquiryUrl({
        number: settings.whatsapp_number,
        template:
          lang === "ar" ? settings.catalog_inquiry_message_ar : settings.catalog_inquiry_message_en,
        lang,
        ctx: {
          brandName: lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en,
          productName: displayName,
          productUrl: typeof window !== "undefined" ? window.location.href : "",
          variantLabel: variant
            ? [
                (showSizeModeToggle && sizeMode === "custom") ||
                (!hasReadySizes && isTailoringActive)
                  ? vocabulary.custom_sizing?.[lang] || t("قياس خاص", "Custom Sizing")
                  : formatSizeWithUnit(variant.size, variant.size_unit, lang),
                variant.color,
                variant.fabric,
              ]
                .filter(Boolean)
                .join(" · ")
            : null,
          priceLabel: shouldShowPrices(settings) ? priceLabel : undefined,
        },
      })
    : null;

  const pdpGalleryRatio = settings?.pdp_gallery_aspect_ratio ?? "3:4";
  const galleryRatioClass =
    pdpGalleryRatio === "1:1"
      ? "aspect-square"
      : pdpGalleryRatio === "4:5"
        ? "aspect-[4/5]"
        : "aspect-[3/4]";

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 sm:py-8 pb-28 md:pb-10 overflow-x-hidden w-full max-w-full">
      <div className="grid md:grid-cols-12 gap-6 lg:gap-10 items-start w-full max-w-full">
        <ProductGallery
          displayName={displayName}
          galleryRatioClass={galleryRatioClass}
          galleryTouchStartX={galleryTouchStartX}
          media={media}
          mediaIdx={mediaIdx}
          primary={primary}
          product={product}
          setMediaIdx={setMediaIdx}
          settings={settings}
          t={t}
        />

        <div className="md:col-span-7 w-full min-w-0 overflow-hidden">
          <ProductTitleAndPrice
            currency={currency}
            discountPercent={discountPercent}
            displayName={displayName}
            displayPrice={displayPrice}
            isWishlisted={isWishlisted}
            lang={lang}
            originalPrice={originalPrice}
            priceLabel={priceLabel}
            product={product}
            settings={settings}
            t={t}
            toggleWishlist={toggleWishlist}
          />

          {/* Social Proof Badge */}
          {settings?.storefront_design_version === 2 &&
            settings?.social_proof_enabled !== false &&
            socialProofQuery.data && (
              <div className="mb-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-semibold border border-amber-500/20">
                <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>
                  {t(
                    `تم شراؤه ${socialProofQuery.data} مرات خلال الأسبوع الماضي`,
                    `Purchased ${socialProofQuery.data} times in the last 7 days`,
                  )}
                </span>
              </div>
            )}

          {displayDescription && (
            <p className="text-muted-foreground mb-4 sm:mb-6 whitespace-pre-line text-sm sm:text-base">
              {displayDescription}
            </p>
          )}

          {(hasVariants || customFields.length > 0) && (
            <ProductOptionPickers
              hasReadySizes={hasReadySizes}
              hasVariants={hasVariants}
              isColorOutOfStock={isColorOutOfStock}
              isFabricOutOfStock={isFabricOutOfStock}
              isMadeToOrder={isMadeToOrder}
              isMeasurementField={isMeasurementField}
              isSizeOutOfStock={isSizeOutOfStock}
              isTailoringActive={isTailoringActive}
              isVisualColorAxis={isVisualColorAxis}
              lang={lang}
              optionsRef={optionsRef}
              primary={primary}
              product={product}
              resolvedAxes={resolvedAxes}
              selectedColor={selectedColor}
              selectedFabric={selectedFabric}
              selectedOptionFive={selectedOptionFive}
              selectedOptionFour={selectedOptionFour}
              selectedSize={selectedSize}
              setCfValues={setCfValues}
              setErrorMsg={setErrorMsg}
              setMeasurementsApplied={setMeasurementsApplied}
              setQty={setQty}
              setSelectedColor={setSelectedColor}
              setSelectedFabric={setSelectedFabric}
              setSelectedOptionFive={setSelectedOptionFive}
              setSelectedOptionFour={setSelectedOptionFour}
              setSelectedSize={setSelectedSize}
              setSizeMode={setSizeMode}
              setVariantId={setVariantId}
              showSizeModeToggle={showSizeModeToggle}
              sizeMode={sizeMode}
              t={t}
              uniqueColors={uniqueColors}
              uniqueFabrics={uniqueFabrics}
              uniqueFive={uniqueFive}
              uniqueFour={uniqueFour}
              uniqueSizes={uniqueSizes}
              variantId={variantId}
              variants={variants}
              vocabulary={vocabulary}
            />
          )}

          {applicableAddons.length > 0 && (
            <ProductAddonsPicker
              applicableAddons={applicableAddons}
              currency={currency}
              lang={lang}
              selectedAddonIds={selectedAddonIds}
              settings={settings}
              t={t}
              toggleAddon={toggleAddon}
            />
          )}

          <AddonSlot
            placement="storefront.product.afterOptions"
            props={{
              product,
              customFields,
              cfValues,
              setCfValues,
              sizeMode,
              onApplied: (applied: boolean) => setMeasurementsApplied(applied),
            }}
          />

          {visibleCustomFields.length > 0 && (!showSizeModeToggle || sizeMode === "custom") && (
            <ProductCustomFields
              brand={brand}
              cfLabel={cfLabel}
              cfValues={cfValues}
              lang={lang}
              modules={modules}
              setCfValues={setCfValues}
              setErrorMsg={setErrorMsg}
              setTailoringNotes={setTailoringNotes}
              setUploadingField={setUploadingField}
              showSizeModeToggle={showSizeModeToggle}
              sizeMode={sizeMode}
              t={t}
              tailoringNotes={tailoringNotes}
              uploadingField={uploadingField}
              visibleCustomFields={visibleCustomFields}
              vocabulary={vocabulary}
            />
          )}

          <AddonSlot
            placement="storefront.product.afterCta"
            props={{
              product,
              selectedSize,
              onSelectSize: (sz: string) => setSelectedSize(sz),
            }}
          />

          <ProductPurchaseActions
            brand={brand}
            doAdd={doAdd}
            errorMsg={errorMsg}
            inquiryUrl={inquiryUrl}
            isTailoringActive={isTailoringActive}
            lang={lang}
            maxStock={maxStock}
            product={product}
            qty={qty}
            selectedVariantOutOfStock={selectedVariantOutOfStock}
            setQty={setQty}
            settings={settings}
            t={t}
            variant={variant}
            vocabulary={vocabulary}
          />

          {/* Layer 2 Product Accordions */}
          {settings?.storefront_design_version === 2 && (
            <ProductAccordion
              description={displayDescription}
              fabricCare={
                variant?.fabric
                  ? `${variant.fabric}`
                  : (lang === "ar" ? settings?.fabric_care_ar : settings?.fabric_care_en) || null
              }
              hasSizeGuide={Boolean(
                modules?.size_guide || (product?.size_guide_id && !product?.size_guide_hidden),
              )}
            />
          )}

          {/* Layer 2 Bundle Offer */}
          {settings?.storefront_design_version === 2 && relatedProducts.length > 0 && (
            <BundleOffer
              mainProduct={product}
              mainVariant={variant}
              bundleItems={relatedProducts.slice(0, 3)}
            />
          )}
        </div>

        {/* Mobile sticky purchase bar. Publishes its height so bottom-fixed
            overlays (consent banner) stack above it rather than over it. */}
        <ProductMobileBuyBar
          brand={brand}
          doAdd={doAdd}
          hasReadySizes={hasReadySizes}
          inquiryUrl={inquiryUrl}
          isTailoringActive={isTailoringActive}
          lang={lang}
          priceLabel={priceLabel}
          primary={primary}
          product={product}
          scrollToOptions={scrollToOptions}
          selectedVariantOutOfStock={selectedVariantOutOfStock}
          settings={settings}
          showSizeModeToggle={showSizeModeToggle}
          sizeMode={sizeMode}
          stickyCtaRef={stickyCtaRef}
          t={t}
          variant={variant}
          vocabulary={vocabulary}
        />
      </div>

      {(relatedProducts.length > 0 || bestSellingProducts.length > 0) && (
        <div className="mt-10 space-y-9 border-t pt-8 sm:mt-14 sm:pt-10">
          {relatedProducts.length > 0 && (
            <RecommendationRail
              title={t("قد يعجبك أيضاً", "You may also like")}
              products={relatedProducts}
            />
          )}
          {bestSellingProducts.length > 0 && (
            <RecommendationRail
              title={t("اشتراها العملاء أيضاً", "Customers also bought")}
              products={bestSellingProducts}
            />
          )}
        </div>
      )}

      {/* Layer 2 Recently Viewed Carousel */}
      {settings?.recently_viewed_enabled !== false && (
        <RecentlyViewed excludeProductId={product.id} />
      )}
    </div>
  );
}
