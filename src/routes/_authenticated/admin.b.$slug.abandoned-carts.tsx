import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShoppingCart, RefreshCw, Send, CheckCircle2, TrendingUp, Sparkles, ShieldAlert } from "lucide-react";
import { AbandonedCartsCommandHeader } from "@/components/abandoned-carts/AbandonedCartsCommandHeader";
import { AbandonedCartsList } from "@/components/abandoned-carts/AbandonedCartsList";
import { AbandonedCartSequencesEditor } from "@/components/abandoned-carts/AbandonedCartSequencesEditor";
import { AbandonedCartSettingsDialog } from "@/components/abandoned-carts/AbandonedCartSettingsDialog";
import { AbandonedCartLogsTable } from "@/components/abandoned-carts/AbandonedCartLogsTable";
import type {
  BrandAbandonedCartSettings,
  AbandonedCartSequence,
  AbandonedCart,
} from "@/lib/abandoned-carts.types";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/abandoned-carts")({
  component: AbandonedCartsDashboardPage,
});

function AbandonedCartsDashboardPage() {
  const brand = useBrand();
  const { lang, t } = useI18n();
  const isAr = lang === "ar";

  const [activeTab, setActiveTab] = useState<string>("carts");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 1. Fetch settings
  const { data: settings } = useQuery<BrandAbandonedCartSettings | null>({
    queryKey: ["brand_abandoned_cart_settings", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("brand_abandoned_cart_settings")
        .select("*")
        .eq("brand_id", brand.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // 2. Fetch sequences
  const { data: sequences = [] } = useQuery<AbandonedCartSequence[]>({
    queryKey: ["abandoned_cart_sequences", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("abandoned_cart_sequences")
        .select("*")
        .eq("brand_id", brand.id)
        .order("step_number", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // 3. Fetch abandoned carts
  const {
    data: carts = [],
    isLoading: loadingCarts,
    refetch: refetchCarts,
  } = useQuery({
    queryKey: ["abandoned_carts_list", brand.id],
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("abandoned_carts")
        .select("*, customers(name, email, phone)")
        .eq("brand_id", brand.id)
        .order("last_activity_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  // 4. Fetch dispatch logs
  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["abandoned_cart_dispatch_logs", brand.id],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("abandoned_cart_dispatch_logs")
        .select("*")
        .eq("brand_id", brand.id)
        .order("sent_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate KPIs
  const activeCarts = carts.filter((c: any) => c.status === "active");
  const abandonedCarts = carts.filter((c: any) => c.status === "abandoned" || c.status === "recovering");
  const recoveredCarts = carts.filter((c: any) => c.status === "recovered");

  const totalAbandonedValue = abandonedCarts.reduce(
    (acc: number, c: any) => acc + Number(c.subtotal || 0),
    0,
  );

  const recoveredRevenue = recoveredCarts.reduce(
    (acc: number, c: any) => acc + Number(c.subtotal || 0),
    0,
  );

  const totalActionableCarts = abandonedCarts.length + recoveredCarts.length;

  const recoveryRate =
    totalActionableCarts > 0
      ? Math.round((recoveredCarts.length / totalActionableCarts) * 100)
      : 0;

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
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
              {isAr ? `${recoveredCarts.length} سلة تم تحويلها لطلبات` : `${recoveredCarts.length} carts recovered`}
            </span>
          </div>
        </Card>

        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? "السلات المستهدفة" : "Active & Abandoned"}
            </span>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <ShoppingCart className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-foreground">
              {abandonedCarts.length + activeCarts.length}
            </span>
            <span className="text-xs text-muted-foreground block mt-1">
              {isAr
                ? `${abandonedCarts.length} متروكة · ${activeCarts.length} نشطة حالياً`
                : `${abandonedCarts.length} abandoned · ${activeCarts.length} active`}
            </span>
          </div>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-3 max-w-md bg-muted/60 p-1">
          <TabsTrigger value="carts" className="gap-2 min-h-[38px]">
            <ShoppingCart className="h-4 w-4" />
            <span>{isAr ? "السلات المتروكة" : "Abandoned Carts"}</span>
          </TabsTrigger>
          <TabsTrigger value="sequences" className="gap-2 min-h-[38px]">
            <Send className="h-4 w-4" />
            <span>{isAr ? "سلاسل التذكير (Drip)" : "Drip Sequences"}</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2 min-h-[38px]">
            <RefreshCw className="h-4 w-4" />
            <span>{isAr ? "سجل الإرسال (Logs)" : "Dispatch Logs"}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="carts" className="space-y-4">
          <AbandonedCartsList
            carts={carts as any}
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
          <AbandonedCartLogsTable logs={logs as any} isLoading={loadingLogs} />
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
