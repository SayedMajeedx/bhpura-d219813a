/**
 * An appointment invoice's booking terms (the store's booking policy: deposit,
 * the balance's due day, moving a booking, free text), in the invoice's own
 * colours. Both the admin preview and the public invoice draw it; nothing when
 * the store set no terms.
 */
export function InvoiceBookingTerms({
  lines,
  isRTL,
  background,
  color,
}: {
  lines: readonly string[];
  isRTL: boolean;
  background: string;
  color: string;
}) {
  if (lines.length === 0) return null;
  return (
    <div
      className="space-y-1 rounded-md p-3 text-xs leading-relaxed"
      style={{ backgroundColor: background }}
    >
      <p className="font-semibold" style={{ color }}>
        {isRTL ? "شروط الحجز" : "Booking terms"}
      </p>
      <ul className="list-disc space-y-0.5 ps-4" style={{ color, opacity: 0.88 }}>
        {lines.map((line) => (
          <li key={line} className="whitespace-pre-line">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
