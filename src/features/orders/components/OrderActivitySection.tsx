import { cn } from "@/lib/utils";
import { ActivityLogList } from "@/components/activity-log-list";
import { useBrand } from "@/lib/brand-context";
import type { Order } from "@/features/orders/types";

/** The order's activity trail. */
export function OrderActivitySection({
  brand,
  mobileTab,
  order,
}: {
  brand: ReturnType<typeof useBrand>;
  mobileTab: "items" | "customer" | "activity";
  order: Order;
}) {
  return (
    <div
      id="sec-activity"
      className={cn(
        "no-print mx-auto max-w-6xl scroll-mt-24 px-1 pb-4 sm:p-6 lg:p-8",
        mobileTab !== "activity" && "hidden sm:block",
      )}
    >
      {/* One list for every width: a phone wrapped it in a fold titled "سجل النشاطات" over the
          list's own heading with the same words, and the page drew it twice (two fetches). */}
      <ActivityLogList orderId={order.id} scope="order" brandId={brand.id} />
    </div>
  );
}
