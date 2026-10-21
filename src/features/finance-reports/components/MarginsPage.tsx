import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { OsLoadFailedState, combinedLoadState } from "@/components/os/os-load-failed-state";
import { DatePickerWithRange } from "@/components/reports/date-range-picker";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { formatDate, moneyFractionDigits } from "@/lib/format";
import { defaultReportRange } from "@/lib/reports-view";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { reportingQueries } from "@/lib/data/reporting";
import { cn } from "@/lib/utils";
import {
  MARGIN_COLUMNS,
  categoryMargins,
  marginRows,
  marginTotals,
  marginsSheet,
  productMargins,
  reconcile,
  sortMargins,
  type MarginLine,
  type MarginSort,
} from "../lib/margins";
import { accountingFigure } from "../lib/statement";
import { downloadWorkbook, workbookFileName } from "../lib/workbook";

const SORT_WORDS: Record<MarginSort, { en: string; ar: string }> = {
  profit: { en: "Gross profit", ar: "مجمل الربح" },
  margin: { en: "Margin", ar: "الهامش" },
  sales: { en: "Net sales", ar: "صافي المبيعات" },
  units: { en: "Pieces sold", ar: "القطع المبيعة" },
};

const percent = (value: number | null) => (value === null ? "–" : `${value.toFixed(1)}%`);
const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * Margin by product and by category for a period: what each made after its cost and its share
 * of the gross profit, with a check that the products add up to the monthly statement's figures
 * for the same period, and an Excel copy.
 */
