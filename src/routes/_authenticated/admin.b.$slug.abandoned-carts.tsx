import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShoppingCart, RefreshCw, Send, TrendingUp, Sparkles, ShieldAlert } from "lucide-react";
import { AbandonedCartsCommandHeader } from "@/components/abandoned-carts/AbandonedCartsCommandHeader";
import { AbandonedCartsList } from "@/components/abandoned-carts/AbandonedCartsList";
import { AbandonedCartSequencesEditor } from "@/components/abandoned-carts/AbandonedCartSequencesEditor";
import { AbandonedCartSettingsDialog } from "@/components/abandoned-carts/AbandonedCartSettingsDialog";
import { AbandonedCartLogsTable } from "@/components/abandoned-carts/AbandonedCartLogsTable";
import { abandonedCartsQueries } from "@/lib/data/abandoned-carts";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/abandoned-carts")({
  component: AbandonedCartsDashboardPage,
});

function AbandonedCartsDashboardPage() {
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const [activeTab, setActiveTab] = useState<string>("carts");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 1. Fetch settings
  const { data: settings } = useQuery(abandonedCartsQueries.settings(brand.id));

  // 2. Fetch sequences
  const { data: sequences = [] } = useQuery(abandonedCartsQueries.sequences(brand.id));

  // 3. Fetch abandoned carts
  const {
    data: carts = [],
    isLoading: loadingCarts,
    refetch: refetchCarts,
  } = useQuery({
    ...abandonedCartsQueries.carts(brand.id),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });

  // 4. Fetch dispatch logs
  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    ...abandonedCartsQueries.dispatchLogs(brand.id),
    refetchInterval: 30_000,
  });
  const abandonedCarts = carts.filter((c) => c.status === "abandoned" || c.status === "recovering");
  const recoveredCarts = carts.filter((c) => c.status === "recovered");

  const totalAbandonedValue = abandonedCarts.reduce(
    (acc: number, c: any) => acc + Number(c.subtotal || 0),
    0,
  );

  const recoveredRevenue = recoveredCarts.reduce(
    (acc: number, c: any) => acc + Number(c.subtotal || 0),
    0,
  );

  const totalActionableCarts = abandonedCarts.length + recoveredCarts.length;

  const targetableAbandonedCarts = abandonedCarts.filter((c: any) =>
    Boolean(c.guest_phone || c.guest_email || c.customers?.phone || c.customers?.email),
  );
  const unreachableCartsCount = abandonedCarts.length - targetableAbandonedCarts.length;

  const recoveryRate =
    totalActionableCarts > 0 ? Math.round((recoveredCarts.length / totalActionableCarts) * 100) : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <AbandonedCartsCommandHeader
        isEnabled={settings?.is_enabled ?? true}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "قيمة السلات المتروكة" : "Abandoned Cart Value"}
            </span>
            <div className="h-8 w-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-foreground">
              {totalAbandonedValue.toFixed(3)} BHD
            </span>
            <span className="text-xs text-muted-foreground block mt-1">
              {isAr ? "فرص بيع معلقة قابلة للاستعادة" : "Potential revenue at risk"}
            </span>
          </div>
        </Card>

        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "الإيرادات المستعادة" : "Recovered Revenue"}
            </span>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {recoveredRevenue.toFixed(3)} BHD
            </span>
            <span className="text-xs text-muted-foreground block mt-1">
              {isAr
                ? `${recoveredCarts.length} سلة تم تحويلها لطلبات`
                : `${recoveredCarts.length} carts recovered`}
            </span>
          </div>
        </Card>

        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "معدل الاستعادة" : "Recovery Rate"}
            </span>
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-primary">{recoveryRate}%</span>
            <span className="text-xs text-muted-foreground block mt-1">
              {isAr ? "نسبة نجاح حملات الاسترداد" : "Overall conversion efficiency"}
            </span>
          </div>
        </Card>

        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "السلات المستهدفة للتذكير" : "Targetable Outreach"}
            </span>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <ShoppingCart className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-foreground">
              {targetableAbandonedCarts.length}
            </span>
            <span className="text-xs text-muted-foreground block mt-1">
              {isAr
                ? `${targetableAbandonedCarts.length} برقم/بريد قابل للتواصل · ${unreachableCartsCount} بدون بيانات`
                : `${targetableAbandonedCarts.length} reachable · ${unreachableCartsCount} without contact info`}
            </span>
          </div>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex w-full items-center gap-1.5 overflow-x-auto no-scrollbar h-auto p-1 bg-muted/60 border border-border rounded-xl overscroll-contain sm:grid sm:grid-cols-3 sm:max-w-md">
          <TabsTrigger
            value="carts"
            className="shrink-0 whitespace-nowrap min-h-[38px] px-3 gap-2 text-xs font-semibold sm:shrink sm:min-w-0 sm:flex-1"
          >
            <ShoppingCart className="h-4 w-4" />
            <span>{isAr ? "السلات المتروكة" : "Abandoned Carts"}</span>
          </TabsTrigger>
          <TabsTrigger
            value="sequences"
            className="shrink-0 whitespace-nowrap min-h-[38px] px-3 gap-2 text-xs font-semibold sm:shrink sm:min-w-0 sm:flex-1"
          >
            <Send className="h-4 w-4" />
            <span>{isAr ? "سلاسل التذكير (Drip)" : "Drip Sequences"}</span>
          </TabsTrigger>
          <TabsTrigger
            value="logs"
            className="shrink-0 whitespace-nowrap min-h-[38px] px-3 gap-2 text-xs font-semibold sm:shrink sm:min-w-0 sm:flex-1"
          >
            <RefreshCw className="h-4 w-4" />
            <span>{isAr ? "سجل الإرسال (Logs)" : "Dispatch Logs"}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="carts" className="space-y-4">
          <AbandonedCartsList
            carts={carts}
            brandSlug={brand.slug}
            brandName={brand.name_ar || brand.name_en}
            brandId={brand.id}
            isLoading={loadingCarts}
            onRefresh={refetchCarts}
          />
        </TabsContent>

        <TabsContent value="sequences" className="space-y-4">
          <AbandonedCartSequencesEditor brandId={brand.id} sequences={sequences} />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <AbandonedCartLogsTable logs={logs} isLoading={loadingLogs} />
        </TabsContent>
      </Tabs>

      {/* Settings Modal */}
      <AbandonedCartSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        brandId={brand.id}
        initialSettings={settings}
      />
    </div>
  );
}
