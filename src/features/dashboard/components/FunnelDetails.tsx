import { useQuery } from "@tanstack/react-query";
import { storefrontFunnelQueries, type CheckoutProgressCounts } from "@/lib/data/storefront-funnel";
import { problemLabel } from "@/lib/checkout-progress";

type Words = { ar: string; en: string };

/**
 * A small table of counts under a caption: a name, then numbers under their headings. The cells
 * follow the page's direction and only the digits read left to right, so on an Arabic page each
 * number sits under its heading.
 */
export function CountsTable({
  caption,
  heads,
  rows,
}: {
  caption: string;
  heads: [string, ...string[]];
  rows: { key: string; name: string; counts: number[] }[];
}) {
  return (
    <table className="w-full text-xs">
      <caption className="pb-1.5 text-start text-xs font-medium text-foreground">{caption}</caption>
      <thead className="text-muted-foreground">
        <tr>
          {heads.map((head, index) => (
            <th
              key={head}
              scope="col"
              className={`pb-1 font-normal ${index === 0 ? "text-start" : "text-end"}`}
            >
              {head}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-border">
            <td className="py-1 text-muted-foreground">
              <bdi>{row.name}</bdi>
            </td>
            {row.counts.map((count, index) => (
              <td key={index} className="py-1 text-end font-mono tabular-nums">
                <bdi dir="ltr">{count.toLocaleString("en-US")}</bdi>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const PART_WORDS: Record<keyof CheckoutProgressCounts, Words> = {
  opened: { ar: "فتحوا صفحة الدفع", en: "Opened checkout" },
  contact: { ar: "كتبوا الاسم والهاتف", en: "Typed name and phone" },
  delivery: { ar: "أكملوا التوصيل أو الاستلام", en: "Filled in delivery or pickup" },
  ready: { ar: "جاهزون للطلب", en: "Ready to order" },
  pressed: { ar: "ضغطوا تأكيد الطلب", en: "Pressed place order" },
  ordered: { ar: "طلبوا", en: "Ordered" },
};

/**
 * Where checkout loses people (migration 20261207100000): of the visits that opened checkout in
 * the period, how many got through each part, and what still stood in the way of those that left.
 * Nothing until a visit has opened checkout since it was counted.
 */
export function CheckoutStops({
  brandId,
  from,
  to,
  isAr,
}: {
  brandId: string;
  from: string;
  to: string;
  isAr: boolean;
}) {
  const { data } = useQuery(storefrontFunnelQueries.checkout(brandId, from, to));
  if (!data || data.progress.opened === 0) return null;
  const { progress, problems } = data;
  const parts = Object.keys(PART_WORDS) as (keyof CheckoutProgressCounts)[];
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium">{isAr ? "وين يوقف الدفع" : "Where checkout stops"}</h3>
      <ol className="space-y-1.5">
        {parts.map((part) => (
          <li
            key={part}
            className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs"
          >
            <span className="truncate text-muted-foreground">
              {isAr ? PART_WORDS[part].ar : PART_WORDS[part].en}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className="block h-full rounded-full bg-primary/70"
                style={{ width: `${Math.min(100, (progress[part] / progress.opened) * 100)}%` }}
              />
            </span>
            <span className="font-mono tabular-nums">
              <bdi dir="ltr">{progress[part].toLocaleString("en-US")}</bdi>
            </span>
          </li>
        ))}
      </ol>
      {problems.length > 0 && (
        <CountsTable
          caption={
            isAr ? "ما كان ناقصًا لما طلعوا بدون طلب" : "What was still missing when they left"
          }
          heads={[isAr ? "الناقص" : "Missing", isAr ? "زيارات" : "Visits"]}
          rows={problems.map((row) => ({
            key: row.problem,
            name: problemLabel(row.problem, isAr),
            counts: [row.visits],
          }))}
        />
      )}
    </div>
  );
}

/** Each campaign the store tagged its links with, and the visits and orders it brought. */
export function CampaignCounts({
  brandId,
  from,
  to,
  isAr,
}: {
  brandId: string;
  from: string;
  to: string;
  isAr: boolean;
}) {
  const { data } = useQuery(storefrontFunnelQueries.campaigns(brandId, from, to));
  if (!data?.length) return null;
  return (
    <CountsTable
      caption={isAr ? "الحملات والمنشورات" : "Campaigns and posts"}
      heads={[isAr ? "الحملة" : "Campaign", isAr ? "زيارات" : "Visits", isAr ? "طلبات" : "Orders"]}
      rows={data.map((row) => ({
        key: row.campaign,
        name: row.campaign,
        counts: [row.visits, row.orders],
      }))}
    />
  );
}
