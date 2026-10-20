import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ordersQueries } from "@/lib/data/orders";
import { supplierOrderQueries } from "@/lib/data/supplier-orders";
import { piecesToMake, type WaitingOrder } from "../lib/pieces-to-make";

/**
 * The customers' made-to-order pieces waiting to go to the workshop: the office's orders list
 * (one cache with the Orders page) less the pieces already with a supplier.
 */
export function usePiecesToMake(brandId: string, enabled = true) {
  const ordersQ = useQuery({ ...ordersQueries.list(brandId, "office"), enabled });
  const orders = useMemo(() => (ordersQ.data ?? []) as unknown as WaitingOrder[], [ordersQ.data]);
  const lineIds = useMemo(
    () => orders.flatMap((o) => (o.order_items ?? []).map((l) => l.id)).filter(Boolean) as string[],
    [orders],
  );
  const sentQ = useQuery({
    ...supplierOrderQueries.orderPieces(brandId, lineIds),
    enabled: enabled && lineIds.length > 0,
  });
  const groups = useMemo(() => {
    const sent = new Set((sentQ.data ?? []).map((p) => p.order_item_id));
    return piecesToMake(orders, sent);
  }, [orders, sentQ.data]);
  const pieces = groups.reduce(
    (sum, g) => sum + g.lines.reduce((n, l) => n + (l.quantity || 1), 0),
    0,
  );
  return {
    groups,
    pieces,
    isLoading: ordersQ.isLoading || (lineIds.length > 0 && sentQ.isLoading),
  };
}
