import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  publicSupabase as supabase,
  supabase as authenticatedSupabase,
} from "@/integrations/supabase/client";
import {
  useStorefront,
  formatPrice,
  pickName,
  pickDescription,
  useStoreModules,
} from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo, useRef, useEffect } from "react";
import { formatSizeWithUnit } from "@/lib/format";
import { translateOptionValue } from "@/lib/variant-i18n";
import {
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  AlertCircle,
  Heart,
  Upload,
  X,
  Loader2,
  Ruler,
  Scissors,
  Sparkles,
  Check,
  Truck,
  FileText,
  MessageCircle,
} from "lucide-react";
import { isCatalogMode, shouldShowPrices, buildWhatsAppInquiryUrl } from "@/lib/storefront-mode";
import { AddonSlot } from "@/components/addons/AddonSlot";
import { useAddons } from "@/components/addons/AddonsProvider";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { variantAxisDefaultsFrom, resolveAllVariantAxes } from "@/lib/addons/addon-registry";
import { formatCustomField } from "@/lib/addons/custom-fields";
import { ProductShareModal } from "@/components/storefront/ProductShareModal";
import { trackProductEngagement } from "@/lib/storefront-tracking";
import { toast } from "sonner";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";
import {
  fetchActiveBrandIdentity,
  fetchBestSellerRows,
  fetchProductDetail,
  fetchRecommendationCatalog,
} from "@/lib/storefront-queries";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { isPlaceholderVariant } from "@/lib/variant-sku-utils";

export const Route = createFileRoute("/$slug/product/$id")({
  loader: async ({ params }) => {
    const brand = await fetchActiveBrandIdentity(params.slug);
    if (!brand) return { product: null, recommendationCatalog: [], bestSellerRows: [] };

    const [product, recommendationCatalog, bestSellerRows] = await Promise.all([
      fetchProductDetail(brand.id, params.id),
      fetchRecommendationCatalog(brand.id),
      fetchBestSellerRows(brand.slug, 10),
    ]);

    return { product: product as any, recommendationCatalog, bestSellerRows };
  },
  head: ({ loaderData, params }) => {
    const product = loaderData?.product as Product | null | undefined;
    if (!product) return { meta: [{ title: "Product not found" }] };

    const name = product.name_ar || product.name_en || product.name;
    const description = (
      product.description_ar ||
      product.description_en ||
      product.description ||
      name
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    const title = `${name} | ${params.slug.toUpperCase()}`;
    const image = product.image_url || undefined;

    return {
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
    };
  },
  component: ProductDetail,
});

type Variant = {
  id: string;
  size: string | null;
  size_unit: string | null;
  color: string | null;
  fabric: string | null;
  option_four?: string | null;
  option_five?: string | null;
  selling_price: number;
  original_price: number | null;
  stock_main: number;
  stock_incubator?: number;
  image_url?: string | null;
};

type CustomField = {
  key: string;
  label_ar: string | null;
  label_en: string | null;
  type: "text" | "number" | "select" | "file";
  options?: string[];
  required?: boolean;
};

type Product = {
  id: string;
  category: string | null;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  image_url: string | null;
  media: unknown;
  custom_fields: CustomField[] | null;
  product_variants: Variant[];
  base_price?: number | null;
  original_price?: number | null;
  is_made_to_order?: boolean | null;
  variant_label_size_ar?: string | null;
  variant_label_size_en?: string | null;
  variant_label_color_ar?: string | null;
  variant_label_color_en?: string | null;
  variant_label_fabric_ar?: string | null;
  variant_label_fabric_en?: string | null;
  variant_label_four_ar?: string | null;
  variant_label_four_en?: string | null;
  variant_label_five_ar?: string | null;
  variant_label_five_en?: string | null;
};

type RecommendationProduct = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  category: string | null;
  image_url: string | null;
  media: unknown;
  is_made_to_order?: boolean | null;
  product_variants: Array<{
    id: string;
    selling_price: number;
    original_price: number | null;
    stock_main: number;
    stock_incubator?: number;
  }>;
};

/** Natural sort key: extract leading number so "52" < "54" < "60". */
function variantSortKey(v: Variant): [number, string] {
  const label = [v.size, v.color, v.fabric].filter(Boolean).join(" · ");
  const m = /-?\d+(?:\.\d+)?/.exec(label);
  const num = m ? Number(m[0]) : Number.POSITIVE_INFINITY;
  return [num, label.toLowerCase()];
}

const COLOR_MAP: Record<string, string> = {
  black: "#0b0c10",
  white: "#ffffff",
  blue: "#2563eb",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#eab308",
  orange: "#ea580c",
  purple: "#9333ea",
  pink: "#db2777",
  brown: "#78350f",
  grey: "#4b5563",
  gray: "#4b5563",
  navy: "#1e3a8a",
  teal: "#0d9488",
  gold: "#d97706",
  silver: "#9ca3af",
  beige: "#f5f5dc",
  burgundy: "#800020",
  maroon: "#800020",
  olive: "#556b2f",
  nude: "#e3bc9a",
  camel: "#c19a6b",
  sand: "#e0cda3",
  taupe: "#483c32",
  charcoal: "#36454f",
  ivory: "#fffff0",
  cream: "#fffdd0",
  lilac: "#c8a2c8",
  lavender: "#e6e6fa",
  mint: "#98ff98",

  // Arabic with & without hamza
  أسود: "#0b0c10",
  اسود: "#0b0c10",
  فاحم: "#0b0c10",
  أبيض: "#ffffff",
  ابيض: "#ffffff",
  سكري: "#fcfbf4",
  أوفوايت: "#f8f6f0",
  افوايت: "#f8f6f0",
  "أوف وايت": "#f8f6f0",
  "اف وايت": "#f8f6f0",
  عاجي: "#fffff0",
  أزرق: "#2563eb",
  ازرق: "#2563eb",
  سماوي: "#38bdf8",
  كحلي: "#1e3a8a",
  نيفي: "#1e3a8a",
  أحمر: "#dc2626",
  احمر: "#dc2626",
  عنابي: "#800020",
  ماروني: "#800020",
  خمري: "#722f37",
  أخضر: "#16a34a",
  اخضر: "#16a34a",
  زيتي: "#4e5d2c",
  زيتوني: "#556b2f",
  أصفر: "#eab308",
  اصفر: "#eab308",
  خردلي: "#e3a857",
  برتقالي: "#ea580c",
  مشمشي: "#fbceb1",
  بنفسجي: "#9333ea",
  موف: "#9932cc",
  ليلك: "#c8a2c8",
  لافندر: "#e6e6fa",
  وردي: "#db2777",
  زهري: "#ff2a8d",
  روز: "#ff007f",
  خربزي: "#f88379",
  بني: "#78350f",
  عسلي: "#d4a373",
  جملي: "#c19a6b",
  تراكوتا: "#e2725b",
  رمادي: "#4b5563",
  رصاصي: "#71717a",
  فحمي: "#36454f",
  بيج: "#f5f5dc",
  لحمي: "#e3bc9a",
  نودي: "#e3bc9a",
  ذهبي: "#d97706",
  فضي: "#9ca3af",
};

