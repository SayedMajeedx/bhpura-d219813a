import { isCatalogMode } from "@/lib/storefront-mode";
import {
  deliveryEstimateLines,
  readyEstimate,
  type EstimateSettings,
} from "@/lib/delivery-estimate";

/**
 * The delivery time a product page says beside the price, in the store's own words: the
 * made-to-order time for a piece the shopper is having made, else the ready time
 * (`delivery-estimate.ts`). None in a catalog, when the store turned the estimate off, or when it
 * wrote none. It sat in a box under the buttons, after the shopper had already decided.
 */
export function productDeliveryLine({
  settings,
  lang,
  madeForShopper,
}: {
  settings: EstimateSettings & {
    storefront_mode?: string | null;
    delivery_estimate_enabled?: boolean | null;
  };
  lang: "ar" | "en";
  /** The shopper is having this piece made (a made-to-order product, no ready size chosen). */
  madeForShopper: boolean;
}): string | null {
  if (isCatalogMode(settings) || settings.delivery_estimate_enabled === false) return null;
  return (
    deliveryEstimateLines({
      kinds: { ready: !madeForShopper, tailored: madeForShopper },
      settings,
      lang,
      readyText: readyEstimate(settings, lang),
    })[0]?.text ?? null
  );
}
