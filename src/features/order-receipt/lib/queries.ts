import { queryOptions } from "@tanstack/react-query";
import { getOrderReceipt } from "@/lib/order-receipt.functions";

export const orderReceiptKeys = {
  receipt: (slug: string, orderId: string) => ["order-receipt", slug, orderId] as const,
};

export const orderReceiptQueries = {
  /** The thank-you page's receipt; null once the order is no longer fresh, or for no order. */
  receipt: (slug: string, orderId: string) =>
    queryOptions({
      queryKey: orderReceiptKeys.receipt(slug, orderId),
      queryFn: () => getOrderReceipt({ data: { slug, orderId } }),
      staleTime: 60_000,
      retry: false,
    }),
};
