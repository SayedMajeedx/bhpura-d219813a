import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import type { ImportRunRecord } from "@/features/import-export/lib/import-templates";

// -------------------------------------------------------------
// Component: History & Audit Log Section
// -------------------------------------------------------------
export function ImportHistorySection({
  importRuns,
  isLoading,
  isAr,
}: {
  importRuns: ImportRunRecord[];
  isLoading: boolean;
  isAr: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-8 text-center">
          <RefreshCw className="h-6 w-6 animate-spin text-primary mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            {isAr ? "جاري تحميل سجل العمليات..." : "Loading migration audit log..."}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (importRuns.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-12 text-center space-y-3">
          <Clock className="h-10 w-10 mx-auto text-muted-foreground" />
          <h3 className="text-sm font-bold text-foreground">
            {isAr ? "لا توجد عمليات استيراد سابقة" : "No previous import runs"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {isAr
              ? "عند استيراد أي ملف منتجات، عملاء، أو طلبات، سيظهر السجل الكامل هنا موثقاً بالتاريخ والأرقام"
              : "When you run an import operation, full audit logs will appear here"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          {isAr ? "سجل عمليات الاستيراد والترحيل" : "Migration Audit Log"}
        </CardTitle>
        <CardDescription>
          {isAr
            ? "سجل رسمي موثق لكافة عمليات الترحيل السابقة مع تفاصيل النجاح والأخطاء"
            : "Official log of all previous migration runs with success/error statistics"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {importRuns.map((run) => (
            <div
              key={run.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/20 transition-all"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-bold uppercase tracking-wide">
                    {run.source || "CSV"}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {run.entity_type || "entities"}
                  </Badge>
                  <span className="text-xs font-semibold text-foreground">
                    {new Date(run.created_at).toLocaleString(isAr ? "ar-BH" : "en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {isAr ? "إجمالي السجلات:" : "Total rows:"}{" "}
                    <strong className="text-foreground">{run.total_count}</strong>
                  </span>
                  <span>•</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    {isAr ? "ناجح:" : "Success:"} {run.success_count}
                  </span>
                  {run.failed_count > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-destructive font-semibold">
                        {isAr ? "أخطاء:" : "Errors:"} {run.failed_count}
                      </span>
                    </>
                  )}
                  {run.skipped_count > 0 && (
                    <>
                      <span>•</span>
                      <span>
                        {isAr ? "تم تخطيه:" : "Skipped:"} {run.skipped_count}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {run.status === "completed" ? (
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs font-semibold">
                    <CheckCircle2 className="h-3 w-3 me-1" />
                    {isAr ? "مكتمل" : "Completed"}
                  </Badge>
                ) : run.status === "failed" ? (
                  <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-xs font-semibold">
                    <AlertCircle className="h-3 w-3 me-1" />
                    {isAr ? "فشل" : "Failed"}
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs font-semibold">
                    <Clock className="h-3 w-3 me-1 animate-spin" />
                    {isAr ? "قيد التنفيذ" : "Processing"}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
