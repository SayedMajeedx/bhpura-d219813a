import { getFulfillmentLabel, getOrderStatusLabel, type Lang } from "./status-labels";

export type DashboardOrderStatusInput = {
  status?: string | null;
  fulfillment_status?: string | null;
};

export function getDashboardOrderStatus(order: DashboardOrderStatusInput, lang: Lang) {
  const fulfillmentStatus = String(order.fulfillment_status || "").trim();
  const rawStatus = String(order.status || "").trim();
  const effectiveStatus = (fulfillmentStatus || rawStatus).toLowerCase();

  return {
    effectiveStatus,
    label: fulfillmentStatus
      ? getFulfillmentLabel(fulfillmentStatus, lang)
      : getOrderStatusLabel(rawStatus, lang),
    variant: (["completed", "delivered", "picked_up"] as string[]).includes(effectiveStatus)
      ? ("success" as const)
      : (["cancelled", "canceled", "failed", "returned"] as string[]).includes(effectiveStatus)
        ? ("destructive" as const)
        : (
              [
                "confirmed",
                "needs_packing",
                "packing",
                "sent_to_tailor",
                "received_from_tailor",
              ] as string[]
            ).includes(effectiveStatus)
          ? ("warning" as const)
          : ("default" as const),
  };
}
