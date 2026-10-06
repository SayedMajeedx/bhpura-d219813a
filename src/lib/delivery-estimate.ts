import type { CartItem } from "@/lib/storefront-context";

/**
 * What a shopper is told about delivery time. A store has one estimate for ready pieces
 * (`delivery_estimate_*`) and may write another for pieces made to order
 * (`delivery_estimate_tailored_*`): a tailored piece is made before it is sent. The product page
 * shows the one that fits the choice made; checkout shows the one that fits the cart, and both
 * when the cart holds both kinds. A store with no tailored text says one thing, as it always did.
 */

type Lang = "ar" | "en";

export type EstimateKinds = { ready: boolean; tailored: boolean };

export type EstimateLine = {
  kind: "all" | "ready" | "tailored";
  /** Which pieces the line is about; set only when the cart holds both kinds. */
  label: string | null;
  text: string;
};

export type EstimateSettings = {
  delivery_estimate_ar?: string | null;
  delivery_estimate_en?: string | null;
  delivery_estimate_tailored_ar?: string | null;
  delivery_estimate_tailored_en?: string | null;
};

const clean = (text: string | null | undefined) => text?.trim() || null;

/** The store's own words for ready pieces, if it wrote any. */
export function readyEstimate(settings: EstimateSettings, lang: Lang): string | null {
  return clean(lang === "ar" ? settings.delivery_estimate_ar : settings.delivery_estimate_en);
}

/** The store's own words for pieces made to order, if it wrote any. */
export function tailoredEstimate(settings: EstimateSettings, lang: Lang): string | null {
  return clean(
    lang === "ar" ? settings.delivery_estimate_tailored_ar : settings.delivery_estimate_tailored_en,
  );
}

/**
 * The kinds of piece in a cart. A line is made to order when the catalog says the product is and
 * the shopper did not choose a ready size on it (`tailored: false`), the same reading the advance
 * payment and the order builder use. A booked service is not delivered, so it counts for neither.
 */
export function cartEstimateKinds(
  cart: readonly Pick<CartItem, "product_id" | "tailored" | "booking">[],
  madeToOrderIds: ReadonlySet<string>,
): EstimateKinds {
  const kinds: EstimateKinds = { ready: false, tailored: false };
  for (const item of cart) {
    if (item.booking) continue;
    if (madeToOrderIds.has(item.product_id) && item.tailored !== false) kinds.tailored = true;
    else kinds.ready = true;
  }
  return kinds;
}

const LABELS: Record<Lang, { ready: string; tailored: string; thenShipping: string }> = {
  ar: { ready: "القطع الجاهزة", tailored: "القطع حسب الطلب", thenShipping: "ثم الشحن" },
  en: { ready: "Ready pieces", tailored: "Made-to-order pieces", thenShipping: "then shipping" },
};

/**
 * The lines to show. `readyText` is what the destination says for ready pieces (the store's text,
 * a shipping zone's, or a default). `afterMaking` is time added once a tailored piece is made,
 * such as a zone's shipping time, so it is not left out of the tailored line.
 */
export function deliveryEstimateLines({
  kinds,
  settings,
  lang,
  readyText,
  afterMaking = null,
}: {
  kinds: EstimateKinds;
  settings: EstimateSettings;
  lang: Lang;
  readyText: string;
  afterMaking?: string | null;
}): EstimateLine[] {
  const own = tailoredEstimate(settings, lang);
  if (!own || !kinds.tailored) return [{ kind: "all", label: null, text: readyText }];

  const labels = LABELS[lang];
  const after = clean(afterMaking);
  const comma = lang === "ar" ? "،" : ",";
  const tailoredText = after ? `${own}${comma} ${labels.thenShipping}: ${after}` : own;
  if (!kinds.ready) return [{ kind: "tailored", label: null, text: tailoredText }];
  return [
    { kind: "ready", label: labels.ready, text: readyText },
    { kind: "tailored", label: labels.tailored, text: tailoredText },
  ];
}

/** One line as a sentence: "Ready pieces: within 24 hours". */
export function estimateLineText(line: EstimateLine): string {
  return line.label ? `${line.label}: ${line.text}` : line.text;
}
