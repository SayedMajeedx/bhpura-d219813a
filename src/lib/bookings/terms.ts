/**
 * The booking terms a service's page shows (in place of a product's shipping
 * and returns), from the store's public booking rules.
 */
export function bookingTermsText(
  rules: { lead_days?: number; deposit_percent?: number; hold_minutes?: number } | null | undefined,
  isAr: boolean,
): string {
  const lines: string[] = [];
  const lead = Number(rules?.lead_days ?? 0);
  if (lead === 1) lines.push(isAr ? "احجز قبل يوم على الأقل." : "Book at least a day ahead.");
  else if (lead > 1)
    lines.push(isAr ? `احجز قبل ${lead} أيام على الأقل.` : `Book at least ${lead} days ahead.`);
  else lines.push(isAr ? "يمكن الحجز لنفس اليوم إن توفّر." : "Same-day bookings when available.");

  const deposit = Number(rules?.deposit_percent ?? 0);
  if (deposit > 0) {
    lines.push(
      isAr
        ? `عند الدفع بالبطاقة يُدفع عربون ${deposit}٪ لتأكيد الموعد، والباقي يوم المناسبة.`
        : `Paying by card takes a ${deposit}% deposit to confirm your date; the rest is paid on the day.`,
    );
  }
  const hold = Number(rules?.hold_minutes ?? 0);
  if (hold > 0) {
    lines.push(
      isAr
        ? `نحجز لك الموعد ${hold} دقيقة وأنت تكمل الدفع.`
        : `Your date is held for ${hold} minutes while you check out.`,
    );
  }
  lines.push(
    isAr
      ? "لتغيير الموعد أو إلغائه تواصل معنا، ونرتّب معك الأنسب."
      : "To change or cancel your booking, contact us and we will sort it out with you.",
  );
  return lines.join("\n");
}
