import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatPrice, pickName, useStorefront } from "@/lib/storefront-context";
import { storefrontQueries, type ProductRow } from "@/lib/data/storefront";
import { buildCartItem } from "@/lib/cart/add-to-cart";
import { formatAxisValue, useVariantAxes } from "@/lib/variant-axes";
import { variantSellable } from "@/lib/product-availability";
import {
  chosenVariant,
  type OfferedOptions,
  type VariantSelection,
} from "@/features/product-page/lib/variant-options";
import { valueOpen } from "@/features/storefront-home/lib/menu-home";

const NOTHING_CHOSEN: VariantSelection = {
  size: null,
  color: null,
  fabric: null,
  four: null,
  five: null,
};

/**
 * Choosing an item's options from the menu (a weight, a flavour) and how many, then adding that
 * one variant. It reads the product as its page does (every option, in the store's own words for
 * them), names nothing for the shopper (`chosenVariant`), and greys a value no variant a shopper
 * can buy carries with what is already chosen.
 */
export function MenuItemSheet({
  product,
  onOpenChange,
}: {
  product: ProductRow;
  onOpenChange: (open: boolean) => void;
}) {
  const { brand, lang, currency, addToCart, t } = useStorefront();
  const isAr = lang === "ar";
  const quantityId = useId();
  const detail = useQuery(storefrontQueries.product(brand, product.id)).data;
  const variants = detail?.product_variants ?? [];
  const axes = useVariantAxes(detail ?? null, variants);
  const [selection, setSelection] = useState<VariantSelection>(NOTHING_CHOSEN);
  const [qty, setQty] = useState(1);

  const offered = Object.fromEntries(
    (Object.keys(NOTHING_CHOSEN) as Array<keyof VariantSelection>).map((key) => [
      key,
      axes.find((axis) => axis.key === key)?.values ?? [],
    ]),
  ) as unknown as OfferedOptions;
  const chosen = detail ? chosenVariant(variants, selection, offered) : null;
  const buyable = Boolean(detail && chosen && variantSellable(detail, chosen));
  const pieces = chosen ? Number(chosen.stock_main ?? 0) + Number(chosen.stock_incubator ?? 0) : 0;
  const most = pieces > 0 ? pieces : 99;
  const name = pickName(lang, product);

  const add = () => {
    if (!detail || !chosen || !buyable) return;
    addToCart(buildCartItem({ product: { ...detail, custom_fields: null }, variant: chosen, qty }));
    toast.success(t(`أُضيف ${name} إلى السلة`, `${name} added to your basket`));
    onOpenChange(false);
  };

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        dir={isAr ? "rtl" : "ltr"}
        className="mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
      >
        <SheetHeader className="text-start">
          <div className="flex items-center gap-3">
            {product.image_url && (
              <img src={product.image_url} alt="" className="size-16 rounded-xl object-cover" />
            )}
            <div className="min-w-0">
              <SheetTitle dir="auto" className="text-page-start line-clamp-2 break-words">
                {name}
              </SheetTitle>
              <SheetDescription>{t("اختر ما تريد", "Choose what you would like")}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {!detail ? (
          <div className="flex h-32 items-center justify-center" role="status">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{t("جارٍ التحميل…", "Loading…")}</span>
          </div>
        ) : (
          <div className="space-y-5 pt-2">
            {axes
              .filter((axis) => axis.values.length > 1)
              .map((axis) => (
                <fieldset key={axis.key} className="space-y-2">
                  <legend className="text-sm font-semibold text-foreground">{axis.label}</legend>
                  <div className="flex flex-wrap gap-2">
                    {axis.values.map((value) => {
                      const picked = selection[axis.key] === value;
                      const open = valueOpen(detail, variants, axis.key, value, selection);
                      return (
                        <Button
                          key={value}
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-pressed={picked}
                          disabled={!open && !picked}
                          onClick={() =>
                            setSelection((current) => ({
                              ...current,
                              [axis.key]: picked ? null : value,
                            }))
                          }
                          className={cn(
                            "h-10 rounded-full px-4",
                            picked && "border-primary bg-primary/10 ring-1 ring-primary",
                          )}
                        >
                          {formatAxisValue(axis, value, isAr ? "ar" : "en", variants)}
                        </Button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}

            <div className="flex items-center justify-between gap-3">
              <span id={quantityId} className="text-sm font-semibold text-foreground">
                {t("الكمية", "Quantity")}
              </span>
              <div
                className="flex h-10 items-center gap-1 rounded-full border border-border"
                role="group"
                aria-labelledby={quantityId}
              >
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-10 rounded-full"
                  aria-label={t("أقل", "Fewer")}
                  disabled={qty <= 1}
                  onClick={() => setQty((n) => Math.max(1, n - 1))}
                >
                  <Minus className="size-4" aria-hidden="true" />
                </Button>
                <span className="min-w-6 text-center font-semibold tabular-nums">{qty}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-10 rounded-full"
                  aria-label={t("أكثر", "More")}
                  disabled={qty >= most}
                  onClick={() => setQty((n) => Math.min(most, n + 1))}
                >
                  <Plus className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <Button
              type="button"
              size="lg"
              className="w-full rounded-full"
              disabled={!buyable}
              onClick={add}
            >
              {buyable && chosen ? (
                <>
                  {t("أضف إلى السلة · ", "Add to basket · ")}
                  <span dir="ltr">
                    {formatPrice(Number(chosen.selling_price) * qty, currency, lang)}
                  </span>
                </>
              ) : chosen ? (
                t("نفدت الكمية", "Sold out")
              ) : (
                t("اختر أولاً", "Choose first")
              )}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
