import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { readAll } from "../read-all";
import { storedParts, type CostPart } from "@/features/inventory/lib/cost-parts";

/**
 * What a brand pays for its products. These rows are visible only to the brand's own staff who
 * may see its finances (`can_view_brand_costs`: the row policy on `product_costs` and
 * `variant_costs`), so a visitor, a shopper's account and a member of staff without the
 * `view_financials` permission read none: their costs are zero here, their screens show no cost
 * field, and the database keeps the real costs when they save (migration `20261013150000`). The
 * admin screens ask for the costs next to the catalog and merge them into the rows they show.
 *
 * A failed read throws: a screen that showed zero costs would let someone save them back as zero.
 * For the same reason the lists are read whole (`readAll`): a cost past the API's row limit would
 * read as zero.
 */

export type ProductCost = {
  cost_price: number;
  direct_packaging_cost: number;
  vendor_id: string | null;
  /** The cost in parts (its sum is `cost_price`), or null when it is one number. */
  cost_parts: CostPart[] | null;
};

export async function fetchProductCosts(brandId: string): Promise<Map<string, ProductCost>> {
  const data = await readAll((from, to) =>
    supabase
      .from("product_costs")
      .select("product_id, cost_price, direct_packaging_cost, vendor_id, cost_parts", {
        count: "exact",
      })
      .eq("brand_id", brandId)
      .order("product_id")
      .range(from, to),
  );
  return new Map(
    data.map((row) => [
      row.product_id,
      {
        cost_price: Number(row.cost_price ?? 0),
        direct_packaging_cost: Number(row.direct_packaging_cost ?? 0),
        vendor_id: row.vendor_id ?? null,
        cost_parts: storedParts(row.cost_parts),
      },
    ]),
  );
}

export async function fetchVariantCosts(brandId: string): Promise<Map<string, number>> {
  const data = await readAll((from, to) =>
    supabase
      .from("variant_costs")
      .select("variant_id, cost_price", { count: "exact" })
      .eq("brand_id", brandId)
      .order("variant_id")
      .range(from, to),
  );
  return new Map(data.map((row) => [row.variant_id, Number(row.cost_price ?? 0)]));
}

/** The rows with their costs (zero and no supplier for a product that has no cost row). */
export function withProductCosts<T extends { id: string }>(
  rows: readonly T[],
  costs: ReadonlyMap<string, ProductCost>,
): Array<T & ProductCost> {
  return rows.map((row) => ({
    ...row,
    ...(costs.get(row.id) ?? {
      cost_price: 0,
      direct_packaging_cost: 0,
      vendor_id: null,
      cost_parts: null,
    }),
  }));
}

export function withVariantCosts<T extends { id: string }>(
  rows: readonly T[],
  costs: ReadonlyMap<string, number>,
): Array<T & { cost_price: number }> {
  return rows.map((row) => ({ ...row, cost_price: costs.get(row.id) ?? 0 }));
}

/**
 * A product's cost, as one number or in parts (the database writes their sum as the cost). The
 * product's sizes that were following its cost move with it, and a size with a cost of its own
 * keeps it (`product_costs_sizes_follow`). Staff who may see the store's finances only.
 */
export async function saveProductCost(
  brandId: string,
  productId: string,
  cost: { amount: number } | { parts: CostPart[] | null },
) {
  const values =
    "parts" in cost
      ? { cost_parts: cost.parts as unknown as Json }
      : { cost_price: cost.amount, cost_parts: null };
  const { data, error } = await supabase
    .from("product_costs")
    .upsert({ product_id: productId, brand_id: brandId, ...values }, { onConflict: "product_id" })
    .select("product_id");
  if (error) throw error;
  if (!data?.length) throw new Error("PRODUCT_COST_NOT_SAVED");
}
