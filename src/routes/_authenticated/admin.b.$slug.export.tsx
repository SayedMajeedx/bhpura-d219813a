import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Download,
  Package,
  Users,
  ReceiptText,
  Clock,
  Sparkles,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Upload,
  ShieldCheck,
  Eye,
  Wallet,
  Database,
} from "lucide-react";
import { toast } from "sonner";
import { sanitizeGCCPhone } from "@/lib/os-formatting";
import {
  exportToCsv,
  exportToExcel,
  exportToJson,
  logExportRun,
  PRODUCT_PRESETS,
  CUSTOMER_PRESETS,
  ORDER_PRESETS,
  EXPENSE_PRESETS,
  ExportFormat,
} from "@/lib/universal-exporter";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/export")({
  component: ExportCenterPage,
});

function ExportCenterPage() {
  const brand = useBrand();
  const brandId = brand.id;
  const brandSlug = brand.slug;
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brandName = (isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug;
  const currency = "BHD";

  const [activeTab, setActiveTab] = useState<string>("products");

  // -------------------------------------------------------------
  // Data Queries
  // -------------------------------------------------------------
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["export-products", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          `
          id, name, name_ar, name_en, description, description_ar, description_en,
          category, image_url, is_active, created_at,
          product_variants (
            id, size, size_unit, color, fabric, sku, barcode,
            cost_price, selling_price, stock_main, stock_incubator
          )
        `,
        )
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Failed to query products for export:", error);
        return [];
      }
      return data || [];
    },
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ["export-customers", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, notes, created_at")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Failed to query customers for export:", error);
        return [];
      }
      return data || [];
    },
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["export-orders", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          id, invoice_number, total, subtotal, shipping, discount, tax_amount,
          payment_method, payment_status, status, fulfillment_status, delivery_notes, created_at, customer_id,
          order_items (
            id, description, quantity, unit_price, unit_cost, line_total
          )
        `,
        )
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Failed to query orders for export:", error);
        return [];
      }
      return data || [];
    },
  });

  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ["export-expenses", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, date, category, title, amount, payment_method, notes, created_at")
        .eq("brand_id", brandId)
        .order("date", { ascending: false });
      if (error) {
        console.warn("Could not query expenses:", error.message);
        return [];
      }
      return data || [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["export-categories", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, name_ar, name_en")
        .eq("brand_id", brandId);
      if (error) return [];
      return data || [];
    },
  });

  const { data: exportHistory = [], refetch: refetchHistory } = useQuery({
    queryKey: ["export-runs-history", brandId],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase.from("export_runs" as never) as any)
          .select("id, preset, entity_type, file_format, record_count, file_name, created_at")
          .eq("brand_id", brandId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        if (data && data.length > 0) return data;
      } catch (e) {
        // Fall back to local storage
      }
      const local = localStorage.getItem(`boutq_export_runs_${brandId}`);
      return local ? JSON.parse(local) : [];
    },
  });

  // Calculate high-level stats
  const totalVariants = useMemo(() => {
    return products.reduce((acc, p: any) => acc + (p.product_variants?.length || 1), 0);
  }, [products]);

  const totalRevenue = useMemo(() => {
    return orders.reduce((acc, o: any) => acc + (Number(o.total) || 0), 0);
  }, [orders]);

  // Full Store Backup handler
  const handleFullStoreBackup = () => {
    const backupData = {
      backup_version: "2.0",
      created_at: new Date().toISOString(),
      store_slug: brandSlug,
      brand_name: brandName,
      currency: currency,
      stats: {
        products_count: products.length,
        variants_count: totalVariants,
        customers_count: customers.length,
        orders_count: orders.length,
        expenses_count: expenses.length,
      },
      catalog: products,
      categories,
      customers,
      orders,
      expenses,
    };

    const fileName = `boutq_${brandSlug}_full_backup_${new Date().toISOString().slice(0, 10)}.json`;
    exportToJson(backupData, fileName);
    void logExportRun({
      brandId,
      preset: "full_store_backup",
      entityType: "full_backup",
      fileFormat: "json",
      recordCount: products.length + customers.length + orders.length,
      fileName,
    });
    void refetchHistory();
    toast.success(
      isAr
        ? "تم تنزيل النسخة الاحتياطية الكاملة للمتجر بنجاح!"
        : "Full store backup downloaded successfully!",
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6" dir={isAr ? "rtl" : "ltr"}>
      {/* Header & Command Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-foreground">
                {isAr
                  ? "مركز التصدير والنسخ الاحتياطي الشامل"
                  : "Universal Export & Data Backup Center"}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {isAr
                  ? "تصدير بيانات متجرك بالكامل إلى ملفات إكسل منسقة وملفات CSV متوافقة مع مختلف المنصات والأنظمة المحاسبية"
                  : "Export your store data into high-fidelity Excel (.xlsx) and clean UTF-8 CSV with instant filters and multi-platform compatibility"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link to="/admin/b/$slug/import" params={{ slug: brandSlug }}>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-semibold">
              <Upload className="h-3.5 w-3.5" />
              {isAr ? "مركز الاستيراد" : "Import Center"}
            </Button>
          </Link>
          <Button
            variant="default"
            size="sm"
            onClick={handleFullStoreBackup}
            className="h-9 gap-1.5 text-xs font-semibold shadow-xs"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isAr ? "نسخة احتياطية كاملة (JSON)" : "Full Store Backup"}
          </Button>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {isAr ? "كتالوج المنتجات والخيارات" : "Products & Variants"}
              </p>
              <p className="text-2xl font-bold text-foreground tracking-tight">
                {products.length}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({totalVariants} {isAr ? "خيار" : "variants"})
                </span>
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Package className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {isAr ? "جهات اتصال العملاء (CRM)" : "Registered Customers"}
              </p>
              <p className="text-2xl font-bold text-foreground tracking-tight">
                {customers.length.toLocaleString()}
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {isAr ? "سجل المبيعات والطلبات" : "Orders Volume"}
              </p>
              <p className="text-2xl font-bold text-foreground tracking-tight">
                {orders.length.toLocaleString()}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({totalRevenue.toFixed(2)} {currency})
                </span>
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ReceiptText className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {isAr ? "محرك التصدير والأمان" : "Export Engine & Shield"}
              </p>
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-foreground">
                  {isAr ? "BOM نشط + درع الحقن" : "UTF-8 BOM & Shield"}
                </span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs Workspace */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex w-full items-center gap-1.5 overflow-x-auto no-scrollbar h-auto p-1 bg-muted/60 border border-border rounded-xl overscroll-contain sm:grid sm:grid-cols-5 sm:h-11">
          <TabsTrigger
            value="products"
            className="shrink-0 whitespace-nowrap min-h-[38px] px-3 text-xs font-semibold gap-1.5 sm:shrink sm:min-w-0 sm:flex-1"
          >
            <Package className="h-4 w-4 shrink-0" />
            <span>{isAr ? "المنتجات" : "Products"}</span>
          </TabsTrigger>
          <TabsTrigger
            value="customers"
            className="shrink-0 whitespace-nowrap min-h-[38px] px-3 text-xs font-semibold gap-1.5 sm:shrink sm:min-w-0 sm:flex-1"
          >
            <Users className="h-4 w-4 shrink-0" />
            <span>{isAr ? "العملاء" : "Customers"}</span>
          </TabsTrigger>
          <TabsTrigger
            value="orders"
            className="shrink-0 whitespace-nowrap min-h-[38px] px-3 text-xs font-semibold gap-1.5 sm:shrink sm:min-w-0 sm:flex-1"
          >
            <ReceiptText className="h-4 w-4 shrink-0" />
            <span>{isAr ? "الطلبات" : "Orders"}</span>
          </TabsTrigger>
          <TabsTrigger
            value="expenses"
            className="shrink-0 whitespace-nowrap min-h-[38px] px-3 text-xs font-semibold gap-1.5 sm:shrink sm:min-w-0 sm:flex-1"
          >
            <Wallet className="h-4 w-4 shrink-0" />
            <span>{isAr ? "المصروفات" : "Expenses"}</span>
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="shrink-0 whitespace-nowrap min-h-[38px] px-3 text-xs font-semibold gap-1.5 sm:shrink sm:min-w-0 sm:flex-1"
          >
            <Clock className="h-4 w-4 shrink-0" />
            <span>{isAr ? "سجل التصدير" : "Audit History"}</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Products Exporter */}
        <TabsContent value="products" className="space-y-4 focus-visible:outline-none">
          <ProductExportSection
            brandId={brandId}
            brandSlug={brandSlug}
            currency={currency}
            products={products}
            categories={categories}
            isLoading={productsLoading}
            isAr={isAr}
            onExportSuccess={refetchHistory}
          />
        </TabsContent>

        {/* Tab 2: Customers Exporter */}
        <TabsContent value="customers" className="space-y-4 focus-visible:outline-none">
          <CustomerExportSection
            brandId={brandId}
            brandSlug={brandSlug}
            currency={currency}
            customers={customers}
            orders={orders}
            isLoading={customersLoading}
            isAr={isAr}
            onExportSuccess={refetchHistory}
          />
        </TabsContent>

        {/* Tab 3: Orders Exporter */}
        <TabsContent value="orders" className="space-y-4 focus-visible:outline-none">
          <OrderExportSection
            brandId={brandId}
            brandSlug={brandSlug}
            currency={currency}
            orders={orders}
            customers={customers}
            isLoading={ordersLoading}
            isAr={isAr}
            onExportSuccess={refetchHistory}
          />
        </TabsContent>

        {/* Tab 4: Expenses Exporter */}
        <TabsContent value="expenses" className="space-y-4 focus-visible:outline-none">
          <ExpenseExportSection
            brandId={brandId}
            brandSlug={brandSlug}
            currency={currency}
            expenses={expenses}
            isLoading={expensesLoading}
            isAr={isAr}
            onExportSuccess={refetchHistory}
          />
        </TabsContent>

        {/* Tab 5: History & Backup */}
        <TabsContent value="history" className="space-y-4 focus-visible:outline-none">
          <ExportHistorySection
            history={exportHistory}
            onRefresh={refetchHistory}
            onBackup={handleFullStoreBackup}
            isAr={isAr}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================
// Component 1: Product Export Section
// =============================================================
function ProductExportSection({
  brandId,
  brandSlug,
  currency,
  products,
  categories,
  isLoading,
  isAr,
  onExportSuccess,
}: {
  brandId: string;
  brandSlug: string;
  currency: string;
  products: any[];
  categories: any[];
  isLoading: boolean;
  isAr: boolean;
  onExportSuccess: () => void;
}) {
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
        if (stockFilter === "in_stock" && totalStock <= 0) return;
        if (stockFilter === "low_stock" && (totalStock <= 0 || totalStock > 5)) return;
        if (stockFilter === "out_of_stock" && totalStock > 0) return;
        if (stockFilter === "active_only" && !p.is_active) return;
        if (stockFilter === "draft_only" && p.is_active) return;

        const handle = (p.name_en || p.name || `product-${p.id.slice(0, 8)}`)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, "");

        const statusLabel = p.is_active ? "active" : "draft";
        const stockStatus =
          totalStock <= 0 ? "Out of Stock" : totalStock <= 5 ? "Low Stock" : "In Stock";

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
            variant_details: [v.size, v.color].filter(Boolean).join(" / ") || "Standard",
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
            size: v.size || "",
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
  }, [products, categoryFilter, stockFilter, selectedPresetId, isAr, brandSlug]);

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
          ? `تم تنزيل ${flattenedRows.length} سجل بنجاح!`
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
          {PRODUCT_PRESETS.map((p) => {
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
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {isAr ? "تصفية حسب القسم:" : "Filter by Category:"}
                </Label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-9 px-3 text-xs rounded-lg border border-border bg-background focus-visible:ring-2 focus-visible:ring-primary"
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
                  {isAr ? "حالة المخزون:" : "Stock Health:"}
                </Label>
                <select
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value)}
                  className="h-9 px-3 text-xs rounded-lg border border-border bg-background focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="all">{isAr ? "كل المنتجات" : "All Products"}</option>
                  <option value="in_stock">{isAr ? "المتوفر بالمخزن فقط" : "In Stock Only"}</option>
                  <option value="low_stock">
                    {isAr ? "مخزون منخفض (≤ 5)" : "Low Stock (≤ 5)"}
                  </option>
                  <option value="out_of_stock">
                    {isAr ? "المنتجات النافذة فقط" : "Out of Stock"}
                  </option>
                  <option value="active_only">
                    {isAr ? "المنتجات النشطة فقط" : "Active Only"}
                  </option>
                  <option value="draft_only">{isAr ? "المسودات والمعطلة" : "Drafts Only"}</option>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
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

// =============================================================
// Component 2: Customer Export Section
// =============================================================
function CustomerExportSection({
  brandId,
  brandSlug,
  currency,
  customers,
  orders,
  isLoading,
  isAr,
  onExportSuccess,
}: {
  brandId: string;
  brandSlug: string;
  currency: string;
  customers: any[];
  orders: any[];
  isLoading: boolean;
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

// =============================================================
// Component 3: Orders Export Section
// =============================================================
function OrderExportSection({
  brandId,
  brandSlug,
  currency,
  orders,
  customers,
  isLoading,
  isAr,
  onExportSuccess,
}: {
  brandId: string;
  brandSlug: string;
  currency: string;
  orders: any[];
  customers: any[];
  isLoading: boolean;
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

// =============================================================
// Component 4: Expenses Export Section
// =============================================================
function ExpenseExportSection({
  brandId,
  brandSlug,
  currency,
  expenses,
  isLoading,
  isAr,
  onExportSuccess,
}: {
  brandId: string;
  brandSlug: string;
  currency: string;
  expenses: any[];
  isLoading: boolean;
  isAr: boolean;
  onExportSuccess: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [isExporting, setIsExporting] = useState(false);
  const preset = EXPENSE_PRESETS[0];

  const rows = useMemo(() => {
    return expenses.map((e) => ({
      date: (e.date || e.created_at || "").slice(0, 10),
      category: e.category || "General",
      title: e.title || "Expense",
      amount: Number(e.amount) || 0,
      payment_method: e.payment_method || "Bank Transfer",
      notes: e.notes || "—",
    }));
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
          ? `تم تصدير ${rows.length} بند مصروفات بنجاح!`
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

// =============================================================
// Component 5: Export History & Disaster Recovery Section
// =============================================================
function ExportHistorySection({
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
