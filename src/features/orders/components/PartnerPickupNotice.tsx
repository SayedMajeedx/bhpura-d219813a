import { useQuery } from "@tanstack/react-query";
import { Building2, MessageCircle, Phone } from "lucide-react";
import { useBrand } from "@/lib/brand-context";
import { incubatorsQueries } from "@/lib/data/incubators";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";
import {
  partnerPickupMessage,
  pickupLines,
  type PartnerHold,
  type PickupLine,
} from "@/features/incubators/lib/partner-stock";

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

  // The shopper collects at the partner's shop: the store tells the partner (by hand, on WhatsApp).
  const collected = lines.filter((line) => line.customerCollects);
  if (collected.length > 0) {
    return (
      <CustomerCollectsNotice
        lines={collected}
        store={(isAr ? brand.name_ar : brand.name_en) || brand.name_en}
        isAr={isAr}
      />
    );
  }

  return (
    <div
      role="status"
      className="mt-5 rounded-xl border border-amber-300/70 bg-amber-50/80 p-3 text-start text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        {isAr ? "استلام من المحل الشريك قبل التجهيز" : "Collect from a partner before packing"}
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
          ? "مخزون المحل لم يكفِ، فأُخذت هذه القطع من مخزون المحل الشريك وخُصمت من رصيده."
          : "The store's own stock ran out, so these pieces were taken from the partner's stock and its count was lowered."}
      </p>
    </div>
  );
}

/**
 * The shopper chose to collect at a partner's shop (migration 20261014130000). Partners do not
 * use the system: staff tell the partner which pieces to hand over, in a WhatsApp message a person
 * sends, one per partner.
 */
function CustomerCollectsNotice({
  lines,
  store,
  isAr,
}: {
  lines: readonly PickupLine[];
  store: string;
  isAr: boolean;
}) {
  const partners = [...new Set(lines.map((line) => line.partner))];
  return (
    <div
      role="status"
      className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-3 text-start text-foreground"
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        {isAr
          ? "الزبون يستلم هذا الطلب من محل الشريك"
          : "The customer collects this order at the partner's shop"}
      </p>
      {partners.map((partner) => {
        const own = lines.filter((line) => line.partner === partner);
        const chat = whatsappChatUrl(own[0]?.phone);
        const message = partnerPickupMessage(own, store, isAr ? "ar" : "en");
        return (
          <div key={partner} className="mt-2 space-y-1.5 text-xs">
            <p>
              {isAr ? "عند" : "At"} <b dir="auto">{partner}</b>
            </p>
            <ul className="space-y-1">
              {own.map((line) => (
                <li key={line.key} className="min-w-0 break-words font-semibold" dir="auto">
                  {line.quantity} × {line.piece}
                </li>
              ))}
            </ul>
            {chat ? (
              <a
                href={`${chat}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 font-semibold text-emerald-700 dark:text-emerald-300"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {isAr ? `أبلغ ${partner} على واتساب` : `Tell ${partner} on WhatsApp`}
              </a>
            ) : (
              <p className="text-muted-foreground">
                {isAr
                  ? "لا يوجد رقم للشريك: أضفه في صفحة محلات الشركاء لإبلاغه من هنا."
                  : "The partner has no number: add one on the partners' page to tell them from here."}
              </p>
            )}
          </div>
        );
      })}
      <p className="mt-2 text-xs text-muted-foreground">
        {isAr
          ? "القطع محجوزة من مخزون الشريك. اتفق معه على تسليمها للزبون عند حضوره."
          : "The pieces are reserved from the partner's stock. Arrange with the partner to hand them over when the customer arrives."}
      </p>
    </div>
  );
}
