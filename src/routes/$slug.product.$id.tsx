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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo, useRef, useEffect } from "react";
import { formatSizeWithUnit } from "@/lib/format";
import { useVariantTranslations } from "@/lib/use-variant-translations";
import { ShoppingBag, AlertCircle, Heart, Sparkles, Truck, MessageCircle } from "lucide-react";
import { isCatalogMode, shouldShowPrices, buildWhatsAppInquiryUrl } from "@/lib/storefront-mode";
import { NotifyMeForm } from "@/components/storefront/NotifyMeForm";
import { useStickyCtaOffset } from "@/hooks/use-sticky-cta-offset";
import { AddonSlot } from "@/components/addons/AddonSlot";
import { useAddons } from "@/components/addons/AddonsProvider";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { variantAxisDefaultsFrom, resolveAllVariantAxes } from "@/lib/addons/addon-registry";
import { isColorSwatchAxis } from "@/lib/variant-axes";
import { formatCustomField } from "@/lib/addons/custom-fields";
import { ProductShareModal } from "@/components/storefront/ProductShareModal";
import { trackProductEngagement } from "@/lib/storefront-tracking";
import { toast } from "sonner";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { ResponsiveImage } from "@/components/responsive-media";
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
import { isPlaceholderVariant } from "@/lib/variant-sku-utils";
import {
  matchingVariantsFor,
  offeredSizes,
  outOfStockByValue,
  parsePriceDelta,
  sortVariants,
  uniqueOptionValues,
  type VariantSelection,
} from "@/features/product-page/lib/variant-options";
import {
  discountPercentFor,
  displayPriceFor,
  matchingPriceRange,
  originalPriceFor,
} from "@/features/product-page/lib/pdp-pricing";
import type { CustomField } from "@/features/product-page/types";
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

