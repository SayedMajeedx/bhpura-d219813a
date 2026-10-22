import type { ProductVariantLabels } from "@/lib/addons/addon-registry";
import { moneyFractionDigits } from "@/lib/format";
import { variantSellable } from "@/lib/product-availability";
import {
  sellingPrice,
  variantDiscounted,
  type PricedProduct,
  type PricedVariant,
} from "@/lib/product-price";
import {
  describeVariantAxes,
  formatAxisValue,
  type AxisDefaults,
  type VariantLike,
} from "@/lib/variant-axes";
import { PLACEHOLDER_SIZE_VALUES } from "@/lib/variant-sku-utils";

/**
 * The store's shopping feed: one item per size of every product a shopper can see, in the
 * format Google Merchant Center and Meta Commerce Manager both read (RSS 2.0 with Google's
 * `g:` fields), so the store's pieces can be tagged in Instagram posts and listed on Google.
 *
 * It says only what the storefront says. A size's price and sale are its own (`sellingPrice`,
 * `variantDiscounted`), whether it can be bought is the one rule the cards use
 * (`variantSellable`: ready pieces, or made when ordered while making is open), and the options
 * are named in the store's own words (`describeVariantAxes`), never by their column. A hidden
 * product, a service and a package are left out, and so is a product with no picture or a size
 * with no price: both services refuse an item without them. A store that hides its prices has
 * no feed.
 */

type Lang = "ar" | "en";

export type FeedStore = {
  /** The storefront's address, the store's slug included ("https://pura.boutq.store/pura"). */
  base: string;
  /** The store's name, as its brand. */
  name: string;
  currency: string;
  lang: Lang;
  axisDefaults: AxisDefaults;
};

export type FeedProduct = PricedProduct &
  ProductVariantLabels & {
    id: string;
    name: string | null;
    name_ar?: string | null;
    name_en?: string | null;
    description?: string | null;
    description_ar?: string | null;
    description_en?: string | null;
    image_url?: string | null;
    media?: unknown;
    is_active?: boolean | null;
    is_package?: boolean | null;
  };

export type FeedVariant = PricedVariant &
  VariantLike & {
    id: string;
    product_id: string;
    image_url?: string | null;
  };

export type FeedItem = {
  id: string;
  /** The product's id when it has more than one size (Google's variant group). */
  groupId: string | null;
  title: string;
  description: string;
  link: string;
  image: string | null;
  additionalImages: string[];
  availability: "in_stock" | "out_of_stock";
  /** "23.000 BHD": the price before a sale, else the price. */
  price: string;
  /** The price on sale, when the size is discounted. */
  salePrice: string | null;
  brand: string;
  size: string | null;
  color: string | null;
};

/** Google takes at most ten extra pictures. */
const MAX_EXTRA_IMAGES = 10;
const MAX_DESCRIPTION = 5000;
const MAX_TITLE = 150;

/** The entities a description written in the editor carries, as the characters they stand for. */
const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/**
 * Text with no markup, on one line, at most `max` characters. Entities become their characters
 * (the document escapes once, so "&amp;" is never sent as "&amp;amp;").
 */
