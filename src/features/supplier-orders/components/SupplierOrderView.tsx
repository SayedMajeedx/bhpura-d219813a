import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, MessageCircle, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { supplierOrderQueries } from "@/lib/data/supplier-orders";
import { landedUnitCosts } from "../lib/landed-cost";
import {
  isLate,
  piecesLabel,
  piecesOf,
  type SupplierOrder,
  type SupplierOrderLine,
} from "../lib/order-state";
import type { SupplierCatalog } from "../hooks/use-supplier-catalog";
import { SupplierOrderStatusBadge } from "./SupplierOrderStatusBadge";
import { PaymentsCard } from "./PaymentsCard";
import { lateOrderMessage } from "../lib/payments";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";

/** One order as it stands: its pieces and what arrived, its costs, its money and its arrivals. */
export function SupplierOrderView({
  brandId,
  order,
  catalog,
  currency,
  today,
  storeName,
  lang,
}: {
  brandId: string;
  order: SupplierOrder;
  catalog: SupplierCatalog;
  currency: string;
  today: string;
  /** The store's name, as a message to its supplier signs it. */
  storeName: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const locale = isAr ? "ar-BH" : "en-BH";
  const pieces = piecesOf(order);
  const late = isLate(order, today);
  const receiptsQ = useQuery({
    ...supplierOrderQueries.receipts(brandId, order.id),
    enabled: pieces.received > 0,
  });
  const landed = useMemo(
    () =>
      landedUnitCosts(
        order.items.map((line) => ({
          id: line.id,
          isPiece: Boolean(line.variant_id),
          quantity: line.quantity,
          unitCost: line.unit_cost,
        })),
      ),
    [order.items],
  );
  const groups = useMemo(() => {
    const map = new Map<string, SupplierOrderLine[]>();
    for (const line of order.items) {
      if (!line.variant_id) continue;
      const key = line.product_id ?? line.id;
      map.set(key, [...(map.get(key) ?? []), line]);
    }
    return [...map.entries()];
  }, [order.items]);
  const extras = order.items.filter((line) => !line.variant_id);
  const money = (n: number) => formatMoney(n, currency, lang);

  return (
    <div className="space-y-3">
      <Card className="space-y-2 p-3 sm:p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 dir="auto" className="text-page-start break-words text-lg font-bold">
            {order.vendor_name}
          </h2>
          <SupplierOrderStatusBadge status={order.status} late={late} isAr={isAr} />
        </div>
        <p className="text-xs text-muted-foreground">
          <span dir="ltr" className="font-mono">
            {order.po_number}
          </span>
          {" · "}
          {isAr ? "طُلبت " : "Ordered "}
          {formatDate(order.created_at, locale)}
          {order.received_at && (
            <>
              {" · "}
              {isAr ? "اكتمل الاستلام " : "Received "}
              {formatDate(order.received_at, locale)}
            </>
          )}
        </p>
        {order.expected_at && order.status !== "received" && order.status !== "cancelled" && (
          <p
            className={
              late
                ? "flex items-center gap-1 text-sm font-semibold text-warning"
                : "flex items-center gap-1 text-sm"
            }
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            {isAr ? "موعد الوصول " : "Due "}
            {formatDate(order.expected_at, locale)}
          </p>
        )}
        {late && whatsappChatUrl(order.vendor_phone) && (
          <a
            href={`${whatsappChatUrl(order.vendor_phone)}?text=${encodeURIComponent(
              lateOrderMessage(order, storeName, lang),
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted"
          >
            <MessageCircle className="h-4 w-4 text-success" aria-hidden="true" />
            {isAr ? "اسأل المورد عن موعدها" : "Ask the supplier when it comes"}
          </a>
        )}
        {order.notes && (
          <p
            dir="auto"
            className="text-page-start whitespace-pre-line break-words text-sm text-muted-foreground"
          >
            {order.notes}
          </p>
        )}
      </Card>

      <section className="space-y-2" aria-label={isAr ? "القطع" : "Pieces"}>
        <h2 className="px-1 text-sm font-bold">
          {isAr
            ? `القطع: وصل ${pieces.received} من ${pieces.ordered}`
            : `Pieces: ${pieces.received} of ${pieces.ordered} arrived`}
        </h2>
        {groups.map(([key, lines]) => {
          const productId = lines[0].product_id;
          const info = productId ? catalog.productById.get(productId) : undefined;
          return (
            <Card key={key} className="p-3 sm:p-4">
              <div className="mb-2 flex min-w-0 items-center gap-3">
                {info?.image_url ? (
                  <img
                    src={info.image_url}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-muted">
                    <Package className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                )}
                <h3
                  dir="auto"
                  className="text-page-start line-clamp-2 min-w-0 break-words font-bold"
                >
                  {productId ? catalog.productName(productId) : lines[0].description}
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 text-start font-medium">{isAr ? "المقاس" : "Size"}</th>
                    <th className="px-3 py-1 text-center font-medium">
                      {isAr ? "وصل" : "Arrived"}
                    </th>
                    <th className="py-1 text-end font-medium">
                      {isAr ? "تكلفة القطعة" : "Cost a piece"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-t border-border-subtle">
                      <td dir="auto" className="py-1.5 text-page-start">
                        {catalog.sizeName(line.variant_id)}
                      </td>
                      <td
                        dir="ltr"
                        className="whitespace-nowrap px-3 py-1.5 text-center tabular-nums"
                      >
                        <span
                          className={
                            line.received_quantity >= line.quantity ? "font-bold text-success" : ""
                          }
                        >
                          {line.received_quantity}
                        </span>
                        <span className="text-muted-foreground"> / {line.quantity}</span>
                      </td>
                      <td className="py-1.5 text-end tabular-nums">
                        {money(landed.get(line.id) ?? line.unit_cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
      </section>

      {extras.length > 0 && (
        <Card className="space-y-1 p-3 sm:p-4">
          <h2 className="text-sm font-bold">{isAr ? "تكاليف أخرى" : "Other costs"}</h2>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "موزّعة على القطع في تكلفتها أعلاه."
              : "Shared over the pieces in their cost above."}
          </p>
          <ul className="divide-y divide-border-subtle text-sm">
            {extras.map((line) => (
              <li key={line.id} className="flex min-w-0 justify-between gap-3 py-1.5">
                <span dir="auto" className="min-w-0 flex-1 break-words">
                  {line.description}
                </span>
                <span className="shrink-0 tabular-nums">{money(line.line_total)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <PaymentsCard brandId={brandId} order={order} currency={currency} lang={lang} />

      {pieces.received > 0 && (receiptsQ.data?.length ?? 0) > 0 && (
        <Card className="space-y-1 p-3 sm:p-4">
          <h2 className="text-sm font-bold">{isAr ? "سجل الاستلام" : "What arrived"}</h2>
          <ul className="divide-y divide-border-subtle text-sm">
            {receiptsQ.data?.map((receipt) => {
              const variant = receipt.variant_id
                ? catalog.variantById.get(receipt.variant_id)
                : undefined;
              return (
                <li
                  key={receipt.id}
                  className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5"
                >
                  <span className="min-w-0">
                    <span dir="auto" className="break-words font-semibold">
                      {catalog.productName(variant?.product_id)} ·{" "}
                      {catalog.sizeName(receipt.variant_id)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(receipt.received_at, locale)}
                      {receipt.note ? ` · ${receipt.note}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {`+${piecesLabel(receipt.quantity, lang)} · `}
                    {isAr ? "التكلفة " : "cost "}
                    <strong className="text-foreground">{money(receipt.cost_after)}</strong>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
