import { formatMoney } from "@/lib/format";
import { SALES_WORDS, type ReportLang } from "@/lib/report-words";
import type { SalesBySource } from "@/lib/reporting-compose";

/**
 * Net sales by where they were made: the store's own orders, the partner shops and services,
 * each with its share, adding up to the total. A source the store has nothing from is left out,
 * unless it is the store's own orders.
 */
export function salesSourceRows(sales: SalesBySource, showPartners: boolean) {
  const share = (value: number) => (sales.total > 0 ? (value / sales.total) * 100 : 0);
  return [
    { key: "store" as const, value: sales.store, share: share(sales.store) },
    ...(showPartners || Math.abs(sales.partners) > 0.0005
      ? [{ key: "partners" as const, value: sales.partners, share: share(sales.partners) }]
      : []),
    ...(Math.abs(sales.services) > 0.0005
      ? [{ key: "services" as const, value: sales.services, share: share(sales.services) }]
      : []),
  ];
}

export function SalesBySourceCard({
  sales,
  currency,
  lang,
  showPartners,
}: {
  sales: SalesBySource;
  currency: string;
  lang: ReportLang;
  showPartners: boolean;
}) {
  const money = (value: number) => formatMoney(value, currency, lang);
  const rows = salesSourceRows(sales, showPartners);
  return (
    <section
      aria-labelledby="sales-by-source"
      className="rounded-2xl border border-border bg-card p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sales-by-source" className="text-lg font-semibold">
          {SALES_WORDS.bySource[lang]}
        </h2>
        <p className="text-xs text-muted-foreground">{SALES_WORDS.netSalesNote[lang]}</p>
      </div>
      <dl className="mt-5 space-y-4">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">{SALES_WORDS[row.key][lang]}</dt>
              <dd className="flex items-baseline gap-3 font-mono font-semibold">
                <span className="text-xs font-normal text-muted-foreground">
                  {row.share.toFixed(1)}%
                </span>
                {money(row.value)}
              </dd>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, Math.max(0, row.share))}%` }}
              />
            </div>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-4 text-sm">
          <dt className="font-semibold">{SALES_WORDS.total[lang]}</dt>
          <dd className="font-mono text-base font-bold">{money(sales.total)}</dd>
        </div>
      </dl>
    </section>
  );
}
