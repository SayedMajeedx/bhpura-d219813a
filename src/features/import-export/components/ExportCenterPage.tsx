import { Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { categoriesQueries } from "@/lib/data/categories";
import { ordersQueries } from "@/lib/data/orders";
import { customersQueries } from "@/lib/data/customers";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  Package,
  Users,
  ReceiptText,
  Clock,
  Sparkles,
  Upload,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { exportToJson, logExportRun } from "@/lib/universal-exporter";
import { importExportQueries } from "@/lib/data/import-export";
import { catalogQueries } from "@/lib/data/catalog";
import { expensesQueries } from "@/lib/data/expenses";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { ProductExportSection } from "@/features/import-export/components/ProductExportSection";
import { CustomerExportSection } from "@/features/import-export/components/CustomerExportSection";
import { OrderExportSection } from "@/features/import-export/components/OrderExportSection";
import { ExpenseExportSection } from "@/features/import-export/components/ExpenseExportSection";
import { ExportHistorySection } from "@/features/import-export/components/ExportHistorySection";
import { countOf } from "@/lib/arabic-count";

export function ExportCenterPage() {
  const brand = useBrand();
  const brandId = brand.id;
  const brandSlug = brand.slug;
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brandName = (isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug;
  const currency = useStoreCurrency(brandId);

  const [activeTab, setActiveTab] = useState<string>("products");

  const { data: products = [] } = useQuery(catalogQueries.productExportRows(brandId));

  const { data: customers = [] } = useQuery(customersQueries.exportRows(brandId));

  const { data: orders = [] } = useQuery(ordersQueries.exportRows(brandId));

  const { data: expenses = [] } = useQuery(expensesQueries.exportRows(brandId));

  const { data: categories = [] } = useQuery(categoriesQueries.exportRows(brandId));

  const { data: exportHistory = [], refetch: refetchHistory } = useQuery(
    importExportQueries.exportRuns(brandId),
  );

  // Calculate high-level stats
  const totalVariants = useMemo(
    () => products.reduce((acc, p: any) => acc + (p.product_variants?.length || 1), 0),
    [products],
  );
  const totalRevenue = useMemo(
    () => orders.reduce((acc, o: any) => acc + (Number(o.total) || 0), 0),
    [orders],
  );

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

        <div className="flex flex-wrap items-center gap-2 shrink-0">
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
                  ({countOf(totalVariants, "option", isAr ? "ar" : "en")})
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
            products={products}
            categories={categories}
            isAr={isAr}
            onExportSuccess={refetchHistory}
          />
        </TabsContent>

        {/* Tab 2: Customers Exporter */}
        <TabsContent value="customers" className="space-y-4 focus-visible:outline-none">
          <CustomerExportSection
            brandId={brandId}
            brandSlug={brandSlug}
            customers={customers}
            orders={orders}
            isAr={isAr}
            onExportSuccess={refetchHistory}
          />
        </TabsContent>

        {/* Tab 3: Orders Exporter */}
        <TabsContent value="orders" className="space-y-4 focus-visible:outline-none">
          <OrderExportSection
            brandId={brandId}
            brandSlug={brandSlug}
            orders={orders}
            customers={customers}
            isAr={isAr}
            onExportSuccess={refetchHistory}
          />
        </TabsContent>

        {/* Tab 4: Expenses Exporter */}
        <TabsContent value="expenses" className="space-y-4 focus-visible:outline-none">
          <ExpenseExportSection
            brandId={brandId}
            brandSlug={brandSlug}
            expenses={expenses}
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
