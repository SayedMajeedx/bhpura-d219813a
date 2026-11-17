import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { catalogKeys } from "./keys";

/**
 * A store's size codes (migration 20261213100000): what its next number is, and writing many
 * codes at once. A new size with no code is numbered by the database itself.
 */

export type CodeNumbering = { prefix: string; nextNumber: number };

export async function fetchCodeNumbering(brandId: string): Promise<CodeNumbering> {
  const { data, error } = await supabase.rpc("next_variant_code_number", { p_brand_id: brandId });
  if (error) throw error;
  const row = (data ?? {}) as { prefix?: unknown; next_number?: unknown };
  return { prefix: String(row.prefix ?? ""), nextNumber: Number(row.next_number ?? 1) || 1 };
}

export const codeNumberingQueries = {
  next: (brandId: string) =>
    queryOptions({
      queryKey: catalogKeys.codeNumbering(brandId),
      queryFn: () => fetchCodeNumbering(brandId),
      enabled: Boolean(brandId),
      staleTime: 0,
    }),
};

export type CodeAssignment = { variantId: string; sku: string; barcode: string | null };

/**
 * Writes the codes (and new barcodes) in one step: all or none; a code already used is refused
 * (`CODE_TAKEN:<variant>`). With `fillPartnerCodes`, pieces at a partner shop with no code there
 * take the size's code.
 */
export async function assignVariantCodes(
  items: readonly CodeAssignment[],
  fillPartnerCodes: boolean,
): Promise<{ codes: number; barcodes: number; partnerCodes: number }> {
  const { data, error } = await supabase.rpc("assign_variant_codes", {
    p_items: items.map((item) => ({
      variant_id: item.variantId,
      sku: item.sku,
      barcode: item.barcode ?? "",
    })),
    p_fill_partner_codes: fillPartnerCodes,
  });
  if (error) throw error;
  const row = (data ?? {}) as { codes?: unknown; barcodes?: unknown; partner_codes?: unknown };
  return {
    codes: Number(row.codes ?? 0),
    barcodes: Number(row.barcodes ?? 0),
    partnerCodes: Number(row.partner_codes ?? 0),
  };
}
