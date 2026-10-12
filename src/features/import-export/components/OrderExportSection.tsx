import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Download, CheckCircle2, FileSpreadsheet, FileText, RefreshCw, Eye } from "lucide-react";
import { toast } from "sonner";
import {
  exportToCsv,
  exportToExcel,
  logExportRun,
  ORDER_PRESETS,
  ExportFormat,
} from "@/lib/universal-exporter";

// =============================================================
// Component 3: Orders Export Section
// =============================================================
export function OrderExportSection({
  brandId,
  brandSlug,
  orders,
  customers,
  isAr,
  onExportSuccess,
}: {
  brandId: string;
  brandSlug: string;
  orders: any[];
  customers: any[];
  isAr: boolean;
  onExportSuccess: () => void;
}) {
  const [selectedPresetId, setSelectedPresetId] = useState("orders_summary");
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [dateRange, setDateRange] = useState<"all" | "today" | "7d" | "30d" | "this_month">("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [isExporting, setIsExporting] = useState(false);

  const preset = ORDER_PRESETS.find((p) => p.id === selectedPresetId) || ORDER_PRESETS[0];

  const customerMap = useMemo(() => {
    const map = new Map<string, any>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  // Date Filtering calculation
  const filteredOrders = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return orders.filter((o: any) => {
      // Payment status filter
      if (paymentStatusFilter !== "all" && o.payment_status !== paymentStatusFilter) return false;

      // Date range filter
      if (dateRange === "all") return true;
      const orderDate = new Date(o.order_date || o.created_at || "");
      if (dateRange === "today") return (o.order_date || "").startsWith(todayStr);
      if (dateRange === "7d") return orderDate >= sevenDaysAgo;
      if (dateRange === "30d") return orderDate >= thirtyDaysAgo;
      if (dateRange === "this_month") return orderDate >= firstDayOfMonth;
      return true;
    });
  }, [orders, dateRange, paymentStatusFilter]);

  // Row transformer based on preset
  const rows = useMemo(() => {
    const out: Record<string, unknown>[] = [];

    filteredOrders.forEach((o: any) => {
      const cust = o.customer_id ? customerMap.get(o.customer_id) : null;
      const custName = cust?.name || "Walk-in Guest";
      const custPhone = cust?.phone || "—";
      const invoiceNo = o.invoice_number ? `INV-${o.invoice_number}` : `ORD-${o.id.slice(0, 8)}`;
      const orderDateStr = (o.order_date || o.created_at || "").slice(0, 10);
      const items = Array.isArray(o.order_items) ? o.order_items : [];

      if (selectedPresetId === "orders_line_items") {
        if (items.length === 0) {
          out.push({
            invoice_number: invoiceNo,
            order_date: orderDateStr,
            customer_name: custName,
            product_name: "General Order Item",
            sku: "—",
            quantity: 1,
            unit_price: Number(o.total) || 0,
            item_total: Number(o.total) || 0,
            payment_status: o.payment_status || "paid",
            order_status: o.status || "completed",
          });
        } else {
          items.forEach((it: any) => {
            const qty = Number(it.quantity) || 1;
            const price = Number(it.unit_price ?? it.price) || 0;
            out.push({
              invoice_number: invoiceNo,
              order_date: orderDateStr,
              customer_name: custName,
              product_name: it.description || it.name || "Product",
              sku: it.sku || "—",
              quantity: qty,
              unit_price: price,
              item_total:
                it.line_total != null
                  ? Number(it.line_total)
                  : it.total != null
                    ? Number(it.total)
                    : price * qty,
              payment_status: o.payment_status || "paid",
              order_status: o.status || "completed",
            });
          });
        }
      } else if (selectedPresetId === "accounting_ledger") {
        const totalPaid = Number(o.total) || 0;
        const shipping = Number(o.shipping ?? o.delivery_fee) || 0;
        const vat = Number(o.tax_amount) || 0;
        const discount = Number(o.discount ?? o.discount_amount) || 0;
        const taxable = totalPaid - shipping;
        const gross = taxable + discount;

        out.push({
          invoice_number: invoiceNo,
          order_date: orderDateStr,
          customer_name: custName,
          gross_sales: gross,
          discounts: discount,
          net_merchandise: taxable,
          shipping_collected: shipping,
          taxable_amount: taxable,
          vat_collected: vat,
          total_collected: totalPaid,
          payment_method: o.payment_method || "Online",
          payment_status: o.payment_status || "paid",
        });
      } else {
        // Orders Summary
        out.push({
          invoice_number: invoiceNo,
          order_date: orderDateStr,
          customer_name: custName,
          customer_phone: custPhone,
          items_count: items.reduce(
            (acc: number, it: any) => acc + (Number(it.quantity) || 1),
            items.length || 1,
          ),
          subtotal: Number(o.subtotal) || Number(o.total) || 0,
          discount_amount: Number(o.discount ?? o.discount_amount) || 0,
          delivery_fee: Number(o.shipping ?? o.delivery_fee) || 0,
          tax_amount: Number(o.tax_amount) || 0,
          total: Number(o.total) || 0,
          payment_method: o.payment_method || "BenefitPay / Card",
          payment_status: o.payment_status || "paid",
          status: o.status || "processing",
          channel: o.channel || "online",
        });
      }
    });

    return out;
  }, [filteredOrders, customerMap, selectedPresetId]);

  const handleExport = async () => {
    if (rows.length === 0) {
      toast.error(isAr ? "لا توجد طلبات مطابقة للفترة المحددة" : "No orders match selected period");
      return;
    }

    setIsExporting(true);
    const toastId = toast.loading(
      isAr ? "جاري تنسيق تقرير الطلبات..." : "Generating orders report...",
    );

    try {
      const fileName = `boutq_${brandSlug}_orders_${selectedPresetId}_${new Date().toISOString().slice(0, 10)}.${format}`;
      const columns = preset.columns.map((c) => ({
        key: c.key,
        label: isAr ? c.headerAr : c.headerEn,
        format: c.format,
        width: c.width,
      }));

      if (format === "xlsx") {
        await exportToExcel(rows, columns, fileName, isAr ? "الطلبات" : "Orders");
      } else {
        exportToCsv(rows, columns, fileName);
      }

      await logExportRun({
        brandId,
        preset: selectedPresetId,
        entityType: "orders",
        fileFormat: format,
        recordCount: rows.length,
        fileName,
      });

      onExportSuccess();
      toast.success(
        isAr
          ? `تم تصدير ${rows.length} صف من سجل المبيعات!`
          : `Successfully exported ${rows.length} sales rows!`,
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
          {isAr ? "1. نمط تقرير الطلبات" : "1. Select Orders Report Preset"}
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ORDER_PRESETS.map((p) => {
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
                    {p.columns.length} {isAr ? "حقول" : "columns"}
                  </span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {p.id === "accounting_ledger" ? "Audit / Tax Ready" : "Sales Ledger"}
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      </div>

      {/* 2. Date Range & Payment Filter */}
      <Card className="border-border bg-card">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {isAr ? "الفترة الزمنية:" : "Date Range:"}
                </Label>
                <div className="flex items-center gap-1.5">
                  {[
                    { id: "all", labelAr: "الكل", labelEn: "All" },
                    { id: "today", labelAr: "اليوم", labelEn: "Today" },
                    { id: "7d", labelAr: "7 أيام", labelEn: "7 Days" },
                    { id: "30d", labelAr: "30 يوم", labelEn: "30 Days" },
                    { id: "this_month", labelAr: "هذا الشهر", labelEn: "This Month" },
                  ].map((d) => (
                    <Button
                      key={d.id}
                      type="button"
                      onClick={() => setDateRange(d.id as any)}
                      variant="chip"
                      size="xs"
                      className={
                        dateRange === d.id
                          ? "border-primary bg-primary text-primary-foreground font-semibold hover:bg-primary hover:text-primary-foreground"
                          : "border-border bg-background"
                      }
                    >
                      {isAr ? d.labelAr : d.labelEn}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {isAr ? "حالة الدفع:" : "Payment Status:"}
                </Label>
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  className="h-9 px-3 text-xs rounded-lg border border-border bg-background focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="all">{isAr ? "جميع الحالات" : "All Statuses"}</option>
                  <option value="paid">{isAr ? "مدفوع فقط" : "Paid Only"}</option>
                  <option value="pending">{isAr ? "معلق / قيد الدفع" : "Pending"}</option>
                  <option value="refunded">{isAr ? "مسترجع" : "Refunded"}</option>
                </select>
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
              {isAr ? "معاينة الطلبات الجاهزة (أول 5 صفوف)" : "Orders Preview (First 5 Rows)"}
            </span>
            <Badge variant="secondary" className="text-xs font-semibold">
              {rows.length} {isAr ? "طلب / سطر" : "rows ready"}
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
                ? `تصدير ملف المبيعات (${rows.length})`
                : `Export Orders (${rows.length})`}
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
                        ? "لا توجد مبيعات مطابقة للفترة المحددة"
                        : "No orders found in this period"}
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
