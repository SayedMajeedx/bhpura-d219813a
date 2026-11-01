import type { StorefrontVariant as Variant } from "@/lib/data/storefront";
import { formatSizeWithUnit } from "@/lib/format";
import {
  madeToOrderLimit,
  offSaleUntil,
  readyUnitsOf,
  type AvailabilityProduct,
} from "@/lib/product-availability";
import { translateOptionValue } from "@/lib/variant-i18n";
import { isPlaceholderVariant } from "@/lib/variant-sku-utils";
import { offeredSizes, tailoringState } from "./variant-options";

/**
 * What a product card (and its quick view) offers to add without opening the product page, read
 * by the product page's own rules (`tailoringState`, `productSelectionError`, the cart line's
 * `tailored`), so a card never sells what the page would refuse and never refuses what it sells:
 *
 * - `add`: the pieces one tap can put in the bag, ready now (a size with pieces; a made-to-order
 *   piece's ready size goes in as ready, `tailored: false`, as on the page). One choice is a button
 *   naming its size; several are the size chips. `tailorToo` when the piece can also be made to
 *   the shopper's measurements, which only its page takes.
 * - `page`: one tap opens the product page: to tailor (measurements to give), to fill details the
 *   store asks for, or to book a service (a booking needs its day).
 * - `none`: nothing to offer (sold out, off sale for a while).
 *
 * Quick add once read raw stock and its own rule (`canQuickAddToCart`), which refused every
 * made-to-order piece and every product with more than one size: on Pura no card added anything,
 * its size chips only opened the product page with no size chosen.
 */
export type QuickAddPlan<V extends QuickAddVariant = QuickAddVariant> =
  | { kind: "none" }
  | { kind: "add"; choices: V[]; tailored: false | undefined; tailorToo: boolean }
  | { kind: "page"; reason: "tailor" | "details" | "book" };

export type QuickAddVariant = Pick<
  Variant,
  "id" | "size" | "size_unit" | "color" | "fabric" | "stock_main" | "stock_incubator"
> & {
  option_four?: string | null;
  option_five?: string | null;
};

export type QuickAddProduct = AvailabilityProduct & {
  custom_fields?: ReadonlyArray<{ key: string; required?: boolean | null }> | null;
};

/** A field the store asks for to make the piece to the shopper's measurements (the page's rule). */
export function isMeasurementField(key: string): boolean {
  return (
    key.startsWith("fit_") ||
    key === "custom_measurements" ||
    key.includes("measurement") ||
    key.startsWith("sizing_") ||
    key.includes("passport")
  );
}

const inStock = (variant: QuickAddVariant) => readyUnitsOf([variant]) > 0;

/** Sizes in the order a shopper reads them: numbers rising, then the store's own order. */
function sortChoices<V extends QuickAddVariant>(choices: V[]): V[] {
  const number = (v: V) => {
    const n = Number.parseFloat(String(v.size ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  return choices
    .map((variant, index) => ({ variant, index, n: number(variant) }))
    .sort((a, b) => {
      if (a.n !== null && b.n !== null && a.n !== b.n) return a.n - b.n;
      if (a.n !== null && b.n === null) return -1;
      if (a.n === null && b.n !== null) return 1;
      return a.index - b.index;
    })
    .map(({ variant }) => variant);
}

/** The pieces one tap can add: in stock, the placeholder size only when it is all there is. */
function readyChoices<V extends QuickAddVariant>(variants: readonly V[]): V[] {
  const stocked = variants.filter(inStock);
  const real = stocked.filter((v) => !isPlaceholderVariant(v));
  return sortChoices(real.length > 0 ? real : stocked);
}

export function quickAddPlan<V extends QuickAddVariant>(
  product: QuickAddProduct,
  variants: readonly V[] | null | undefined,
  { madeToOrderModule, at = new Date() }: { madeToOrderModule: boolean; at?: Date },
): QuickAddPlan<V> {
  const list = variants ?? [];
  if (offSaleUntil(product, at)) return { kind: "none" };
  if (product.item_kind === "service") return { kind: "page", reason: "book" };

  // As the page reads it: a made-to-order piece whose limit is used up (or paused) is sold as a
  // ready piece only, with no measurements or details to give.
  const limitClosed = madeToOrderLimit(product).closed;
  const isMadeToOrder = Boolean(product.is_made_to_order) && !limitClosed;
  const fields = limitClosed ? [] : (product.custom_fields ?? []);
  const hasMeasurements = fields.some((f) => isMeasurementField(f.key));
  const detailsAsked = (
    hasMeasurements ? fields.filter((f) => !isMeasurementField(f.key)) : fields
  ).some((f) => Boolean(f.required));
  const { showSizeModeToggle } = tailoringState({
    isMadeToOrder,
    offeredSizes: offeredSizes(list as unknown as Variant[]),
    hasCustomFields: fields.length > 0,
    madeToOrderModule,
    sizeMode: "ready",
  });
  const tailored = product.is_made_to_order ? (false as const) : undefined;

  if (showSizeModeToggle) {
    // Ready sizes or the shopper's measurements: a ready size needs only a piece in stock.
    const choices = readyChoices(list);
    if (choices.length === 0) return { kind: "page", reason: "tailor" };
    return { kind: "add", choices, tailored, tailorToo: true };
  }
  if (isMadeToOrder) {
    return { kind: "page", reason: hasMeasurements ? "tailor" : "details" };
  }
  if (detailsAsked) return { kind: "page", reason: "details" };
  const choices = readyChoices(list);
  if (choices.length === 0) return { kind: "none" };
  return { kind: "add", choices, tailored, tailorToo: false };
}

/**
 * A choice in the shopper's words: its size with its unit, and the other options it differs by
 * ("54 · بني"); null for the placeholder size, which names nothing.
 */
export function choiceLabel(variant: QuickAddVariant, lang: "ar" | "en"): string | null {
  const size =
    variant.size && !isPlaceholderVariant(variant)
      ? formatSizeWithUnit(variant.size, variant.size_unit, lang) || variant.size
      : null;
  const others = [variant.color, variant.fabric, variant.option_four, variant.option_five]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .map((part) => translateOptionValue(part, lang) || part);
  const parts = [size, ...others].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" · ") : null;
}
