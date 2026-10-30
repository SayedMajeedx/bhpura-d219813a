import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { storefrontFunnelQueries } from "@/lib/data/storefront-funnel";
import { conversionRate, funnelStages, type FunnelStage } from "@/lib/funnel";

/** The last 30 days, as the dashboard's other figures read them (from midnight 29 days ago). */
export function last30Days(now: Date): { from: string; to: string } {
  const start = new Date(now);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  // To the next minute, so the period stays one request while the page is open.
  const end = new Date(Math.ceil(now.getTime() / 60_000) * 60_000);
  return { from: start.toISOString(), to: end.toISOString() };
}

const STAGE_WORDS: Record<FunnelStage["key"], { ar: string; en: string }> = {
  visits: { ar: "زيارات", en: "Visits" },
  product_views: { ar: "شاهدوا منتجًا", en: "Viewed a product" },
  carts: { ar: "أضافوا إلى السلة", en: "Added to bag" },
  checkouts: { ar: "بدأوا الدفع", en: "Began checkout" },
  orders: { ar: "طلبات", en: "Orders" },
};

const SERVICE_WORDS: Partial<Record<FunnelStage["key"], { ar: string; en: string }>> = {
  product_views: { ar: "شاهدوا خدمة", en: "Viewed a service" },
  orders: { ar: "حجوزات وطلبات", en: "Bookings & orders" },
};

/**
 * On the dashboard: how many shoppers visited in the last 30 days, how far they went and the
 * conversion rate (orders placed out of visits), from the store's own count of visits. Before it
 * the dashboard had revenue and orders but no visitors, unless the store had set up Google.
 */
export function StoreFunnelCard({
  brandId,
  isAr,
  isServices = false,
}: {
  brandId: string;
  isAr: boolean;
  isServices?: boolean;
}) {
  const period = useMemo(() => last30Days(new Date()), []);
  const { data } = useQuery(storefrontFunnelQueries.period(brandId, period.from, period.to));
  if (!data) return null;

  const stages = funnelStages(data);
  const rate = conversionRate(data);
  const top = Math.max(data.visits, 1);
  const word = (key: FunnelStage["key"]) => {
    const words = (isServices && SERVICE_WORDS[key]) || STAGE_WORDS[key];
    return isAr ? words.ar : words.en;
  };

  return (
    <section
      aria-label={isAr ? "الزيارات والتحويل" : "Visits and conversion"}
      className="space-y-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-2xs"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          {isAr ? "الزيارات والتحويل · آخر 30 يومًا" : "Visits and conversion · last 30 days"}
        </h2>
        {rate !== null && (
          <p className="text-sm">
            <span className="text-muted-foreground">
              {isAr ? "معدل التحويل " : "Conversion rate "}
            </span>
            <span className="font-mono text-base font-semibold" dir="ltr">
              {rate}%
            </span>
          </p>
        )}
      </div>

      {data.visits === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "تُعدّ الزيارات من الآن: ستظهر هنا مع وصول المتسوقين إلى متجرك."
            : "Visits are counted from now on: they show here as shoppers reach your store."}
        </p>
      ) : (
        <ol className="space-y-1.5">
          {stages.map((stage) => (
            <li
              key={stage.key}
              className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs"
            >
              <span className="truncate text-muted-foreground">{word(stage.key)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span
                  className="block h-full rounded-full bg-primary/70"
                  style={{ width: `${Math.min(100, (stage.count / top) * 100)}%` }}
                />
              </span>
              <span className="font-mono tabular-nums" dir="ltr">
                {stage.count.toLocaleString("en-US")}
                {stage.ofVisits !== null && (
                  <span className="text-muted-foreground"> · {stage.ofVisits}%</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
