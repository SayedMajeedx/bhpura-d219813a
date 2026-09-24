import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** The order customer's saved Fit Passport measurements (fit-passport module only). */
export function useCustomerFitPassport({
  brandId,
  customerId,
  enabled,
}: {
  brandId: string;
  customerId: string | null | undefined;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["admin-order-fit-passport", brandId, customerId],
    enabled: enabled && Boolean(customerId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customer_fit_passports")
        .select("measurements,preferred_length_unit,version")
        .eq("brand_id", brandId)
        .eq("customer_id", customerId!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        measurements: unknown;
        preferred_length_unit: "in" | "cm";
        version: number;
      } | null;
    },
  });
}