/** Best sellers ranked for the product page's badges and rails. */
const PDP_BEST_SELLER_LIMIT = 10;

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

  const { data: recommendationCatalog = [] } = useQuery({
    ...storefrontQueries.recommendations(brand),
    initialData: loaderData?.recommendationCatalog ?? undefined,
  });

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

  const { data: bestSellerRows = [] } = useQuery({
    ...storefrontQueries.bestSellers(brand, PDP_BEST_SELLER_LIMIT),
    initialData: loaderData?.bestSellerRows ?? undefined,
  });

  const relatedProducts = useMemo(
    () =>
      product?.category
        ? recommendationCatalog
            .filter((item) => item.id !== product.id && item.category === product.category)
            .slice(0, 8)
        : [],
    [product, recommendationCatalog],
  );
  const relatedIds = useMemo(
    () => new Set(relatedProducts.map((item) => item.id)),
    [relatedProducts],
  );
  const bestSellingProducts = useMemo(() => {
    const ranks = new Map(bestSellerRows.map((row, index) => [row.product_id, index]));
    return recommendationCatalog
      .filter((item) => item.id !== product?.id && !relatedIds.has(item.id) && ranks.has(item.id))
      .sort((a, b) => (ranks.get(a.id) ?? 99) - (ranks.get(b.id) ?? 99))
      .slice(0, 8);
  }, [bestSellerRows, product?.id, recommendationCatalog, relatedIds]);

  const variants = useMemo<Variant[]>(() => {
    return sortVariants(product?.product_variants ?? []);
  }, [product]);
  const variant = variantId ? variants.find((v) => v.id === variantId) : null;

  const media = useMemo(() => {
    if (!product) return [];
    const arr = Array.isArray(product.media)
      ? (product.media as Array<{
          type: "image" | "video";
          url: string;
          stream_uid?: string;
          stream_iframe_url?: string;
          poster_url?: string;
        }>)
      : [];
    const list = [...arr];
    if (product.image_url && !list.some((m) => m.url === product.image_url)) {
      list.unshift({ type: "image" as const, url: product.image_url });
    }
    if (variant?.image_url && !list.some((m) => m.url === variant.image_url)) {
      list.unshift({ type: "image" as const, url: variant.image_url });
    }
    return list;
  }, [product, variant?.image_url]);

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
  const resolvedAxes = useMemo(() => {
    const base = resolveAllVariantAxes({
      product,
      addonDefaults: addonAxisDefaults,
      lang: lang === "ar" ? "ar" : "en",
    });
    return {
      size: {
        ...base.size,
        visible: base.size.visible || uniqueSizes.length > 0,
      },
      color: {
        ...base.color,
        visible: base.color.visible || uniqueColors.length > 0,
      },
      fabric: {
        ...base.fabric,
        visible: base.fabric.visible || uniqueFabrics.length > 0,
      },
      four: {
        ...base.four,
        visible: base.four.visible || uniqueFour.length > 0,
      },
      five: {
        ...base.five,
        visible: base.five.visible || uniqueFive.length > 0,
      },
    };
  }, [
    product,
    addonAxisDefaults,
    lang,
    uniqueSizes,
    uniqueColors,
    uniqueFabrics,
    uniqueFour,
    uniqueFive,
  ]);

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

  // Pre-select single options if an axis has only 1 choice available
  useEffect(() => {
    if (uniqueSizes.length === 1 && !selectedSize) {
      setSelectedSize(uniqueSizes[0]);
    }
  }, [uniqueSizes, selectedSize]);

  useEffect(() => {
    if (uniqueColors.length === 1 && !selectedColor) {
      setSelectedColor(uniqueColors[0]);
    }
  }, [uniqueColors, selectedColor]);

  useEffect(() => {
    if (uniqueFabrics.length === 1 && !selectedFabric) {
      setSelectedFabric(uniqueFabrics[0]);
    }
  }, [uniqueFabrics, selectedFabric]);

  useEffect(() => {
    if (uniqueFour.length === 1 && !selectedOptionFour) {
      setSelectedOptionFour(uniqueFour[0]);
    }
  }, [uniqueFour, selectedOptionFour]);

  useEffect(() => {
    if (uniqueFive.length === 1 && !selectedOptionFive) {
      setSelectedOptionFive(uniqueFive[0]);
    }
  }, [uniqueFive, selectedOptionFive]);

  // Auto-initialize attributes only when a single variant is available
  useEffect(() => {
    if (variants.length === 1 && !variantId) {
      const first = variants[0];
      setVariantId(first.id);
      setSelectedColor(first.color ?? null);
      setSelectedSize(first.size ?? null);
      setSelectedFabric(first.fabric ?? null);
      setSelectedOptionFour(first.option_four ?? null);
      setSelectedOptionFive(first.option_five ?? null);
    }
  }, [variants, variantId]);

  // Sync selected attributes back to variantId
  useEffect(() => {
    const match = variants.find((v) => {
      const colorMatch = !selectedColor || v.color === selectedColor;
      const sizeMatch = !selectedSize || v.size === selectedSize;
      const fabricMatch = !selectedFabric || v.fabric === selectedFabric;
      const fourMatch = !selectedOptionFour || v.option_four === selectedOptionFour;
      const fiveMatch = !selectedOptionFive || v.option_five === selectedOptionFive;
      return colorMatch && sizeMatch && fabricMatch && fourMatch && fiveMatch;
    });
    if (match) {
      setVariantId(match.id);
    } else {
      setVariantId(null);
    }
  }, [
    selectedColor,
    selectedSize,
    selectedFabric,
    selectedOptionFour,
    selectedOptionFive,
    variants,
  ]);

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

  const validate = (): string | null => {
    if (showSizeModeToggle) {
      if (sizeMode === "ready") {
        if (hasVariants && !variant) {
          return t("يرجى اختيار مقاس جاهز أولاً", "Please select a ready size first");
        }
        if (
          variant &&
          Number(variant.stock_main || 0) + Number(variant.stock_incubator || 0) <= 0
        ) {
          return t("هذا المقاس غير متوفر حالياً", "This size is out of stock");
        }
      } else {
        if (hasMeasurementFields && !measurementsApplied) {
          return t(
            "يرجى تطبيق المقاسات المطلوبة لإكمال الطلب",
            "Please apply the required measurements to continue",
          );
        }
        for (const f of visibleCustomFields) {
          if (f.required && !(cfValues[f.key] ?? "").trim()) {
            return t(`الحقل مطلوب: ${cfLabel(f)}`, `Required field: ${cfLabel(f)}`);
          }
        }
      }
    } else {
      const isPureCustom = hasCustomFields && uniqueSizes.length === 0;
      if (!isPureCustom) {
        if (hasVariants && !variant) {
          return t("يرجى اختيار مقاس/خيار أولاً", "Please select a size or option first");
        }
        if (
          variant &&
          Number(variant.stock_main || 0) + Number(variant.stock_incubator || 0) <= 0
        ) {
          return t("هذا الخيار غير متوفر حالياً", "This option is out of stock");
        }
      }
      if (isTailoringActive && hasMeasurementFields && !measurementsApplied) {
        return t(
          "يرجى تطبيق المقاسات المطلوبة لإكمال الطلب",
          "Please apply the required measurements to continue",
        );
      }
      for (const f of visibleCustomFields) {
        if (f.required && !(cfValues[f.key] ?? "").trim()) {
          return t(`الحقل مطلوب: ${cfLabel(f)}`, `Required field: ${cfLabel(f)}`);
        }
      }
    }
    return null;
  };

  const doAdd = (thenBuy = false) => {
    if (isCatalogMode(settings)) return;
    const err = validate();
    if (err) {
      setErrorMsg(err);
      toast.error(err);
      scrollToOptions();
      return;
    }
    const targetVariant = isTailoringActive
      ? variant ||
        matchingVariants[0] ||
        variants.find((v) => !selectedColor || v.color === selectedColor) ||
        variants[0] ||
        null
      : variant;

    if (!targetVariant && hasVariants && !isTailoringActive) {
      const msg = t("يرجى اختيار خيار أولاً", "Please select an option first");
      setErrorMsg(msg);
      toast.error(msg);
      scrollToOptions();
      return;
    }
    setErrorMsg(null);

    const activeCustomFields =
      showSizeModeToggle && sizeMode === "ready" ? [] : visibleCustomFields;
    const custom = activeCustomFields
      .map((f) => {
        const val = (cfValues[f.key] ?? "").trim();
        const price_delta = parsePriceDelta(val);
        return {
          key: f.key,
          label_ar: f.label_ar,
          label_en: f.label_en,
          value: val,
          type: f.type,
          price_delta,
        };
      })
      .filter((v) => v.value.length > 0);

    if (measurementsApplied) {
      Object.entries(cfValues).forEach(([k, v]) => {
        if (isMeasurementField(k) && v && !custom.some((c) => c.key === k)) {
          const fmtAr = formatCustomField({ key: k, value: String(v) }, "ar");
          const fmtEn = formatCustomField({ key: k, value: String(v) }, "en");
          if (fmtAr && fmtEn) {
            custom.push({
              key: k,
              label_ar: fmtAr.label,
              label_en: fmtEn.label,
              value: lang === "ar" ? fmtAr.value : fmtEn.value,
              type: "text",
              price_delta: 0,
            });
          }
        }
      });
    }

    const chosenAddons = applicableAddons.filter((a: any) => selectedAddonIds.includes(a.id));
    for (const addon of chosenAddons) {
      const delta = Number(addon.price_delta || 0);
      custom.push({
        key: `addon_${addon.id}`,
        label_ar: addon.name,
        label_en: addon.name,
        value: delta > 0 ? `+ ${formatPrice(delta, currency, lang)}` : t("مجاني", "Free"),
        type: "select",
        price_delta: delta,
      });
    }

    if (tailoringNotes.trim()) {
      custom.push({
        key: "tailoring_notes",
        label_ar:
          vocabulary.workshop_notes_label?.[lang] ||
          (lang === "ar" ? "ملاحظات وتفاصيل التجهيز" : "Production & Workshop Notes"),
        label_en:
          vocabulary.workshop_notes_label?.[lang] ||
          (lang === "ar" ? "ملاحظات وتفاصيل التجهيز" : "Production & Workshop Notes"),
        value: tailoringNotes.trim(),
        type: "text",
        price_delta: 0,
      });
      try {
        localStorage.setItem(`pura_guest_tailoring_notes_${brand.slug}`, tailoringNotes.trim());
      } catch {
        // localStorage can be unavailable (private mode, quota) — draft just won't persist.
      }
    }

    const fileField = activeCustomFields.find((f) => f.type === "file");
    const file_url = fileField ? (cfValues[fileField.key] ?? "").trim() : "";
    const textField = activeCustomFields.find((f) => f.type === "text");
    const custom_text = textField ? (cfValues[textField.key] ?? "").trim() : "";

    const selected_customizations = {
      options: custom.map((c) => ({
        name: lang === "ar" ? c.label_ar || c.label_en : c.label_en || c.label_ar,
        value: c.value,
        price_delta: c.price_delta,
      })),
      custom_text: tailoringNotes.trim() || custom_text,
      file_url,
    };

    const effectiveSize =
      showSizeModeToggle && sizeMode === "custom"
        ? vocabulary.custom_sizing?.[lang] || t("قياسات خاصة / حسب الطلب", "Custom Sizing")
        : targetVariant?.size && !isPlaceholderVariant(targetVariant)
          ? targetVariant.size
          : isTailoringActive
            ? vocabulary.custom_sizing?.[lang] ||
              vocabulary.custom_order?.[lang] ||
              t("حسب الطلب", "Made to order")
            : targetVariant?.size || null;

    addToCart({
      cart_line_id: "",
      variant_id: targetVariant?.id ?? null,
      product_id: product.id,
      name: displayName,
      name_ar: product.name_ar,
      name_en: product.name_en,
      image:
        targetVariant?.image_url ||
        media.find((m) => m.type === "image")?.url ||
        product.image_url ||
        null,
      price: displayPrice,
      original_price: originalPriceWithAddons > displayPrice ? originalPriceWithAddons : null,
      size: effectiveSize,
      size_unit: targetVariant?.size_unit || null,
      color: targetVariant?.color || selectedColor || null,
      fabric: targetVariant?.fabric || selectedFabric || null,
      option_four: targetVariant?.option_four || selectedOptionFour || null,
      option_five: targetVariant?.option_five || selectedOptionFive || null,
      qty,
      max_stock: isTailoringActive
        ? 999
        : Number(targetVariant?.stock_main ?? 0) + Number(targetVariant?.stock_incubator ?? 0) ||
          999,
      custom_fields: custom,
      selected_customizations,
    } as any);
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
          <div className="mb-1 flex items-start justify-between gap-3 sm:mb-2">
            <h1
              className="font-display text-2xl sm:text-3xl"
              style={{ color: "var(--sf-product-title, var(--sf-heading))" }}
            >
              {displayName}
            </h1>
            <div className="flex items-center gap-2 shrink-0">
              <ProductShareModal
                isAr={lang === "ar"}
                productName={displayName}
                priceFormatted={priceLabel}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 rounded-full h-11 w-11"
                onClick={() => toggleWishlist(product.id)}
                aria-label={t("المفضلة", "Wishlist")}
              >
                <Heart
                  className={`h-5 w-5 ${isWishlisted(product.id) ? "fill-red-600 text-red-600" : ""}`}
                />
              </Button>
            </div>
          </div>
          <div
            className="mb-3 flex flex-wrap items-center gap-3 text-xl font-semibold sm:mb-4 sm:text-2xl"
            style={{ color: "var(--sf-price, var(--sf-heading))" }}
          >
            {!shouldShowPrices(settings) ? (
              <span className="text-base font-normal text-muted-foreground">
                {t("تواصل معنا للسعر", "Contact us for price")}
              </span>
            ) : (
              <>
                <span>{priceLabel}</span>
                {originalPrice > displayPrice && (
                  <span className="text-base font-normal text-muted-foreground line-through">
                    {formatPrice(originalPrice, currency, lang)}
                  </span>
                )}
                {discountPercent > 0 && (
                  <span className="rounded-full bg-neutral-950 px-3 py-1 text-xs text-white">
                    {t(`وفر ${discountPercent}%`, `Save ${discountPercent}%`)}
                  </span>
                )}
              </>
            )}
          </div>

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

          {!isCatalogMode(settings) && (variant || isTailoringActive) && (
            <div className="mb-4 flex items-center">
              <div>
                <div className="text-sm font-medium mb-2">{t("الكمية", "Quantity")}</div>
                <div className="inline-flex items-center border rounded-lg overflow-hidden">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("تقليل الكمية", "Decrease quantity")}
                    className="h-11 w-11 rounded-none"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                  >
                    −
                  </Button>
                  <span className="px-4 text-sm font-medium">{qty}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("زيادة الكمية", "Increase quantity")}
                    className="h-11 w-11 rounded-none"
                    disabled={isTailoringActive ? false : qty >= maxStock}
                    onClick={() =>
                      setQty((q) => (isTailoringActive ? q + 1 : Math.min(maxStock, q + 1)))
                    }
                  >
                    +
                  </Button>
                </div>
              </div>
              <div className="ms-3 mt-6">
                {isTailoringActive ? (
                  <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-primary font-medium">
                    {vocabulary.made_to_order?.[lang] || t("صنع حسب الطلب", "Made to order")}
                  </span>
                ) : maxStock > 0 && maxStock <= 5 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-300 font-semibold animate-pulse">
                    <span>🔥</span>
                    <span>
                      {t(`متبقي ${maxStock} قطع فقط!`, `Only ${maxStock} left in stock!`)}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground">
                    {maxStock} {t("متوفر", "available")}
                  </span>
                )}
              </div>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isCatalogMode(settings) ? (
            <div className="hidden md:flex gap-2">
              <Button
                type="button"
                className="flex-1 h-12 font-semibold shadow-sm hover:opacity-90 bg-primary text-primary-foreground gap-2"
                onClick={() => {
                  if (inquiryUrl) {
                    void trackProductEngagement(brand.slug, product.id, "inquiry");
                    window.open(inquiryUrl, "_blank", "noopener,noreferrer");
                  } else {
                    toast.error(
                      t(
                        "رقم التواصل عبر واتساب غير متوفر حالياً",
                        "WhatsApp contact number is not available",
                      ),
                    );
                  }
                }}
              >
                <MessageCircle className="h-5 w-5" />
                <span>{t("طلب عبر واتساب", "Inquire via WhatsApp")}</span>
              </Button>
            </div>
          ) : selectedVariantOutOfStock ? (
            settings?.back_in_stock_enabled !== false ? (
              <div className="space-y-3">
                <NotifyMeForm brandId={brand.id} productId={product.id} variantId={variant?.id} />
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-center text-sm font-medium text-muted-foreground">
                {t("هذا المنتج غير متوفر حالياً", "This product is currently out of stock")}
              </div>
            )
          ) : (
            <div className="hidden md:flex gap-2">
              <Button
                className="flex-1 h-12 font-semibold shadow-sm hover:opacity-90 bg-primary text-primary-foreground gap-2"
                disabled={selectedVariantOutOfStock}
                aria-disabled={selectedVariantOutOfStock ? "true" : undefined}
                onClick={() => doAdd(false)}
              >
                {isTailoringActive ? (
                  <Sparkles className="h-4 w-4" />
                ) : (
                  <ShoppingBag className="h-4 w-4" />
                )}
                <span>
                  {isTailoringActive
                    ? vocabulary.custom_order?.[lang]
                      ? lang === "ar"
                        ? `طلب ${vocabulary.custom_order[lang]} القطعة`
                        : `Order ${vocabulary.custom_order[lang]} Piece`
                      : t("طلب تجهيز القطعة", "Order Custom Piece")
                    : t("أضف للسلة", "Add to cart")}
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-12 border-2 font-semibold hover:opacity-90"
                disabled={selectedVariantOutOfStock}
                aria-disabled={selectedVariantOutOfStock ? "true" : undefined}
                onClick={() => doAdd(true)}
              >
                {isTailoringActive
                  ? vocabulary.custom_order?.[lang]
                    ? lang === "ar"
                      ? `إتمام طلب ال${vocabulary.custom_order[lang]}`
                      : `Complete ${vocabulary.custom_order[lang]}`
                    : t("إتمام الطلب الآن", "Complete Order Now")
                  : t("اشتر الآن", "Buy now")}
              </Button>
            </div>
          )}

          {settings.delivery_estimate_enabled !== false && !isCatalogMode(settings) && (
            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <Truck className="h-4 w-4 text-primary shrink-0" />
              <span className="font-medium text-foreground">
                {lang === "ar"
                  ? settings.delivery_estimate_ar ||
                    "التوصيل المتوقع خلال 24 - 48 ساعة داخل البحرين"
                  : settings.delivery_estimate_en || "Estimated delivery within 24 - 48 hours"}
              </span>
            </div>
          )}

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

