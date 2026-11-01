import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useStoreModules, useStorefront } from "@/lib/storefront-context";
import { buildCartItem } from "@/lib/cart/add-to-cart";
import { openCartDrawer } from "@/lib/cart-drawer";
import { useLiveOffers } from "@/hooks/use-live-offers";
import { offeredPiecePrice } from "@/lib/offer-price";
import { useVariantAxes, type VariantField, type VariantLike } from "@/lib/variant-axes";
import type { ProductVariantLabels } from "@/lib/addons/addon-registry";
import {
  chosenChoice,
  pickOption,
  quickAddPlan,
  valueFits,
  type Picked,
  type QuickAddPlan,
  type QuickAddProduct,
  type QuickAddVariant,
} from "@/features/product-page/lib/quick-add";

/** The product a quick add reads: what a card and the product page carry. */
export type QuickAddItem = Omit<QuickAddProduct, "custom_fields"> &
  ProductVariantLabels & {
    custom_fields?: Array<{ key: string; required?: boolean }> | null;
    id: string;
    name: string;
    name_ar?: string | null;
    name_en?: string | null;
    base_price?: number | null;
    original_price?: number | null;
    image_url?: string | null;
    product_variants?: VariantLike[] | null;
  };

/**
 * What a card, its quick view and the phone's sheet offer to add, read once by the product page's
 * rule (`quickAddPlan`) with the store's made-to-order module.
 */
export function useQuickAddPlan(
  product: QuickAddItem,
  variants: readonly QuickAddVariant[] | null | undefined,
) {
  const modules = useStoreModules();
  const madeToOrderModule = Boolean(modules.made_to_order);
  return useMemo(
    () =>
      quickAddPlan(product, variants ?? [], {
        madeToOrderModule,
      }),
    [product, variants, madeToOrderModule],
  );
}

/** The pieces a plan can add (none for a plan that opens a page). */
export function planChoices<V>(plan: QuickAddPlan): V[] {
  return (plan.kind === "add" ? plan.choices : []) as V[];
}

/**
 * The shopper's picks among the pieces that can be added: the options in the store's words
 * (`useVariantAxes` over those pieces only), what has been picked, the piece it names (nothing is
 * chosen for the shopper) and the first option still to pick.
 */
export function useQuickAddChoice<V extends QuickAddVariant>(product: QuickAddItem, choices: V[]) {
  const axes = useVariantAxes(product, choices as VariantLike[]);
  const [picked, setPicked] = useState<Picked>({});
  const openFields = axes.filter((axis) => axis.values.length > 1).map((axis) => axis.field);
  const selected = chosenChoice(choices, openFields, picked);
  const openAxis = axes.find((axis) => axis.values.length > 1 && !picked[axis.field]) ?? null;
  return {
    axes,
    picked,
    selected,
    openAxis,
    /** Picks `value`; returns the picks it leaves, to show a photo of them. */
    select(field: VariantField, value: string): Picked {
      const next = pickOption(choices, picked, field, value);
      setPicked(next);
      return next;
    },
    fits: (field: VariantField, value: string) => valueFits(choices, picked, field, value),
  };
}

type PricedVariant = { selling_price?: number | null; original_price?: number | null };

/**
 * The price a quick add shows: the chosen piece's, else the cheapest that can be added ("from"
 * when the pieces differ), after the store's offers (`offeredPiecePrice`).
 */
export function useQuickAddPrice<V extends PricedVariant>(
  product: QuickAddItem,
  choices: V[],
  selected: V | null,
  fallback: V | null,
) {
  const offers = useLiveOffers();
  const cheapest = [...choices].sort(
    (a, b) => Number(a.selling_price ?? 0) - Number(b.selling_price ?? 0),
  )[0];
  const priced = selected ?? cheapest ?? fallback;
  const from =
    !selected && new Set(choices.map((variant) => Number(variant.selling_price ?? 0))).size > 1;
  const offered = priced ? offeredPiecePrice(offers, product, priced) : null;
  const price = offered?.offer
    ? offered.price
    : Number(priced?.selling_price ?? product?.base_price ?? 0);
  const rawWas = offered?.offer ? offered.was : (priced?.original_price ?? product?.original_price);
  const was = rawWas && Number(rawWas) > price ? Number(rawWas) : null;
  return { price, was, from };
}

export type QuickAddPage = "tailor" | "details" | "book" | "product";

/**
 * What a quick add does: put a piece in the bag (a made-to-order piece's ready size as ready, as
 * the product page does), open the bag after it, or open the page the plan sends the shopper to
 * (a service to its booking page with the service chosen, never the bag).
 */
export function useQuickAddActions(product: QuickAddItem, plan: QuickAddPlan) {
  const { brand, addToCart, t } = useStorefront();
  const navigate = useNavigate();
  const slug = brand.slug;

  const openPage = (page: QuickAddPage) => {
    if (page === "book") {
      navigate({ to: "/$slug/book", params: { slug }, search: { service: product.id } });
      return;
    }
    navigate({
      to: "/$slug/product/$id",
      params: { slug, id: product.id },
      search: page === "tailor" ? { mode: "custom" } : {},
    });
  };

  /** The bag opens on what was added; a page with no drawer says so in a note. */
  const openBag = () => {
    if (openCartDrawer()) return;
    toast.success(t("تمت الإضافة إلى السلة", "Added to cart"), {
      action: {
        label: t("عرض السلة", "View bag"),
        onClick: () => {
          if (!openCartDrawer()) navigate({ to: "/$slug/checkout", params: { slug } });
        },
      },
    });
  };

  const add = (variant: QuickAddVariant & { color?: string | null }, qty = 1) => {
    addToCart(
      buildCartItem({
        product,
        variant,
        qty,
        selectedColor: variant.color,
        selectedSize: variant.size,
        ...(plan.kind === "add" && plan.tailored !== undefined ? { tailored: plan.tailored } : {}),
      }),
    );
  };

  return { add, openBag, openPage };
}
