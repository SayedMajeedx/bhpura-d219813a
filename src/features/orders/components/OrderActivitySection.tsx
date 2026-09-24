import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ActivityLogList } from "@/components/activity-log-list";
import { useBrand } from "@/lib/brand-context";
import type { Order } from "@/features/orders/types";

/** The order's activity trail. */
export function OrderActivitySection({
  brand,
  lang,
  mobileTab,
  order,
}: {
  brand: ReturnType<typeof useBrand>;
  lang: ReturnType<typeof useI18n>["lang"];
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
      <details className="group overflow-hidden rounded-2xl border border-border-subtle bg-card/60 shadow-sm sm:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold marker:content-none">
          <span>{lang === "ar" ? "سجل النشاطات" : "Activity history"}</span>
          <span className="text-lg text-muted-foreground transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="border-t border-border-subtle p-4">
          <ActivityLogList orderId={order.id} scope="order" brandId={brand.id} />
        </div>
      </details>
      <div className="hidden sm:block">
        <ActivityLogList orderId={order.id} scope="order" brandId={brand.id} />
      </div>
    </div>
  );
}
