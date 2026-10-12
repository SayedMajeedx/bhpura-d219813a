import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Download, CheckCircle2, FileSpreadsheet, FileText, RefreshCw, Eye } from "lucide-react";
import { toast } from "sonner";
import { sanitizeGCCPhone } from "@/lib/os-formatting";
import {
  exportToCsv,
  exportToExcel,
  logExportRun,
  CUSTOMER_PRESETS,
  ExportFormat,
} from "@/lib/universal-exporter";

// =============================================================
// Component 2: Customer Export Section
// =============================================================
export function CustomerExportSection({
  brandId,
  brandSlug,
  customers,
  orders,
  isAr,
  onExportSuccess,
}: {
  brandId: string;
  brandSlug: string;
  customers: any[];
  orders: any[];
  isAr: boolean;
  onExportSuccess: () => void;
}) {
  const [selectedPresetId, setSelectedPresetId] = useState("crm_full");
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [maskPrivacy, setMaskPrivacy] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const preset = CUSTOMER_PRESETS.find((p) => p.id === selectedPresetId) || CUSTOMER_PRESETS[0];

  // Map orders spend to customers
  const customerStats = useMemo(() => {
    const statsMap = new Map<string, { totalOrders: number; totalSpent: number }>();
    orders.forEach((o: any) => {
      if (!o.customer_id) return;
      const cur = statsMap.get(o.customer_id) || { totalOrders: 0, totalSpent: 0 };
      statsMap.set(o.customer_id, {
        totalOrders: cur.totalOrders + 1,
        totalSpent: cur.totalSpent + (Number(o.total) || 0),
      });
    });
    return statsMap;
  }, [orders]);

  const rows = useMemo(() => {
    return customers
      .map((c) => {
        const stats = customerStats.get(c.id) || { totalOrders: 0, totalSpent: 0 };
        const isVip = stats.totalSpent >= 100 || (c.notes || "").includes("VIP");
        const cleanPhone = sanitizeGCCPhone(c.phone) || c.phone || "";

        let displayPhone = cleanPhone;
        let displayEmail = c.email || "";

        if (maskPrivacy) {
          if (displayPhone)
            displayPhone = displayPhone.slice(0, 4) + "****" + displayPhone.slice(-2);
          if (displayEmail)
            displayEmail = displayEmail.slice(0, 2) + "***@" + (displayEmail.split("@")[1] || "");
        }

        const avgOrder = stats.totalOrders > 0 ? stats.totalSpent / stats.totalOrders : 0;

        return {
          id: c.id,
          name: c.name || "Customer",
          phone: displayPhone,
          clean_phone: maskPrivacy ? displayPhone : cleanPhone,
          email: displayEmail,
          total_orders: stats.totalOrders,
          total_spent: stats.totalSpent,
          is_vip: isVip ? (isAr ? "نعم (VIP)" : "VIP") : isAr ? "عادي" : "Standard",
          segment: isVip ? "VIP" : stats.totalOrders > 0 ? "Returning" : "New Contact",
          average_order_value: avgOrder,
          notes: c.notes || "",
          created_at: c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : "",
        };
      })
      .filter((r) => {
        if (segmentFilter === "vip_only") return r.is_vip.includes("VIP");
        if (segmentFilter === "with_orders") return r.total_orders > 0;
        if (segmentFilter === "with_phone") return !!r.phone;
        return true;
      });
  }, [customers, customerStats, maskPrivacy, segmentFilter, isAr]);

  const handleExport = async () => {
    if (rows.length === 0) {
      toast.error(isAr ? "لا يوجد عملاء مطابقين للتصدير" : "No customers to export");
      return;
    }

    setIsExporting(true);
    const toastId = toast.loading(
      isAr ? "جاري تجهيز قائمة العملاء..." : "Generating customer list...",
    );

    try {
      const fileName = `boutq_${brandSlug}_customers_${selectedPresetId}_${new Date().toISOString().slice(0, 10)}.${format}`;
      const columns = preset.columns.map((c) => ({
        key: c.key,
        label: isAr ? c.headerAr : c.headerEn,
        format: c.format,
        width: c.width,
      }));

      if (format === "xlsx") {
        await exportToExcel(rows, columns, fileName, isAr ? "العملاء" : "Customers");
      } else {
        exportToCsv(rows, columns, fileName);
      }

      await logExportRun({
        brandId,
        preset: selectedPresetId,
        entityType: "customers",
        fileFormat: format,
        recordCount: rows.length,
        fileName,
      });

      onExportSuccess();
      toast.success(
        isAr
          ? `تم تصدير ${rows.length} جهة اتصال بنجاح!`
          : `Successfully exported ${rows.length} contacts!`,
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
      {/* 1. Presets */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {isAr ? "1. حدد نمط بيانات العملاء" : "1. Choose Customer Export Format"}
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CUSTOMER_PRESETS.map((p) => {
            const isSelected = selectedPresetId === p.id;
            return (
              <Button
                key={p.id}
                type="button"
                onClick={() => setSelectedPresetId(p.id)}
                variant="chip"
                className={`h-auto p-4 rounded-xl text-start whitespace-normal flex-col items-stretch justify-between gap-0 hover:text-foreground ${
                  isSelected
                    ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary shadow-xs hover:bg-primary/5"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/40"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-bold text-foreground">
                      {isAr ? p.labelAr : p.labelEn}
                    </p>
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {isAr ? p.descriptionAr : p.descriptionEn}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-border-subtle flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {p.columns.length} {isAr ? "حقول" : "fields"}
                  </span>
                  <span className="font-semibold text-sky-600 dark:text-sky-400">
                    {p.id === "whatsapp_campaign" ? "Marketing Blast" : "CRM"}
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      </div>

      {/* 2. Controls & Privacy Toggle */}
      <Card className="border-border bg-card">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {isAr ? "الشريحة المستهدفة:" : "Customer Segment:"}
                </Label>
                <select
                  value={segmentFilter}
                  onChange={(e) => setSegmentFilter(e.target.value)}
                  className="h-9 px-3 text-xs rounded-lg border border-border bg-background focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="all">{isAr ? "جميع جهات الاتصال" : "All Customers"}</option>
                  <option value="vip_only">
                    {isAr ? "عملاء VIP والأكثر شراءً فقط" : "VIP Spenders Only"}
                  </option>
                  <option value="with_orders">
                    {isAr ? "من لديهم طلبات سابقة" : "With Order History"}
                  </option>
                  <option value="with_phone">
                    {isAr ? "من لديهم رقم هاتف متاح" : "With Valid Phone"}
                  </option>
                </select>
              </div>

              {/* Privacy Masking Checkbox */}
              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="mask-privacy"
                  checked={maskPrivacy}
                  onChange={(e) => setMaskPrivacy(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <label
                  htmlFor="mask-privacy"
                  className="text-xs font-semibold cursor-pointer text-foreground"
                >
                  {isAr
                    ? "تفعيل درع الخصوصية (إخفاء الأرقام والبريد)"
                    : "Privacy Shield (Mask phone & email)"}
                </label>
              </div>
            </div>

            {/* Format Selector */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
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
          </div>
        </CardContent>
      </Card>

      {/* 3. Live Preview & Action Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-bold text-foreground">
              {isAr
                ? "معاينة العملاء المستهدفين (أول 5 صفوف)"
                : "Target Customers Preview (First 5 Rows)"}
            </span>
            <Badge variant="secondary" className="text-xs font-semibold">
              {rows.length} {isAr ? "عميل محدد" : "contacts"}
            </Badge>
          </div>

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
            {isExporting
              ? isAr
                ? "جاري التصدير..."
                : "Exporting..."
              : isAr
                ? `تصدير قائمة العملاء (${rows.length})`
                : `Export Customers (${rows.length})`}
          </Button>
        </div>

        {/* Table */}
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
                      {isAr
                        ? "لا توجد جهات اتصال مطابقة للشريحة"
                        : "No contacts match current segment"}
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