function resolveColorHex(rawColor: string): string | null {
  if (!rawColor) return null;
  const trimmed = rawColor.trim();

  // If valid CSS hex code
  if (/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(trimmed)) {
    return trimmed;
  }

  const key = trimmed.toLowerCase();
  if (COLOR_MAP[key]) return COLOR_MAP[key];

  // Strip Arabic hamzas and tatweel
  const normalized = key.replace(/[أإآ]/g, "ا").replace(/ـ/g, "").trim();

  if (COLOR_MAP[normalized]) return COLOR_MAP[normalized];

  // Keyword matching for compound color names
  if (/اسود|أسود|black|فاحم/.test(normalized)) return "#0b0c10";
  if (/ابيض|أبيض|white|سكري|عاجي|افوايت|أوفوايت/.test(normalized)) return "#ffffff";
  if (/كحلي|navy|نيفي/.test(normalized)) return "#1e3a8a";
  if (/عنابي|ماروني|خمري|burgundy|maroon/.test(normalized)) return "#800020";
  if (/زيتي|زيتوني|olive/.test(normalized)) return "#4e5d2c";
  if (/بني|brown|جملي|camel/.test(normalized)) return "#78350f";
  if (/بيج|beige|لحمي|نودي|nude|sand/.test(normalized)) return "#f5f5dc";
  if (/رمادي|رصاصي|فحمي|gray|grey|charcoal/.test(normalized)) return "#4b5563";
  if (/ازرق|أزرق|سماوي|blue/.test(normalized)) return "#2563eb";
  if (/احمر|أحمر|red/.test(normalized)) return "#dc2626";
  if (/اخضر|أخضر|green/.test(normalized)) return "#16a34a";
  if (/وردي|زهري|روز|pink/.test(normalized)) return "#db2777";
  if (/بنفسجي|موف|ليلك|purple/.test(normalized)) return "#9333ea";
  if (/ذهبي|gold/.test(normalized)) return "#d97706";
  if (/فضي|silver/.test(normalized)) return "#9ca3af";

  return null;
}

