import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateRange } from "react-day-picker";
import { defaultReportRange } from "@/lib/reports-view";
import { useI18n } from "@/lib/i18n";
import { ReportsToolbar } from "@/components/reports/ReportsToolbar";
import { OverviewSections } from "@/components/reports/OverviewSections";
import { AlertCircle, RefreshCw, Info } from "lucide-react";
import { OsSkeleton } from "@/components/os/os-skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reportingQueries } from "@/lib/data/reporting";
import { useBrand } from "@/lib/brand-context";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useStoreCurrency } from "@/hooks/use-store-currency";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports/")({
  component: ReportsOverview,
});

function ReportsOverview() {
  const { lang } = useI18n();
  const { slug } = Route.useParams();
  const brandId = useBrand().id;
  const { modules } = useAdminStoreProfile(brandId).profile;
  const storeCurrency = useStoreCurrency(brandId);
  const [date, setDate] = useState<DateRange | undefined>(defaultReportRange);
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState("");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const query = useQuery({
    ...reportingQueries.overview(
      slug,
      date?.from && date?.to ? { from: date.from, to: date.to } : undefined,
      timezone,
      includeHistorical,
    ),
    retry: 1,
  });
  const periodMs = date?.from && date?.to ? date.to.getTime() - date.from.getTime() + 1 : 0;
  const previousTo = date?.from ? new Date(date.from.getTime() - 1) : null;
  const previousFrom = previousTo ? new Date(previousTo.getTime() - periodMs + 1) : null;
  const previousQuery = useQuery({
    ...reportingQueries.overview(
      slug,
      previousFrom && previousTo ? { from: previousFrom, to: previousTo } : undefined,
      timezone,
      includeHistorical,
    ),
    retry: 1,
  });

  const rows = Array.isArray(query.data) ? query.data : query.data ? [query.data] : [];
  const currencies = rows.map((row: any) => row.currency).filter(Boolean);
  const effectiveCurrency = currencies.includes(selectedCurrency)
    ? selectedCurrency
    : currencies[0];
  const data = rows.find((row: any) => row.currency === effectiveCurrency) as any;
  const previousRows = Array.isArray(previousQuery.data) ? previousQuery.data : [];
  const previousData: any = previousRows.find((row: any) => row.currency === effectiveCurrency);

  return (
    <div className="space-y-6">
      <ReportsToolbar
        lang={lang === "ar" ? "ar" : "en"}
        date={date}
        setDate={setDate}
        includeHistorical={includeHistorical}
        setIncludeHistorical={setIncludeHistorical}
      />

      {currencies.length > 1 && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {lang === "ar" ? "عملة التقرير" : "Reporting currency"}
          </span>
          <Select value={effectiveCurrency} onValueChange={setSelectedCurrency}>
            <SelectTrigger className="w-32 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((currency: string) => (
                <SelectItem key={currency} value={currency}>
                  {currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {query.isLoading ? (
        <Skeleton />
      ) : query.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center">
          <AlertCircle className="mx-auto h-9 w-9 text-rose-600" />
          <h2 className="mt-4 text-lg font-semibold">
            {lang === "ar" ? "تعذر تحميل النظرة العامة" : "Overview could not be loaded"}
          </h2>
          <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
            {lang === "ar"
              ? "لم تتغير بياناتك. أعد المحاولة، وإذا استمرت المشكلة فتحقق من ترحيل دوال التقارير في قاعدة البيانات."
              : "Your data is safe. Retry now; if this persists, the reporting database functions need to be synchronized."}
          </p>
          <Button
            variant="outline"
            onClick={() => query.refetch()}
            className="mt-5 rounded-xl bg-white"
          >
            <RefreshCw className="me-2 h-4 w-4" />
            {lang === "ar" ? "إعادة المحاولة" : "Try again"}
          </Button>
        </div>
      ) : data ? (
        <>
          {data.overview_fallback && (
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {lang === "ar"
                  ? "يتم عرض مؤشرات المبيعات الأساسية مؤقتاً. يجب مزامنة ترحيل النظرة العامة لإظهار التكلفة والمصروفات بالكامل."
                  : "Core sales metrics are available. Synchronize the overview database migration to restore complete cost and expense metrics."}
              </span>
            </div>
          )}
          <OverviewSections
            data={data}
            previous={previousData}
            lang={lang === "ar" ? "ar" : "en"}
            currency={data.currency || storeCurrency}
            modules={modules}
          />
        </>
      ) : (
        <div className="rounded-2xl border bg-white p-14 text-center text-sm text-muted-foreground">
          {lang === "ar" ? "لا توجد بيانات في هذه الفترة" : "No data for this period"}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 7 }).map((_, i) => (
        <OsSkeleton key={i} variant="card" className="h-36 rounded-2xl" />
      ))}
    </div>
  );
}
