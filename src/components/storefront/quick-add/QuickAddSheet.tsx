import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatPrice, pickName, useStorefront } from "@/lib/storefront-context";
import { storefrontQueries } from "@/lib/data/storefront";
import { productCover } from "@/lib/product-photo";
import type { QuickAddVariant } from "@/features/product-page/lib/quick-add";
import {
  planChoices,
  useQuickAddActions,
  useQuickAddChoice,
  useQuickAddPlan,
  useQuickAddPrice,
  type QuickAddItem,
  type QuickAddPage,
} from "./use-quick-add";
import { LowStockNote, QuickAddButtons, QuickAddOptions } from "./QuickAddParts";

type Piece = QuickAddVariant & {
  selling_price?: number | null;
  original_price?: number | null;
  image_url?: string | null;
};

/**
 * Quick add on a phone or a tablet, where a card has no hover: a sheet from the foot of the screen
 * with the same choices as the laptop's popover and quick view (`quickAddPlan`): the options in the
 * store's words (a colour as swatches), nothing chosen for the shopper, the "last pieces" line, then
 * the bag opens on what was added. Mounted only while open, so a grid of cards loads nothing more.
 */
export function QuickAddSheet({
  product: cardProduct,
  onOpenChange,
}: {
  product: QuickAddItem;
  onOpenChange: (open: boolean) => void;
}) {
  const { lang, currency, t, brand } = useStorefront();
  // The card's product is trimmed (no option labels, units or extra option columns): read the
  // product page's own record, from its cache, and show the card's until it comes.
  const { data: fullProduct } = useQuery(storefrontQueries.product(brand, cardProduct.id));
  const product = { ...cardProduct, ...((fullProduct as object | null) ?? {}) };
  const variants = (product.product_variants ?? []) as Piece[];
  const plan = useQuickAddPlan(product, variants);
  const choices = planChoices<Piece>(plan);
  const choice = useQuickAddChoice(product, choices);
  const { price, was, from } = useQuickAddPrice(
    product,
    choices,
    choice.selected,
    variants[0] ?? null,
  );
  const actions = useQuickAddActions(product, plan);
  const name = pickName(lang, product);
  const cover = (choice.selected?.image_url as string | null | undefined) || productCover(product);

  const close = () => onOpenChange(false);
  const openPage = (page: QuickAddPage) => {
    close();
    actions.openPage(page);
  };
  const add = () => {
    if (plan.kind !== "add" || !choice.selected) return;
    try {
      actions.add(choice.selected);
      close();
      // The bag opens on what was added once the sheet has gone.
      window.setTimeout(actions.openBag, 0);
    } catch {
      toast.error(t("حدث خطأ أثناء الإضافة", "Could not add item to bag"));
    }
  };

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
      >
        <SheetHeader className="text-start">
          <div className="flex items-center gap-3">
            {cover && <img src={cover} alt="" className="size-16 rounded-xl object-cover" />}
            <div className="min-w-0">
              <SheetTitle dir="auto" className="text-page-start line-clamp-2 break-words">
                {name}
              </SheetTitle>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {from && (
                  <span className="me-1 text-xs font-normal text-muted-foreground">
                    {t("من", "From")}
                  </span>
                )}
                {formatPrice(price, currency, lang)}
                {was && (
                  <span className="ms-2 text-xs font-normal text-muted-foreground line-through">
                    {formatPrice(was, currency, lang)}
                  </span>
                )}
              </p>
            </div>
          </div>
          <SheetDescription className="sr-only">
            {t("اختر ما تضيفه إلى السلة", "Choose what to add to your bag")}
          </SheetDescription>
        </SheetHeader>

        <div className="pt-4">
          {choice.axes.length > 0 && <QuickAddOptions choice={choice} choices={choices} />}
          <LowStockNote variant={choice.selected} />
          <div className="mt-5 flex flex-col gap-2">
            <QuickAddButtons plan={plan} choice={choice} onAdd={add} onOpenPage={openPage} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
