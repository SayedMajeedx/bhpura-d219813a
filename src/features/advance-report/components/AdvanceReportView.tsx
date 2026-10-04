import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Banknote, CheckCircle2, Clock, MessageCircle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/reports/kpi-card";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ADVANCE_REPORT_LIMIT, advanceReportQueries } from "@/lib/data/advance-report";
import { invoiceLink, whatsAppToCustomer } from "@/features/bookings/lib/booking-invoice";
import { owedRows, reminderMessage, summarizeAdvance } from "../lib/advance-report";

const PERIODS: Array<{ days: number | null; ar: string; en: string }> = [
  { days: 30, ar: "30 يوماً", en: "30 days" },
  { days: 90, ar: "90 يوماً", en: "90 days" },
  { days: 365, ar: "سنة", en: "A year" },
  { days: null, ar: "الكل", en: "All time" },
];

/**
 * Advance payments: of the orders placed under an advance rule, what has been collected and
 * what is still owed, with a WhatsApp reminder a staff member sends to each customer who owes.
 * (A message is only ever sent by a person: nothing here writes to a customer by itself.)
 */
export function AdvanceReportView() {
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [days, setDays] = useState<number | null>(90);
  const query = useQuery(advanceReportQueries.orders(brand.id, days));
  const orders = useMemo(() => query.data ?? [], [query.data]);
  const summary = useMemo(() => summarizeAdvance(orders), [orders]);
  const owed = useMemo(() => owedRows(orders, new Date()), [orders]);
  const currency = summary.currency ?? "BHD";
  const money = (value: number) => formatMoney(value, currency);
  const brandName = (isAr ? brand.name_ar : null) || brand.name_en;

  return (
    <div className="space-y-4" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs text-muted-foreground">
          {isAr
            ? "الطلبات التي طُبّقت عليها قاعدة الدفعة المقدمة: ما تم تحصيله وما تبقى."
            : "Orders placed under an advance-payment rule: what has been collected and what is still owed."}
        </p>
        <div
          role="radiogroup"
          aria-label={isAr ? "الفترة" : "Period"}
          className="flex flex-wrap gap-1.5"
        >
          {PERIODS.map((period) => (
            <Button
              key={String(period.days)}
              type="button"
              size="xs"
              variant="chip"
              role="radio"
              aria-checked={days === period.days}
              className={cn(
                "border border-border",
                days === period.days && "border-primary bg-primary/10 text-foreground",
              )}
              onClick={() => setDays(period.days)}
            >
              {isAr ? period.ar : period.en}
            </Button>
          ))}
        </div>
      </div>

      {query.isError ? (
        <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          {isAr ? "تعذّر تحميل التقرير." : "Couldn't load the report."}
        </p>
      ) : query.isLoading ? (
        <p className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
          {isAr ? "جارٍ التحميل…" : "Loading…"}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              title={isAr ? "تم تحصيله" : "Collected"}
              value={money(summary.collected)}
              description={isAr ? `${summary.orders} طلب` : `${summary.orders} orders`}
              icon={<Banknote />}
              accent="emerald"
            />
            <KpiCard
              title={isAr ? "المتبقي" : "Still owed"}
              value={money(summary.outstanding)}
              description={
                isAr
                  ? `${summary.awaiting.orders + summary.balance.orders} طلب`
                  : `${summary.awaiting.orders + summary.balance.orders} orders`
              }
              icon={<Wallet />}
              accent="amber"
            />
            <KpiCard
              title={isAr ? "بانتظار الدفعة" : "Awaiting advance"}
              value={String(summary.awaiting.orders)}
              description={money(summary.awaiting.amount)}
              icon={<Clock />}
              accent="burgundy"
            />
            <KpiCard
              title={isAr ? "مدفوعة بالكامل" : "Paid in full"}
              value={String(summary.settled.orders)}
              description={isAr ? "لا شيء مستحق" : "Nothing owed"}
              icon={<CheckCircle2 />}
              accent="blue"
            />
          </div>

          {orders.length >= ADVANCE_REPORT_LIMIT && (
            <p className="text-xs text-muted-foreground">
              {isAr
                ? `يعرض التقرير أحدث ${ADVANCE_REPORT_LIMIT} طلب؛ اختر فترة أقصر لرؤية الباقي.`
                : `The report shows the latest ${ADVANCE_REPORT_LIMIT} orders; pick a shorter period to see the rest.`}
            </p>
          )}

          <section className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">
              {isAr ? "طلبات فيها مبلغ مستحق" : "Orders with money owed"}
            </h3>
            {owed.length === 0 ? (
              <p className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
                {isAr ? "لا شيء مستحق في هذه الفترة." : "Nothing is owed in this period."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {owed.map((row) => {
                  const { order } = row;
                  const link = whatsAppToCustomer(
                    order.customer_phone_snapshot,
                    reminderMessage({
                      isAr,
                      brandName,
                      customerName: order.customer_name_snapshot,
                      invoiceNumber: order.invoice_number,
                      stage: row.stage,
                      balance: row.balance,
                      currency: order.currency,
                      link: invoiceLink(window.location.origin, order.public_invoice_token),
                    }),
                  );
                  return (
                    <li
                      key={order.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                    >
                      <div className="min-w-0">
                        <Link
                          to="/admin/b/$slug/orders/$id"
                          params={{ slug: brand.slug, id: order.id }}
                          className="text-sm font-semibold text-foreground hover:underline"
                        >
                          #{order.invoice_number}
                        </Link>
                        <span className="text-sm text-muted-foreground">
                          {" · "}
                          {order.customer_name_snapshot || (isAr ? "بدون اسم" : "No name")}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {row.stage === "awaiting"
                            ? isAr
                              ? "بانتظار الدفعة المقدمة"
                              : "Waiting for the advance"
                            : isAr
                              ? "الدفعة مدفوعة، والرصيد متبقٍ"
                              : "Advance paid, balance left"}
                          {" · "}
                          {isAr ? `منذ ${row.ageDays} يوم` : `${row.ageDays} days ago`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {formatMoney(row.balance, order.currency)}
                        </span>
                        {link ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={link} target="_blank" rel="noopener noreferrer">
                              <MessageCircle />
                              {isAr ? "تذكير" : "Remind"}
                            </a>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {isAr ? "لا يوجد رقم" : "No number"}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
