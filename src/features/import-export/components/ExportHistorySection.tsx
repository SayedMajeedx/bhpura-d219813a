import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Sparkles, RefreshCw, Database } from "lucide-react";

// =============================================================
// Component 5: Export History & Disaster Recovery Section
// =============================================================
export function ExportHistorySection({
  history,
  onRefresh,
  onBackup,
  isAr,
}: {
  history: any[];
  onRefresh: () => void;
  onBackup: () => void;
  isAr: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* 1. Full Disaster Recovery Card */}
      <Card className="border-border bg-gradient-to-r from-primary/5 via-primary/10 to-transparent">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <Database className="h-5 w-5" />
              <span>
                {isAr
                  ? "النسخة الاحتياطية الشاملة للمتجر (Disaster Recovery)"
                  : "Full Store Disaster Recovery Backup"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              {isAr
                ? "قم بتحميل أرشيف JSON كامل يتضمن كافة منتجاتك، خياراتها، الأسعار، العملاء، الطلبات، الأقسام، والإعدادات بضغطة زر واحدة لضمان أمان بياناتك التام."
                : "Download a structured JSON archive containing your full catalog, variants, prices, customer CRM, past orders, and taxonomy in a single click."}
            </p>
          </div>

          <Button
            onClick={onBackup}
            className="shrink-0 h-10 px-5 text-xs font-bold gap-2 shadow-xs"
          >
            <Sparkles className="h-4 w-4" />
            {isAr ? "تحميل النسخة الاحتياطية الفورية" : "Download Full JSON Backup"}
          </Button>
        </CardContent>
      </Card>

      {/* 2. Audit Trail Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-bold text-foreground">
              {isAr ? "سجل عمليات التصدير الأخيرة (Audit Trail)" : "Recent Export Runs Audit Trail"}
            </h3>
          </div>

          <Button variant="outline" size="sm" onClick={onRefresh} className="h-8 gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            {isAr ? "تحديث" : "Refresh"}
          </Button>
        </div>

        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-muted/60 text-muted-foreground font-semibold border-b border-border">
                <tr>
                  <th className="p-3 text-start">{isAr ? "التاريخ والوقت" : "Timestamp"}</th>
                  <th className="p-3 text-start">{isAr ? "نوع الكيان" : "Entity Type"}</th>
                  <th className="p-3 text-start">{isAr ? "القالب المستخدم" : "Preset Used"}</th>
                  <th className="p-3 text-start">{isAr ? "الصيغة" : "Format"}</th>
                  <th className="p-3 text-start">{isAr ? "عدد السجلات" : "Records"}</th>
                  <th className="p-3 text-start">{isAr ? "اسم الملف" : "File Name"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((run: any) => (
                  <tr key={run.id || run.created_at} className="hover:bg-muted/30">
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {new Date(run.created_at).toLocaleString(isAr ? "ar-BH" : "en-US")}
                    </td>
                    <td className="p-3 whitespace-nowrap font-medium text-foreground capitalize">
                      {run.entity_type}
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      <Badge variant="outline" className="text-xs font-mono">
                        {run.preset}
                      </Badge>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                          run.file_format === "xlsx"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : run.file_format === "csv"
                              ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                              : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                        }`}
                      >
                        {String(run.file_format).toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap font-bold text-foreground">
                      {Number(run.record_count).toLocaleString()}
                    </td>
                    <td className="p-3 whitespace-nowrap text-xs text-muted-foreground font-mono">
                      {run.file_name}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      {isAr
                        ? "لم يتم تنفيذ أي عمليات تصدير حتى الآن"
                        : "No export runs recorded yet"}
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
