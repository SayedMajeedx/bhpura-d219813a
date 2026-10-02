import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { bookingPoliciesQueries } from "@/lib/data/booking-policies";
import { policyLines } from "@/lib/bookings/policies";

/** The store's booking terms (deposit, balance, moving a booking, free text). Nothing when it set none. */
export function BookingPolicies({
  brandId,
  isAr,
  depositPercent,
  eventDay,
}: {
  brandId: string;
  isAr: boolean;
  depositPercent: number;
  eventDay?: string | null;
}) {
  const policy = useQuery(bookingPoliciesQueries.policy(brandId)).data;
  if (!policy) return null;
  const lines = policyLines(policy, { isAr, depositPercent, eventDay });
  if (lines.length === 0) return null;
  return (
    <section
      className="space-y-2 rounded-2xl border border-border bg-card p-4 text-start"
      aria-labelledby="booking-terms-title"
    >
      <h2
        id="booking-terms-title"
        className="flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        <ScrollText className="size-4 text-primary" aria-hidden="true" />
        {isAr ? "شروط الحجز" : "Booking terms"}
      </h2>
      <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
        {lines.map((line) => (
          <li key={line} className="whitespace-pre-line">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
