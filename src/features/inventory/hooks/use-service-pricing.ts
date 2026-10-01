import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { bookingsQueries } from "@/lib/data/bookings";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { catalogQueries } from "@/lib/data/catalog";
import { durations } from "@/lib/bookings/rules";
import { servicePricingFrom, type ServicePricing } from "@/features/inventory/lib/service-pricing";

/**
 * A service's prices for its editor: read once from its variants and the
 * store's booking lengths (both already cached by the inventory page), then
 * edited locally until the editor saves them.
 */
export function useServicePricing(brandId: string, productId: string | null, enabled: boolean) {
  const variantsQ = useQuery({ ...catalogQueries.variants(brandId), enabled });
  const rulesQ = useQuery({ ...bookingsQueries.settings(brandId), enabled });
  const currency = useQuery(businessSettingsQueries.detail(brandId)).data?.currency ?? "BHD";
  const variants = useMemo(
    () => (variantsQ.data ?? []).filter((variant) => variant.product_id === productId),
    [variantsQ.data, productId],
  );
  const [pricing, setPricing] = useState<ServicePricing | null>(null);
  const ready = enabled && variantsQ.isSuccess && !rulesQ.isLoading;

  useEffect(() => {
    if (!ready || pricing) return;
    setPricing(servicePricingFrom(variants, rulesQ.data ? durations(rulesQ.data) : []));
  }, [ready, pricing, variants, rulesQ.data]);

  return { pricing, setPricing, variants, currency };
}
