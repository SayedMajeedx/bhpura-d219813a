import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { useI18n } from "@/lib/i18n";
import { DatePickerWithRange } from "@/components/reports/date-range-picker";
import { Button } from "@/components/ui/button";
import {
  Download,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { buildExport, isEmptyExport, type ExportKind } from "@/features/report-export/build-export";
import { csvText } from "@/features/report-export/lib/export-shared";
import { downloadWorkbook, workbookFileName } from "@/features/finance-reports/lib/workbook";
import { localDay } from "@/features/finance-reports/lib/receivables";
import { useBrand } from "@/lib/brand-context";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { useOrderNumberFormat } from "@/hooks/use-order-number";
import { moneyFractionDigits } from "@/lib/format";
import { cn, getFriendlyErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports/export")({
  component: ReportsExport,
});

type ReportType = ExportKind;
type FormatType = "csv" | "xlsx";

const reportOptions = [
  {
    id: "sales",
    icon: FileText,
    en: "Full report",
    ar: "التقرير الشامل",
    descEn:
      "Sales by source, profit and loss, cost of goods, profit by product, partner shops, expenses, balances and stock",
    descAr:
      "المبيعات حسب المصدر، الأرباح والخسائر، تكلفة البضاعة، الربح حسب المنتج، المحلات الشريكة، المصاريف، الأرصدة والمخزون",
  },
  {
    id: "products",
    icon: FileSpreadsheet,
    en: "Product performance",
    ar: "أداء المنتجات",
    descEn: "Pieces and sales in store and at partners, cost and stock",
    descAr: "القطع والمبيعات في المتجر والمحلات، والتكلفة والمخزون",
  },
  {
    id: "customers",
    icon: Sparkles,
    en: "Customer insights",
    ar: "تحليلات العملاء",
    descEn: "Orders and spend per customer, with no contact details",
    descAr: "الطلبات والمشتريات لكل عميل، بدون بيانات التواصل",
  },
] as const;

