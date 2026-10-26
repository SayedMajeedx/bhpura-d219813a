import { PRODUCT_PHOTO_RATIOS, type ProductPhotoRatio } from "@/lib/brand-templates/design-presets";
import { optionName, optionPrice, type ServiceOption } from "@/lib/bookings/service-options";
import type { ProductRow } from "@/lib/data/storefront";

/**
 * What a rental's card shows, as rules: the shape of its photo, the few words that describe it,
 * and its add-ons with what each costs. The card once framed every rental 4:3 (a services store's
 * shape, made for a room or a setting), so a photo booth shot standing showed its middle half,
 * and it named the add-ons with no price.
 */

/**
 * A rental's photo frame: the shape the store chose for its product photos, else 3:4. What is
 * hired (a booth, an arch, a dress) is photographed standing; the services vertical's own shape
 * is wide, for a room or a treatment.
 */
export function rentalPhotoRatio(
  settings: { product_card_aspect_ratio?: string | null } | null | undefined,
): ProductPhotoRatio {
  const chosen = settings?.product_card_aspect_ratio;
  return (PRODUCT_PHOTO_RATIOS as readonly string[]).includes(chosen ?? "")
    ? (chosen as ProductPhotoRatio)
    : "3:4";
}

/** The first paragraph of a rental's description in the reader's language, or "". */
export function descriptionLead(
  product: Pick<ProductRow, "description" | "description_ar" | "description_en">,
  isAr: boolean,
): string {
  const text =
    (isAr
      ? product.description_ar || product.description_en
      : product.description_en || product.description_ar) ||
    product.description ||
    "";
  return (
    String(text)
      .split(/\n\s*\n|\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

export type AddOnLine = {
  id: string;
  name: string;
  /** What it costs: one price, the first block's ("from"), or nothing when it is included. */
  price: number | null;
  /** The price is a block's: more units cost more ("from 15"). */
  from: boolean;
  /** Comes with every booking (included, or required at a price). */
  always: boolean;
  /** What each hour beyond the service's shortest length adds to the price (null: one price). */
  perHour: number | null;
};

const ORDER: Record<ServiceOption["mode"], number> = {
  included: 0,
  required: 1,
  default_on: 2,
  optional: 3,
};

/**
 * A rental's add-ons for its card, what comes with every booking first: each with its own price
 * ("+ 30"), a block price as "from", and nothing for one that is included.
 */
export function addOnLines(addOns: readonly ServiceOption[], isAr: boolean): AddOnLine[] {
  return [...addOns]
    .sort((a, b) => ORDER[a.mode] - ORDER[b.mode])
    .map((option) => {
      const included = option.mode === "included";
      return {
        id: option.id,
        name: optionName(option, isAr),
        price: included ? null : optionPrice(option, option.tiers ? option.tiers.step : 1),
        from: !included && Boolean(option.tiers),
        always: included || option.mode === "required",
        perHour:
          !included && !option.tiers && option.extra_hour_price ? option.extra_hour_price : null,
      };
    })
    .filter((line) => line.name);
}
