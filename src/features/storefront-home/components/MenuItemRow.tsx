import { Link } from "@tanstack/react-router";
import { CardFactLine } from "@/components/storefront/CardFactLine";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice, pickName, useStorefront } from "@/lib/storefront-context";
import type { ProductRow } from "@/lib/data/storefront";
import {
  basketQty,
  menuCartLine,
  menuItemAction,
  menuPrice,
  type MenuVariant,
} from "@/features/storefront-home/lib/menu-home";

/**
 * One variant's quantity in the basket, changed in place: "Add", then − n +. The basket's own
 * limits hold (a variant never goes past its pieces), and − at one takes it out.
 */
export function BasketStepper({
  product,
  variant,
  name,
}: {
  product: ProductRow;
  variant: MenuVariant;
  name: string;
}) {
  const { cart, addToCart, updateQty, t } = useStorefront();
  const qty = basketQty(cart, variant.id);
  const line = cart.find(
    (c) =>
      c.variant_id === variant.id && !(Array.isArray(c.custom_fields) && c.custom_fields.length),
  );
  const add = () => addToCart(menuCartLine(product, variant));

  if (qty === 0 || !line) {
    return (
      <Button type="button" size="sm" className="h-9 gap-1 rounded-full px-4" onClick={add}>
        <Plus className="size-4" aria-hidden="true" />
        {t("أضف", "Add")} <span className="sr-only">{name}</span>
      </Button>
    );
  }
  return (
    <div
      className="flex h-9 items-center gap-1 rounded-full border border-primary/40 bg-primary/5"
      role="group"
      aria-label={t(`الكمية من ${name}`, `${name} in your basket`)}
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9 rounded-full"
        aria-label={t(`أنقص ${name}`, `One less ${name}`)}
        onClick={() => updateQty(line.cart_line_id, qty - 1)}
      >
        <Minus className="size-4" aria-hidden="true" />
      </Button>
      <span className="min-w-5 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {qty}
      </span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9 rounded-full"
        aria-label={t(`زد ${name}`, `One more ${name}`)}
        disabled={qty >= line.max_stock}
        onClick={add}
      >
        <Plus className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * An item on the menu: its square photo and name (both open its page), a line of what it is, its
 * price, and one button by what it takes to buy it (`menuItemAction`).
 */
export function MenuItemRow({
  product,
  onChoose,
}: {
  product: ProductRow;
  /** Opens the choice of its options (weight, flavour...). */
  onChoose: (product: ProductRow) => void;
}) {
  const { brand, lang, currency, cart, t } = useStorefront();
  const isAr = lang === "ar";
  const name = pickName(lang, product);
  const description = (
    (isAr ? product.description_ar : product.description_en) ??
    product.description ??
    ""
  ).trim();
  const action = menuItemAction(product);
  const price = menuPrice(product);
  const inBasket = (product.product_variants ?? []).reduce(
    (sum, v) => sum + basketQty(cart, v.id),
    0,
  );
  const page = { to: "/$slug/product/$id" as const, params: { slug: brand.slug, id: product.id } };

  return (
    <li className="flex items-start gap-3 py-4">
      <Link {...page} className="shrink-0" tabIndex={-1} aria-hidden="true">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt=""
            loading="lazy"
            className="size-20 rounded-xl object-cover sm:size-24"
          />
        ) : (
          <span className="block size-20 rounded-xl bg-muted sm:size-24" />
        )}
      </Link>
      <div className="min-w-0 flex-1 space-y-1">
        <Link
          {...page}
          dir="auto"
          className="text-page-start line-clamp-2 break-words font-semibold text-foreground hover:underline"
        >
          {name}
        </Link>
        <CardFactLine details={product.details} reserve={false} />
        {description && (
          <p dir="auto" className="text-page-start line-clamp-2 text-sm text-muted-foreground">
            {description}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-sm font-semibold text-foreground">
            {price ? (
              <>
                {price.from ? t("من ", "From ") : ""}
                <span dir="ltr">{formatPrice(price.amount, currency, lang)}</span>
              </>
            ) : null}
          </p>
          {action.kind === "add" && (
            <BasketStepper product={product} variant={action.variant} name={name} />
          )}
          {action.kind === "choose" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 rounded-full px-4"
              onClick={() => onChoose(product)}
            >
              {inBasket > 0
                ? t(`اختر · ${inBasket} في السلة`, `Choose · ${inBasket} in basket`)
                : t("اختر", "Choose")}{" "}
              <span className="sr-only">{name}</span>
            </Button>
          )}
          {action.kind === "details" && (
            <Button asChild size="sm" variant="outline" className="h-9 rounded-full px-4">
              <Link {...page}>
                {t("التفاصيل", "Details")} <span className="sr-only">{name}</span>
              </Link>
            </Button>
          )}
          {action.kind === "sold_out" && (
            <span className="text-xs font-medium text-muted-foreground">
              {t("نفدت الكمية", "Sold out")}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
