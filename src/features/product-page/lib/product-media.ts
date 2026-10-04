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

/** The gallery frame's width over its height (portrait 3:4 by default), as a number. */
export function galleryRatioValue(ratio: string | null | undefined): number {
  return ratio === "1:1" ? 1 : ratio === "4:5" ? 0.8 : 0.75;
}

/**
 * The widest the gallery frame may be, so that at its ratio it is no taller than the screen
 * leaves room for. Limiting the height instead (as it was) broke the ratio on any wide column
 * and made every setting look the same.
 */
export function galleryMaxWidth(ratio: string | null | undefined): string {
  return `calc(min(78vh, 700px) * ${galleryRatioValue(ratio)})`;
}

/** The gallery frame's ratio from the store's `pdp_gallery_aspect_ratio` (portrait 3:4 by default). */
export function galleryRatioClass(ratio: string | null | undefined): string {
  return ratio === "1:1" ? "aspect-square" : ratio === "4:5" ? "aspect-[4/5]" : "aspect-[3/4]";
}
