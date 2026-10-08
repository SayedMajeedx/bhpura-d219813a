import { supabase } from "@/integrations/supabase/client";

/**
 * What a brand pays for its products. These rows are visible to the brand's own staff only
 * (row policy on `product_costs` and `variant_costs`), so a visitor or a shopper's account reads
 * none. The admin screens ask for them next to the catalog and merge them into the rows they show.
 *
 * A failed read throws: a screen that showed zero costs would let someone save them back as zero.
 */

export type ProductCost = {
  cost_price: number;
  direct_packaging_cost: number;
  vendor_id: string | null;
};

export async function fetchProductCosts(brandId: string): Promise<Map<string, ProductCost>> {
  const { data, error } = await supabase
    .from("product_costs")
    .select("product_id, cost_price, direct_packaging_cost, vendor_id")
    .eq("brand_id", brandId);
  if (error) throw error;
  return new Map(
    (data ?? []).map((row) => [
      row.product_id,
      {
        cost_price: Number(row.cost_price ?? 0),
        direct_packaging_cost: Number(row.direct_packaging_cost ?? 0),
        vendor_id: row.vendor_id ?? null,
      },
    ]),
  );
}

export async function fetchVariantCosts(brandId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("variant_costs")
    .select("variant_id, cost_price")
    .eq("brand_id", brandId);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.variant_id, Number(row.cost_price ?? 0)]));
}

/** The rows with their costs (zero and no supplier for a product that has no cost row). */
export function withProductCosts<T extends { id: string }>(
  rows: readonly T[],
  costs: ReadonlyMap<string, ProductCost>,
): Array<T & ProductCost> {
  return rows.map((row) => ({
    ...row,
    ...(costs.get(row.id) ?? { cost_price: 0, direct_packaging_cost: 0, vendor_id: null }),
  }));
}

export function withVariantCosts<T extends { id: string }>(
  rows: readonly T[],
  costs: ReadonlyMap<string, number>,
): Array<T & { cost_price: number }> {
  return rows.map((row) => ({ ...row, cost_price: costs.get(row.id) ?? 0 }));
}
