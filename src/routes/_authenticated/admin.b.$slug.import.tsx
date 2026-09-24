import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  Package,
  Users,
  ReceiptText,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Check,
  RefreshCw,
  Instagram,
} from "lucide-react";
import { toast } from "sonner";
import { parseCSV } from "@/lib/csv-parser";
import { sanitizeGCCPhone } from "@/lib/os-formatting";
import { importProductCatalog } from "@/lib/universal-importer";
import { importCustomerDatabase } from "@/lib/customer-importer";
import { importHistoricalOrders } from "@/lib/order-importer";
import { InstagramImporterModal } from "@/components/inventory/InstagramImporterModal";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/import")({
  component: ImportCenterPage,
});

type ImportType = "products" | "customers" | "orders";

interface ImportRunRecord {
  id: string;
  brand_id: string;
  session_id: string;
  source: string;
  entity_type: string;
  status: "pending" | "processing" | "completed" | "failed" | "partial";
  total_count: number;
  success_count: number;
  skipped_count: number;
  failed_count: number;
  created_at: string;
}

const SAMPLE_CSV_TEMPLATES: Record<ImportType, { filename: string; content: string }> = {
  products: {
    filename: "boutq_products_template.csv",
    content: `name_ar,name_en,price,cost_price,sku,stock,category,description_ar,description_en,image_url
قميص قطني مطرز,Embroidered Cotton Shirt,45.000,20.000,SKU-SHT-01,15,ملابس,قميص فاخر من القطن الطبيعي مع تطريز يدوي,Luxury natural cotton shirt with handcrafted embroidery,https://images.unsplash.com/photo-1584917865442-de89df76afd3
فستان سهرة دانتيل,Lace Evening Dress,65.000,30.000,SKU-DRS-02,8,فساتين,فستان أنيق مناسب لجميع المناسبات,Elegant lace dress perfect for special occasions,https://images.unsplash.com/photo-1595777457583-95e059d581b8`,
  },
  customers: {
    filename: "boutq_customers_template.csv",
    content: `name,phone,email,notes
سارة العبدالله,97339000001,sara@example.com,عميلة مميزة VIP
فاطمة المحمود,97339000002,fatima@example.com,تفضل التواصل عبر الواتساب
نورة الدوسري,966500000001,noura@example.com,طلب مسبق لمجموعة العيد`,
  },
  orders: {
    filename: "boutq_orders_template.csv",
    content: `order_number,created_at,customer_name,customer_phone,customer_email,total,item_name,quantity,price
ORD-1001,2026-02-15T12:00:00Z,سارة العبدالله,97339000001,sara@example.com,45.000,قميص قطني مطرز,1,45.000
ORD-1002,2026-02-16T14:30:00Z,فاطمة المحمود,97339000002,fatima@example.com,65.000,فستان سهرة دانتيل,1,65.000`,
  },
};

