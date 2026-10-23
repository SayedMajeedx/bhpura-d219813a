import type { StoreVertical } from "@/lib/store-profile";

/**
 * What a store of each vertical looks like until it chooses otherwise, and nothing more: every
 * value here is read by the platform (`tests/brand-templates.test.ts` holds them).
 *
 * - `radius`: the corner radius the brand wizard writes when it makes a store
 *   (`storefront_radius`), from then on the store's own.
 * - `productPhoto`: the shape of a product's photo on the storefront's cards while the store has
 *   chosen none (`business_settings.product_card_aspect_ratio` is null; migration
 *   20261023130000), read at every render through `productCardRatio`, so a store follows its
 *   vertical, and a change of vertical, until it picks a shape itself. Clothes are photographed
 *   standing (portrait); food, beauty, fragrance, jewellery and most goods are shot square; a
 *   room or a service's setting reads best wide.
 *
 * The presets once also named a style ("editorial", "fresh", "tech"), a grid of 4 or 5 columns, a
 * spacing and a card style that nothing read, while the storefront's documentation said they
 * were applied: they are gone.
 */

export type ProductPhotoRatio = "3:4" | "4:5" | "1:1" | "4:3";

export const PRODUCT_PHOTO_RATIOS: readonly ProductPhotoRatio[] = ["3:4", "4:5", "1:1", "4:3"];

export type BrandDesignConfig = {
  radius: string;
  productPhoto: ProductPhotoRatio;
};

const PORTRAIT = { radius: "0.5rem", productPhoto: "3:4" } as const;
const SQUARE_SOFT = { radius: "0.5rem", productPhoto: "1:1" } as const;
const SQUARE_ROUND = { radius: "1.25rem", productPhoto: "1:1" } as const;
const SQUARE_SHARP = { radius: "0.375rem", productPhoto: "1:1" } as const;

export const VERTICAL_DESIGN_PRESETS: Record<StoreVertical, BrandDesignConfig> = {
  fashion: PORTRAIT,
  abayas: PORTRAIT,
  beauty: SQUARE_SOFT,
  fragrance: SQUARE_SOFT,
  jewelry: SQUARE_SOFT,
  food: SQUARE_ROUND,
  coffee: SQUARE_ROUND,
  gifts: SQUARE_ROUND,
  home: { radius: "1.25rem", productPhoto: "4:3" },
  services: { radius: "0.75rem", productPhoto: "4:3" },
  electronics: SQUARE_SHARP,
  digital: SQUARE_SHARP,
  print: SQUARE_SHARP,
  general: SQUARE_SHARP,
};

const isRatio = (value: unknown): value is ProductPhotoRatio =>
  typeof value === "string" && (PRODUCT_PHOTO_RATIOS as readonly string[]).includes(value);

/** The photo shape a store of this vertical starts with. */
export function verticalProductPhoto(vertical: string | null | undefined): ProductPhotoRatio {
  return (VERTICAL_DESIGN_PRESETS[vertical as StoreVertical] ?? VERTICAL_DESIGN_PRESETS.general)
    .productPhoto;
}

/** The shape of a product's photo on the store's cards: its own choice, else its vertical's. */
export function productCardRatio(
  settings:
    | { product_card_aspect_ratio?: string | null; store_vertical?: string | null }
    | null
    | undefined,
): ProductPhotoRatio {
  const chosen = settings?.product_card_aspect_ratio;
  return isRatio(chosen) ? chosen : verticalProductPhoto(settings?.store_vertical);
}

/** The frame's class for a shape (whole class names, so Tailwind keeps them). */
export const PRODUCT_PHOTO_CLASS: Record<ProductPhotoRatio, string> = {
  "3:4": "aspect-[3/4]",
  "4:5": "aspect-[4/5]",
  "1:1": "aspect-square",
  "4:3": "aspect-[4/3]",
};
