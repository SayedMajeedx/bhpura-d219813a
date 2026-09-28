import type { Drawable, SceneData } from "@/features/content-studio/engine/scene";
import { extractSnappySnippet, type Product } from "@/features/content-studio/lib/studio-content";
import type { Sale } from "@/features/content-studio/lib/sale-price";
import type { OptionRun } from "@/features/content-studio/lib/option-run";
import { DEFAULT_DETAIL_POINT } from "@/features/content-studio/templates/detail-zoom";

/** The most products one batch exports. */
export const BATCH_MAX = 12;

/** The templates a batch can run: the ones built around one product. */
export const BATCH_TEMPLATES: readonly string[] = [
  "atelier-reveal",
  "editorial-cover",
  "price-drop",
  "swatch-run",
  "detail-zoom",
];

/** A price amount as the studio prints it ("42.000"). */
export function formatAmount(value: number) {
  return Number(value).toFixed(3);
}

/**
 * A product's headline and body, as the studio fills them when the product is
 * picked: its name, and a short line from its description.
 */
export function productCopy(product: Product, lang: "ar" | "en") {
  const name =
    (lang === "ar" ? product.name_ar || product.name : product.name_en || product.name) ||
    product.name;
  const description =
    lang === "ar"
      ? product.description_ar || product.description
      : product.description || product.description_ar;
  const body = extractSnappySnippet(
    description,
    lang === "ar"
      ? "أناقة هادئة، وتفاصيل مدروسة لكل لحظة."
      : "Quiet elegance, thoughtful details for every moment.",
  );
  return { name, headline: name, body };
}

/**
 * The parts of a scene that belong to one product, for a batch: its copy,
 * its price and sale (as the studio shows them with no variant chosen), its
 * photo, its options for Swatch Run, and its fabric and occasion for Detail
 * Zoom. The rest of the scene (brand, look, format) comes from the studio.
 */
export function batchSceneFields({
  product,
  lang,
  showPrice,
  currencySymbol,
  sale,
  run,
  media,
  stopMedia,
}: {
  product: Product;
  lang: "ar" | "en";
  showPrice: boolean;
  currencySymbol: string;
  /** The sale every variant shares, or null. */
  sale: Sale | null;
  run: OptionRun | null;
  media: Drawable | null;
  /** Each option's own photo, in the run's order (null where it has none). */
  stopMedia: ReadonlyArray<Drawable | null>;
}): Pick<
  SceneData,
  | "productName"
  | "headline"
  | "body"
  | "price"
  | "originalPrice"
  | "priceAmount"
  | "originalAmount"
  | "discountPercent"
  | "media"
  | "options"
  | "detail"
> {
  const copy = productCopy(product, lang);
  const selling = sale?.price ?? product.base_price;
  const priceAmount = showPrice && selling ? formatAmount(selling) : null;
  const originalAmount = showPrice && sale ? formatAmount(sale.original) : null;
  return {
    productName: copy.name,
    headline: copy.headline,
    body: copy.body,
    price: priceAmount ? `${priceAmount} ${currencySymbol}` : null,
    originalPrice: originalAmount ? `${originalAmount} ${currencySymbol}` : null,
    priceAmount,
    originalAmount,
    discountPercent: showPrice && sale ? sale.percent : null,
    media,
    options: run
      ? {
          axisLabel: run.axisLabel,
          swatch: run.swatch,
          stops: run.stops.map((stop, index) => ({
            label: stop.label,
            color: stop.color,
            media: stopMedia[index] ?? media,
          })),
        }
      : null,
    detail: {
      ...DEFAULT_DETAIL_POINT,
      label: (product.fabric_type ?? "").trim(),
      note: (product.occasion ?? "").trim(),
    },
  };
}

/** The picks after tapping `id`: in or out, never more than BATCH_MAX. */
export function toggleBatchPick(current: readonly string[], id: string): readonly string[] {
  if (current.includes(id)) return current.filter((picked) => picked !== id);
  return current.length < BATCH_MAX ? [...current, id] : current;
}
