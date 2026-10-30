import type { ProductRow } from "@/lib/data/storefront";
import { ProductCardV2 } from "@/components/storefront/ProductCardV2";

/**
 * A product's card in every grid, rail and list of the storefront: the one card (`ProductCardV2`).
 * The classic storefront's own card went with it (docs/storefront-v1-to-v2-plan.md).
 */
export function ProductCard({
  product,
  badge,
  index,
  className,
}: {
  product: ProductRow;
  badge?: "trending" | "best";
  index?: number;
  className?: string;
}) {
  return <ProductCardV2 product={product} badge={badge} index={index} className={className} />;
}
