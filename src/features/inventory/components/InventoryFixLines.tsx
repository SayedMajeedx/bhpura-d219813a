import { MissingCostsLine } from "@/features/inventory/components/MissingCostsLine";
import { CodeNumberingLine } from "@/features/inventory/components/CodeNumberingDialog";
import type { MissingCostProduct } from "@/features/inventory/lib/missing-costs";
import type { NumberingProduct, NumberingVariant } from "@/features/inventory/lib/code-numbering";

/**
 * The lines above the inventory list that lead to something to fix: products with no cost (staff
 * who may see costs) and sizes with no code (staff who may manage stock). Each draws nothing when
 * there is nothing to fix.
 */
export function InventoryFixLines<P extends MissingCostProduct & NumberingProduct>({
  canViewCosts,
  missingCost,
  products,
  variants,
  variantsByProduct,
  lowestPrice,
  brandId,
  currency,
  isAr,
  onSaved,
}: {
  canViewCosts: boolean;
  /** Products with no cost (the needs-attention rule's count). */
  missingCost: number;
  products: readonly P[];
  variants: readonly NumberingVariant[];
  variantsByProduct: Readonly<Record<string, ReadonlyArray<{ cost_price?: number | null }>>>;
  lowestPrice: (productId: string) => number;
  brandId: string;
  currency: string;
  isAr: boolean;
  onSaved: () => void;
}) {
  return (
    <>
      {canViewCosts && (
        <MissingCostsLine
          count={missingCost}
          products={products}
          variantsByProduct={variantsByProduct}
          lowestPrice={lowestPrice}
          brandId={brandId}
          currency={currency}
          isAr={isAr}
          onSaved={onSaved}
        />
      )}
      <CodeNumberingLine
        brandId={brandId}
        isAr={isAr}
        products={products}
        variants={variants}
        onSaved={onSaved}
      />
    </>
  );
}
