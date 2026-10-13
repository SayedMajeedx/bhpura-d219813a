import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { promoCodesQueries } from "@/lib/data/promo-codes";
import { leadsQueries } from "@/lib/data/leads";
import { reviewsQueries } from "@/lib/data/reviews";
import { describeVariantAxes, type ResolvedVariantAxis } from "@/lib/variant-axes";
import type { SceneData } from "@/features/content-studio/engine/scene";
import {
  askedCount,
  backNowProductIds,
  deadlineParts,
  defaultDeadline,
  inStockOptions,
  localDay,
  postablePromos,
  promoOffer,
  ratingSummary,
} from "@/features/content-studio/lib/moments";

type Variant = Parameters<typeof backNowProductIds>[1][number];

/**
 * The templates made for a moment, and what each reads: Last Chance its last
 * day and, if the merchant picks one, a code that more than one shopper can
 * use; Back in Stock the sizes on the shelf again and how many asked for the
 * piece; Customer Favourite the store's reviews summed up. Each reads its
 * data only while it is the template showing; a read that fails leaves the
 * line out rather than the post.
 */
export function useMoments({
  templateId,
  brandId,
  productId,
  productVariants,
  allVariants,
  axisDefaults,
  isAr,
  currencySymbol,
}: {
  templateId: string;
  brandId: string;
  productId: string | null | undefined;
  productVariants: readonly Variant[];
  allVariants: readonly Variant[];
  axisDefaults: Parameters<typeof describeVariantAxes>[0]["addonDefaults"];
  isAr: boolean;
  currencySymbol: string;
}) {
  const lang = isAr ? "ar" : "en";
  const lastChance = templateId === "last-chance";
  const backInStock = templateId === "back-in-stock";
  const favourite = templateId === "customer-favourite";

  // Last Chance: the day, and the code that goes with it.
  const promosQ = useQuery({
    ...promoCodesQueries.list(brandId),
    enabled: lastChance && Boolean(brandId),
  });
  const promos = useMemo(() => postablePromos(promosQ.data ?? [], new Date()), [promosQ.data]);
  const [deadlineDay, setDeadlineDay] = useState(() => defaultDeadline(new Date()));
  const [promoId, setPromoId] = useState<string | null>(null);
  const promo = promos.find((item) => item.id === promoId) ?? null;
  const choosePromo = (id: string | null) => {
    setPromoId(id);
    const picked = promos.find((item) => item.id === id);
    // A code's own last day is the post's.
    if (picked?.end_date) setDeadlineDay(localDay(picked.end_date));
  };
  const deadline = useMemo<SceneData["deadline"]>(() => {
    if (!lastChance) return null;
    const parts = deadlineParts(deadlineDay, lang);
    if (!parts) return null;
    return {
      ...parts,
      code: promo?.code ?? null,
      offer: promo ? promoOffer(promo, lang, currencySymbol) : null,
    };
  }, [lastChance, deadlineDay, lang, promo, currencySymbol]);

  // Back in Stock: the options on the shelf, and who asked.
  const leadsQ = useQuery({
    ...leadsQueries.backInStock(brandId),
    enabled: backInStock && Boolean(brandId),
  });
  const requests = useMemo(() => leadsQ.data ?? [], [leadsQ.data]);
  const [showAsked, setShowAsked] = useState(true);
  const asked = productId ? askedCount(requests, productId) : 0;
  const backNowIds = useMemo(
    () => (backInStock ? backNowProductIds(requests, allVariants) : []),
    [backInStock, requests, allVariants],
  );
  const restock = useMemo<SceneData["restock"]>(() => {
    if (!backInStock) return null;
    const axes: ResolvedVariantAxis[] = describeVariantAxes({
      variants: [...productVariants],
      addonDefaults: axisDefaults,
      lang,
    });
    const shelf = inStockOptions(axes, productVariants, lang);
    return {
      axisLabel: shelf?.axisLabel ?? null,
      options: shelf?.options ?? [],
      // A count of one or two reads as little; it shows from three.
      asked: showAsked && asked >= 3 ? asked : null,
    };
  }, [backInStock, productVariants, axisDefaults, lang, showAsked, asked]);

  // Customer Favourite: the store's reviews, summed up.
  const reviewsQ = useQuery({
    ...reviewsQueries.orderReviews(brandId),
    enabled: favourite && Boolean(brandId),
  });
  const [showHighlights, setShowHighlights] = useState(true);
  const summary = useMemo(
    () => (reviewsQ.data ? ratingSummary(reviewsQ.data, lang) : null),
    [reviewsQ.data, lang],
  );
  const rating = useMemo<SceneData["rating"]>(() => {
    if (!favourite || !summary) return null;
    return showHighlights ? summary : { ...summary, highlights: [] };
  }, [favourite, summary, showHighlights]);

  return {
    deadlineDay,
    setDeadlineDay,
    promos,
    promoId,
    choosePromo,
    deadline,
    asked,
    showAsked,
    setShowAsked,
    backNowIds,
    restock,
    reviewSummary: summary,
    reviewsLoading: favourite && reviewsQ.isLoading,
    showHighlights,
    setShowHighlights,
    rating,
  };
}
