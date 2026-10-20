import { useState } from "react";
import { ChevronRight, CircleDollarSign } from "lucide-react";
import { MissingCostsDialog } from "@/features/inventory/components/MissingCostsDialog";
import { arCount } from "@/features/outreach/lib/outreach-messages";

const PRODUCTS = { one: "منتج واحد", two: "منتجان", few: "منتجات", many: "منتجاً" };
import type { MissingCostProduct } from "@/features/inventory/lib/missing-costs";

/**
 * One line above the inventory list while products have no cost, the way in to the sheet that
 * fills them in. Shown only to staff who may see costs (for anyone else every cost reads as zero).
 */
export function MissingCostsLine<P extends MissingCostProduct>({
  count,
  products,
  variantsByProduct,
  lowestPrice,
  brandId,
  currency,
  isAr,
  onSaved,
}: {
  /** Products with no cost (the needs-attention rule's count). */
  count: number;
  products: readonly P[];
  variantsByProduct: Readonly<Record<string, ReadonlyArray<{ cost_price?: number | null }>>>;
  lowestPrice: (productId: string) => number;
  brandId: string;
  currency: string;
  isAr: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0 && !open) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-warning/30 bg-warning-subtle px-4 py-3 text-start transition-colors hover:bg-warning-subtle/70"
      >
        <CircleDollarSign className="size-4 shrink-0 text-warning" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm font-medium">
          {isAr
            ? `${arCount(count, PRODUCTS)} بلا تكلفة، فيُحسب سعرها كله ربحاً`
            : count === 1
              ? "1 product has no cost, so its whole price counts as profit"
              : `${count} products have no cost, so their whole price counts as profit`}
        </span>
        <span className="shrink-0 text-sm font-bold text-warning">
          {isAr ? "أكمل التكاليف" : "Fill them in"}
        </span>
        <ChevronRight className="size-4 shrink-0 text-warning rtl:rotate-180" aria-hidden="true" />
      </button>
      <MissingCostsDialog
        open={open}
        onOpenChange={setOpen}
        products={products}
        variantsByProduct={variantsByProduct}
        lowestPrice={lowestPrice}
        brandId={brandId}
        currency={currency}
        isAr={isAr}
        onSaved={onSaved}
      />
    </>
  );
}