function ReportsExport() {
  const { lang } = useI18n();
  const { slug } = Route.useParams();
  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(startOfDay(new Date()), 30),
    to: endOfDay(new Date()),
  });
  const [reportType, setReportType] = useState<ReportType>("sales");
  const [formatType, setFormatType] = useState<FormatType>("xlsx");
  const [isExporting, setIsExporting] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const qc = useQueryClient();
  const brand = useBrand();
  const currency = useStoreCurrency(brand.id);
  const numberFormat = useOrderNumberFormat(brand.id);

  const handleExport = async () => {
    if (!date?.from || !date?.to) return;
    const toastId = "report-export";
    try {
      setIsExporting(true);
      toast.loading(lang === "ar" ? "جاري إعداد الملف..." : "Preparing your file…", {
        id: toastId,
      });

      const words = lang === "ar" ? "ar" : "en";
      const file = await buildExport({
        kind: reportType,
        qc,
        slug,
        range: { from: date.from, to: date.to },
        ctx: {
          lang: words,
          storeName: (words === "ar" ? brand.name_ar : null) || brand.name_en,
          currency,
          digits: moneyFractionDigits(currency),
          timeZone: timezone,
          numberFormat,
        },
      });
      // The full report has a summary worth reading even in a period with no sale.
      if (reportType !== "sales" && isEmptyExport(file))
        throw new Error(
          lang === "ar"
            ? "لا توجد بيانات للتصدير في هذه الفترة."
            : "No data is available for this period.",
        );
      const period = `${localDay(date.from)}-to-${localDay(date.to)}`;
      const fileName = workbookFileName(
        slug,
        reportType === "sales" ? "report" : reportType,
        period,
      );
      if (formatType === "xlsx") {
        await downloadWorkbook(file.sheets, fileName);
      } else {
        downloadCsv(csvText(file.csv), fileName.replace(/\.xlsx$/, ".csv"));
      }
      toast.success(lang === "ar" ? "تم تنزيل التقرير بنجاح" : "Report downloaded successfully", {
        id: toastId,
      });
    } catch (error) {
      const message = getFriendlyErrorMessage(
        error,
        lang === "ar" ? "فشل التصدير" : "Export failed",
      );
      toast.error(message, { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
      <section className="rounded-2xl border bg-white p-4 shadow-[0_16px_45px_-34px_rgba(43,23,25,.5)] sm:p-7">
        <div className="mb-5 sm:mb-7">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Download className="h-3.5 w-3.5" />
            {lang === "ar" ? "مركز التصدير" : "EXPORT CENTRE"}
          </span>
          <h2 className="mt-3 text-2xl font-semibold">
            {lang === "ar" ? "أنشئ تقريرك" : "Build your report"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {lang === "ar"
              ? "اختر البيانات والفترة والصيغة، وسنجهز ملفاً منظماً للتحليل."
              : "Choose the data, period, and format. We’ll prepare a clean file ready for analysis."}
          </p>
        </div>

        <div className="space-y-5 sm:space-y-7">
          <Field label={lang === "ar" ? "1. الفترة الزمنية" : "1. Date range"}>
            <DatePickerWithRange date={date} setDate={setDate} className="mt-3" />
          </Field>
          <Field label={lang === "ar" ? "2. محتوى التقرير" : "2. Report content"}>
            <div className="mt-3 grid gap-2.5 md:grid-cols-3">
              {reportOptions.map((option) => {
                const Icon = option.icon;
                const selected = reportType === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setReportType(option.id)}
                    className={cn(
                      "rounded-2xl border p-3.5 sm:p-4 text-start transition",
                      selected
                        ? "border-primary bg-primary/5 shadow-xs"
                        : "hover:border-primary/30 hover:bg-muted/40",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-10 w-10 place-items-center rounded-xl",
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <strong className="mt-4 block text-sm">
                      {lang === "ar" ? option.ar : option.en}
                    </strong>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {lang === "ar" ? option.descAr : option.descEn}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label={lang === "ar" ? "3. صيغة الملف" : "3. File format"}>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FormatButton
                selected={formatType === "xlsx"}
                onClick={() => setFormatType("xlsx")}
                icon={<FileSpreadsheet />}
                title="Excel (.xlsx)"
                subtitle={lang === "ar" ? "موصى به للتحليل" : "Recommended for analysis"}
                tone="emerald"
              />
              <FormatButton
                selected={formatType === "csv"}
                onClick={() => setFormatType("csv")}
                icon={<FileText />}
                title="CSV (.csv)"
                subtitle={lang === "ar" ? "خفيف ومتوافق" : "Lightweight and compatible"}
                tone="blue"
              />
            </div>
          </Field>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {formatType === "xlsx"
              ? lang === "ar"
                ? "أرقام بعملة المتجر وخاناتها، وسطر مجموع في كل ورقة"
                : "Figures in the store's currency and decimals, a total on every sheet"
              : lang === "ar"
                ? "الجدول الرئيسي فقط، بدون الملخص"
                : "The main table only, without the summary"}
          </p>
          <Button
            onClick={handleExport}
            disabled={!date?.from || !date?.to || isExporting}
            className="h-12 rounded-xl bg-primary px-7 text-primary-foreground hover:bg-primary/90"
          >
            {isExporting ? (
              <span className="me-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <Download className="me-2 h-4 w-4" />
            )}
            {isExporting
              ? lang === "ar"
                ? "جاري التصدير..."
                : "Exporting…"
              : lang === "ar"
                ? "تنزيل التقرير"
                : "Download report"}
          </Button>
        </div>
      </section>

      <aside className="grid gap-3 sm:grid-cols-2 xl:block xl:space-y-4">
        <div className="rounded-2xl bg-primary p-6 text-primary-foreground shadow-md">
          <ShieldCheck className="h-8 w-8 text-primary-foreground/80" />
          <h3 className="mt-5 text-xl font-semibold">
            {lang === "ar" ? "الخصوصية مدمجة" : "Privacy built in"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-primary-foreground/80">
            {lang === "ar"
              ? "يتم حذف البريد الإلكتروني ورقم الهاتف تلقائياً من ملفات التصدير."
              : "Email addresses and phone numbers are automatically removed from exported files."}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <LockKeyhole className="h-5 w-5 text-primary" />
          <h3 className="mt-3 font-semibold">{lang === "ar" ? "وصول محمي" : "Protected access"}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {lang === "ar"
              ? "التصدير متاح فقط للمسؤولين والموظفين المخولين بعرض البيانات المالية."
              : "Exports are available only to administrators and staff with financial reporting permission."}
          </p>
        </div>
      </aside>
    </div>
  );
}

function downloadCsv(content: string, fileName: string) {
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{label}</h3>
      {children}
    </div>
  );
}
function FormatButton({ selected, onClick, icon, title, subtitle, tone }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4 text-start transition",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "grid h-10 w-10 place-items-center rounded-xl [&>svg]:h-5 [&>svg]:w-5",
          tone === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700",
        )}
      >
        {icon}
      </span>
      <span>
        <b className="block text-sm">{title}</b>
        <small className="text-muted-foreground">{subtitle}</small>
      </span>
      {selected && (
        <span className="ms-auto h-3 w-3 rounded-full bg-primary ring-4 ring-primary/10" />
      )}
    </button>
  );
}
