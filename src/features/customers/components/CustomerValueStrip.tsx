import { formatMoney } from "@/lib/format";
import { CUSTOMER_SORTS, type CustomerSort, type ValueSummary } from "../lib/customer-value";

/**
 * Above the customers list: what an average buyer has spent, how many came back for a second
 * order, and how much of all spend the top tenth of buyers made (who to look after first).
 * Nothing when no customer has ordered yet.
 */
export function CustomerValueStrip({
  summary,
  currency,
  isAr,
}: {
  summary: ValueSummary;
  currency: string;
  isAr: boolean;
}) {
  if (summary.buyers === 0) return null;
  const lang = isAr ? "ar" : "en";
  const figures: Array<[string, string]> = [
    [
      isAr ? "متوسط قيمة العميل" : "Average customer value",
      formatMoney(summary.averageValue, currency, lang),
    ],
    ...(summary.repeatRate !== null
      ? ([[isAr ? "عادوا للشراء" : "Came back to buy", `${summary.repeatRate}%`]] as Array<
          [string, string]
        >)
      : []),
    ...(summary.topTenthShare !== null
      ? ([
          [
            isAr ? "حصة أفضل 10% من المبيعات" : "Spend from the top 10%",
            `${summary.topTenthShare}%`,
          ],
        ] as Array<[string, string]>)
      : []),
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-card p-3">
      {figures.map(([label, value]) => (
        <div key={label} className="min-w-0 space-y-0.5">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="font-mono text-sm font-semibold sm:text-base" dir="ltr">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const SORT_WORDS: Record<CustomerSort, { ar: string; en: string }> = {
  recent: { ar: "الأحدث إضافة", en: "Newest added" },
  spend: { ar: "الأعلى إنفاقًا", en: "Top spenders" },
  orders: { ar: "الأكثر طلبات", en: "Most orders" },
  last_order: { ar: "آخر طلب", en: "Latest order" },
};

/** How the customers list is sorted. */
export function CustomerSortField({
  sort,
  onSortChange,
  isAr,
}: {
  sort: CustomerSort;
  onSortChange: (sort: CustomerSort) => void;
  isAr: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <label htmlFor="customers-sort" className="text-xs text-muted-foreground">
        {isAr ? "الترتيب" : "Sort"}
      </label>
      <select
        id="customers-sort"
        value={sort}
        onChange={(e) => onSortChange(e.target.value as CustomerSort)}
        className="h-9 max-w-full rounded-lg border border-border bg-card px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {CUSTOMER_SORTS.map((id) => (
          <option key={id} value={id}>
            {isAr ? SORT_WORDS[id].ar : SORT_WORDS[id].en}
          </option>
        ))}
      </select>
    </div>
  );
}
