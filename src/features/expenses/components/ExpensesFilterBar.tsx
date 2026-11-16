import { useId } from "react";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { categoryLabel } from "@/features/expenses/lib/expense-form";
import {
  monthOf,
  periodDays,
  periodLabel,
  shiftMonth,
  thisMonth,
  type ExpensePeriod,
} from "@/features/expenses/lib/period";

type Lang = "ar" | "en";
export type KindFilter = "all" | "opex" | "cogs";

/**
 * The one filter of the expenses page: its period (a month with the months either side a tap
 * away, days the reader picks, or every period), the kind, the category and a search, and the
 * period's files. The page once had two lists, each with its own period.
 */
export function ExpensesFilterBar({
  lang,
  period,
  onPeriod,
  kind,
  onKind,
  offerStock,
  category,
  onCategory,
  categories,
  search,
  onSearch,
  onDownloadExcel,
  onDownloadCogs,
}: {
  lang: Lang;
  period: ExpensePeriod;
  onPeriod: (period: ExpensePeriod) => void;
  kind: KindFilter;
  onKind: (kind: KindFilter) => void;
  offerStock: boolean;
  category: string;
  onCategory: (category: string) => void;
  categories: string[];
  search: string;
  onSearch: (search: string) => void;
  onDownloadExcel: () => void;
  onDownloadCogs: () => void;
}) {
  const isAr = lang === "ar";
  const ids = useId();
  const month = period.kind === "month" ? period.month : monthOf();
  const days = periodDays(period);
  const choice = period.kind === "month" ? (month === monthOf() ? "this" : "month") : period.kind;
  const Prev = isAr ? ChevronRight : ChevronLeft;
  const Next = isAr ? ChevronLeft : ChevronRight;

  return (
    <div className="space-y-2.5 rounded-2xl border border-border-subtle bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => onPeriod({ kind: "month", month: shiftMonth(month, -1) })}
            aria-label={isAr ? "الشهر السابق" : "Previous month"}
          >
            <Prev className="h-4 w-4" />
          </Button>
          <span className="min-w-36 px-2 text-center text-sm font-semibold" aria-live="polite">
            {periodLabel(period, lang)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => onPeriod({ kind: "month", month: shiftMonth(month, 1) })}
            aria-label={isAr ? "الشهر التالي" : "Next month"}
          >
            <Next className="h-4 w-4" />
          </Button>
        </div>
        <select
          aria-label={isAr ? "الفترة" : "Period"}
          value={choice}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "this") onPeriod(thisMonth());
            else if (value === "last")
              onPeriod({ kind: "month", month: shiftMonth(monthOf(), -1) });
            else if (value === "all") onPeriod({ kind: "all" });
            else if (value === "range")
              onPeriod({
                kind: "range",
                from: days.from || `${monthOf()}-01`,
                to: days.to || periodDays(thisMonth()).to,
              });
          }}
          className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="this">{isAr ? "هذا الشهر" : "This month"}</option>
          <option value="last">{isAr ? "الشهر الماضي" : "Last month"}</option>
          {choice === "month" && <option value="month">{periodLabel(period, lang)}</option>}
          <option value="range">{isAr ? "من تاريخ إلى تاريخ" : "From a date to a date"}</option>
          <option value="all">{isAr ? "كل الفترات" : "Every period"}</option>
        </select>
        {period.kind === "range" && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <label htmlFor={`${ids}-from`} className="text-muted-foreground">
              {isAr ? "من" : "From"}
            </label>
            <Input
              id={`${ids}-from`}
              type="date"
              value={period.from}
              onChange={(e) => e.target.value && onPeriod({ ...period, from: e.target.value })}
              className="h-9 w-auto"
            />
            <label htmlFor={`${ids}-to`} className="text-muted-foreground">
              {isAr ? "إلى" : "To"}
            </label>
            <Input
              id={`${ids}-to`}
              type="date"
              value={period.to}
              onChange={(e) => e.target.value && onPeriod({ ...period, to: e.target.value })}
              className="h-9 w-auto"
            />
          </div>
        )}
        <div className="ms-auto flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onDownloadExcel}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            {isAr ? "Excel" : "Excel"}
          </Button>
          {offerStock && (
            <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={onDownloadCogs}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {isAr ? "تكلفة البضاعة (CSV)" : "Cost of goods (CSV)"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label={isAr ? "نوع المصروف" : "Kind of expense"}
          className="flex rounded-lg border border-border p-0.5"
        >
          {[
            { value: "all" as KindFilter, label: isAr ? "الكل" : "All" },
            { value: "opex" as KindFilter, label: isAr ? "تشغيلية" : "Running costs" },
            ...(offerStock
              ? [{ value: "cogs" as KindFilter, label: isAr ? "مشتريات مخزون" : "Stock purchases" }]
              : []),
          ].map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => onKind(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-(--motion-quick)",
                kind === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label={isAr ? "التصنيف" : "Category"}
          value={category}
          onChange={(e) => onCategory(e.target.value)}
          className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">{isAr ? "كل التصنيفات" : "Every category"}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c, lang)}
            </option>
          ))}
        </select>
        <div className="relative min-w-0 flex-1 basis-48">
          <Search
            className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={isAr ? "ابحث في الوصف أو المورد" : "Search a description or supplier"}
            aria-label={isAr ? "ابحث في المصاريف" : "Search the expenses"}
            className="h-9 ps-8"
          />
        </div>
      </div>
    </div>
  );
}
