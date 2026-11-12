import { Check, Flower2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/storefront-context";
import { addonName } from "@/lib/gift-addons";
import { cn } from "@/lib/utils";
import type { Storefront } from "@/features/checkout/types";
import type { CheckoutGift } from "@/features/checkout/hooks/use-checkout-gift";

/**
 * The store's gift add-ons at checkout (a flower bouquet, chocolates): each with its picture, name
 * and price, added or taken off with one tap. Its price joins the order's total; the database
 * prices it from the store's own row. Nothing is drawn when the store lists none.
 */
export function GiftAddonsPicker({
  gift,
  currency,
  lang,
  t,
}: {
  /** The store's add-ons, what was chosen and how one is ticked (checkout's gift, a printed card). */
  gift: Pick<CheckoutGift, "addons" | "chosen" | "toggleAddon">;
  currency: string;
  lang: Storefront["lang"];
  t: Storefront["t"];
}) {
  if (gift.addons.length === 0) return null;
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium">{t("أضف إلى الهدية", "Add to the gift")}</legend>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {gift.addons.map((addon) => {
          const added = (gift.chosen[addon.id] ?? 0) > 0;
          const name = addonName(addon, lang);
          const price = formatPrice(addon.price, currency, lang);
          return (
            <li key={addon.id}>
              <Button
                type="button"
                variant="outline"
                aria-pressed={added}
                aria-label={
                  added
                    ? t(`إزالة ${name} من الهدية`, `Remove ${name} from the gift`)
                    : t(`إضافة ${name} إلى الهدية، ${price}`, `Add ${name} to the gift, ${price}`)
                }
                onClick={() => gift.toggleAddon(addon.id)}
                className={cn(
                  "h-auto min-h-16 w-full justify-start gap-3 rounded-lg bg-background p-2 text-start font-normal whitespace-normal",
                  added ? "border-primary ring-1 ring-primary" : "border-border",
                )}
              >
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {addon.imageUrl ? (
                    <img
                      src={addon.imageUrl}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <Flower2 className="size-5 text-muted-foreground" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-sm font-medium break-words" dir="auto">
                    {name}
                  </span>
                  <span className="block font-mono text-xs text-muted-foreground">+ {price}</span>
                </span>
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border",
                    added
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-foreground",
                  )}
                  aria-hidden
                >
                  {added ? <Check className="size-4" /> : <Plus className="size-4" />}
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
