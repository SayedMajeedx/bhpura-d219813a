import { Link } from "@tanstack/react-router";
import { TrendingUp, PackageCheck, Wallet, Receipt, ChevronDown, Table2 } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PeriodFigures } from "@/features/expenses/lib/profit-and-loss";

interface ExpensesScopeSwitcherProps {
  lang: "ar" | "en";
  currency: string;
  slug: string;
  /** The Reports' figures for the page's period; null while they load. */
  figures: PeriodFigures | null;
  /** The page's period (whole days, YYYY-MM-DD): the strip says which days its figures are. */
  period?: { from: string; to: string };
}

/** "1 Oct 2026 – 31 Oct 2026", in Western digits, read as calendar days. */
export function periodCaption(period: { from: string; to: string }, lang: "ar" | "en"): string {
  const day = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(y, (m || 1) - 1, d || 1));
  };
  return period.from === period.to ? day(period.from) : `${day(period.from)} – ${day(period.to)}`;
}

/**
 * The profit and loss strip above the expenses: net sales, cost of goods, running costs, fees
 * and commissions, operating profit and margin, the Reports' own figures for the page's period,
 * with a way to the full monthly statement.
 */
export function ExpensesScopeSwitcher({
  lang,
  currency,
  slug,
  figures,
  period,
}: ExpensesScopeSwitcherProps) {
  const isAr = lang === "ar";
  const money = (value: number | undefined) =>
    figures ? formatMoney(value ?? 0, currency, lang) : "…";
  const fees = figures ? figures.paymentFees + figures.partnerCommissions : 0;
  const feesLabel =
    figures && figures.partnerCommissions > 0
      ? isAr
        ? "رسوم الدفع والعمولات"
        : "Payment fees & commissions"
      : isAr
        ? "رسوم الدفع"
        : "Payment fees";
  const profitable = (figures?.operatingProfit ?? 0) >= 0;

  return (
    <div className="rounded-2xl border border-border-subtle bg-muted/30 p-1.5">
      {period && (
        <p className="px-2 pb-1.5 pt-0.5 text-xs text-muted-foreground">
          {isAr ? "أرقام الفترة: " : "Figures for "}
          <span dir="auto" className="font-medium text-foreground">
            {periodCaption(period, lang)}
          </span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        <Tile
          label={isAr ? "صافي المبيعات" : "Net sales"}
          value={money(figures?.netSales)}
          icon={<TrendingUp className="h-3.5 w-3.5 text-success" aria-hidden="true" />}
        />
        <Tile
          label={isAr ? "تكلفة البضاعة" : "Cost of goods"}
          value={money(figures?.costOfGoods)}
          icon={<PackageCheck className="h-3.5 w-3.5 text-info" aria-hidden="true" />}
          wide
        />
        <Tile
          label={isAr ? "المصاريف التشغيلية" : "Running costs"}
          value={money(figures?.runningCosts)}
          icon={<Wallet className="h-3.5 w-3.5 text-warning" aria-hidden="true" />}
          wide
        />
        <Tile
          label={feesLabel}
          value={money(fees)}
          icon={<Receipt className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
          wide
        />
        <div className="flex flex-col gap-0.5 rounded-xl border border-border-subtle bg-card p-3 shadow-2xs sm:col-span-4 lg:col-span-1">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>{isAr ? "الربح التشغيلي والهامش" : "Operating profit / margin"}</span>
            {figures && (
              <span
                className={cn(
                  "rounded-md px-1.5 text-xs font-extrabold",
                  profitable ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                )}
              >
                {figures.operatingMargin.toFixed(1)}%
              </span>
            )}
          </div>
          <span
            className={cn(
              "font-mono text-sm font-extrabold",
              profitable ? "text-success" : "text-destructive",
            )}
          >
            {money(figures?.operatingProfit)}
          </span>
        </div>
      </div>
      <details className="group mt-1.5 sm:hidden">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-xl border border-border-subtle bg-card px-3 text-xs font-bold text-muted-foreground">
          <span>{isAr ? "تفاصيل التكاليف والمصروفات" : "Cost and expense details"}</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 grid gap-2">
          <MetricRow
            label={isAr ? "تكلفة البضاعة" : "Cost of goods"}
            value={money(figures?.costOfGoods)}
            icon={<PackageCheck className="h-4 w-4 text-info" aria-hidden="true" />}
          />
          <MetricRow
            label={isAr ? "المصاريف التشغيلية" : "Running costs"}
            value={money(figures?.runningCosts)}
            icon={<Wallet className="h-4 w-4 text-warning" aria-hidden="true" />}
          />
          <MetricRow
            label={feesLabel}
            value={money(fees)}
            icon={<Receipt className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
          />
        </div>
      </details>
      <Link
        to="/admin/b/$slug/reports/statement"
        params={{ slug }}
        className="mt-1.5 inline-flex min-h-9 items-center gap-1.5 px-2 text-xs font-semibold text-primary hover:underline"
      >
        <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
        {isAr
          ? "نفس أرقام التقارير. القائمة الشهرية كاملة"
          : "The same figures as Reports. The full monthly statement"}
      </Link>
    </div>
  );
}

function Tile({
  label,
  value,
  icon,
  wide = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  /** Shown from `sm` up; on a phone it sits in the details below. */
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex-col gap-0.5 rounded-xl border border-border-subtle bg-card p-3 shadow-2xs",
        wide ? "hidden sm:flex" : "flex",
      )}
    >
      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <span className="font-mono text-sm font-extrabold text-foreground">{value}</span>
    </div>
  );
}

function MetricRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-card px-3">
      <span>{icon}</span>
      <span className="flex-1 text-xs font-semibold text-muted-foreground">{label}</span>
      <strong className="font-mono text-xs">{value}</strong>
    </div>
  );
}
