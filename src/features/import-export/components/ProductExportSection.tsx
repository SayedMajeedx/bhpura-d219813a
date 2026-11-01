import { useState, useMemo } from "react";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useLowStockLevel } from "@/hooks/use-low-stock-level";
import {
  productExportPresets,
  productListFilterLabel,
  productListFilterOptions,
} from "@/features/import-export/lib/store-columns";
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
  PRODUCT_PRESETS,
  ExportFormat,
} from "@/lib/universal-exporter";
import {
  exportStockStatus,
  matchesExportStockFilter,
} from "@/features/import-export/lib/export-stock-status";
import { arNounOblique } from "@/lib/arabic-count";
import { realSize } from "@/lib/default-variant";

// =============================================================
// Component 1: Product Export Section
// =============================================================
export function ProductExportSection({
  brandId,
  brandSlug,
  products,
  categories,
  isAr,
  onExportSuccess,
}: {
  brandId: string;
  brandSlug: string;
  products: any[];
  categories: any[];
  isAr: boolean;
  onExportSuccess: () => void;
}) {
  const stock = useAdminStoreProfile(brandId).profile.modules.stock;
  const lowStockUnits = useLowStockLevel(brandId);
  const [selectedPresetId, setSelectedPresetId] = useState("boutq_master");
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const preset = PRODUCT_PRESETS.find((p) => p.id === selectedPresetId) || PRODUCT_PRESETS[0];

  // Flatten products and variants based on filters
  const flattenedRows = useMemo(() => {
    const rows: Record<string, unknown>[] = [];

    products.forEach((p) => {
      // Category filter
      if (categoryFilter !== "all" && p.category !== categoryFilter) return;

      const variants =
        p.product_variants && p.product_variants.length > 0
          ? p.product_variants
          : [
              {
                id: p.id,
                size: null,
                color: null,
                fabric: null,
                sku: `SKU-${p.id.slice(0, 8).toUpperCase()}`,
                barcode: null,
                cost_price: 0,
                selling_price: 0,
                stock_main: 0,
                stock_incubator: 0,
              },
            ];

      variants.forEach((v: any) => {
        const totalStock = (v.stock_main || 0) + (v.stock_incubator || 0);

        // Stock filter
        const stockStatus = exportStockStatus(p, totalStock, lowStockUnits);
        if (!matchesExportStockFilter(stockFilter, stockStatus)) return;
        if (stockFilter === "active_only" && !p.is_active) return;
        if (stockFilter === "draft_only" && p.is_active) return;

        const handle = (p.name_en || p.name || `product-${p.id.slice(0, 8)}`)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, "");

        const statusLabel = p.is_active ? "active" : "draft";
        if (selectedPresetId === "shopify_compatible") {
          rows.push({
            handle,
            title: p.name_en || p.name || "",
            body_html: p.description_en || p.description || "",
            vendor: brandSlug,
            type: p.category || "General",
            tags: [p.category, p.is_active ? "active" : "draft"].filter(Boolean).join(", "),
            published: p.is_active ? "TRUE" : "FALSE",
            option1_name: v.size ? "Size" : "Title",
            option1_value: v.size || (v.color ? v.color : "Default Title"),
            option2_name: v.color ? "Color" : null,
            option2_value: v.color || null,
            variant_sku: v.sku || "",
            variant_grams: 500,
            variant_inventory_tracker: "shopify",
            variant_inventory_qty: totalStock,
            variant_price: Number(v.selling_price) || 0,
            variant_compare_at_price: null,
            variant_barcode: v.barcode || "",
            image_src: p.image_url || "",
            status: statusLabel,
          });
        } else if (selectedPresetId === "salla_zid") {
          rows.push({
            name: p.name_ar || p.name || "",
            category: p.category || "عام",
            selling_price: Number(v.selling_price) || 0,
            cost_price: Number(v.cost_price) || 0,
            sku: v.sku || "",
            barcode: v.barcode || "",
            total_stock: totalStock,
            size: v.size || "قياسي",
            color: v.color || "افتراضي",
            image_url: p.image_url || "",
            description: p.description_ar || p.description || "",
          });
        } else if (selectedPresetId === "inventory_valuation") {
          const unitCost = Number(v.cost_price) || 0;
          const unitRetail = Number(v.selling_price) || 0;
          rows.push({
            sku: v.sku || `SKU-${v.id?.slice(0, 6)}`,
            barcode: v.barcode || "—",
            name: isAr ? p.name_ar || p.name : p.name_en || p.name,
            variant_details: [realSize(v.size), v.color].filter(Boolean).join(" / ") || "—",
            category: p.category || "—",
            total_stock: totalStock,
            cost_price: unitCost,
            total_cost_value: unitCost * totalStock,
            selling_price: unitRetail,
            total_retail_value: unitRetail * totalStock,
            stock_status: stockStatus,
          });
        } else {
          // Boutq Master
          rows.push({
            id: p.id,
            name_ar: p.name_ar || p.name || "",
            name_en: p.name_en || p.name || "",
            category: p.category || "General",
            sku: v.sku || "",
            barcode: v.barcode || "",
            size: realSize(v.size) ?? "",
            color: v.color || "",
            fabric: v.fabric || "",
            selling_price: Number(v.selling_price) || 0,
            cost_price: Number(v.cost_price) || 0,
            stock_main: v.stock_main || 0,
            stock_incubator: v.stock_incubator || 0,
            total_stock: totalStock,
            status: p.is_active ? (isAr ? "نشط" : "Active") : isAr ? "معطل" : "Draft",
            image_url: p.image_url || "",
            description_ar: p.description_ar || p.description || "",
            description_en: p.description_en || p.description || "",
          });
        }
      });
    });

    return rows;
  }, [products, categoryFilter, stockFilter, selectedPresetId, isAr, brandSlug, lowStockUnits]);

  const handleExport = async () => {
    if (flattenedRows.length === 0) {
      toast.error(isAr ? "لا توجد منتجات مطابقة للتصدير" : "No matching products found to export");
      return;
    }

    setIsExporting(true);
    const toastId = toast.loading(
      isAr ? "جاري تجهيز وتنسيق الملف..." : "Generating export file...",
    );

    try {
      const fileName = `boutq_${brandSlug}_products_${selectedPresetId}_${new Date().toISOString().slice(0, 10)}.${format}`;
      const columns = preset.columns.map((c) => ({
        key: c.key,
        label: isAr ? c.headerAr : c.headerEn,
        format: c.format,
        width: c.width,
      }));

      if (format === "xlsx") {
        await exportToExcel(flattenedRows, columns, fileName, isAr ? "المنتجات" : "Products");
      } else {
        exportToCsv(flattenedRows, columns, fileName);
      }

      await logExportRun({
        brandId,
        preset: selectedPresetId,
        entityType: "products",
        fileFormat: format,
        recordCount: flattenedRows.length,
        fileName,
      });

      onExportSuccess();
      toast.success(
        isAr
          ? `تم تنزيل ${arNounOblique(flattenedRows.length, "record")} بنجاح!`
          : `Successfully exported ${flattenedRows.length} records!`,
        { id: toastId },
      );
    } catch (err: any) {
      console.error("Product export error:", err);
      toast.error(err.message || (isAr ? "فشل التصدير" : "Export failed"), { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Presets Selection Cards */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {isAr ? "1. اختر قالب وتنسيق التصدير" : "1. Choose Export Preset & Schema"}
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {productExportPresets(PRODUCT_PRESETS, stock).map((p) => {
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
                    {p.columns.length} {isAr ? "أعمدة" : "cols"}
                  </span>
                  <span className="font-semibold text-primary/80">
                    {p.id === "shopify_compatible" ? "Shopify Ready" : "Universal"}
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      </div>

      {/* 2. Filter & Format Controls */}
      <Card className="border-border bg-card">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 max-w-full space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {isAr ? "تصفية حسب القسم:" : "Filter by Category:"}
                </Label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="block h-9 max-w-full px-3 text-xs rounded-lg border border-border bg-background focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="all">{isAr ? "جميع الأقسام" : "All Categories"}</option>
                  {categories.map((c: any) => (
                    <option key={c.id} value={c.name}>
                      {isAr ? c.name_ar || c.name : c.name_en || c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {productListFilterLabel(stock, isAr)}
                </Label>
                <select
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value)}
                  className="h-9 px-3 text-xs rounded-lg border border-border bg-background focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="all">{isAr ? "كل المنتجات" : "All Products"}</option>
                  {productListFilterOptions(stock, lowStockUnits).map((o) => (
                    <option key={o.value} value={o.value}>
                      {isAr ? o.labelAr : o.labelEn}
                    </option>
                  ))}
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

      {/* 3. Live Preview & Download Bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-bold text-foreground">
              {isAr ? "معاينة مباشرة للبيانات (أول 5 صفوف)" : "Live Data Preview (First 5 Rows)"}
            </span>
            <Badge variant="secondary" className="text-xs font-semibold">
              {flattenedRows.length} {isAr ? "سجل جاهز" : "rows ready"}
            </Badge>
          </div>

          <Button
            onClick={handleExport}
            disabled={isExporting || flattenedRows.length === 0}
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
                ? `تصدير الكتالوج (${flattenedRows.length} صف)`
                : `Export Catalog (${flattenedRows.length} Rows)`}
          </Button>
        </div>

        {/* Preview Table */}
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-xs text-start">
              <thead className="bg-muted/60 text-muted-foreground font-semibold border-b border-border sticky top-0">
                <tr>
                  {preset.columns.slice(0, 8).map((c) => (
                    <th key={c.key} className="p-2.5 text-start font-medium whitespace-nowrap">
                      {isAr ? c.headerAr : c.headerEn}
                    </th>
                  ))}
                  {preset.columns.length > 8 && (
                    <th className="p-2.5 text-start font-medium text-muted-foreground">
                      +{preset.columns.length - 8} {isAr ? "حقول أخرى" : "more"}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {flattenedRows.slice(0, 5).map((row, idx) => (
                  <tr key={idx} className="hover:bg-muted/30">
                    {preset.columns.slice(0, 8).map((c) => (
                      <td
                        key={c.key}
                        className="p-2.5 whitespace-nowrap text-foreground font-mono text-xs"
                      >
                        {row[c.key] != null ? String(row[c.key]) : "—"}
                      </td>
                    ))}
                    {preset.columns.length > 8 && (
                      <td className="p-2.5 text-muted-foreground">...</td>
                    )}
                  </tr>
                ))}
                {flattenedRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      {isAr
                        ? "لا توجد بيانات مطابقة للفلاتر المحددة"
                        : "No records match current filters"}
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
