import { useQuery } from "@tanstack/react-query";
import { Building2, Phone } from "lucide-react";
import { useBrand } from "@/lib/brand-context";
import { incubatorsQueries } from "@/lib/data/incubators";
import { pickupLines, type PartnerHold } from "@/features/incubators/lib/partner-stock";

/** The rows as the rules read them (joined columns narrowed). */
const asHolds = (rows: unknown[]) => rows as PartnerHold[];

/**
 * "Collect from partner": the pieces of this order that are held at a partner. When the store's
 * own stock ran out, the order took them from a partner's shelf; someone has to fetch them
 * before the order is packed. Nothing is shown for an order that took nothing from a partner,
 * or once it is handed over.
 */
export function PartnerPickupNotice({
  orderId,
  lang,
}: {
  orderId: string | null | undefined;
  lang: string;
}) {
  const brand = useBrand();
  const isAr = lang === "ar";
  const saved = Boolean(orderId) && orderId !== "new";
  const holds = useQuery({
    ...incubatorsQueries.orderPickups(brand.id, saved ? String(orderId) : ""),
    select: asHolds,
  });
  const lines = pickupLines(holds.data ?? [], isAr ? "ar" : "en");
  if (lines.length === 0) return null;

  return (
    <div
      role="status"
      className="mt-5 rounded-xl border border-amber-300/70 bg-amber-50/80 p-3 text-start text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        {isAr ? "استلام من الحاضنة قبل التجهيز" : "Collect from a partner before packing"}
      </p>
      <ul className="mt-2 space-y-1.5 text-xs">
        {lines.map((line) => (
          <li key={line.key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words font-semibold" dir="auto">
              {line.quantity} × {line.piece}
            </span>
            <span className="text-amber-900/80 dark:text-amber-100/80">
              {isAr ? "من" : "from"} <b dir="auto">{line.partner}</b>
            </span>
            {line.phone && (
              <a
                href={`tel:${line.phone}`}
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                dir="ltr"
              >
                <Phone className="h-3 w-3" aria-hidden="true" />
                {line.phone}
              </a>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-100/80">
        {isAr
          ? "مخزون المحل لم يكفِ، فأُخذت هذه القطع من مخزون الحاضنة وخُصمت من رصيدها."
          : "The store's own stock ran out, so these pieces were taken from the partner's stock and its count was lowered."}
      </p>
    </div>
  );
}