export function plainText(input: string | null | undefined, max: number): string {
  const text = (input ?? "")
    .replace(/<[^>]*>?/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** An address as a feed must give it: absolute, on the store's own host for a path. */
function absolute(url: string | null | undefined, base: string): string | null {
  const value = url?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  const origin = new URL(base).origin;
  return `${origin}${value.startsWith("/") ? "" : "/"}${value}`;
}

/** The product's pictures in its gallery order (videos left out). */
function galleryImages(product: FeedProduct): string[] {
  const media = Array.isArray(product.media) ? product.media : [];
  return media.flatMap((item: unknown) => {
    if (typeof item === "string") return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(item) ? [] : [item];
    const entry = item as { url?: string; type?: string } | null;
    if (!entry?.url || entry.type === "video") return [];
    return [entry.url];
  });
}

/** An amount as both services read it: "23.000 BHD". */
export function feedPrice(amount: number, currency: string): string {
  const code = (currency || "BHD").toUpperCase();
  return `${amount.toFixed(moneyFractionDigits(code))} ${code}`;
}

/** The items of the feed, product by product in the order given. */
export function feedItems(
  store: FeedStore,
  products: readonly FeedProduct[],
  variants: readonly FeedVariant[],
): FeedItem[] {
  const byProduct = new Map<string, FeedVariant[]>();
  for (const variant of variants) {
    const list = byProduct.get(variant.product_id) ?? [];
    list.push(variant);
    byProduct.set(variant.product_id, list);
  }
  const { lang } = store;

  return products.flatMap((product) => {
    if (product.is_active === false || product.is_package || product.item_kind === "service") {
      return [];
    }
    const sizes = (byProduct.get(product.id) ?? []).filter(
      (variant) => sellingPrice(variant, product) > 0,
    );
    if (sizes.length === 0) return [];

    const name =
      (lang === "ar"
        ? product.name_ar || product.name || product.name_en
        : product.name_en || product.name || product.name_ar) || "";
    const description =
      plainText(
        lang === "ar"
          ? product.description_ar || product.description || product.description_en
          : product.description_en || product.description || product.description_ar,
        MAX_DESCRIPTION,
      ) || name;
    const axes = describeVariantAxes({
      product,
      variants: sizes,
      addonDefaults: store.axisDefaults,
      lang,
    });
    const gallery = galleryImages(product)
      .map((url) => absolute(url, store.base))
      .filter((url): url is string => Boolean(url));
    const cover = absolute(product.image_url, store.base) ?? gallery[0] ?? null;
    const grouped = sizes.length > 1;

    const items = sizes.map((variant) => {
      // Each option the size has, as the store names it; the "Standard" placeholder is none.
      const options = axes.flatMap((axis) => {
        const raw = variant[axis.field]?.trim();
        if (!raw) return [];
        if (axis.field === "size" && (PLACEHOLDER_SIZE_VALUES as readonly string[]).includes(raw)) {
          return [];
        }
        return [{ axis, value: formatAxisValue(axis, raw, lang, sizes) }];
      });
      const size = options.find((option) => option.axis.field === "size")?.value ?? null;
      const color = options.find((option) => option.axis.swatch)?.value ?? null;
      const title = plainText(
        grouped && options.length > 0
          ? `${name} - ${options.map((option) => option.value).join(" / ")}`
          : name,
        MAX_TITLE,
      );
      const image = absolute(variant.image_url, store.base) ?? cover;
      const selling = sellingPrice(variant, product);
      const onSale = variantDiscounted(variant, product);
      return {
        id: variant.id,
        groupId: grouped ? product.id : null,
        title,
        description,
        link: `${store.base}/product/${product.id}${grouped ? `?variant=${variant.id}` : ""}`,
        image,
        additionalImages: [cover, ...gallery]
          .filter((url): url is string => Boolean(url) && url !== image)
          .filter((url, index, list) => list.indexOf(url) === index)
          .slice(0, MAX_EXTRA_IMAGES),
        availability: variantSellable(product, variant) ? "in_stock" : "out_of_stock",
        price: feedPrice(onSale ? Number(variant.original_price) : selling, store.currency),
        salePrice: onSale ? feedPrice(selling, store.currency) : null,
        brand: store.name,
        size,
        color,
      } satisfies FeedItem;
    });
    // A size with no picture of its own or its product's is refused by both services.
    return items.filter((item) => item.image);
  });
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The feed's document (RSS 2.0 with Google's `g:` fields, which Meta reads too). */
export function feedXml(store: FeedStore, items: readonly FeedItem[]): string {
  const field = (tag: string, value: string | null) =>
    value ? `      <${tag}>${xml(value)}</${tag}>\n` : "";
  const entries = items.map(
    (item) =>
      "    <item>\n" +
      field("g:id", item.id) +
      field("g:item_group_id", item.groupId) +
      field("title", item.title) +
      field("description", item.description) +
      field("link", item.link) +
      field("g:image_link", item.image) +
      item.additionalImages.map((url) => field("g:additional_image_link", url)).join("") +
      field("g:availability", item.availability) +
      field("g:price", item.price) +
      field("g:sale_price", item.salePrice) +
      field("g:brand", item.brand) +
      field("g:condition", "new") +
      field("g:identifier_exists", "no") +
      field("g:size", item.size) +
      field("g:color", item.color) +
      "    </item>\n",
  );
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n' +
    "  <channel>\n" +
    field("title", store.name).replace(/^ {6}/, "    ") +
    field("link", store.base).replace(/^ {6}/, "    ") +
    field("description", store.name).replace(/^ {6}/, "    ") +
    entries.join("") +
    "  </channel>\n" +
    "</rss>\n"
  );
}
