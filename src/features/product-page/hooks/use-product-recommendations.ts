import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  storefrontQueries,
  type RecommendationProduct,
  type StorefrontBrandRef,
} from "@/lib/data/storefront";

/** Best sellers ranked for the product page's badges and rails. */
export const PDP_BEST_SELLER_LIMIT = 10;

/**
 * The product page's rails: up to 8 products from the same category, then up
 * to 8 best sellers not already shown, ranked by units sold. The loader's rows
 * seed both queries.
 */
export function useProductRecommendations({
  brand,
  product,
  initialCatalog,
  initialBestSellerRows,
}: {
  brand: StorefrontBrandRef;
  product: { id: string; category?: string | null } | null | undefined;
  initialCatalog: RecommendationProduct[] | undefined;
  initialBestSellerRows: Array<{ product_id: string; units_sold: number }> | undefined;
}) {
  const { data: recommendationCatalog = [] } = useQuery({
    ...storefrontQueries.recommendations(brand),
    initialData: initialCatalog,
  });

  const { data: bestSellerRows = [] } = useQuery({
    ...storefrontQueries.bestSellers(brand, PDP_BEST_SELLER_LIMIT),
    initialData: initialBestSellerRows,
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

  return { relatedProducts, bestSellingProducts };
}
