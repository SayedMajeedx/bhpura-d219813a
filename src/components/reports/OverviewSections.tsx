import type { ReactNode } from "react";
import {
  AlertCircle,
  Banknote,
  CircleDollarSign,
  HandCoins,
  PackageCheck,
  Percent,
  ShoppingBag,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { KpiCard } from "@/components/reports/kpi-card";
import { SalesBySourceCard } from "@/components/reports/SalesBySourceCard";
import { formatMoney } from "@/lib/format";
import { SALES_WORDS } from "@/lib/report-words";
import { overviewProfit, salesBySource, type ComposedOverviewRow } from "@/lib/reporting-compose";
import { cn } from "@/lib/utils";

type Lang = "ar" | "en";
type Row = Partial<ComposedOverviewRow> & Record<string, unknown>;
type Modules = { incubators: boolean; shipping: boolean; packaging: boolean };

const num = (value: unknown) => Number(value ?? 0) || 0;

/** A row for something the store does not use is left out, unless it holds a figure. */
const shows = (enabled: boolean, value: unknown) => enabled || num(value) !== 0;

/**
 * The change against the period before, with the earlier figure itself: "+12.4% · was 230.000".
 * A cost that rose is not good news, so `goodWhenUp` says which way is.
 */
export function periodTrend(
  current: number,
  previous: number | null | undefined,
  lang: Lang,
  format: (value: number) => string,
  goodWhenUp = true,
) {
  if (previous === null || previous === undefined || Math.abs(previous) < 0.0005) return undefined;
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return {
    value: Number(change.toFixed(1)),
    label: lang === "ar" ? `السابقة: ${format(previous)}` : `Before: ${format(previous)}`,
    isPositive: goodWhenUp ? current >= previous : current <= previous,
  };
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Lines({
  rows,
  total,
}: {
  rows: Array<{ label: string; value: string; muted?: boolean }>;
  total?: { label: string; value: string; negative?: boolean };
}) {
  return (
    <dl className="divide-y divide-border/60 rounded-2xl border border-border-subtle bg-card px-4">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className={cn("text-sm", row.muted ? "text-muted-foreground" : "")}>{row.label}</dt>
          <dd className="font-mono text-sm font-semibold">{row.value}</dd>
        </div>
      ))}
      {total && (
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-sm font-semibold">{total.label}</dt>
          <dd
            className={cn(
              "font-mono text-base font-bold",
              total.negative ? "text-destructive" : "",
            )}
          >
            {total.value}
          </dd>
        </div>
      )}
    </dl>
  );
}

/**
 * The Reports overview, by the questions an owner asks: how much did I sell (net sales and
 * where they came from), how much did I make (gross and operating profit, every cost as a
 * line), where is the money (collected, owed by customers and by partner shops, VAT owed) and,
 * folded, whether the cost data can be trusted. Each figure beside the period before it.
 */
