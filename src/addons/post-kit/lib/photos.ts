import { currencyLabel } from "@/lib/currency-label";
import { cardPrice, type PricedProduct, type PricedVariant } from "@/lib/product-price";
import type { Photo, PhotoBook, Post } from "./types";

/** A product as the page reads it: the studio's own read of the catalogue. */
export type KitProduct = PricedProduct & {
  id: string;
  name?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
  image_url?: string | null;
  media?: unknown;
  is_active?: boolean | null;
};
export type KitVariant = PricedVariant & { product_id?: string | null };

/** "Abaya | New Blazer" gives "new-blazer": the key a post names a piece by, whatever its price. */
export function productKey(product: Pick<KitProduct, "id" | "name_en">): string {
  const last = (product.name_en ?? "").split("|").pop() ?? "";
  const slug = last
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || product.id;
}

/** A price as a post writes it: "25 د.ب", with no empty decimals. */
export function postPrice(amount: number, currency: string | null | undefined): string {
  return `${Number(amount.toFixed(3))} ${currencyLabel(currency, "ar")}`;
}

function pictureOf(product: KitProduct): string | null {
  if (product.image_url) return product.image_url;
  const media = Array.isArray(product.media) ? (product.media as unknown[]) : [];
  for (const entry of media) {
    const url =
      typeof entry === "string" ? entry : ((entry as { url?: string } | null)?.url ?? null);
    if (url && !/\.(mp4|webm|mov)(\?|$)/i.test(url)) return url;
  }
  return null;
}

export type Catalogue = {
  photos: PhotoBook;
  prices: Record<string, string>;
  /** The lowest abaya or piece on sale, for "from 22". */
  from: string | null;
  /** The making time the store wrote, for {making}: none written, none said. */
  making?: string;
};

/** The pieces the store sells now, each with its picture, name and live price. */
export function catalogueFrom(
  products: readonly KitProduct[],
  variants: readonly KitVariant[],
  currency: string | null | undefined,
  making?: string | null,
): Catalogue {
  const photos: PhotoBook = {};
  const prices: Record<string, string> = {};
  let lowest: number | null = null;
  for (const product of products) {
    if (product.is_active === false) continue;
    const url = pictureOf(product);
    if (!url) continue;
    const parts = (product.name_ar ?? product.name ?? "").split("|").map((part) => part.trim());
    const label = parts[parts.length - 1] || product.name_en || "";
    const kind = parts.length > 1 ? parts[0] : "";
    const own = variants.filter((variant) => variant.product_id === product.id);
    const amount = cardPrice(product, own).from;
    let key = productKey(product);
    if (photos[key]) key = `${key}-${product.id}`;
    const price = amount > 0 ? postPrice(amount, currency) : "";
    prices[key] = price;
    photos[key] = {
      label,
      name: `${kind ? `${kind} ` : ""}${label}`,
      url,
      full: `${kind ? `${kind} ` : ""}${label}${price ? ` · ${price}` : ""}`,
    };
    if (amount > 0 && kind && (lowest === null || amount < lowest)) lowest = amount;
  }
  return {
    photos,
    prices,
    from: lowest === null ? null : postPrice(lowest, currency),
    making: making?.trim() || "",
  };
}

function fillIn(text: string, catalogue: Catalogue): string {
  return text
    .replace(/\{price:([\w-]+)\}/g, (_, key: string) => catalogue.prices[key] ?? "")
    .replace(/\{full:([\w-]+)\}/g, (_, key: string) => catalogue.photos[key]?.full ?? "")
    .replace(/\{from\}/g, catalogue.from ?? "")
    .replace(/\{making\}\n?/g, catalogue.making ? `${catalogue.making}\n` : "")
    .replace(/ {2,}/g, " ");
}

/** A ready post with today's prices written in. */
export function livePost(post: Post, catalogue: Catalogue): Post {
  return {
    ...post,
    label: post.label === undefined ? undefined : fillIn(post.label, catalogue),
    caption: fillIn(post.caption, catalogue),
  };
}

export const photoOrder = (photos: PhotoBook): [string, Photo][] =>
  Object.entries(photos).sort(([, a], [, b]) => Number(!!b.upload) - Number(!!a.upload));
