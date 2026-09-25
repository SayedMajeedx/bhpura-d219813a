import { useQuery } from "@tanstack/react-query";
import { profilesQueries } from "@/lib/data/profiles";

/** Active couriers of the brand, by name, for assignment menus. */
export function useBrandCouriers(brandId: string) {
  return useQuery(profilesQueries.couriers(brandId));
}