function RecommendationRail({
  title,
  products,
}: {
  title: string;
  products: RecommendationProduct[];
}) {
  const { brand, currency, lang, t, settings } = useStorefront();

  return (
    <section aria-label={title} className="w-full overflow-hidden">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="font-display text-xl sm:text-2xl">{title}</h2>
        <span className="hidden text-xs text-muted-foreground sm:block">
          {t("اسحب للمزيد", "Scroll for more")}
        </span>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-4 sm:px-0 [scrollbar-width:thin]">
        {products.map((item) => {
          const variants = item.product_variants
            .filter((variant) => Number(variant.selling_price || 0) >= 0)
            .sort((a, b) => Number(a.selling_price) - Number(b.selling_price));
          const discounted = variants.find(
            (variant) => Number(variant.original_price || 0) > Number(variant.selling_price || 0),
          );
          const priced = discounted ?? variants[0];
          const media = Array.isArray(item.media)
            ? (item.media as Array<{ type: string; url: string }>)
            : [];
          const cover = media.find((entry) => entry.type === "image")?.url || item.image_url;
          const name = pickName(lang, item);

          return (
            <Link
              key={item.id}
              to="/$slug/product/$id"
              params={{ slug: brand.slug, id: item.id }}
              className="group w-[8.75rem] shrink-0 snap-start sm:w-[10.5rem]"
              onClick={() => {
                void trackProductEngagement(brand.slug, item.id, "click");
              }}
            >
              <div className="aspect-[3/4] overflow-hidden rounded-xl bg-muted">
                {cover ? (
                  <ResponsiveImage
                    src={cover}
                    preset="thumb"
                    sizes="(min-width: 640px) 168px, 140px"
                    alt={name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid h-full place-items-center px-3 text-center text-xs text-muted-foreground">
                    {t("لا توجد صورة", "No image")}
                  </div>
                )}
              </div>
              <div className="mt-2 min-w-0">
                <div className="line-clamp-2 min-h-10 text-sm font-medium leading-5">{name}</div>
                {priced && (
                  <div
                    className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs font-semibold"
                    style={{ color: "var(--sf-heading)" }}
                  >
                    {!shouldShowPrices(settings) ? (
                      <span className="font-normal text-muted-foreground">
                        {t("تواصل معنا للسعر", "Contact us for price")}
                      </span>
                    ) : (
                      <>
                        <span>{formatPrice(Number(priced.selling_price), currency, lang)}</span>
                        {Number(priced.original_price || 0) > Number(priced.selling_price) && (
                          <span className="font-normal text-muted-foreground line-through">
                            {formatPrice(Number(priced.original_price), currency, lang)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