function downloadTemplate(type: ImportType) {
  const { filename, content } = SAMPLE_CSV_TEMPLATES[type];
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ImportCenterPage() {
  const brand = useBrand();
  const brandId = brand.id;
  const brandSlug = brand.slug;
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<string>("products");
  const [isInstagramModalOpen, setIsInstagramModalOpen] = useState(false);

  // Live Import Runs Query
  const {
    data: importRuns = [],
    isLoading: runsLoading,
    refetch: refetchRuns,
  } = useQuery<ImportRunRecord[]>({
    queryKey: ["import-runs-hub", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_runs")
        .select(
          "id,brand_id,session_id,source,entity_type,status,total_count,success_count,skipped_count,failed_count,created_at",
        )
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) return [];
      return (data || []) as ImportRunRecord[];
    },
  });

  // Calculate high-level summary metrics
  const totalImportedEntities = useMemo(() => {
    return importRuns.reduce((acc, run) => acc + (run.success_count || 0), 0);
  }, [importRuns]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6" dir={isAr ? "rtl" : "ltr"}>
      {/* Header & Command Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-foreground">
                {isAr ? "مركز الاستيراد والترحيل الشامل" : "Universal Migration & Import Center"}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {isAr
                  ? "انقل بيانات متجرك من أي منصة أخرى (Shopify، سلة، زد، WooCommerce) بدقة وأمان كامل"
                  : "Effortlessly migrate products, customer contacts, and legacy orders into Boutq OS"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link to="/admin/b/$slug/export" params={{ slug: brandSlug }}>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-semibold">
              <Download className="h-3.5 w-3.5" />
              {isAr ? "مركز التصدير والنسخ" : "Export & Backup"}
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetchRuns()}
            className="h-9 gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {isAr ? "تحديث السجل" : "Refresh Log"}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setIsInstagramModalOpen(true)}
            className="h-9 gap-1.5 text-xs font-semibold shadow-sm"
          >
            <Instagram className="h-4 w-4" />
            {isAr ? "استيراد إنستغرام بالذكاء الاصطناعي" : "Instagram AI Import"}
          </Button>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {isAr ? "إجمالي السجلات المستوردة" : "Total Imported Records"}
              </p>
              <p className="text-2xl font-bold text-foreground tracking-tight">
                {totalImportedEntities.toLocaleString()}
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {isAr ? "عمليات الترحيل المنفذة" : "Migration Runs Executed"}
              </p>
              <p className="text-2xl font-bold text-foreground tracking-tight">
                {importRuns.length}
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {isAr ? "حالة المحرك" : "Engine Status"}
              </p>
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-bold text-foreground">
                  {isAr ? "جاهز لاستقبال الملفات" : "Ready & Active"}
                </span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs Workspace */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex w-full items-center gap-1.5 overflow-x-auto no-scrollbar h-auto p-1 bg-muted/60 border border-border rounded-xl overscroll-contain sm:grid sm:grid-cols-4 sm:h-11">
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
            <span>{isAr ? "الطلبات السابقة" : "Past Orders"}</span>
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="shrink-0 whitespace-nowrap min-h-[38px] px-3 text-xs font-semibold gap-1.5 sm:shrink sm:min-w-0 sm:flex-1"
          >
            <Clock className="h-4 w-4 shrink-0" />
            <span>{isAr ? "سجل الترحيل" : "Audit History"}</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Products Importer */}
        <TabsContent value="products" className="space-y-4 focus-visible:outline-none">
          <ProductImportSection
            brandId={brandId}
            isAr={isAr}
            onComplete={() => {
              void refetchRuns();
              void qc.invalidateQueries({ queryKey: ["inventory", brandId] });
            }}
          />
        </TabsContent>

        {/* Tab 2: Customers Importer */}
        <TabsContent value="customers" className="space-y-4 focus-visible:outline-none">
          <CustomerImportSection
            brandId={brandId}
            isAr={isAr}
            onComplete={() => {
              void refetchRuns();
              void qc.invalidateQueries({ queryKey: ["customers", brandId] });
            }}
          />
        </TabsContent>

        {/* Tab 3: Orders Importer */}
        <TabsContent value="orders" className="space-y-4 focus-visible:outline-none">
          <OrderImportSection
            brandId={brandId}
            isAr={isAr}
            onComplete={() => {
              void refetchRuns();
              void qc.invalidateQueries({ queryKey: ["orders", brandId] });
            }}
          />
        </TabsContent>

        {/* Tab 4: History & Audit Log */}
        <TabsContent value="history" className="space-y-4 focus-visible:outline-none">
          <ImportHistorySection importRuns={importRuns} isLoading={runsLoading} isAr={isAr} />
        </TabsContent>
      </Tabs>

      {/* Instagram AI Importer Modal */}
      <InstagramImporterModal
        brandId={brandId}
        open={isInstagramModalOpen}
        onOpenChange={setIsInstagramModalOpen}
        onComplete={() => {
          void refetchRuns();
          void qc.invalidateQueries({ queryKey: ["inventory", brandId] });
        }}
      />
    </div>
  );
}

