import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { getOrderCustomerContact } from "@/lib/order-customer-snapshot";
import { countOf } from "@/lib/arabic-count";
import { cn } from "@/lib/utils";
import { orderCardWhen, orderItemsLine } from "@/features/orders/lib/order-card";
import { OrderWaitingBadge } from "@/features/orders/components/OrderWaitingBadge";
import { boardColumns, canDrop, type BoardColumn } from "@/features/orders/lib/order-board";
import { useOrderNumber } from "@/hooks/use-order-number";
import { useBoardFlip } from "@/features/orders/hooks/use-board-flip";

/**
 * The orders as a board: a column per stage (to confirm, preparing, at the workshop, ready, on
 * the way, appointments, done today), each card with the list's own next-step button. On a laptop
 * a card can be dragged to the column its next step takes it to: the drop presses that button, so
 * a dialog it opens (the cash collected, the courier) opens as it does from the list. On a phone
 * the columns scroll sideways and the button is the way to move an order.
 */
type BoardCard = Parameters<typeof canDrop>[0] &
  Parameters<typeof getOrderCustomerContact>[0] & {
    id: string;
    invoice_number?: number | null;
    created_at?: string | null;
    total?: number | string | null;
    currency?: string | null;
    order_items?: Parameters<typeof orderItemsLine>[0];
  };

export function OrdersBoard<T extends BoardCard>({
  orders,
  slug,
  lang,
  currency,
  madeToOrder,
  bookings,
  renderAction,
}: {
  orders: T[];
  slug: string;
  lang: "ar" | "en";
  currency: string;
  madeToOrder: boolean;
  bookings: boolean;
  renderAction: (order: T) => ReactNode;
}) {
  const orderNo = useOrderNumber();
  const isAr = lang === "ar";
  const columns = boardColumns(orders, { madeToOrder, bookings });
  const [dragging, setDragging] = useState<T | null>(null);
  const [over, setOver] = useState<BoardColumn | null>(null);
  const actions = useRef(new Map<string, HTMLDivElement | null>());
  const board = useRef<HTMLDivElement>(null);
  useBoardFlip(board, orders);

  const drop = (column: BoardColumn) => {
    const order = dragging;
    setDragging(null);
    setOver(null);
    if (!order) return;
    if (!canDrop(order, column, madeToOrder)) {
      toast.error(
        isAr
          ? "لا ينتقل الطلب إلى هنا الآن. استخدم زر خطوته التالية."
          : "This order can't move here now. Use its next-step button.",
      );
      return;
    }
    const button = actions.current.get(order.id)?.querySelector("button");
    button?.click();
  };

  return (
    <div
      ref={board}
      className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
      aria-label={isAr ? "لوحة الطلبات" : "Orders board"}
    >
      {columns.map((column) => (
        <section
          key={column.id}
          aria-labelledby={`board-${column.id}`}
          onDragOver={(event) => {
            if (!dragging) return;
            event.preventDefault();
            setOver(column.id);
          }}
          onDragLeave={() => setOver((current) => (current === column.id ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            drop(column.id);
          }}
          className={cn(
            "flex w-[85vw] max-w-80 shrink-0 snap-start flex-col rounded-2xl border border-border bg-muted/30 transition-colors duration-150 sm:w-72",
            over === column.id &&
              dragging &&
              (canDrop(dragging, column.id, madeToOrder)
                ? "border-primary bg-primary/5"
                : "border-destructive/50"),
          )}
        >
          <header className="flex items-center justify-between gap-2 px-3 py-2.5">
            <h2 id={`board-${column.id}`} className="text-sm font-semibold">
              {isAr ? column.ar : column.en}
            </h2>
            <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold tabular-nums">
              {column.orders.length}
            </span>
          </header>
          <ol className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
            {column.orders.length === 0 && (
              <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                {isAr ? "لا طلبات" : "No orders"}
              </li>
            )}
            {column.orders.map((order) => {
              const contact = getOrderCustomerContact(order);
              const items = orderItemsLine(order.order_items, lang);
              return (
                <li
                  key={order.id}
                  data-flip-id={order.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    setDragging(order);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  className={cn(
                    "space-y-2 rounded-xl border border-border bg-card p-3 shadow-2xs transition-[opacity,scale,box-shadow] duration-150 ease-(--motion-ease-smooth)",
                    "[@media(hover:hover)_and_(pointer:fine)]:cursor-grab [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-sm",
                    // The card being carried stays behind as a lighter, smaller outline.
                    dragging?.id === order.id && "scale-[0.98] opacity-50",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to="/admin/b/$slug/orders/$id"
                      params={{ slug, id: order.id }}
                      className="font-mono text-sm font-extrabold text-primary hover:underline"
                    >
                      {orderNo(order.invoice_number, order.id)}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {orderCardWhen(order.created_at, lang)}
                    </span>
                  </div>
                  <p className="line-clamp-2 break-words text-sm font-medium" dir="auto">
                    {contact.name || (isAr ? "عميل زائر" : "Guest customer")}
                  </p>
                  <OrderWaitingBadge
                    order={order}
                    lang={isAr ? "ar" : "en"}
                    productionStages={madeToOrder}
                  />
                  {items && (
                    <p
                      className="line-clamp-2 break-words text-xs text-muted-foreground"
                      dir="auto"
                    >
                      {items.first}
                      {items.more > 0 && ` · +${countOf(items.more, "line", lang)}`}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold tabular-nums">
                      {formatMoney(Number(order.total ?? 0), order.currency || currency, lang)}
                    </span>
                    <div
                      ref={(node) => {
                        actions.current.set(order.id, node);
                      }}
                    >
                      {renderAction(order)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
