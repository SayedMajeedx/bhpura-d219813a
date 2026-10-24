import { Fragment, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Download, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { OsLoadFailedState, combinedLoadState } from "@/components/os/os-load-failed-state";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { formatDate, moneyFractionDigits } from "@/lib/format";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { reportingQueries } from "@/lib/data/reporting";
import { reminderMessage } from "@/features/advance-report/lib/advance-report";
import { cn } from "@/lib/utils";
import {
  AGE_BUCKETS,
  BALANCE_COLUMNS,
  BUCKET_WORDS,
  balancesSheet,
  bucketTotals,
  customerBalances,
  localDay,
  pastThirty,
  readReceivables,
  type AgedOrder,
  type CustomerBalance,
} from "../lib/receivables";
import { accountingFigure } from "../lib/statement";
import { downloadWorkbook, workbookFileName } from "../lib/workbook";
import { arNoun } from "@/lib/arabic-count";

/**
 * What customers owe the store today, aged from the day each piece was handed over, by customer
 * with their orders and a reminder a person sends on WhatsApp; what partner shops owe beside it;
 * and an Excel copy. Nothing is sent by itself.
 */
export function CustomerBalancesPage({ slug }: { slug: string }) {
  const { lang: rawLang } = useI18n();
  const lang = rawLang === "ar" ? "ar" : "en";
  const isAr = lang === "ar";
  const brand = useBrand();
  const storeCurrency = useStoreCurrency(brand.id);
  const [chosenCurrency, setChosenCurrency] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = localDay(new Date());

  const query = useQuery({ ...reportingQueries.receivables(slug, today, timeZone), retry: 1 });
  const { orders, partners } = useMemo(() => readReceivables(query.data), [query.data]);
  const currencies = useMemo(() => {
    const seen = new Set<string>([storeCurrency]);
    for (const o of orders) if (o.currency) seen.add(o.currency);
    for (const p of partners) if (p.currency) seen.add(p.currency);
    return [...seen];
  }, [orders, partners, storeCurrency]);
  const currency = currencies.includes(chosenCurrency) ? chosenCurrency : currencies[0];
  const digits = moneyFractionDigits(currency);
  const unnamed = isAr ? "عميل بلا اسم" : "Unnamed customer";
  const customers = useMemo(
    () => customerBalances(orders, currency, today, unnamed),
    [orders, currency, today, unnamed],
  );
  const totals = bucketTotals(customers);
  const myPartners = partners.filter((p) => p.currency === currency);
  const money = (value: number) => accountingFigure(value, digits);
  const storeName = (isAr ? brand.name_ar : null) || brand.name_en;
  const asOf = formatDate(today, isAr ? "ar-BH" : "en-BH");

  const download = async () => {
    setSaving(true);
    try {
      const title = isAr ? "أرصدة العملاء" : "Customer balances";
      await downloadWorkbook(
        [
          balancesSheet({
            customers,
            partners,
            currency,
            digits,
            lang,
            title,
            subtitle: `${storeName} · ${isAr ? "حتى" : "As of"} ${asOf} · ${currency} · ${timeZone}`,
          }),
        ],
        workbookFileName(slug, "customer-balances", today),
      );
    } catch {
      toast.error(isAr ? "تعذر تنزيل الملف" : "The file could not be downloaded");
    } finally {
      setSaving(false);
    }
  };

  const state = combinedLoadState([query]);

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-end gap-3 p-3 sm:p-4">
        <div className="min-w-0 flex-1 basis-56">
          <h2 className="text-base font-bold">{isAr ? "أرصدة العملاء" : "Customer balances"}</h2>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `ما على العملاء حتى اليوم، ${asOf}. يُحسب العمر من يوم تسليم القطعة؛ قبله لم يستحق المبلغ بعد.`
              : `What customers owe as of today, ${asOf}. Age counts from the day the piece was handed over; before that, a balance is not yet due.`}
          </p>
        </div>
        {currencies.length > 1 && (
          <div className="space-y-1">
            <Label htmlFor="balances-currency" className="text-xs">
              {isAr ? "العملة" : "Currency"}
            </Label>
            <select
              id="balances-currency"
              value={currency}
              onChange={(e) => setChosenCurrency(e.target.value)}
              className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11"
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={download}
          disabled={saving || state !== "ready"}
          className="gap-1.5"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {isAr ? "تنزيل Excel" : "Download Excel"}
        </Button>
      </Card>

      {state === "failed" ? (
        <OsLoadFailedState
          isAr={isAr}
          title={isAr ? "تعذّر تحميل الأرصدة" : "The balances could not be loaded"}
          description={
            isAr
              ? "لم يتغير شيء. تحقق من الاتصال ثم أعد المحاولة."
              : "Nothing was changed. Check the connection and try again."
          }
          queries={[query]}
        />
      ) : state === "loading" ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {isAr ? "جارٍ التحميل…" : "Loading…"}
        </Card>
      ) : (
        <>
          <dl
            aria-label={isAr ? "أعمار المبالغ" : "Ageing"}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
          >
            {AGE_BUCKETS.map((bucket) => (
              <Card
                key={bucket}
                className={cn(
                  "p-3",
                  bucket !== "not_due" &&
                    bucket !== "d0_30" &&
                    totals[bucket] > 0 &&
                    "border-warning/50 bg-warning/5",
                )}
              >
                <dt className="text-xs text-muted-foreground">{BUCKET_WORDS[bucket][lang]}</dt>
                <dd className="mt-1 font-bold tabular-nums">{money(totals[bucket])}</dd>
              </Card>
            ))}
            <Card className="p-3">
              <dt className="text-xs text-muted-foreground">
                {isAr ? `المجموع (${currency})` : `Total (${currency})`}
              </dt>
              <dd className="mt-1 font-bold tabular-nums">{money(totals.total)}</dd>
            </Card>
          </dl>
          {pastThirty(totals) > 0 && (
            <p className="px-1 text-xs font-semibold text-warning">
              {isAr
                ? `${money(pastThirty(totals))} مضى على تسليمها أكثر من 30 يوماً.`
                : `${money(pastThirty(totals))} has been owed for more than 30 days since hand-over.`}
            </p>
          )}

          {customers.length === 0 ? (
            <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              {isAr ? "لا يدين أي عميل بشيء اليوم." : "No customer owes anything today."}
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-max border-collapse text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th scope="col" className="sticky start-0 z-10 bg-card px-3 py-2 text-start">
                        {BALANCE_COLUMNS.customer[lang]}
                      </th>
                      {AGE_BUCKETS.map((b) => (
                        <th key={b} scope="col" className="px-3 py-2 text-end">
                          {BUCKET_WORDS[b][lang]}
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-2 text-end">
                        {BALANCE_COLUMNS.balance[lang]}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((customer) => (
                      <Fragment key={customer.key}>
                        <CustomerRow
                          customer={customer}
                          open={open === customer.key}
                          onToggle={() => setOpen(open === customer.key ? null : customer.key)}
                          money={money}
                          lang={lang}
                        />
                        {open === customer.key &&
                          customer.orders.map((order) => (
                            <OrderRow
                              key={order.id}
                              order={order}
                              customer={customer}
                              slug={slug}
                              storeName={storeName}
                              money={money}
                              lang={lang}
                            />
                          ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {myPartners.length > 0 && (
            <Card className="space-y-2 p-3 sm:p-4">
              <h3 className="text-sm font-bold">
                {isAr ? "ما على المحلات الشريكة" : "What partner shops owe"}
              </h3>
              <ul className="divide-y divide-border-subtle text-sm">
                {myPartners.map((p) => (
                  <li key={p.id} className="flex min-w-0 flex-wrap items-center gap-x-3 py-2">
                    <Link
                      to="/admin/b/$slug/incubators"
                      params={{ slug }}
                      className="min-w-0 flex-1 break-words font-semibold text-primary hover:underline"
                    >
                      {p.name}
                    </Link>
                    <span className="tabular-nums">{money(p.due)}</span>
                    {p.overdue > 0 && (
                      <span className="text-xs font-semibold text-warning">
                        {isAr ? `متأخر ${money(p.overdue)}` : `${money(p.overdue)} overdue`}
                      </span>
                    )}
                    {p.next_settlement && (
                      <span className="w-full text-xs text-muted-foreground sm:w-auto">
                        {isAr ? "التسوية القادمة " : "Next settlement "}
                        {formatDate(p.next_settlement, isAr ? "ar-BH" : "en-BH")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function CustomerRow({
  customer,
  open,
  onToggle,
  money,
  lang,
}: {
  customer: CustomerBalance;
  open: boolean;
  onToggle: () => void;
  money: (value: number) => string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  return (
    <tr className="border-t border-border-subtle">
      <th scope="row" className="sticky start-0 z-10 bg-card px-3 py-1.5 text-start font-normal">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-h-9 w-40 items-center gap-1.5 text-start sm:w-64"
        >
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span dir="auto" className="text-page-start line-clamp-2 break-words font-semibold">
              {customer.name}
            </span>
            <span className="block text-xs text-muted-foreground">
              {isAr
                ? `${customer.orders.length} ${customer.orders.length === 1 ? "طلب" : "طلبات"}`
                : `${customer.orders.length} ${customer.orders.length === 1 ? "order" : "orders"}`}
              {customer.oldestDays !== null &&
                ` · ${isAr ? `أقدمها ${arNoun(customer.oldestDays, "day")}` : `oldest ${customer.oldestDays} days`}`}
            </span>
          </span>
        </button>
      </th>
      {AGE_BUCKETS.map((b) => (
        <td key={b} className="px-3 py-1.5 text-end">
          {money(customer.buckets[b])}
        </td>
      ))}
      <td className="px-3 py-1.5 text-end font-bold">{money(customer.buckets.total)}</td>
    </tr>
  );
}

function OrderRow({
  order,
  customer,
  slug,
  storeName,
  money,
  lang,
}: {
  order: AgedOrder;
  customer: CustomerBalance;
  slug: string;
  storeName: string;
  money: (value: number) => string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const chat = whatsappChatUrl(customer.phone);
  const invoice =
    order.public_invoice_token && typeof window !== "undefined"
      ? `${window.location.origin}/invoice/${order.public_invoice_token}`
      : null;
  const message =
    chat && invoice && order.invoice_number !== null
      ? reminderMessage({
          isAr,
          brandName: storeName,
          customerName: customer.name,
          invoiceNumber: order.invoice_number,
          stage: "balance",
          balance: order.balance,
          currency: order.currency,
          link: invoice,
        })
      : null;
  return (
    <tr className="bg-muted/30 text-xs">
      <td className="sticky start-0 z-10 bg-muted/30 px-3 py-1.5 ps-9">
        <Link
          to="/admin/b/$slug/orders/$id"
          params={{ slug, id: order.id }}
          className="font-semibold text-primary hover:underline"
        >
          #{order.invoice_number ?? "—"}
        </Link>
        <span className="block text-muted-foreground">
          {order.handed_over_at
            ? `${isAr ? "سُلّم" : "Handed over"} ${formatDate(order.handed_over_at, isAr ? "ar-BH" : "en-BH")} · ${order.days} ${isAr ? "يوماً" : "days"}`
            : isAr
              ? "لم يُسلّم بعد"
              : "Not handed over yet"}
        </span>
      </td>
      <td colSpan={AGE_BUCKETS.length - 1} className="px-3 py-1.5 text-end text-muted-foreground">
        {isAr
          ? `القيمة ${money(order.total)} · المحصّل ${money(order.collected)}`
          : `Total ${money(order.total)} · collected ${money(order.collected)}`}
      </td>
      <td className="px-3 py-1.5 text-end">
        {message && chat ? (
          <a
            href={`${chat}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-1 font-semibold text-success hover:underline"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {isAr ? "تذكير" : "Remind"}
          </a>
        ) : null}
      </td>
      <td className="px-3 py-1.5 text-end font-bold">{money(order.balance)}</td>
    </tr>
  );
}
