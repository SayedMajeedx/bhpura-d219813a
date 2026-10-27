import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { useBrandOptional } from "@/lib/brand-context";
import { orderNumberLabel, type OrderNumberFormat } from "@/lib/order-number";

/**
 * How the open store writes its order numbers (`order_number_prefix`, `order_number_digits`),
 * from the settings row the admin already keeps in its cache; null until it is known.
 */
export function useOrderNumberFormat(brandId?: string | null): OrderNumberFormat | null {
  const openBrand = useBrandOptional();
  const id = brandId ?? openBrand?.id ?? "";
  const { data } = useQuery({ ...businessSettingsQueries.detail(id), enabled: Boolean(id) });
  return data ?? null;
}

/** An order's number as the open store writes it ("PL-01042", "#1042"): `orderNumberLabel`. */
export function useOrderNumber(
  brandId?: string | null,
): (invoiceNumber: number | string | null | undefined, fallbackId?: string | null) => string {
  const format = useOrderNumberFormat(brandId);
  return useCallback(
    (invoiceNumber, fallbackId) => orderNumberLabel(invoiceNumber, format, fallbackId),
    [format],
  );
}
