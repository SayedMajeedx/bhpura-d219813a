import { Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateCustomers } from "@/lib/data/customers";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  Package,
  Users,
  ReceiptText,
  Clock,
  Sparkles,
  CheckCircle2,
  Download,
  RefreshCw,
  Instagram,
} from "lucide-react";
import { InstagramImporterModal } from "@/components/inventory/InstagramImporterModal";
import { importExportQueries } from "@/lib/data/import-export";
import { invalidateCatalog } from "@/lib/data/catalog";
import type { ImportRunRecord } from "@/features/import-export/lib/import-templates";
import { ProductImportSection } from "@/features/import-export/components/ProductImportSection";
import { CustomerImportSection } from "@/features/import-export/components/CustomerImportSection";
import { OrderImportSection } from "@/features/import-export/components/OrderImportSection";
import { ImportHistorySection } from "@/features/import-export/components/ImportHistorySection";

export function ImportCenterPage() {
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
  } = useQuery({
    ...importExportQueries.importRuns(brandId),
    select: (rows) => rows as ImportRunRecord[],
  });

  // New products must show in the inventory list (bug backlog #29).
  const onProductsImported = () => {
    void refetchRuns();
    void invalidateCatalog(qc, brandId);
  };

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

        <div className="flex flex-wrap items-center gap-2 shrink-0">
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
          <ProductImportSection brandId={brandId} isAr={isAr} onComplete={onProductsImported} />
        </TabsContent>

        {/* Tab 2: Customers Importer */}
        <TabsContent value="customers" className="space-y-4 focus-visible:outline-none">
          <CustomerImportSection
            brandId={brandId}
            isAr={isAr}
            onComplete={() => {
              void refetchRuns();
              void invalidateCustomers(qc, brandId);
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
        onComplete={onProductsImported}
      />
    </div>
  );
}
