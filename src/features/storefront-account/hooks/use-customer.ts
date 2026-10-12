import { useQuery } from "@tanstack/react-query";
import { useStorefront } from "@/lib/storefront-context";
import { ownCustomerQueries } from "@/lib/data/customers";

/** The signed-in shopper's own customer record with this store. */
export function useCustomer() {
  const { brand, session } = useStorefront();
  return useQuery(ownCustomerQueries.profile(brand.id, session?.user?.id));
}
