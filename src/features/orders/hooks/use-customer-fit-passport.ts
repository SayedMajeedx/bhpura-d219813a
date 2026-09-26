import { useQuery } from "@tanstack/react-query";
import { addonDataQueries } from "@/lib/data/addons";

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
    ...addonDataQueries.customerFitPassport(brandId, customerId ?? ""),
    enabled: enabled && Boolean(customerId),
    select: (row) =>
      row as {
        measurements: unknown;
        preferred_length_unit: "in" | "cm";
        version: number;
      } | null,
  });
}
