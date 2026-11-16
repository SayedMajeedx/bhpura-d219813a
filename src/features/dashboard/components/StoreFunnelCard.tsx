import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Users } from "lucide-react";
import { storefrontFunnelQueries } from "@/lib/data/storefront-funnel";
import { CardPlaceholder } from "@/features/dashboard/components/CardPlaceholder";
import {
  CampaignCounts,
  CheckoutStops,
  CountsTable,
} from "@/features/dashboard/components/FunnelDetails";
import { CampaignLinkButton } from "@/components/admin/CampaignLinkDialog";
import { periodWords } from "@/features/dashboard/lib/dashboard-period";
import { conversionRate, funnelStages, type FunnelStage, type VisitSource } from "@/lib/funnel";

/** The last `days` days, as the dashboard's other figures read them (from midnight `days - 1` days ago). */
export function lastDays(now: Date, days = 30): { from: string; to: string } {
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
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

const SOURCE_WORDS: Record<VisitSource, { ar: string; en: string }> = {
  instagram: { ar: "انستقرام", en: "Instagram" },
  facebook: { ar: "فيسبوك", en: "Facebook" },
  tiktok: { ar: "تيك توك", en: "TikTok" },
  snapchat: { ar: "سناب شات", en: "Snapchat" },
  whatsapp: { ar: "واتساب", en: "WhatsApp" },
  google: { ar: "جوجل", en: "Google" },
  other: { ar: "مواقع أخرى", en: "Other sites" },
  direct: { ar: "مباشرة", en: "Direct" },
};

/**
 * On the dashboard: how many shoppers visited in the last 30 days, how far they went and the
 * conversion rate (orders placed out of visits), from the store's own count of visits. Before it
 * the dashboard had revenue and orders but no visitors, unless the store had set up Google.
 * It is one line (visits and the conversion rate) until opened: open, it took a phone's screen.
 */
export function StoreFunnelCard({
  brandId,
  isAr,
  isServices = false,
  days = 30,
}: {
  brandId: string;
  isAr: boolean;
  isServices?: boolean;
  /** The dashboard's period, in days. */
  days?: number;
}) {
  const period = useMemo(() => lastDays(new Date(), days), [days]);
  const [open, setOpen] = useState(false);
  const { data, isPending } = useQuery(
    storefrontFunnelQueries.period(brandId, period.from, period.to),
  );
  const { data: sources } = useQuery({
    ...storefrontFunnelQueries.sources(brandId, period.from, period.to),
    enabled: open,
  });
  if (isPending) {
    return (
      <CardPlaceholder
        label={isAr ? "جارٍ تحميل الزيارات" : "Loading visits"}
        className="min-h-12"
      />
    );
  }
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
      className="rounded-2xl border border-border bg-card shadow-2xs"
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
          className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-start"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
            {isAr
              ? `الزيارات · ${periodWords(days, "ar").last}`
              : `Visits · ${periodWords(days, "en").last}`}
          </span>
          <span className="flex items-center gap-3 text-sm">
            <span className="font-mono font-semibold tabular-nums" dir="ltr">
              {data.visits.toLocaleString("en-US")}
            </span>
            {rate !== null && (
              <span>
                <span className="text-muted-foreground">{isAr ? "التحويل " : "Conversion "}</span>
                <span className="font-mono font-semibold" dir="ltr">
                  {rate}%
                </span>
              </span>
            )}
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-(--motion-quick) ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </span>
        </button>
      </h2>
      {open && (
        <div className="space-y-3 border-t border-border-subtle px-4 pb-3.5 pt-3">
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
          {data.visits > 0 && (
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "الطلبات هنا كل ما طُلب من المتجر الإلكتروني ومنها الملغاة، فقد تختلف عن المبيعات في الأرقام فوق."
                : "Orders here are every order placed on the online store, cancelled ones included, so they can differ from the sales above."}
            </p>
          )}

          {sources && sources.length > 0 ? (
            <CountsTable
              caption={isAr ? "من وين جاءت الزيارات" : "Where visits came from"}
              heads={[
                isAr ? "المصدر" : "Source",
                isAr ? "زيارات" : "Visits",
                isAr ? "طلبات" : "Orders",
              ]}
              rows={sources.map((row) => ({
                key: row.source,
                name: isAr ? SOURCE_WORDS[row.source].ar : SOURCE_WORDS[row.source].en,
                counts: [row.visits, row.orders],
              }))}
            />
          ) : null}
          <CampaignCounts brandId={brandId} from={period.from} to={period.to} isAr={isAr} />
          <CheckoutStops brandId={brandId} from={period.from} to={period.to} isAr={isAr} />
          <div className="flex justify-end">
            <CampaignLinkButton isAr={isAr} />
          </div>
        </div>
      )}
    </section>
  );
}
