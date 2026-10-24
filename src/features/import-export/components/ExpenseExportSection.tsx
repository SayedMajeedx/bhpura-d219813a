import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  exportToCsv,
  exportToExcel,
  logExportRun,
  EXPENSE_PRESETS,
  ExportFormat,
} from "@/lib/universal-exporter";
import { toExpenseExportLine, type ExpenseExportRow } from "@/lib/data/expenses";
import { arNounOblique } from "@/lib/arabic-count";

// =============================================================
// Component 4: Expenses Export Section
// =============================================================
export function ExpenseExportSection({
  brandId,
  brandSlug,
  expenses,
  isAr,
  onExportSuccess,
}: {
  brandId: string;
  brandSlug: string;
  expenses: ExpenseExportRow[];
  isAr: boolean;
  onExportSuccess: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [isExporting, setIsExporting] = useState(false);
  const preset = EXPENSE_PRESETS[0];

  const rows = useMemo(() => {
    return expenses.map(toExpenseExportLine);
  }, [expenses]);

  const handleExport = async () => {
    if (rows.length === 0) {
      toast.error(isAr ? "لا توجد مصروفات مسجلة للتصدير" : "No expenses to export");
      return;
    }

    setIsExporting(true);
    const toastId = toast.loading(
      isAr ? "جاري تجهيز كشف المصروفات..." : "Generating expenses file...",
    );

    try {
      const fileName = `boutq_${brandSlug}_expenses_${new Date().toISOString().slice(0, 10)}.${format}`;
      const columns = preset.columns.map((c) => ({
        key: c.key,
        label: isAr ? c.headerAr : c.headerEn,
        format: c.format,
        width: c.width,
      }));

      if (format === "xlsx") {
        await exportToExcel(rows, columns, fileName, isAr ? "المصروفات" : "Expenses");
      } else {
        exportToCsv(rows, columns, fileName);
      }

      await logExportRun({
        brandId,
        preset: "expenses_standard",
        entityType: "expenses",
        fileFormat: format,
        recordCount: rows.length,
        fileName,
      });

      onExportSuccess();
      toast.success(
        isAr
          ? `تم تصدير ${arNounOblique(rows.length, "line")} مصروفات بنجاح!`
          : `Exported ${rows.length} expense items!`,
        { id: toastId },
      );
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل التصدير" : "Export failed"), { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">
              {isAr
                ? "كشف المصروفات والنفقات التشغيلية"
                : "Operational Overhead & Expenses Journal"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "تصدير جميع التكاليف المسجلة (إيجار، تغليف، تسويق، رسوم شحن) لمراجعة الحسابات"
                : "Export all logged expenses, operational overhead, and packaging costs for auditing"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => setFormat("xlsx")}
              variant="chip"
              size="sm"
              className={
                format === "xlsx"
                  ? "border-success bg-success-subtle text-success hover:bg-success-subtle hover:text-success"
                  : "border-border"
              }
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Excel (.xlsx)</span>
            </Button>
            <Button
              type="button"
              onClick={() => setFormat("csv")}
              variant="chip"
              size="sm"
              className={
                format === "csv"
                  ? "border-info bg-info-subtle text-info hover:bg-info-subtle hover:text-info"
                  : "border-border"
              }
            >
              <FileText className="h-4 w-4" />
              <span>CSV (UTF-8 BOM)</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-foreground">
            {isAr ? "معاينة المصروفات" : "Expenses Preview"} ({rows.length}{" "}
            {isAr ? "بند" : "entries"})
          </span>
          <Button
            onClick={handleExport}
            disabled={isExporting || rows.length === 0}
            className="h-10 px-5 text-xs font-bold gap-2 shadow-xs"
          >
            {isExporting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isAr ? `تصدير المصروفات (${rows.length})` : `Export Expenses (${rows.length})`}
          </Button>
        </div>

        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-xs text-start">
              <thead className="bg-muted/60 text-muted-foreground font-semibold border-b border-border sticky top-0">
                <tr>
                  {preset.columns.map((c) => (
                    <th key={c.key} className="p-2.5 text-start font-medium whitespace-nowrap">
                      {isAr ? c.headerAr : c.headerEn}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, 5).map((row: any, idx) => (
                  <tr key={idx} className="hover:bg-muted/30">
                    {preset.columns.map((c) => (
                      <td
                        key={c.key}
                        className="p-2.5 whitespace-nowrap text-foreground font-mono text-xs"
                      >
                        {row[c.key] != null ? String(row[c.key]) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={preset.columns.length}
                      className="p-8 text-center text-muted-foreground"
                    >
                      {isAr ? "لا توجد مصروفات مسجلة" : "No expenses recorded"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
