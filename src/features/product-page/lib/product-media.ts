import type { StorefrontProductDetail as Product } from "@/lib/data/storefront";
import type { PdpMediaItem } from "@/features/product-page/types";

/**
 * The gallery: the product's media, with the cover image and then the chosen
 * variant's image put first when they are not already in it.
 */
export function productMediaList(
  product: Pick<Product, "media" | "image_url"> | null | undefined,
  variantImageUrl: string | null | undefined,
): PdpMediaItem[] {
  if (!product) return [];
  const arr = Array.isArray(product.media) ? (product.media as PdpMediaItem[]) : [];
  const list = [...arr];
  if (product.image_url && !list.some((m) => m.url === product.image_url)) {
    list.unshift({ type: "image" as const, url: product.image_url });
  }
  if (variantImageUrl && !list.some((m) => m.url === variantImageUrl)) {
    list.unshift({ type: "image" as const, url: variantImageUrl });
  }
  return list;
}

/** The gallery frame's ratio from the store's `pdp_gallery_aspect_ratio` (portrait 3:4 by default). */
export function galleryRatioClass(ratio: string | null | undefined): string {
  return ratio === "1:1" ? "aspect-square" : ratio === "4:5" ? "aspect-[4/5]" : "aspect-[3/4]";
}
