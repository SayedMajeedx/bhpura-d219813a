import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TabsPill } from "@/components/motion/TabsPill";
import { formatPrice, pickName, useStorefront } from "@/lib/storefront-context";
import { ownCustomerQueries } from "@/lib/data/customers";
import type { ProductRow } from "@/lib/data/storefront";
import { formatSizeWithUnit } from "@/lib/format";
import { translateOptionValue } from "@/lib/variant-i18n";
import { HeroBanner } from "@/features/storefront-home/components/HeroBanner";
import { BasketStepper, MenuItemRow } from "@/features/storefront-home/components/MenuItemRow";
import { MenuItemSheet } from "@/features/storefront-home/components/MenuItemSheet";
import { MenuBasketBar } from "@/features/storefront-home/components/MenuBasketBar";
import { useCustomer } from "@/features/storefront-account/hooks/use-customer";
import {
  menuSections,
  orderAgainItems,
  type MenuVariant,
} from "@/features/storefront-home/lib/menu-home";

type Category = { slug: string; name_ar?: string | null; name_en?: string | null };

/** Where a section's heading lands when its tab is tapped: under the header and the tabs. */
const SECTION_SCROLL_MARGIN = "calc(var(--sf-header-h, 0px) + 4rem)";

/**
 * The home page of a store that sells by quick order (the `menu` home layout): the store's hero,
 * what the signed-in shopper ordered before, the categories as tabs that stay under the header
 * and follow the scroll, each item a row with one button, and the basket at the foot of the
 * screen. The shop's rails (new arrivals, best sellers) are not drawn: a bakery's customer knows
 * what they came for.
 */
export function MenuHome({
  products,
  categories,
}: {
  products: readonly ProductRow[];
  categories: readonly Category[];
}) {
  const { brand, lang, t } = useStorefront();
  const isAr = lang === "ar";
  const sections = useMemo(
    () => menuSections(products, categories, isAr),
    [products, categories, isAr],
  );
  const customer = useCustomer().data;
  const orders = useQuery(ownCustomerQueries.orders(brand.id, customer?.id)).data;
  const again = useMemo(() => orderAgainItems(orders ?? [], products), [orders, products]);
  const [choosing, setChoosing] = useState<ProductRow | null>(null);
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);

  // The tab of the section being read lights up as the page scrolls.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || sections.length < 2) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);

  // The lit tab stays in view in its row (sideways only: the page does not move).
  useEffect(() => {
    if (!active) return;
    document
      .getElementById(`${active}-tab`)
      ?.scrollIntoView?.({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  const goTo = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="pb-28">
      <HeroBanner />

      {again.length > 0 && (
        <section
          className="mx-auto w-full max-w-3xl space-y-3 px-4 pt-6"
          aria-labelledby="menu-again-title"
        >
          <h2 id="menu-again-title" className="font-display text-xl text-foreground">
            {t("اطلب مرة أخرى", "Order again")}
          </h2>
          <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
            {again.map(({ product, variant }) => (
              <OrderAgainCard key={variant.id} product={product} variant={variant} />
            ))}
          </ul>
        </section>
      )}

      {sections.length > 1 && (
        <nav
          aria-label={t("أقسام القائمة", "Menu sections")}
          className="sticky z-30 mt-4 border-b border-border bg-background/95 backdrop-blur"
          style={{ top: "var(--sf-header-h, 0px)" }}
        >
          {/* The lit section's fill slides along the row as the page scrolls (transitions.dev's
              tabs sliding): the fill is the row's one pill, the tabs are its words. */}
          <ul className="t-tabs relative mx-auto flex max-w-3xl snap-x gap-2 overflow-x-auto px-4 py-2.5 scrollbar-none">
            <TabsPill as="li" />
            {sections.map((section) => (
              <li
                key={section.id}
                data-active={active === section.id ? "true" : "false"}
                className={cn(
                  "t-tab snap-start rounded-full",
                  active === section.id ? "bg-primary" : "bg-muted/60",
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  id={`${section.id}-tab`}
                  aria-current={active === section.id ? "true" : undefined}
                  onClick={() => goTo(section.id)}
                  className={cn(
                    "h-10 rounded-full bg-transparent px-4 text-sm font-medium hover:bg-transparent",
                    active === section.id
                      ? "text-primary-foreground hover:text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {section.title}
                </Button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mx-auto w-full max-w-3xl px-4">
        {sections.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {t("القائمة قيد التحضير.", "The menu is being prepared.")}
          </p>
        )}
        {sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-title`}
            className="pt-6"
            style={{ scrollMarginTop: SECTION_SCROLL_MARGIN }}
          >
            <h2 id={`${section.id}-title`} className="font-display text-xl text-foreground">
              {section.title}
            </h2>
            <ul className="divide-y divide-border">
              {section.products.map((product) => (
                <MenuItemRow key={product.id} product={product} onChoose={setChoosing} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {choosing && (
        <MenuItemSheet product={choosing} onOpenChange={(open) => !open && setChoosing(null)} />
      )}
      <MenuBasketBar />
    </div>
  );
}

/** An item the shopper had before, as they had it: the same weight or flavour, one tap away. */
function OrderAgainCard({ product, variant }: { product: ProductRow; variant: MenuVariant }) {
  const { lang, currency } = useStorefront();
  const name = pickName(lang, product);
  const options = [
    variant.size ? formatSizeWithUnit(variant.size, variant.size_unit, lang) || variant.size : "",
    variant.color ? translateOptionValue(variant.color, lang) || variant.color : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const image = variant.image_url || product.image_url;
  return (
    <li className="w-40 shrink-0 snap-start space-y-2">
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          className="aspect-square w-full rounded-xl object-cover"
        />
      ) : (
        <span className="block aspect-square w-full rounded-xl bg-muted" />
      )}
      <div className="space-y-0.5">
        <p dir="auto" className="text-page-start line-clamp-2 break-words text-sm font-semibold">
          {name}
        </p>
        {options && <p className="text-xs text-muted-foreground">{options}</p>}
        <p className="text-sm" dir="ltr">
          {formatPrice(Number(variant.selling_price), currency, lang)}
        </p>
      </div>
      <BasketStepper product={product} variant={variant} name={name} />
    </li>
  );
}
