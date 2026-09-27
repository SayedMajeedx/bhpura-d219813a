import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { catalogInsightQueries, catalogQueries } from "@/lib/data/catalog";
import {
  extractSnappySnippet,
  firstImage,
  type Product,
} from "@/features/content-studio/lib/studio-content";

/**
 * The chosen product, its variants and media, and the price and description the
 * studio uses for it.
 */
export function useStudioProduct(brandId: string, isAr: boolean) {
  const [productId, setProductId] = useState("");

  const productsQ = useQuery({
    ...catalogInsightQueries.contentStudio(brandId),
    select: (rows) => rows as Product[],
  });
  // Prices, stock and images per variant, from the shared catalog.
  const variantsQ = useQuery(catalogQueries.variants(brandId));
  const settingsQ = useQuery(businessSettingsQueries.detail(brandId));
  const products = productsQ.data ?? [];
  const selected = products.find((product) => product.id === productId) ?? products[0];

  type StudioMediaItem = {
    url: string;
    type: "image" | "video";
    source: "primary" | "gallery" | "variant";
    label: string;
  };

  const productVariants = useMemo(() => {
    if (!selected) return [];
    return (variantsQ.data ?? []).filter((v) => v.product_id === selected.id);
  }, [selected, variantsQ.data]);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string | null>(null);

  const activeVariant = useMemo(() => {
    if (!selectedVariantId) return null;
    return productVariants.find((v) => v.id === selectedVariantId) ?? null;
  }, [productVariants, selectedVariantId]);

  const productMediaList = useMemo(() => {
    if (!selected) return [];
    const list: StudioMediaItem[] = [];
    const seenUrls = new Set<string>();

    const add = (
      url: string | null | undefined,
      type: "image" | "video",
      source: "primary" | "gallery" | "variant",
      label: string,
    ) => {
      if (!url || seenUrls.has(url)) return;
      seenUrls.add(url);
      list.push({ url, type, source, label });
    };

    if (selected.image_url) {
      add(selected.image_url, "image", "primary", isAr ? "الأساسية" : "Main");
    }

    if (Array.isArray(selected.media)) {
      selected.media.forEach((item: any, idx: number) => {
        const url = typeof item === "string" ? item : item?.url;
        if (!url) return;
        const isVid =
          typeof item === "object" && item.type === "video"
            ? true
            : /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
        add(
          url,
          isVid ? "video" : "image",
          "gallery",
          isVid
            ? `${isAr ? "فيديو" : "Video"} ${idx + 1}`
            : `${isAr ? "صورة" : "Image"} ${idx + 1}`,
        );
      });
    }

    productVariants.forEach((v) => {
      if (v.image_url) {
        const vLabel =
          [v.size, v.color].filter(Boolean).join(" · ") || (isAr ? "متغير" : "Variant");
        add(v.image_url, "image", "variant", vLabel);
      }
    });

    return list;
  }, [selected, productVariants, isAr]);

  useEffect(() => {
    if (productMediaList.length > 0) {
      const match = productMediaList.some((m) => m.url === selectedMediaUrl);
      if (!match) {
        setSelectedMediaUrl(productMediaList[0].url);
      }
    } else {
      setSelectedMediaUrl(null);
    }
  }, [selected?.id, productMediaList, selectedMediaUrl]);

  const handleSelectVariant = (variantId: string | null) => {
    setSelectedVariantId(variantId);
    if (variantId) {
      const v = productVariants.find((item) => item.id === variantId);
      if (v?.image_url) {
        setSelectedMediaUrl(v.image_url);
      }
    }
  };

  const currentMedia = useMemo(() => {
    return productMediaList.find((m) => m.url === selectedMediaUrl) ?? productMediaList[0] ?? null;
  }, [productMediaList, selectedMediaUrl]);

  const photo = currentMedia?.url ?? firstImage(selected);
  const isCurrentVideo = currentMedia?.type === "video";

  const effectivePrice =
    activeVariant?.selling_price != null
      ? activeVariant.selling_price
      : (selected?.base_price ?? null);

  const selectedDescription = useMemo(
    () =>
      selected
        ? isAr
          ? selected.description_ar || selected.description
          : selected.description
        : null,
    [isAr, selected],
  );

  const snappyDesc = useMemo(
    () =>
      extractSnappySnippet(
        selectedDescription,
        isAr
          ? "أناقة هادئة، وتفاصيل مدروسة لكل لحظة."
          : "Quiet elegance, thoughtful details for every moment.",
      ),
    [isAr, selectedDescription],
  );

  return {
    productId,
    setProductId,
    productsQ,
    variantsQ,
    settingsQ,
    products,
    selected,
    productVariants,
    selectedVariantId,
    setSelectedVariantId,
    selectedMediaUrl,
    setSelectedMediaUrl,
    activeVariant,
    productMediaList,
    handleSelectVariant,
    currentMedia,
    photo,
    isCurrentVideo,
    effectivePrice,
    selectedDescription,
    snappyDesc,
  };
}
