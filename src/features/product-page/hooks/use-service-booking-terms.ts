import { useQuery } from "@tanstack/react-query";
import { useStorefront } from "@/lib/storefront-context";
import { bookingsQueries } from "@/lib/data/bookings";
import { bookingPoliciesQueries } from "@/lib/data/booking-policies";
import { bookingTermsText } from "@/lib/bookings/terms";
import { depositTerms } from "@/lib/bookings/deposit";

/**
 * The booking terms a service's page shows in place of shipping and returns:
 * the store's booking rules, with the deposit it really takes and when the
 * rest is due by its own terms. Reads nothing for a store without bookings.
 */
export function useServiceBookingTerms(enabled: boolean) {
  const { brand, settings } = useStorefront();
  const rules = useQuery({ ...bookingsQueries.publicRules(brand.id), enabled }).data;
  const policy = useQuery({ ...bookingPoliciesQueries.policy(brand.id), enabled }).data;
  return (isAr: boolean) => bookingTermsText(rules, isAr, depositTerms(rules, settings, policy));
}
