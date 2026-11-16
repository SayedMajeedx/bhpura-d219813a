import { useQuery } from "@tanstack/react-query";
import { Handshake } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { reportingQueries } from "@/lib/data/reporting";
import { readMonthPack } from "@/features/finance-reports/lib/month-pack";
import { partnerLines } from "@/features/report-export/lib/owner-sheets";

type Lang = "ar" | "en";

/**
 * Each partner shop's sales in the period (the month pack's own list for these days, added up
 * by `partnerLines`): pieces, sales, commission, what it paid and what it still owes, the shop
 * that sold most first, and the period's total.
 */
export function PartnerShopsCard({
  slug,
  range,
  timeZone,
  currency,
  lang,
}: {
  slug: string;
  range: { from: Date; to: Date };
  timeZone: string;
  currency: string;
  lang: Lang;
}) {
  const isAr = lang === "ar";
  const q = useQuery(reportingQueries.monthPack(slug, range, timeZone));
  const lines = partnerLines(readMonthPack(q.data).partner_sales, currency);
  const money = (value: number) => formatMoney(value, currency, lang);
  const total = lines.reduce(
    (s, l) => ({
      pieces: s.pieces + l.pieces,
      sales: s.sales + l.sales,
      commission: s.commission + l.commission,
      paid: s.paid + l.paid,
      owed: s.owed + Math.max(0, l.due - l.paid),
    }),
    { pieces: 0, sales: 0, commission: 0, paid: 0, owed: 0 },
  );
  const head = isAr
    ? ["المحل", "القطع", "المبيعات", "العمولة", "المدفوع", "المتبقي"]
    : ["Partner shop", "Pieces", "Sales", "Commission", "Paid", "Still owed"];

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Handshake className="h-4 w-4" aria-hidden="true" />
        </span>
        {isAr ? "حسب المحل الشريك" : "By partner shop"}
      </h3>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">{isAr ? "جارٍ التحميل…" : "Loading…"}</p>
      ) : lines.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-xs text-muted-foreground">
                {head.map((label, i) => (
                  <th
                    key={label}
                    className={i === 0 ? "p-2 text-start font-medium" : "p-2 text-end font-medium"}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {lines.map((l) => (
                <tr key={l.partner}>
                  <th scope="row" className="p-2 text-start font-medium" dir="auto">
                    {l.partner}
                  </th>
                  <td className="p-2 text-end font-mono">{l.pieces}</td>
                  <td className="p-2 text-end font-mono font-semibold">{money(l.sales)}</td>
                  <td className="p-2 text-end font-mono">{money(-l.commission)}</td>
                  <td className="p-2 text-end font-mono">{money(l.paid)}</td>
                  <td className="p-2 text-end font-mono">{money(Math.max(0, l.due - l.paid))}</td>
                </tr>
              ))}
            </tbody>
            {lines.length > 1 && (
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  <th scope="row" className="p-2 text-start">
                    {isAr ? "المجموع" : "Total"}
                  </th>
                  <td className="p-2 text-end font-mono">{total.pieces}</td>
                  <td className="p-2 text-end font-mono">{money(total.sales)}</td>
                  <td className="p-2 text-end font-mono">{money(-total.commission)}</td>
                  <td className="p-2 text-end font-mono">{money(total.paid)}</td>
                  <td className="p-2 text-end font-mono">{money(total.owed)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لا مبيعات في المحلات الشريكة في هذه الفترة."
            : "No partner shop sales in this period."}
        </p>
      )}
    </section>
  );
}