const parsePriceDelta = (valStr: string): number => {
  if (!valStr) return 0;
  const match = /\+\s*(\d+(?:\.\d+)?)\s*(?:BHD|BHD\b|د\.ب|BHD|BD\b|BD)?/i.exec(valStr);
  if (match) {
    return Number(match[1]);
  }
  return 0;
};

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
  const { brand, settings, currency, lang, t, addToCart, isWishlisted, toggleWishlist, session } =
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

  const { data: product, isLoading } = useQuery({
    queryKey: ["storefront", brand.slug, "product", id],
    initialData: loaderData?.product ?? undefined,
    queryFn: async () => {
      const primaryFields =
        "id, category, name, name_ar, name_en, description, description_ar, description_en, image_url, media, custom_fields, is_made_to_order, base_price, size_guide_id, size_guide_hidden, product_variants(id, size, size_unit, color, fabric, option_four, option_five, selling_price, original_price, stock_main, stock_incubator, image_url)";
      const fullFields = `${primaryFields}, variant_label_size_ar, variant_label_size_en, variant_label_color_ar, variant_label_color_en, variant_label_fabric_ar, variant_label_fabric_en, variant_label_four_ar, variant_label_four_en, variant_label_five_ar, variant_label_five_en`;

      const fetchByTargetId = async (targetId: string) => {
        // Try full fields with custom variant labels
        const { data: fullData, error: fullError } = await supabase
          .from("products")
          .select(fullFields)
          .eq("id", targetId)
          .eq("brand_id", brand.id)
          .eq("is_active", true)
          .maybeSingle();

        if (fullData) return fullData as unknown as Product;

        // Resilient fallback if full fields query fails due to missing column permissions
        if (fullError) {
          const { data: fallbackData } = await supabase
            .from("products")
            .select(primaryFields)
            .eq("id", targetId)
            .eq("brand_id", brand.id)
            .eq("is_active", true)
            .maybeSingle();

          if (fallbackData) return fallbackData as unknown as Product;
        }

        return null;
      };

      // 1. Try direct exact match with id
      const directData = await fetchByTargetId(id);
      if (directData) return directData;

      // 2. Extract full path after /product/ to catch corrupted URLs with slashes (e.g. 6d8a9ec5-ed96-461b-b5/a-33d84/9e04b8)
      let fullPathSuffix = id;
      if (typeof window !== "undefined") {
        const match = window.location.pathname.match(/\/product\/(.+)$/i);
        if (match?.[1]) {
          fullPathSuffix = decodeURIComponent(match[1]);
        }
      }

      // Repair corrupted URL where '7' was replaced by '/' or encoded
      const repairedId = fullPathSuffix.replace(/\//g, "7").trim();
      if (repairedId && repairedId !== id) {
        const repairedData = await fetchByTargetId(repairedId);
        if (repairedData) {
          // Silently clean up browser URL to canonical format
          if (typeof window !== "undefined" && window.history?.replaceState) {
            const canonicalUrl = `/${brand.slug}/product/${repairedData.id}`;
            window.history.replaceState(null, "", canonicalUrl);
          }
          return repairedData;
        }
      }

      return null;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });


  useEffect(() => {
    if (!product) return;
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
  }, [product, currency, lang]);

  const { data: recommendationCatalog = [] } = useQuery({
    queryKey: ["storefront", brand.slug, "product-recommendations"],
    initialData: loaderData?.recommendationCatalog ?? undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, name_ar, name_en, category, image_url, media, product_variants(id, selling_price, original_price, stock_main)",
        )
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RecommendationProduct[];
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: bestSellerRows = [] } = useQuery({
    queryKey: ["storefront", brand.slug, "best-sellers"],
    initialData: loaderData?.bestSellerRows ?? undefined,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_storefront_best_sellers", {
        p_brand_slug: brand.slug,
        p_limit: 10,
      });
      if (error) throw error;
      return (data ?? []) as Array<{ product_id: string; units_sold: number }>;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
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
    const list = product?.product_variants ?? [];
    return [...list].sort((a, b) => {
      const [an, al] = variantSortKey(a);
      const [bn, bl] = variantSortKey(b);
      if (an !== bn) return an - bn;
      return al.localeCompare(bl, undefined, { numeric: true, sensitivity: "base" });
    });
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

  const uniqueColors = useMemo(() => {
    const colors = variants.map((v) => v.color).filter(Boolean) as string[];
    return Array.from(new Set(colors));
  }, [variants]);

  const uniqueSizes = useMemo(() => {
    const allPlaceholder = variants.length > 0 && variants.every(isPlaceholderVariant);
    const sizes = variants
      .filter((v) => !allPlaceholder || !isPlaceholderVariant(v))
      .map((v) => v.size)
      .filter(Boolean) as string[];
    return Array.from(new Set(sizes));
  }, [variants]);

  const uniqueFabrics = useMemo(() => {
    const fabrics = variants.map((v) => v.fabric).filter(Boolean) as string[];
    return Array.from(new Set(fabrics));
  }, [variants]);

  const uniqueFour = useMemo(() => {
    const opts = variants.map((v) => v.option_four).filter(Boolean) as string[];
    return Array.from(new Set(opts));
  }, [variants]);

  const uniqueFive = useMemo(() => {
    const opts = variants.map((v) => v.option_five).filter(Boolean) as string[];
    return Array.from(new Set(opts));
  }, [variants]);

  const addonAxisDefaults = useMemo(() => variantAxisDefaultsFrom(addons), [addons]);
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
  const isColorOutOfStock = useMemo(() => {
    return uniqueColors.reduce(
      (acc, col) => {
        const matching = variants.filter((v) => {
          const colorMatch = v.color === col;
          const sizeMatch = !selectedSize || v.size === selectedSize;
          const fabricMatch = !selectedFabric || v.fabric === selectedFabric;
          const fourMatch = !selectedOptionFour || v.option_four === selectedOptionFour;
          const fiveMatch = !selectedOptionFive || v.option_five === selectedOptionFive;
          return colorMatch && sizeMatch && fabricMatch && fourMatch && fiveMatch;
        });
        acc[col] =
          matching.length === 0 ||
          matching.every((v) => Number(v.stock_main ?? 0) + Number(v.stock_incubator ?? 0) <= 0);
        return acc;
      },
      {} as Record<string, boolean>,
    );
  }, [
    uniqueColors,
    selectedSize,
    selectedFabric,
    selectedOptionFour,
    selectedOptionFive,
    variants,
  ]);

  const isSizeOutOfStock = useMemo(() => {
    return uniqueSizes.reduce(
      (acc, sz) => {
        const matching = variants.filter((v) => {
          const sizeMatch = v.size === sz;
          const colorMatch = !selectedColor || v.color === selectedColor;
          const fabricMatch = !selectedFabric || v.fabric === selectedFabric;
          const fourMatch = !selectedOptionFour || v.option_four === selectedOptionFour;
          const fiveMatch = !selectedOptionFive || v.option_five === selectedOptionFive;
          return colorMatch && sizeMatch && fabricMatch && fourMatch && fiveMatch;
        });
        acc[sz] =
          matching.length === 0 ||
          matching.every((v) => Number(v.stock_main ?? 0) + Number(v.stock_incubator ?? 0) <= 0);
        return acc;
      },
      {} as Record<string, boolean>,
    );
  }, [
    uniqueSizes,
    selectedColor,
    selectedFabric,
    selectedOptionFour,
    selectedOptionFive,
    variants,
  ]);

  const isFabricOutOfStock = useMemo(() => {
    return uniqueFabrics.reduce(
      (acc, fb) => {
        const matching = variants.filter((v) => {
          const fabricMatch = v.fabric === fb;
          const colorMatch = !selectedColor || v.color === selectedColor;
          const sizeMatch = !selectedSize || v.size === selectedSize;
          const fourMatch = !selectedOptionFour || v.option_four === selectedOptionFour;
          const fiveMatch = !selectedOptionFive || v.option_five === selectedOptionFive;
          return colorMatch && sizeMatch && fabricMatch && fourMatch && fiveMatch;
        });
        acc[fb] =
          matching.length === 0 ||
          matching.every((v) => Number(v.stock_main ?? 0) + Number(v.stock_incubator ?? 0) <= 0);
        return acc;
      },
      {} as Record<string, boolean>,
    );
  }, [
    uniqueFabrics,
    selectedColor,
    selectedSize,
    selectedOptionFour,
    selectedOptionFive,
    variants,
  ]);

  const isVisualColorAxis = useMemo(() => {
    const label = (resolvedAxes.color.label || "").toLowerCase();
    const isColorLabel = label.includes("لون") || label.includes("color");
    const hasHexMatch = uniqueColors.some((c) => Boolean(resolveColorHex(c)));
    return isColorLabel && hasHexMatch;
  }, [resolvedAxes.color.label, uniqueColors]);

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
    queryKey: ["customization-options", brand.id],
    enabled: Boolean(brand.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customization_options")
        .select("*")
        .eq("brand_id", brand.id)
        .order("name");
      if (error) return [];
      return data ?? [];
    },
    staleTime: 5 * 60_000,
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
  const matchingVariants = useMemo(() => {
    return variants.filter((v) => {
      const colorMatch = !selectedColor || v.color === selectedColor;
      const sizeMatch = !selectedSize || v.size === selectedSize;
      const fabricMatch = !selectedFabric || v.fabric === selectedFabric;
      const fourMatch = !selectedOptionFour || v.option_four === selectedOptionFour;
      const fiveMatch = !selectedOptionFive || v.option_five === selectedOptionFive;
      return colorMatch && sizeMatch && fabricMatch && fourMatch && fiveMatch;
    });
  }, [
    selectedColor,
    selectedSize,
    selectedFabric,
    selectedOptionFour,
    selectedOptionFive,
    variants,
  ]);

  // Compute prices for matching variants
  const matchingPrices = useMemo(() => {
    return matchingVariants.map((v) => Number(v.selling_price || basePrice) + selectedAddOnPrice);
  }, [matchingVariants, basePrice, selectedAddOnPrice]);

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

  const minMatchingPrice =
    matchingPrices.length > 0 ? Math.min(...matchingPrices) : basePrice + selectedAddOnPrice;
  const maxMatchingPrice =
    matchingPrices.length > 0 ? Math.max(...matchingPrices) : basePrice + selectedAddOnPrice;

  // Single matched variant (if unique)
  const isUniqueVariantMatched = matchingVariants.length === 1;
  const matchedVariant = isUniqueVariantMatched ? matchingVariants[0] : null;

  // Final displayPrice (use the unique matched variant, or fallback to minMatchingPrice)
  const displayPrice = matchedVariant
    ? Number(matchedVariant.selling_price || basePrice) + selectedAddOnPrice
    : minMatchingPrice;

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
  const variantPriceDelta = variant ? Number(variant.selling_price || basePrice) - basePrice : 0;
  const variantOriginalDelta = variant
    ? Number(variant.original_price || basePrice) - basePrice
    : 0;
  const productOriginalPrice = Number((product as any).original_price || 0);

  const originalPrice =
    !isRange && variantOriginalDelta > variantPriceDelta
      ? basePrice + variantOriginalDelta
      : !isRange && productOriginalPrice > basePrice
        ? productOriginalPrice + variantPriceDelta
        : 0;

  const originalPriceWithAddons = originalPrice > 0 ? originalPrice + selectedAddOnPrice : 0;
  const discountPercent =
    originalPriceWithAddons > displayPrice
      ? Math.round((1 - displayPrice / originalPriceWithAddons) * 100)
      : 0;

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

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 sm:py-8 pb-28 md:pb-10">
      <div className="grid md:grid-cols-12 gap-6 lg:gap-10 items-start">
        <div className="md:col-span-5 max-w-[420px] mx-auto md:max-w-none w-full">
          <div className="relative aspect-[3/4] max-h-[500px] bg-muted rounded-2xl overflow-hidden shadow-sm border border-border-subtle mx-auto w-full">
            {media.length > 0 ? (
              <>
                {media[mediaIdx % media.length].type === "video" ? (
                  <OptimizedVideo
                    src={
                      media[mediaIdx % media.length].stream_iframe_url
                        ? undefined
                        : media[mediaIdx % media.length].url
                    }
                    streamIframeUrl={media[mediaIdx % media.length].stream_iframe_url}
                    poster={
                      media[mediaIdx % media.length].poster_url ??
                      media[mediaIdx % media.length].url
                    }
                    className="h-full w-full object-cover"
                    wrapperClassName="h-full w-full overflow-hidden bg-black/90"
                    autoPlay
                    loop
                    muted
                    playsInline
                    controls
                  />
                ) : (
                  <ResponsiveImage
                    src={media[mediaIdx % media.length].url}
                    preset="product"
                    sizes="(min-width: 1024px) 55vw, 100vw"
                    alt={displayName}
                    className="w-full h-full object-cover"
                    fetchPriority="high"
                    loading="eager"
                  />
                )}
                {media.length > 1 && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setMediaIdx((i) => (i - 1 + media.length) % media.length)}
                      className="absolute top-1/2 left-3 -translate-y-1/2 h-11 w-11 bg-background/90 hover:bg-background text-foreground rounded-full shadow-md border border-border-subtle transition-transform active:scale-95 z-20"
                      aria-label="Previous media"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setMediaIdx((i) => (i + 1) % media.length)}
                      className="absolute top-1/2 right-3 -translate-y-1/2 h-11 w-11 bg-background/90 hover:bg-background text-foreground rounded-full shadow-md border border-border-subtle transition-transform active:scale-95 z-20"
                      aria-label="Next media"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </>
                )}
              </>
            ) : (
              <div className="w-full h-full grid place-items-center text-muted-foreground">
                {t("لا توجد صورة", "No image")}
              </div>
            )}
          </div>
          {media.length > 1 && (
            <div className="mt-3 flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
              {media.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setMediaIdx(i)}
                  className={`relative h-18 w-18 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                    i === mediaIdx % media.length
                      ? "ring-2 ring-primary border-primary shadow-sm opacity-100"
                      : "border-border-subtle hover:border-primary/50 opacity-75 hover:opacity-100"
                  }`}
                  style={i === mediaIdx % media.length ? { borderColor: primary } : undefined}
                >
                  {m.type === "video" ? (
                    <div className="relative w-full h-full bg-black/90 flex items-center justify-center">
                      {m.poster_url || m.url ? (
                        <img
                          src={m.poster_url || m.url}
                          alt=""
                          className="w-full h-full object-cover opacity-60"
                        />
                      ) : null}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="h-6 w-6 rounded-full bg-white/90 text-black flex items-center justify-center text-xs font-bold shadow-md">
                          ▶
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ResponsiveImage
                      src={m.url}
                      preset="thumb"
                      sizes="80px"
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="md:col-span-7">
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
          {displayDescription && (
            <p className="text-muted-foreground mb-4 sm:mb-6 whitespace-pre-line text-sm sm:text-base">
              {displayDescription}
            </p>
          )}

          {(hasVariants || customFields.length > 0) && (
            <div ref={optionsRef} className="mb-6 space-y-4 scroll-mt-24">
              {showSizeModeToggle && (
                <div className="rounded-xl border bg-muted/30 p-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                    {t("طريقة اختيار المقاس", "Sizing Method")}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={sizeMode === "ready" ? "default" : "outline"}
                      onClick={() => {
                        setSizeMode("ready");
                        setErrorMsg(null);
                        setCfValues((prev) => {
                          const next = { ...prev };
                          Object.keys(next).forEach((k) => {
                            if (isMeasurementField(k)) {
                              delete next[k];
                            }
                          });
                          return next;
                        });
                        setMeasurementsApplied(false);
                      }}
                      className={`h-11 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                        sizeMode === "ready" ? "shadow-sm" : ""
                      }`}
                    >
                      <Ruler className="h-4 w-4" />
                      <span>{t("مقاس جاهز", "Ready Size")}</span>
                    </Button>
                    <Button
                      type="button"
                      variant={sizeMode === "custom" ? "default" : "outline"}
                      onClick={() => {
                        setSizeMode("custom");
                        setErrorMsg(null);
                      }}
                      className={`h-11 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                        sizeMode === "custom" ? "shadow-sm" : ""
                      }`}
                    >
                      <Scissors className="h-4 w-4" />
                      <span>
                        {vocabulary.custom_sizing?.[lang] || t("مقاس مخصص", "Custom Size")}
                      </span>
                    </Button>
                  </div>
                </div>
              )}

              {!showSizeModeToggle && isMadeToOrder && !hasReadySizes && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm font-bold text-foreground">
                        {vocabulary.made_to_order?.[lang] || t("صنع حسب الطلب", "Made to Order")}
                      </span>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {vocabulary.custom_order?.[lang] || t("خاص", "Bespoke")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t(
                      "يتم تجهيز هذه القطعة خصيصاً على قياساتكِ الفردية لضمان أفضل ملاءمة وأناقة.",
                      "This piece is tailored specifically to your personal measurements for a perfect fit.",
                    )}
                  </p>
                  <div className="pt-2 flex items-center justify-between border-t border-primary/10">
                    <span className="text-xs text-muted-foreground">
                      {t("تحتاجين مساعدة في القياسات؟", "Need measuring guidance?")}
                    </span>
                    <AddonSlot
                      placement="storefront.product.optionsAside"
                      props={{
                        product,
                        selectedSize: null,
                        uniqueSizes: [],
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 🔵 Circular Color Swatches OR 🏷️ Option Pills (Flavors / Types / Roasts) */}
              {uniqueColors.length > 0 &&
                (resolvedAxes.color.visible || uniqueColors.length > 1) && (
                  <div>
                    <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <span>
                        {resolvedAxes.color.label || (lang === "ar" ? "الخيار" : "Option")}:
                      </span>
                      {selectedColor && (
                        <span className="text-muted-foreground font-normal">
                          {translateOptionValue(selectedColor, lang)}
                        </span>
                      )}
                    </div>
                    {isVisualColorAxis ? (
                      <div className="flex flex-wrap gap-2.5">
                        {uniqueColors.map((color) => {
                          const active = selectedColor === color;
                          const oos = !isTailoringActive && Boolean(isColorOutOfStock[color]);
                          const hex = resolveColorHex(color);
                          const ringStyle = active ? { borderColor: primary } : {};
                          const localizedColor = translateOptionValue(color, lang);
                          return (
                            <Button
                              key={color}
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedColor(color);
                                setErrorMsg(null);
                              }}
                              className={`h-11 w-11 rounded-full border-2 p-0 relative ${
                                active
                                  ? "scale-110 shadow-sm"
                                  : "border-transparent hover:scale-105"
                              } ${oos ? "opacity-45 cursor-not-allowed" : ""}`}
                              style={ringStyle}
                              title={
                                localizedColor +
                                (oos ? ` (${t("غير متوفر جاهز", "out of ready stock")})` : "")
                              }
                              aria-label={localizedColor}
                            >
                              {hex ? (
                                <span
                                  className="h-7 w-7 rounded-full border shadow-inner block relative overflow-hidden"
                                  style={{ backgroundColor: hex }}
                                >
                                  {oos && (
                                    <span className="absolute inset-0 w-full h-[2px] bg-destructive/80 rotate-45 origin-center top-1/2 -translate-y-1/2" />
                                  )}
                                </span>
                              ) : (
                                <span className="h-7 w-7 rounded-full border bg-muted flex items-center justify-center text-xs font-bold uppercase truncate shadow-inner relative overflow-hidden">
                                  {localizedColor.slice(0, 2)}
                                  {oos && (
                                    <span className="absolute inset-0 w-full h-[2px] bg-destructive/80 rotate-45 origin-center top-1/2 -translate-y-1/2" />
                                  )}
                                </span>
                              )}
                            </Button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {uniqueColors.map((color) => {
                          const active = selectedColor === color;
                          const oos = !isTailoringActive && Boolean(isColorOutOfStock[color]);
                          return (
                            <Button
                              key={color}
                              type="button"
                              variant={active ? "default" : "outline"}
                              onClick={() => {
                                setSelectedColor(color);
                                setErrorMsg(null);
                              }}
                              className={`min-h-11 px-4 py-2 rounded-lg text-sm font-medium ${
                                oos
                                  ? "line-through opacity-45 cursor-not-allowed bg-muted text-muted-foreground border-dashed"
                                  : ""
                              }`}
                            >
                              {translateOptionValue(color, lang)}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              {/* 📏 Size Selection Pills (if any) */}
              {uniqueSizes.length > 0 &&
                resolvedAxes.size.visible &&
                (!showSizeModeToggle || sizeMode === "ready") && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold flex items-center gap-1.5">
                        <span>{resolvedAxes.size.label}:</span>
                        {selectedSize && (
                          <span className="text-muted-foreground font-normal">
                            {formatSizeWithUnit(
                              selectedSize,
                              variants.find((v) => v.size === selectedSize && v.size_unit)
                                ?.size_unit ||
                                variants.find((v) => v.size === selectedSize)?.size_unit,
                              lang,
                            )}
                          </span>
                        )}
                      </div>
                      <AddonSlot
                        placement="storefront.product.optionsAside"
                        props={{
                          product,
                          selectedSize,
                          onSelectSize: (sz: string) => setSelectedSize(sz),
                          uniqueSizes,
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {uniqueSizes.map((sz) => {
                        const active = selectedSize === sz;
                        const matchingVariant = variants.find((v) => v.size === sz && v.size_unit);
                        const unit =
                          matchingVariant?.size_unit ||
                          variants.find((v) => v.size === sz)?.size_unit;
                        const sizeLabel = formatSizeWithUnit(sz, unit, lang);
                        const oos =
                          isSizeOutOfStock[sz] ||
                          Number(
                            variants
                              .filter((v) => v.size === sz)
                              .reduce(
                                (acc, v) =>
                                  acc + Number(v.stock_main || 0) + Number(v.stock_incubator || 0),
                                0,
                              ),
                          ) <= 0;
                        return (
                          <Button
                            key={sz}
                            type="button"
                            variant={active ? "default" : "outline"}
                            onClick={() => {
                              setSelectedSize(sz);
                              setErrorMsg(null);
                            }}
                            className={`min-h-11 px-4 py-2 rounded-lg text-sm font-medium ${
                              oos
                                ? "line-through opacity-45 cursor-not-allowed bg-muted text-muted-foreground border-dashed"
                                : ""
                            }`}
                          >
                            {sizeLabel}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* 🧵 Fabric Selection Pills (if any) */}
              {uniqueFabrics.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <span>{resolvedAxes.fabric.label || (lang === "ar" ? "الخامة" : "Fabric")}:</span>
                    {selectedFabric && (
                      <span className="text-muted-foreground font-normal">
                        {translateOptionValue(selectedFabric, lang)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {uniqueFabrics.map((fb) => {
                      const active = selectedFabric === fb;
                      const oos =
                        !isTailoringActive &&
                        (isFabricOutOfStock[fb] ||
                          Number(
                            variants
                              .filter((v) => v.fabric === fb)
                              .reduce(
                                (acc, v) =>
                                  acc + Number(v.stock_main || 0) + Number(v.stock_incubator || 0),
                                0,
                              ),
                          ) <= 0);
                      return (
                        <Button
                          key={fb}
                          type="button"
                          variant={active ? "default" : "outline"}
                          onClick={() => {
                            setSelectedFabric(fb);
                            setErrorMsg(null);
                          }}
                          className={`min-h-11 px-4 py-2 rounded-lg text-sm font-medium ${
                            oos
                              ? "line-through opacity-45 cursor-not-allowed bg-muted text-muted-foreground border-dashed"
                              : ""
                          }`}
                        >
                          {translateOptionValue(fb, lang)}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 🏷️ Option Four Selection Pills (if any) */}
              {uniqueFour.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <span>{resolvedAxes.four.label || (lang === "ar" ? "الخيار 4" : "Option 4")}:</span>
                    {selectedOptionFour && (
                      <span className="text-muted-foreground font-normal">
                        {translateOptionValue(selectedOptionFour, lang)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {uniqueFour.map((opt) => {
                      const active = selectedOptionFour === opt;
                      return (
                        <Button
                          key={opt}
                          type="button"
                          variant={active ? "default" : "outline"}
                          onClick={() => {
                            setSelectedOptionFour(opt);
                            setErrorMsg(null);
                          }}
                          className="min-h-11 px-4 py-2 rounded-lg text-sm font-medium"
                        >
                          {translateOptionValue(opt, lang)}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 🏷️ Option Five Selection Pills (if any) */}
              {uniqueFive.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <span>{resolvedAxes.five.label || (lang === "ar" ? "الخيار 5" : "Option 5")}:</span>
                    {selectedOptionFive && (
                      <span className="text-muted-foreground font-normal">
                        {translateOptionValue(selectedOptionFive, lang)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {uniqueFive.map((opt) => {
                      const active = selectedOptionFive === opt;
                      return (
                        <Button
                          key={opt}
                          type="button"
                          variant={active ? "default" : "outline"}
                          onClick={() => {
                            setSelectedOptionFive(opt);
                            setErrorMsg(null);
                          }}
                          className="min-h-11 px-4 py-2 rounded-lg text-sm font-medium"
                        >
                          {translateOptionValue(opt, lang)}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Fallback general buttons if no properties could be isolated or visible */}
              {(!resolvedAxes.color.visible || uniqueColors.length === 0) &&
                (!resolvedAxes.size.visible || uniqueSizes.length === 0) &&
                (!resolvedAxes.fabric.visible || uniqueFabrics.length === 0) &&
                (!resolvedAxes.four.visible || uniqueFour.length === 0) &&
                (!resolvedAxes.five.visible || uniqueFive.length === 0) &&
                hasVariants &&
                (!showSizeModeToggle || sizeMode === "ready") &&
                !isTailoringActive &&
                !variants.every(isPlaceholderVariant) && (
                  <div>
                    <div className="text-sm font-medium mb-2">{t("الخيارات", "Options")}</div>
                    <div className="flex flex-wrap gap-2">
                      {variants.map((v) => {
                        const oos = Number(v.stock_main || 0) + Number(v.stock_incubator || 0) <= 0;
                        const active = v.id === variantId;
                        const label =
                          [
                            formatSizeWithUnit(v.size, v.size_unit, lang),
                            translateOptionValue(v.color, lang),
                            translateOptionValue(v.fabric, lang),
                            translateOptionValue(v.option_four, lang),
                            translateOptionValue(v.option_five, lang),
                          ]
                            .filter(Boolean)
                            .join(" · ") || t("متغيّر", "Variant");
                        return (
                          <Button
                            key={v.id}
                            type="button"
                            variant={active ? "default" : "outline"}
                            disabled={oos}
                            onClick={() => {
                              setVariantId(v.id);
                              setQty(1);
                              setErrorMsg(null);
                            }}
                            className={`min-h-11 px-4 py-2 rounded-lg text-sm font-medium ${
                              oos ? "opacity-40 line-through cursor-not-allowed" : ""
                            }`}
                            aria-pressed={active}
                          >
                            {label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>
          )}

          {applicableAddons.length > 0 && (
            <div className="mb-6 space-y-3 rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>
                  {t("الإضافات والتخصيصات المتاحة", "Available Add-ons & Customizations")}
                </span>
              </div>
              <div className="grid gap-2">
                {applicableAddons.map((addon: any) => {
                  const isSelected = selectedAddonIds.includes(addon.id);
                  const delta = Number(addon.price_delta || 0);
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() => toggleAddon(addon.id)}
                      className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-start transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5 text-primary font-medium ring-1 ring-primary"
                          : "border-border hover:border-muted-foreground/40 bg-background"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                            isSelected
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-muted-foreground/40"
                          }`}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                        </div>
                        <span className="text-sm truncate">{addon.name}</span>
                      </div>
                      {shouldShowPrices(settings) &&
                        (delta > 0 ? (
                          <span className="shrink-0 text-xs font-semibold dir-ltr">
                            + {formatPrice(delta, currency, lang)}
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs text-muted-foreground font-medium">
                            {t("مجاني", "Free")}
                          </span>
                        ))}
                    </button>
                  );
                })}
              </div>
            </div>
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
            <div className="mb-6 space-y-4 rounded-xl border bg-card p-4 shadow-sm">
              {showSizeModeToggle && sizeMode === "custom" && (
                <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-xs font-medium text-primary flex items-center gap-2 mb-2">
                  <Scissors className="h-4 w-4 shrink-0" />
                  <span>
                    {vocabulary.customization_options?.[lang] ||
                      t(
                        "يرجى إدخال تفاصيل وخيارات الطلب أدناه:",
                        "Please enter your custom details and options below:",
                      )}
                  </span>
                </div>
              )}
              {visibleCustomFields.map((f) => {
                const label = cfLabel(f);
                const val = cfValues[f.key] ?? "";
                const set = (v: string) => {
                  setCfValues((s) => ({ ...s, [f.key]: v }));
                  setErrorMsg(null);
                };
                const isUploading = uploadingField[f.key];

                const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    setUploadingField((prev) => ({ ...prev, [f.key]: true }));
                    const url = await uploadPublicMedia(brand.id, file, "product");
                    set(url);
                    toast.success(t("تم رفع الملف بنجاح", "File uploaded successfully"));
                  } catch (err: any) {
                    toast.error(err.message ?? t("فشل في رفع الملف", "File upload failed"));
                  } finally {
                    setUploadingField((prev) => ({ ...prev, [f.key]: false }));
                  }
                };

                return (
                  <div key={f.key} className="space-y-1">
                    <label className="block text-sm font-semibold mb-1">
                      {label}
                      {f.required && <span className="text-destructive ms-1">*</span>}
                    </label>
                    {f.type === "select" ? (
                      <select
                        value={val}
                        onChange={(e) => set(e.target.value)}
                        className="w-full h-11 rounded-md border border-input bg-background px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">{t("اختر...", "Select...")}</option>
                        {(f.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : f.type === "file" ? (
                      <div className="space-y-2">
                        {val ? (
                          <div className="flex items-center justify-between p-3 border rounded-xl bg-muted/30">
                            <div className="flex items-center gap-3 min-w-0">
                              {/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(val) ? (
                                <img
                                  src={val}
                                  alt=""
                                  className="h-12 w-12 rounded object-cover border"
                                />
                              ) : (
                                <div className="h-12 w-12 rounded bg-primary/10 grid place-items-center text-primary text-xs font-bold uppercase">
                                  FILE
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="text-xs text-muted-foreground truncate">
                                  {t("الملف المرفوع", "Uploaded file")}
                                </div>
                                <a
                                  href={val}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-primary font-medium hover:underline truncate block"
                                >
                                  {val}
                                </a>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => set("")}
                              aria-label={t("إزالة", "Remove")}
                              title={t("إزالة", "Remove")}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={handleFileChange}
                              className="hidden"
                              id={`file-input-${f.key}`}
                              disabled={isUploading}
                            />
                            <label
                              htmlFor={`file-input-${f.key}`}
                              className={`flex min-h-[56px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-dashed border-muted-foreground/30 px-4 py-3 text-sm font-medium transition hover:bg-muted/40 ${
                                isUploading ? "pointer-events-none opacity-50" : ""
                              }`}
                            >
                              {isUploading ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  <span className="text-muted-foreground">
                                    {t("جاري الرفع...", "Uploading...")}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Upload className="h-4 w-4 text-muted-foreground" />
                                  <span>
                                    {t(
                                      "انقر لرفع الشعار أو الملف الخاص بك",
                                      "Click to upload your logo or file",
                                    )}
                                  </span>
                                </>
                              )}
                            </label>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Input
                        type={f.type === "number" ? "number" : "text"}
                        value={val}
                        onChange={(e) => set(e.target.value)}
                        placeholder={(() => {
                          if (lang === "ar") {
                            if ((f as any).placeholder_ar) return (f as any).placeholder_ar;
                            if ((f as any).placeholder) return (f as any).placeholder;
                          } else {
                            if ((f as any).placeholder_en) return (f as any).placeholder_en;
                            if ((f as any).placeholder) return (f as any).placeholder;
                          }
                          const lStr = (
                            (lang === "ar" ? f.label_ar || f.label_en : f.label_en || f.label_ar) ||
                            f.key ||
                            ""
                          ).toLowerCase();
                          if (lStr.includes("length") || lStr.includes("طول")) {
                            return lang === "ar" ? "مثال: 56 (بالإنش)" : "e.g. 56 (in inches)";
                          }
                          if (lStr.includes("bust") || lStr.includes("صدر")) {
                            return lang === "ar" ? "مثال: 22 (بالإنش)" : "e.g. 22 (in inches)";
                          }
                          if (lStr.includes("sleeve") || lStr.includes("كم")) {
                            return lang === "ar" ? "مثال: 28 (بالإنش)" : "e.g. 28 (in inches)";
                          }
                          if (lStr.includes("shoulder") || lStr.includes("كتف")) {
                            return lang === "ar" ? "مثال: 15 (بالإنش)" : "e.g. 15 (in inches)";
                          }
                          if (/waist|hips|height|size|measurement|خصر|ورك|قياس|مقاس/.test(lStr)) {
                            return lang === "ar"
                              ? "أدخل القياس بالإنش (مثال: 56)"
                              : "Enter measurement in inches (e.g. 56)";
                          }
                          return lang === "ar"
                            ? "أدخل التفاصيل المطلوبة..."
                            : "Type required details here...";
                        })()}
                        className="w-full h-11 rounded-xl shadow-2xs"
                      />
                    )}
                  </div>
                );
              })}

              {/* 📝 Customer Tailoring & Workshop Notes Box */}
              {modules.made_to_order && (
                <div className="space-y-2 pt-3 border-t border-border-subtle">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span>
                        {vocabulary.workshop_notes_label?.[lang] ||
                          t(
                            "ملاحظات وتفاصيل التجهيز (اختياري)",
                            "Production & Workshop Notes (Optional)",
                          )}
                      </span>
                    </label>
                    <span className="text-xs sm:text-xs text-muted-foreground font-normal">
                      {vocabulary.workshop_instructions?.[lang] ||
                        t("تعليمات للورشة", "Workshop notes")}
                    </span>
                  </div>
                  <p className="text-xs sm:text-xs text-muted-foreground leading-relaxed">
                    {vocabulary.workshop_notes_placeholder?.[lang]
                      ? `${t("ملاحظات خاصة:", "Special instructions:")} ${vocabulary.workshop_notes_placeholder[lang]}`
                      : t(
                          "اكتب هنا أي تفاصيل خاصة للتجهيز ترغب بإبلاغ الورشة بها",
                          "Add any specific production instructions for the workshop",
                        )}
                  </p>
                  <Textarea
                    rows={3}
                    value={tailoringNotes}
                    onChange={(e) => setTailoringNotes(e.target.value)}
                    placeholder={
                      vocabulary.workshop_notes_placeholder?.[lang] ||
                      (lang === "ar"
                        ? "أدخل الملاحظات والتعليمات الخاصة هنا..."
                        : "Type any special requests or notes here...")
                    }
                    className="text-xs bg-background resize-none leading-relaxed rounded-xl border border-input shadow-2xs focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              )}
            </div>
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
        </div>

        {/* Mobile sticky purchase bar */}
        <div
          className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur px-3 py-2 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.15)]"
          style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="mx-auto max-w-6xl flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground truncate">
                {variant
                  ? [
                      (showSizeModeToggle && sizeMode === "custom") ||
                      (!hasReadySizes && isTailoringActive)
                        ? vocabulary.custom_sizing?.[lang] || t("قياس خاص", "Custom Sizing")
                        : formatSizeWithUnit(variant.size, variant.size_unit, lang),
                      variant.color,
                      variant.fabric,
                    ]
                      .filter(Boolean)
                      .join(" · ") || t("مختار", "Selected")
                  : t("اختر الخيار", "Choose option")}
              </div>
              <div className="text-base font-semibold truncate" style={{ color: primary }}>
                {!shouldShowPrices(settings) ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    {t("تواصل معنا للسعر", "Contact us for price")}
                  </span>
                ) : (
                  priceLabel
                )}
              </div>
            </div>
            {isCatalogMode(settings) ? (
              <Button
                type="button"
                className="h-11 px-4 font-semibold bg-primary text-primary-foreground gap-2"
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
                aria-label={t("طلب عبر واتساب", "Inquire via WhatsApp")}
              >
                <MessageCircle className="h-4 w-4" />
                <span>{t("طلب عبر واتساب", "Inquire")}</span>
              </Button>
            ) : (
              <>
                <Button
                  className="h-11 px-3 font-semibold bg-primary text-primary-foreground"
                  disabled={selectedVariantOutOfStock}
                  aria-disabled={selectedVariantOutOfStock ? "true" : undefined}
                  onClick={() => doAdd(false)}
                  aria-label={
                    isTailoringActive
                      ? vocabulary.custom_order?.[lang]
                        ? lang === "ar"
                          ? `طلب ${vocabulary.custom_order[lang]} القطعة`
                          : `Order ${vocabulary.custom_order[lang]} Piece`
                        : t("طلب تجهيز القطعة", "Order Custom Piece")
                      : t("أضف للسلة", "Add to cart")
                  }
                >
                  {isTailoringActive ? (
                    <Sparkles className="h-4 w-4" />
                  ) : (
                    <ShoppingBag className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="h-11 px-4 font-semibold border-2"
                  disabled={selectedVariantOutOfStock}
                  aria-disabled={selectedVariantOutOfStock ? "true" : undefined}
                  onClick={() => doAdd(true)}
                >
                  {isTailoringActive
                    ? vocabulary.custom_order?.[lang]
                      ? lang === "ar"
                        ? `إتمام طلب ال${vocabulary.custom_order[lang]}`
                        : `Complete ${vocabulary.custom_order[lang]}`
                      : t("إتمام الطلب", "Complete Order")
                    : t("اشتر الآن", "Buy now")}
                </Button>
              </>
            )}
          </div>
        </div>
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
    <section aria-label={title}>
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
