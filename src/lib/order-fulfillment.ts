export function orderRequiresCourier(order: { fulfillment_method?: string | null }): boolean {
  return (
    String(order.fulfillment_method ?? "")
      .trim()
      .toLowerCase() === "delivery"
  );
}