export function OverviewSections({
  data,
  previous,
  lang,
  currency,
  modules,
}: {
  data: Row;
  previous: Row | undefined;
  lang: Lang;
  currency: string;
  modules: Modules;
}) {
  const isAr = lang === "ar";
  const money = (value: unknown) => formatMoney(num(value), currency, lang);
  const count = (value: number) => String(value);
  const sales = salesBySource(data);
  const salesBefore = previous ? salesBySource(previous) : null;
  const profit = overviewProfit(data);
  const profitBefore = previous ? overviewProfit(previous) : null;
  const partnerCount = num(data.incubator_sale_count);
  const storeOrders = Math.max(0, num(data.paid_order_count) - partnerCount);
  const storeOrdersBefore = previous
    ? Math.max(0, num(previous.paid_order_count) - num(previous.incubator_sale_count))
    : null;
  const average = storeOrders > 0 ? sales.store / storeOrders : 0;
  const costRows = [
    {
      label: isAr ? "تكلفة البضاعة المبيعة" : "Cost of the goods sold",
      value: money(-profit.costOfGoods),
    },
    {
      label: isAr ? "المصاريف التشغيلية" : "Running costs",
      value: money(-num(data.manual_expenses)),
    },
    ...(num(data.processing_fees)
      ? [{ label: isAr ? "رسوم الدفع" : "Payment fees", value: money(-num(data.processing_fees)) }]
      : []),
    ...(shows(modules.incubators, data.incubator_commissions)
      ? [
          {
            label: isAr ? "عمولات المحلات الشريكة" : "Partner shops' commission",
            value: money(-num(data.incubator_commissions)),
          },
        ]
      : []),
  ];
  const missing = num(data.missing_cost_item_count) > 0 || num(data.missing_cost_exposure) > 0;

  return (
    <div className="space-y-7">
      <Section
        title={isAr ? "كم بعت؟" : "How much did I sell?"}
        note={SALES_WORDS.netSalesNote[lang]}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title={SALES_WORDS.total[lang]}
            value={money(sales.total)}
            icon={<Banknote />}
            trend={periodTrend(sales.total, salesBefore?.total, lang, money)}
          />
          <KpiCard
            title={isAr ? "طلبات المتجر" : "Store orders"}
            value={storeOrders}
            icon={<PackageCheck />}
            accent="blue"
            description={
              shows(modules.incubators, partnerCount)
                ? isAr
                  ? `ومبيعات المحلات الشريكة: ${partnerCount}`
                  : `And partner shop sales: ${partnerCount}`
                : undefined
            }
            trend={periodTrend(storeOrders, storeOrdersBefore, lang, count)}
          />
          <KpiCard
            title={isAr ? "متوسط طلب المتجر" : "Average store order"}
            value={money(average)}
            icon={<ShoppingBag />}
            description={isAr ? "صافي، بلا ضريبة ولا توصيل" : "Net, without VAT or delivery"}
          />
          <KpiCard
            title={isAr ? "الخصومات" : "Discounts"}
            value={money(data.discounts)}
            icon={<Percent />}
            accent="amber"
            trend={periodTrend(
              num(data.discounts),
              previous ? num(previous.discounts) : null,
              lang,
              money,
              false,
            )}
          />
        </div>
        <SalesBySourceCard
          sales={sales}
          currency={currency}
          lang={lang}
          showPartners={modules.incubators}
        />
      </Section>

      <Section
        title={isAr ? "كم ربحت؟" : "How much did I make?"}
        note={
          isAr
            ? "الدفع للموردين ليس مصروفاً: تُحسب تكلفة القطعة عند بيعها"
            : "Paying a supplier is not a cost: a piece's cost counts when it sells"
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            title={isAr ? "مجمل الربح" : "Gross profit"}
            value={money(profit.grossProfit)}
            icon={<TrendingUp />}
            accent={profit.grossProfit >= 0 ? "emerald" : "amber"}
            description={isAr ? "بعد تكلفة البضاعة" : "After the cost of goods"}
            trend={periodTrend(profit.grossProfit, profitBefore?.grossProfit, lang, money)}
          />
          <KpiCard
            title={isAr ? "هامش مجمل الربح" : "Gross margin"}
            value={`${profit.grossMargin.toFixed(1)}%`}
            icon={<Percent />}
            accent={profit.grossMargin >= 30 ? "emerald" : "amber"}
            description={
              profitBefore
                ? isAr
                  ? `السابقة: ${profitBefore.grossMargin.toFixed(1)}%`
                  : `Before: ${profitBefore.grossMargin.toFixed(1)}%`
                : undefined
            }
          />
          <KpiCard
            title={isAr ? "صافي الربح التشغيلي" : "Operating net profit"}
            value={money(profit.operatingProfit)}
            icon={<WalletCards />}
            accent={profit.operatingProfit >= 0 ? "emerald" : "amber"}
            description={`${isAr ? "الهامش" : "Margin"}: ${profit.operatingMargin.toFixed(1)}%`}
            trend={periodTrend(profit.operatingProfit, profitBefore?.operatingProfit, lang, money)}
          />
        </div>
        <Lines
          rows={[
            { label: isAr ? "صافي المبيعات" : "Net sales", value: money(profit.netSales) },
            ...costRows,
          ]}
          total={{
            label: isAr ? "صافي الربح التشغيلي" : "Operating net profit",
            value: money(profit.operatingProfit),
            negative: profit.operatingProfit < 0,
          }}
        />
      </Section>

      <Section title={isAr ? "أين المال؟" : "Where is the money?"}>
        <Lines
          rows={[
            {
              label: isAr ? "المحصّل من هذه المبيعات" : "Collected on these sales",
              value: money(data.collected),
            },
            {
              label: isAr ? "باقي على العملاء" : "Still owed by customers",
              value: money(data.owed_by_customers),
            },
            ...(shows(modules.incubators, data.incubator_receivables)
              ? [
                  {
                    label: isAr ? "باقي على المحلات الشريكة" : "Still owed by partner shops",
                    value: money(data.incubator_receivables),
                  },
                ]
              : []),
            {
              label: isAr ? "المبالغ المستردة للعملاء" : "Refunded to customers",
              value: money(data.refunded_total),
            },
            ...(shows(modules.shipping, data.shipping_collected)
              ? [
                  {
                    label: isAr ? "رسوم التوصيل المحصّلة" : "Delivery charged",
                    value: money(data.shipping_collected),
                    muted: true,
                  },
                ]
              : []),
            {
              label: isAr
                ? "الضريبة المحصّلة (مستحقة للجهة الضريبية)"
                : "VAT charged (owed to the tax authority)",
              value: money(data.vat_collected),
              muted: true,
            },
            {
              label: SALES_WORDS.billed[lang],
              value: money(data.paid_order_value),
              muted: true,
            },
          ]}
        />
      </Section>

      <details open={missing} className="group rounded-2xl border border-border-subtle bg-card">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold">
          <span className="flex items-center gap-2">
            {missing ? (
              <AlertCircle className="h-4 w-4 text-warning" aria-hidden="true" />
            ) : (
              <CircleDollarSign className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
            {isAr ? "هل بيانات التكلفة كاملة؟" : "Is the cost data complete?"}
          </span>
          <span
            className={cn(
              "text-xs font-medium",
              missing ? "text-warning" : "text-muted-foreground",
            )}
          >
            {missing ? (isAr ? "يتطلب المراجعة" : "Needs a look") : isAr ? "كاملة" : "Complete"}
          </span>
        </summary>
        <div className="px-4 pb-4">
          <Lines
            rows={[
              {
                label: isAr ? "تكلفة طلبات المتجر" : "Cost of store orders",
                value: money(data.product_cogs),
              },
              ...(shows(modules.incubators, data.incubator_cogs)
                ? [
                    {
                      label: isAr ? "تكلفة مبيعات المحلات الشريكة" : "Cost of partner sales",
                      value: money(data.incubator_cogs),
                    },
                  ]
                : []),
              ...(shows(modules.packaging, data.packaging_cogs)
                ? [
                    {
                      label: isAr ? "تكلفة التغليف" : "Packaging",
                      value: money(data.packaging_cogs),
                    },
                  ]
                : []),
              {
                label: isAr ? "قطع مبيعة بلا تكلفة مسجلة" : "Pieces sold with no cost recorded",
                value: String(num(data.missing_cost_item_count)),
              },
              {
                label: isAr ? "مبيعاتها" : "Their sales",
                value: money(data.missing_cost_exposure),
              },
              {
                label: isAr
                  ? "أسطر طلبات يدوية (بلا منتج)"
                  : "Hand-written order lines (no product)",
                value: String(num(data.missing_product_link_count)),
                muted: true,
              },
            ]}
          />
          {missing && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <HandCoins className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {isAr
                ? "القطعة المبيعة بلا تكلفة تُحسب بتكلفة صفر، فيظهر الربح أعلى من حقيقته. أضف التكلفة من صفحة المنتجات."
                : "A piece sold with no cost counts as costing nothing, so the profit reads higher than it is. Add the cost on the products page."}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
