import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { bookingPoliciesQueries } from "@/lib/data/booking-policies";
import { policyLines } from "@/lib/bookings/policies";

/**
 * The store's booking terms (deposit, balance, moving a booking, free text). Nothing when it set
 * none. `compact` (the booking page) keeps the short sentences in view and folds the store's own
 * long text behind "Read the full terms", with a line saying that sending the request accepts them.
 */
export function BookingPolicies({
  brandId,
  isAr,
  depositPercent,
  eventDay,
  compact = false,
}: {
  brandId: string;
  isAr: boolean;
  depositPercent: number;
  eventDay?: string | null;
  compact?: boolean;
}) {
  const policy = useQuery(bookingPoliciesQueries.policy(brandId)).data;
  if (!policy) return null;
  const lines = policyLines(policy, { isAr, depositPercent, eventDay });
  if (lines.length === 0) return null;
  const terms = (
    isAr ? policy.terms_ar || policy.terms_en : policy.terms_en || policy.terms_ar
  )?.trim();
  const short = compact && terms ? lines.filter((line) => line !== terms) : lines;
  const folded = compact && terms ? terms : null;
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
      {short.length > 0 && (
        <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
          {short.map((line) => (
            <li key={line} className="whitespace-pre-line">
              {line}
            </li>
          ))}
        </ul>
      )}
      {folded && (
        <Accordion type="single" collapsible>
          <AccordionItem value="terms" className="border-b-0">
            <AccordionTrigger className="py-2 text-sm font-semibold text-primary">
              {isAr ? "اقرأ الشروط كاملة" : "Read the full terms"}
            </AccordionTrigger>
            <AccordionContent className="whitespace-pre-line text-muted-foreground">
              {folded}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
      {compact && (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "بإرسال الطلب فإنك توافق على هذه الشروط."
            : "By sending your request you accept these terms."}
        </p>
      )}
    </section>
  );
}