export function MarginsPage({ slug }: { slug: string }) {
  const { lang: rawLang } = useI18n();
  const lang = rawLang === "ar" ? "ar" : "en";
  const isAr = lang === "ar";
  const brand = useBrand();
  const storeCurrency = useStoreCurrency(brand.id);
  const [date, setDate] = useState<DateRange | undefined>(defaultReportRange);
  const [by, setBy] = useState<"product" | "category">("product");
  const [sort, setSort] = useState<MarginSort>("profit");
  const [chosenCurrency, setChosenCurrency] = useState("");
  const [saving, setSaving] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const range = date?.from && date?.to ? { from: date.from, to: date.to } : undefined;

  const marginsQ = useQuery({ ...reportingQueries.margins(slug, range, false), retry: 1 });
  const statementQ = useQuery({
    ...reportingQueries.overview(slug, range, timeZone, false),
    retry: 1,
  });
  const rows = useMemo(() => marginRows(marginsQ.data), [marginsQ.data]);
  const currencies = useMemo(() => {
    const seen = new Set<string>([storeCurrency]);
    for (const row of rows) if (row.currency) seen.add(row.currency);
    return [...seen];
  }, [rows, storeCurrency]);
  const currency = currencies.includes(chosenCurrency) ? chosenCurrency : currencies[0];
  const digits = moneyFractionDigits(currency);
  const lines = useMemo(
    () =>
      sortMargins(
        by === "product"
          ? productMargins(rows, currency, lang)
          : categoryMargins(rows, currency, lang),
        sort,
      ),
    [rows, currency, lang, by, sort],
  );
  const totals = marginTotals(lines);
  const statementRows = Array.isArray(statementQ.data) ? statementQ.data : [];
  const check = statementQ.data
    ? reconcile(
        totals,
        statementRows.find((r) => r.currency === currency),
        digits,
      )
    : null;
  const money = (value: number) => accountingFigure(value, digits);
  const period = range
    ? `${formatDate(range.from, isAr ? "ar-BH" : "en-BH")} – ${formatDate(range.to, isAr ? "ar-BH" : "en-BH")}`
    : "";

  const download = async () => {
    if (!range) return;
    setSaving(true);
    try {
      const title = isAr ? "الهوامش" : "Margins";
      const subtitle = `${(isAr ? brand.name_ar : null) || brand.name_en} · ${period} · ${currency}`;
      const sheets = (["product", "category"] as const).map((view) =>
        marginsSheet({
          lines: sortMargins(
            view === "product"
              ? productMargins(rows, currency, lang)
              : categoryMargins(rows, currency, lang),
            sort,
          ),
          by: view,
          currency,
          digits,
          lang,
          title:
            view === "product"
              ? isAr
                ? "حسب المنتج"
                : "By product"
              : isAr
                ? "حسب القسم"
                : "By category",
          subtitle: `${title} · ${subtitle}`,
        }),
      );
      await downloadWorkbook(
        sheets,
        workbookFileName(slug, "margins", `${isoDay(range.from)}-to-${isoDay(range.to)}`),
      );
    } catch {
      toast.error(isAr ? "تعذر تنزيل الملف" : "The file could not be downloaded");
    } finally {
      setSaving(false);
    }
  };

  const state = combinedLoadState([marginsQ]);

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-end gap-3 p-3 sm:p-4">
        <div className="min-w-0 flex-1 basis-56">
          <h2 className="text-base font-bold">{isAr ? "الهوامش" : "Margins"}</h2>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "ما ربحه كل منتج وكل قسم بعد تكلفته، ونصيبه من مجمل الربح."
              : "What each product and category made after its cost, and its share of gross profit."}
          </p>
        </div>
        <DatePickerWithRange date={date} setDate={setDate} />
        <div className="space-y-1">
          <Label htmlFor="margins-by" className="text-xs">
            {isAr ? "حسب" : "By"}
          </Label>
          <select
            id="margins-by"
            value={by}
            onChange={(e) => setBy(e.target.value as "product" | "category")}
            className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11"
          >
            <option value="product">{isAr ? "المنتج" : "Product"}</option>
            <option value="category">{isAr ? "القسم" : "Category"}</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="margins-sort" className="text-xs">
            {isAr ? "الترتيب" : "Sort by"}
          </Label>
          <select
            id="margins-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as MarginSort)}
            className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11"
          >
            {(Object.keys(SORT_WORDS) as MarginSort[]).map((key) => (
              <option key={key} value={key}>
                {SORT_WORDS[key][lang]}
              </option>
            ))}
          </select>
        </div>
        {currencies.length > 1 && (
          <div className="space-y-1">
            <Label htmlFor="margins-currency" className="text-xs">
              {isAr ? "العملة" : "Currency"}
            </Label>
            <select
              id="margins-currency"
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
          disabled={saving || state !== "ready" || !range}
          className="gap-1.5"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {isAr ? "تنزيل Excel" : "Download Excel"}
        </Button>
      </Card>

      {state === "failed" ? (
        <OsLoadFailedState
          isAr={isAr}
          title={isAr ? "تعذّر تحميل الهوامش" : "The margins could not be loaded"}
          description={
            isAr
              ? "لم يتغير شيء. تحقق من الاتصال ثم أعد المحاولة."
              : "Nothing was changed. Check the connection and try again."
          }
          queries={[marginsQ]}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-max border-collapse text-sm tabular-nums"
              aria-busy={state === "loading"}
            >
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" className="sticky start-0 z-10 bg-card px-3 py-2 text-start">
                    {by === "product" ? MARGIN_COLUMNS.name[lang] : MARGIN_COLUMNS.category[lang]}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end">
                    {MARGIN_COLUMNS.units[lang]}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end">
                    {`${MARGIN_COLUMNS.netSales[lang]} (${currency})`}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end">
                    {MARGIN_COLUMNS.cost[lang]}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end">
                    {MARGIN_COLUMNS.grossProfit[lang]}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end">
                    {MARGIN_COLUMNS.margin[lang]}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end">
                    {MARGIN_COLUMNS.share[lang]}
                  </th>
                </tr>
              </thead>
              <tbody>
                {state === "loading" ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                      {isAr ? "جارٍ التحميل…" : "Loading…"}
                    </td>
                  </tr>
                ) : lines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                      {isAr ? "لا مبيعات في هذه الفترة." : "No sales in this period."}
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <MarginRowView key={line.key} line={line} money={money} lang={lang} />
                  ))
                )}
              </tbody>
              {state === "ready" && lines.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border font-bold">
                    <th scope="row" className="sticky start-0 z-10 bg-card px-3 py-2 text-start">
                      {MARGIN_COLUMNS.total[lang]}
                    </th>
                    <td className="px-3 py-2 text-end">{accountingFigure(totals.units, 0)}</td>
                    <td className="px-3 py-2 text-end">{money(totals.netSales)}</td>
                    <td className="px-3 py-2 text-end">{money(-totals.cost)}</td>
                    <td className="px-3 py-2 text-end">{money(totals.grossProfit)}</td>
                    <td className="px-3 py-2 text-end">{percent(totals.margin)}</td>
                    <td className="px-3 py-2 text-end">{percent(totals.share)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {state === "ready" && check && lines.length > 0 && (
        <p
          className={cn(
            "flex items-start gap-2 px-1 text-xs",
            check.ok ? "text-success" : "text-warning",
          )}
        >
          {check.ok ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          {check.ok
            ? isAr
              ? "تطابق القائمة الشهرية لهذه الفترة: صافي المبيعات وتكلفة البضاعة."
              : "Adds up to the monthly statement for this period: net sales and cost of goods."
            : isAr
              ? `يختلف عن القائمة الشهرية: صافي المبيعات بـ ${money(check.netSalesDiff)}، والتكلفة بـ ${money(check.costDiff)}.`
              : `Differs from the monthly statement: net sales by ${money(check.netSalesDiff)}, cost by ${money(check.costDiff)}.`}
        </p>
      )}
      <p className="px-1 text-xs text-muted-foreground">
        {isAr
          ? "صافي المبيعات بعد الخصومات والمرتجعات، ويشمل ما بيع في المحلات الشريكة. المرتجع يُخصم في شهر معالجته. قطعة بلا تكلفة مسجلة تُظهر ربحاً أعلى من حقيقته (علامة !)."
          : "Net sales are after discounts and returns, and include what partner shops sold. A return is deducted in the month it was processed. A piece with no cost recorded shows more profit than it made (marked !)."}
      </p>
    </div>
  );
}

function MarginRowView({
  line,
  money,
  lang,
}: {
  line: MarginLine;
  money: (value: number) => string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  return (
    <tr className="border-t border-border-subtle">
      <th scope="row" className="sticky start-0 z-10 max-w-64 bg-card px-3 py-1.5 text-start">
        <span dir="auto" className="text-page-start line-clamp-2 break-words font-semibold">
          {line.name}
          {line.missingCost && (
            <span
              className="ms-1 text-warning"
              title={isAr ? "بعض القطع بلا تكلفة مسجلة" : "Some pieces have no cost recorded"}
            >
              !
            </span>
          )}
        </span>
        {(line.category || line.products !== undefined) && (
          <span className="block text-xs font-normal text-muted-foreground">
            {line.category ?? (isAr ? `${line.products} منتجات` : `${line.products} products`)}
            {line.partnerUnits > 0 &&
              ` · ${isAr ? `${line.partnerUnits} في المحلات الشريكة` : `${line.partnerUnits} at partner shops`}`}
          </span>
        )}
      </th>
      <td className="px-3 py-1.5 text-end">{accountingFigure(line.units, 0)}</td>
      <td className="px-3 py-1.5 text-end">{money(line.netSales)}</td>
      <td className="px-3 py-1.5 text-end">{money(-line.cost)}</td>
      <td
        className={cn(
          "px-3 py-1.5 text-end font-semibold",
          line.grossProfit < 0 && "text-destructive",
        )}
      >
        {money(line.grossProfit)}
      </td>
      <td className="px-3 py-1.5 text-end">{percent(line.margin)}</td>
      <td className="px-3 py-1.5 text-end text-muted-foreground">{percent(line.share)}</td>
    </tr>
  );
}