// -------------------------------------------------------------
// Component: Product Import Section
// -------------------------------------------------------------
function ProductImportSection({
  brandId,
  isAr,
  onComplete,
}: {
  brandId: string;
  isAr: boolean;
  onComplete: () => void;
}) {
  const [selectedPreset, setSelectedPreset] = useState<
    "shopify" | "salla" | "zid" | "woocommerce" | "custom"
  >("shopify");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, number>>({
    name: -1,
    price: -1,
    image: -1,
    stock: -1,
    sku: -1,
  });
  const [step, setStep] = useState<"upload" | "map" | "success">("upload");
  const [lastCount, setLastCount] = useState(0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast.error(
          isAr
            ? "الملف فارغ أو لا يحتوي على صفوف بيانات صالحة"
            : "CSV file is empty or missing data rows",
        );
        return;
      }

      const fileHeaders = rows[0].map((h) => h.trim());
      setHeaders(fileHeaders);
      setParsedRows(rows.slice(1));

      // Auto-detect columns
      const newMap: Record<string, number> = { name: -1, price: -1, image: -1, stock: -1, sku: -1 };
      fileHeaders.forEach((h, idx) => {
        const lower = h.toLowerCase();
        if (
          lower.includes("name") ||
          lower.includes("title") ||
          lower.includes("اسم") ||
          lower.includes("عنوان")
        ) {
          if (newMap.name === -1) newMap.name = idx;
        } else if (lower.includes("price") || lower.includes("سعر") || lower.includes("السعر")) {
          if (newMap.price === -1) newMap.price = idx;
        } else if (lower.includes("image") || lower.includes("صورة") || lower.includes("صور")) {
          if (newMap.image === -1) newMap.image = idx;
        } else if (
          lower.includes("stock") ||
          lower.includes("qty") ||
          lower.includes("quantity") ||
          lower.includes("كمية") ||
          lower.includes("مخزون")
        ) {
          if (newMap.stock === -1) newMap.stock = idx;
        } else if (lower.includes("sku") || lower.includes("رمز")) {
          if (newMap.sku === -1) newMap.sku = idx;
        }
      });

      setMappings(newMap);
      setStep("map");
    };
    reader.readAsText(file);
  };

  const executeImport = async () => {
    if (mappings.name === -1) {
      toast.error(isAr ? "يجب ربط حقل اسم المنتج على الأقل" : "Please map product name");
      return;
    }

    setIsProcessing(true);
    setProgressMsg(isAr ? "جاري تجهيز المنتجات للترحيل..." : "Preparing products for migration...");

    try {
      const sessionId = crypto.randomUUID();
      const rawProducts = parsedRows.map((row, index) => {
        const nameVal = mappings.name !== -1 ? row[mappings.name]?.trim() : `Product ${index + 1}`;
        const priceVal =
          mappings.price !== -1
            ? parseFloat(row[mappings.price]?.replace(/[^\d.]/g, "") || "10") || 10
            : 10;
        const imageVal = mappings.image !== -1 ? row[mappings.image]?.trim() || null : null;
        const stockVal =
          mappings.stock !== -1
            ? parseInt(row[mappings.stock]?.replace(/[^\d]/g, "") || "10") || 10
            : 10;
        const skuVal =
          mappings.sku !== -1 && row[mappings.sku]?.trim()
            ? row[mappings.sku].trim().toUpperCase()
            : `SKU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

        return {
          name: nameVal || `Product ${index + 1}`,
          name_ar: isAr ? nameVal : null,
          name_en: isAr ? null : nameVal,
          description: isAr ? "تم الاستيراد بنجاح" : "Imported product details",
          description_ar: isAr ? "تم الاستيراد بنجاح" : null,
          description_en: isAr ? null : "Imported product details",
          category: "General",
          image_url: imageVal,
          is_active: true,
          variants: [
            {
              size: null,
              size_unit: null,
              color: null,
              fabric: null,
              sku: skuVal,
              barcode: null,
              cost_price: 0,
              selling_price: priceVal,
              stock_main: stockVal,
              stock_incubator: 0,
            },
          ],
        };
      });

      const batchSize = 10;
      let inserted = 0;

      for (let i = 0; i < rawProducts.length; i += batchSize) {
        const chunk = rawProducts.slice(i, i + batchSize);
        setProgressMsg(
          isAr
            ? `جاري حفظ الدفعة (${i + 1} إلى ${Math.min(i + batchSize, rawProducts.length)})...`
            : `Inserting batch (${i + 1} - ${Math.min(i + batchSize, rawProducts.length)})...`,
        );

        const result = await importProductCatalog({
          data: {
            brandId,
            importSessionId: sessionId,
            batchIndex: Math.floor(i / batchSize),
            source: selectedPreset,
            products: chunk,
          },
        });
        inserted += result.successCount;
      }

      setLastCount(inserted);
      setStep("success");
      toast.success(
        isAr ? `تم استيراد ${inserted} منتج بنجاح!` : `Successfully imported ${inserted} products!`,
      );
      onComplete();
    } catch (err: any) {
      console.error(err);
      toast.error(isAr ? "فشل استيراد المنتجات" : "Product import failed");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              {isAr ? "ترحيل واستيراد كتالوج المنتجات" : "Product Catalog Migration"}
            </CardTitle>
            <CardDescription>
              {isAr
                ? "ارفع ملف CSV من متجرك السابق وسيتم استيراد المنتجات، الأسعار، والمخزون مباشرة"
                : "Upload a CSV export from your previous platform to populate inventory seamlessly"}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTemplate("products")}
            className="h-8 gap-1.5 text-xs self-start sm:self-center"
          >
            <Download className="h-3.5 w-3.5" />
            {isAr ? "تحميل نموذج CSV تجريبي" : "Download Sample CSV"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {step === "upload" && (
          <div className="space-y-5">
            {/* Platform Presets */}
            <div>
              <label className="text-xs font-bold text-foreground mb-2 block">
                {isAr ? "اختر المنصة المصدر للملف:" : "Select Source Platform:"}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {[
                  { id: "shopify", label: "Shopify" },
                  { id: "salla", label: isAr ? "سلة (Salla)" : "Salla" },
                  { id: "zid", label: isAr ? "زد (Zid)" : "Zid" },
                  { id: "woocommerce", label: "WooCommerce" },
                  { id: "custom", label: isAr ? "ملف مخصص" : "Custom CSV" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedPreset(item.id as any)}
                    className={`p-3 rounded-lg border text-center transition-all text-xs font-semibold ${
                      selectedPreset === item.id
                        ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                        : "border-border hover:border-border-strong text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dropzone */}
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-all bg-muted/20">
              <FileSpreadsheet className="h-10 w-10 mx-auto text-primary mb-3" />
              <h3 className="text-sm font-bold text-foreground mb-1">
                {isAr ? "ارفع ملف CSV للمنتجات" : "Upload Product CSV File"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                {isAr
                  ? "يدعم الملفات المصدرة من المنصات العالمية والعربية مع ترميز UTF-8"
                  : "Supports UTF-8 CSV exports from all regional & global platforms"}
              </p>
              <label className="inline-block">
                <span className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:bg-primary/90 cursor-pointer shadow-sm">
                  <Upload className="h-4 w-4 me-1.5" />
                  {isAr ? "اختيار ملف CSV" : "Choose CSV File"}
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h4 className="text-sm font-bold text-foreground">
                  {isAr ? "مطابقة الأعمدة والحقول" : "Field Mapping"}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? `تم اكتشاف ${parsedRows.length} صف من البيانات. راجع ربط الأعمدة:`
                    : `Detected ${parsedRows.length} rows. Verify column bindings:`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("upload")}
                className="text-xs"
              >
                {isAr ? "تغيير الملف" : "Change File"}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto p-1">
              {[
                { field: "name", label: isAr ? "اسم المنتج" : "Product Name" },
                { field: "price", label: isAr ? "سعر البيع" : "Selling Price" },
                { field: "stock", label: isAr ? "الكمية بالمخزون" : "Stock Quantity" },
                { field: "sku", label: isAr ? "رمز SKU" : "SKU" },
                { field: "image", label: isAr ? "رابط الصورة" : "Image URL" },
              ].map(({ field, label }) => (
                <div
                  key={field}
                  className="p-2.5 rounded-lg border border-border bg-muted/30 flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-medium text-foreground">{label}</span>
                  <select
                    value={mappings[field] ?? -1}
                    onChange={(e) =>
                      setMappings((prev) => ({ ...prev, [field]: Number(e.target.value) }))
                    }
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 max-w-[160px]"
                  >
                    <option value={-1}>{isAr ? "— تخطي الحقل —" : "— Skip —"}</option>
                    {headers.map((h, idx) => (
                      <option key={idx} value={idx}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {isProcessing && (
              <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-xs font-semibold text-primary">{progressMsg}</p>
                <Progress value={50} className="h-1.5" />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("upload")}
                disabled={isProcessing}
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={executeImport}
                disabled={isProcessing}
                className="gap-1.5 font-bold"
              >
                {isProcessing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {isAr ? "بدء استيراد الكتالوج" : "Start Importing"}
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="py-8 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {isAr ? "اكتمل استيراد المنتجات بنجاح!" : "Catalog Migration Completed!"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                {isAr
                  ? `تمت إضافة ${lastCount} منتج بنجاح إلى مخزونك. أصبحت جاهزة للتعديل والعرض في المتجر.`
                  : `Successfully added ${lastCount} products to your store inventory.`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setParsedRows([]);
                setHeaders([]);
                setStep("upload");
              }}
              className="text-xs font-semibold"
            >
              {isAr ? "استيراد ملف إضافي" : "Import Another File"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------
// Component: Customer Import Section
// -------------------------------------------------------------
function CustomerImportSection({
  brandId,
  isAr,
  onComplete,
}: {
  brandId: string;
  isAr: boolean;
  onComplete: () => void;
}) {
  const [selectedPreset, setSelectedPreset] = useState<
    "shopify" | "salla" | "zid" | "woocommerce" | "whatsapp" | "custom"
  >("shopify");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, number>>({
    name: -1,
    phone: -1,
    email: -1,
  });
  const [step, setStep] = useState<"upload" | "map" | "success">("upload");
  const [lastCount, setLastCount] = useState(0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast.error(isAr ? "الملف فارغ" : "File is empty");
        return;
      }

      const fileHeaders = rows[0].map((h) => h.trim());
      setHeaders(fileHeaders);
      setParsedRows(rows.slice(1));

      // Auto detect phone, name, email
      const newMap = { name: -1, phone: -1, email: -1 };
      fileHeaders.forEach((h, idx) => {
        const lower = h.toLowerCase();
        if (lower.includes("phone") || lower.includes("جوال") || lower.includes("هاتف")) {
          newMap.phone = idx;
        } else if (lower.includes("name") || lower.includes("اسم")) {
          newMap.name = idx;
        } else if (lower.includes("email") || lower.includes("بريد")) {
          newMap.email = idx;
        }
      });

      setMappings(newMap);
      setStep("map");
    };
    reader.readAsText(file);
  };

  const executeImport = async () => {
    if (mappings.name === -1 && mappings.phone === -1) {
      toast.error(isAr ? "يجب ربط حقل الاسم أو الجوال على الأقل" : "Please map name or phone");
      return;
    }

    setIsProcessing(true);

    try {
      const customersToInsert = parsedRows
        .map((row) => {
          const rawName = mappings.name !== -1 ? row[mappings.name]?.trim() : "";
          const rawPhone = mappings.phone !== -1 ? row[mappings.phone]?.trim() : "";
          const rawEmail = mappings.email !== -1 ? row[mappings.email]?.trim() : "";

          const sanitizedPhone = rawPhone ? sanitizeGCCPhone(rawPhone) : null;

          return {
            name: rawName || (sanitizedPhone ? `عميل ${sanitizedPhone}` : "عميل مسجّل"),
            phone: sanitizedPhone,
            email: rawEmail || null,
            notes: `Source: ${selectedPreset}`,
            totalOrders: 0,
            totalSpend: 0,
            tags: [selectedPreset],
          };
        })
        .filter((c) => c.name || c.phone || c.email);

      let insertedCount = 0;
      const batchSize = 50;

      for (let i = 0; i < customersToInsert.length; i += batchSize) {
        const batch = customersToInsert.slice(i, i + batchSize);
        const result = await importCustomerDatabase({
          data: {
            brandId,
            customers: batch,
          },
        });
        insertedCount += result.successCount;
      }

      setLastCount(insertedCount);
      setStep("success");
      toast.success(
        isAr
          ? `تم استيراد ${insertedCount} جهة اتصال بنجاح!`
          : `Successfully imported ${insertedCount} contacts!`,
      );
      onComplete();
    } catch (err: any) {
      console.error(err);
      toast.error(isAr ? "فشل استيراد العملاء" : "Failed to import customers");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {isAr ? "ترحيل واستيراد قاعدة العملاء" : "Customer CRM Migration"}
            </CardTitle>
            <CardDescription>
              {isAr
                ? "انقل بيانات عملائك وأرقام جوالاتهم مع تنقية الأرقام الخليجية تلقائياً لمنع التكرار"
                : "Migrate customer contacts with automatic GCC mobile sanitization and deduplication"}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTemplate("customers")}
            className="h-8 gap-1.5 text-xs self-start sm:self-center"
          >
            <Download className="h-3.5 w-3.5" />
            {isAr ? "تحميل نموذج CSV تجريبي" : "Download Sample CSV"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {step === "upload" && (
          <div className="space-y-5">
            <div>
              <label className="text-xs font-bold text-foreground mb-2 block">
                {isAr ? "اختر صيغة الملف المصدر:" : "Source Format:"}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                {[
                  { id: "shopify", label: "Shopify" },
                  { id: "salla", label: isAr ? "سلة" : "Salla" },
                  { id: "zid", label: isAr ? "زد" : "Zid" },
                  { id: "woocommerce", label: "WooCommerce" },
                  { id: "whatsapp", label: isAr ? "جهات واتساب" : "WhatsApp" },
                  { id: "custom", label: isAr ? "مخصص" : "Custom" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedPreset(item.id as any)}
                    className={`p-2.5 rounded-lg border text-center transition-all text-xs font-semibold ${
                      selectedPreset === item.id
                        ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                        : "border-border hover:border-border-strong text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-all bg-muted/20">
              <Users className="h-10 w-10 mx-auto text-primary mb-3" />
              <h3 className="text-sm font-bold text-foreground mb-1">
                {isAr ? "ارفع ملف CSV للعملاء" : "Upload Customer CSV File"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                {isAr
                  ? "يدعم أرقام الجوال الخليجية (البحرين، السعودية، الإمارات، الكويت، قطر، عمان)"
                  : "Supports GCC regional phone numbers with smart prefix cleaning"}
              </p>
              <label className="inline-block">
                <span className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:bg-primary/90 cursor-pointer shadow-sm">
                  <Upload className="h-4 w-4 me-1.5" />
                  {isAr ? "اختيار ملف العملاء" : "Choose Customer File"}
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-sm font-bold text-foreground">
                {isAr ? "مطابقة حقول العملاء" : "Customer Fields Mapping"}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("upload")}
                className="text-xs"
              >
                {isAr ? "تغيير الملف" : "Change File"}
              </Button>
            </div>

            <div className="space-y-2.5 max-w-md">
              {[
                { field: "name", label: isAr ? "اسم العميل" : "Customer Name" },
                { field: "phone", label: isAr ? "رقم الجوال" : "Mobile Phone" },
                { field: "email", label: isAr ? "البريد الإلكتروني" : "Email Address" },
              ].map(({ field, label }) => (
                <div
                  key={field}
                  className="p-3 rounded-lg border border-border bg-muted/30 flex items-center justify-between"
                >
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  <select
                    value={mappings[field] ?? -1}
                    onChange={(e) =>
                      setMappings((prev) => ({ ...prev, [field]: Number(e.target.value) }))
                    }
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-w-[150px]"
                  >
                    <option value={-1}>{isAr ? "— تخطي —" : "— Skip —"}</option>
                    {headers.map((h, idx) => (
                      <option key={idx} value={idx}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("upload")}
                disabled={isProcessing}
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={executeImport}
                disabled={isProcessing}
                className="gap-1.5 font-bold"
              >
                {isProcessing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {isAr ? "بدء استيراد العملاء" : "Import Customers"}
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="py-8 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {isAr ? "اكتمل استيراد العملاء بنجاح!" : "Customer Import Completed!"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                {isAr
                  ? `تم حفظ ${lastCount} عميل في قاعدة البيانات مع ربط جهات الاتصال.`
                  : `Successfully recorded ${lastCount} customer profiles.`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setParsedRows([]);
                setHeaders([]);
                setStep("upload");
              }}
              className="text-xs font-semibold"
            >
              {isAr ? "استيراد ملف إضافي" : "Import Another File"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------
// Component: Order Import Section
// -------------------------------------------------------------
function OrderImportSection({
  brandId,
  isAr,
  onComplete,
}: {
  brandId: string;
  isAr: boolean;
  onComplete: () => void;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, number>>({
    order_number: -1,
    order_date: -1,
    customer_name: -1,
    customer_phone: -1,
    total_price: -1,
    item_name: -1,
  });
  const [step, setStep] = useState<"upload" | "map" | "success">("upload");
  const [lastCount, setLastCount] = useState(0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast.error(isAr ? "الملف فارغ" : "File is empty");
        return;
      }

      const fileHeaders = rows[0].map((h) => h.trim());
      setHeaders(fileHeaders);
      setParsedRows(rows.slice(1));

      // Auto header detection
      const newMap: Record<string, number> = {
        order_number: -1,
        order_date: -1,
        customer_name: -1,
        customer_phone: -1,
        total_price: -1,
        item_name: -1,
      };

      fileHeaders.forEach((h, idx) => {
        const lower = h.toLowerCase();
        if (lower.includes("order") && lower.includes("number")) newMap.order_number = idx;
        else if (lower.includes("date") || lower.includes("تاريخ")) newMap.order_date = idx;
        else if (lower.includes("customer") || lower.includes("العميل")) newMap.customer_name = idx;
        else if (lower.includes("phone") || lower.includes("جوال") || lower.includes("هاتف"))
          newMap.customer_phone = idx;
        else if (lower.includes("total") || lower.includes("إجمالي")) newMap.total_price = idx;
        else if (lower.includes("item") || lower.includes("منتج")) newMap.item_name = idx;
      });

      setMappings(newMap);
      setStep("map");
    };
    reader.readAsText(file);
  };

  const executeImport = async () => {
    setIsProcessing(true);
    setProgressMsg(isAr ? "جاري تجميع الطلبات السابقة..." : "Bundling legacy orders...");

    try {
      const ordersMap = new Map<string, any>();

      parsedRows.forEach((row, i) => {
        const orderNum =
          mappings.order_number !== -1 ? row[mappings.order_number] : `LEGACY-${i + 1}`;
        const orderDate =
          mappings.order_date !== -1 && row[mappings.order_date]
            ? new Date(row[mappings.order_date]).toISOString()
            : new Date().toISOString();
        const custName = mappings.customer_name !== -1 ? row[mappings.customer_name] : null;
        const custPhone =
          mappings.customer_phone !== -1 ? sanitizeGCCPhone(row[mappings.customer_phone]) : null;
        const total =
          mappings.total_price !== -1
            ? parseFloat(row[mappings.total_price]?.replace(/[^\d.]/g, "") || "0") || 0
            : 0;
        const itemName = mappings.item_name !== -1 ? row[mappings.item_name] : "منتج سابق";

        if (!ordersMap.has(orderNum)) {
          ordersMap.set(orderNum, {
            externalOrderNumber: orderNum,
            createdAt: orderDate,
            customerName: custName,
            customerPhone: custPhone,
            total,
            status: "delivered",
            paymentStatus: "paid",
            source: "csv_import",
            items: [{ name: itemName, quantity: 1, price: total }],
          });
        }
      });

      const parsedOrders = Array.from(ordersMap.values());
      const batchSize = 25;
      let totalSuccess = 0;

      for (let i = 0; i < parsedOrders.length; i += batchSize) {
        const chunk = parsedOrders.slice(i, i + batchSize);
        setProgressMsg(
          isAr
            ? `جاري استيراد ${i} من أصل ${parsedOrders.length} طلب...`
            : `Importing ${i} / ${parsedOrders.length} orders...`,
        );

        const result = await importHistoricalOrders({
          data: {
            brandId,
            orders: chunk,
          },
        });
        totalSuccess += result.successCount;
      }

      setLastCount(totalSuccess);
      setStep("success");
      toast.success(
        isAr
          ? `تم استيراد ${totalSuccess} طلب بنجاح!`
          : `Successfully imported ${totalSuccess} orders!`,
      );
      onComplete();
    } catch (err: any) {
      console.error(err);
      toast.error(isAr ? "فشل استيراد الطلبات" : "Order importer failed");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-primary" />
              {isAr ? "استيراد وترحيل الطلبات السابقة" : "Historical Orders Migration"}
            </CardTitle>
            <CardDescription>
              {isAr
                ? "ارفع ملف الطلبات والمبيعات التاريخية لتهيئة تقارير المبيعات وحسابات العملاء"
                : "Import legacy sales and order records to establish full historical reporting"}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTemplate("orders")}
            className="h-8 gap-1.5 text-xs self-start sm:self-center"
          >
            <Download className="h-3.5 w-3.5" />
            {isAr ? "تحميل نموذج CSV تجريبي" : "Download Sample CSV"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {step === "upload" && (
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-all bg-muted/20">
            <ReceiptText className="h-10 w-10 mx-auto text-primary mb-3" />
            <h3 className="text-sm font-bold text-foreground mb-1">
              {isAr ? "ارفع ملف CSV للطلبات السابقة" : "Upload Orders CSV File"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
              {isAr
                ? "سيتم تجميع بنود الطلب الواحد تلقائياً وربط المبيعات بالعملاء"
                : "Line items with matching order numbers will be grouped automatically"}
            </p>
            <label className="inline-block">
              <span className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:bg-primary/90 cursor-pointer shadow-sm">
                <Upload className="h-4 w-4 me-1.5" />
                {isAr ? "اختيار ملف الطلبات" : "Choose Orders File"}
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-sm font-bold text-foreground">
                {isAr ? "مطابقة حقول الطلب" : "Order Field Mapping"}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("upload")}
                className="text-xs"
              >
                {isAr ? "تغيير الملف" : "Change File"}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1">
              {[
                { field: "order_number", label: isAr ? "رقم الطلب" : "Order Number" },
                { field: "order_date", label: isAr ? "تاريخ الطلب" : "Order Date" },
                { field: "customer_name", label: isAr ? "اسم العميل" : "Customer Name" },
                { field: "customer_phone", label: isAr ? "جوال العميل" : "Customer Phone" },
                { field: "total_price", label: isAr ? "إجمالي المبلغ" : "Total Amount" },
                { field: "item_name", label: isAr ? "اسم المنتج / البند" : "Line Item Name" },
              ].map(({ field, label }) => (
                <div
                  key={field}
                  className="p-2.5 rounded-lg border border-border bg-muted/30 flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  <select
                    value={mappings[field] ?? -1}
                    onChange={(e) =>
                      setMappings((prev) => ({ ...prev, [field]: Number(e.target.value) }))
                    }
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 max-w-[150px]"
                  >
                    <option value={-1}>{isAr ? "— تخطي —" : "— Skip —"}</option>
                    {headers.map((h, idx) => (
                      <option key={idx} value={idx}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {isProcessing && (
              <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-xs font-semibold text-primary">{progressMsg}</p>
                <Progress value={50} className="h-1.5" />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("upload")}
                disabled={isProcessing}
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={executeImport}
                disabled={isProcessing}
                className="gap-1.5 font-bold"
              >
                {isProcessing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {isAr ? "بدء استيراد الطلبات" : "Import Orders"}
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="py-8 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {isAr ? "اكتمل استيراد الطلبات بنجاح!" : "Orders Migration Completed!"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                {isAr
                  ? `تم توثيق ${lastCount} طلب في سجل مبيعات متجرك التاريخي.`
                  : `Successfully added ${lastCount} legacy orders to sales records.`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setParsedRows([]);
                setHeaders([]);
                setStep("upload");
              }}
              className="text-xs font-semibold"
            >
              {isAr ? "استيراد ملف إضافي" : "Import Another File"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------
// Component: History & Audit Log Section
// -------------------------------------------------------------
function ImportHistorySection({
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
