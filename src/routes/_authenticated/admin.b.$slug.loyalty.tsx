import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Award, Coins, Users, ArrowUpRight, ShieldCheck, Sparkles } from "lucide-react";
import { LoyaltyCommandHeader } from "@/components/loyalty/LoyaltyCommandHeader";
import { LoyaltyTiersManager } from "@/components/loyalty/LoyaltyTiersManager";
import { LoyaltyLedgerTable } from "@/components/loyalty/LoyaltyLedgerTable";
import { LoyaltySettingsEditor } from "@/components/loyalty/LoyaltySettingsEditor";
import { LoyaltyManualAdjustmentDialog } from "@/components/loyalty/LoyaltyManualAdjustmentDialog";
import type { BrandLoyaltyProgram, LoyaltyTier } from "@/lib/loyalty.types";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/loyalty")({
  component: LoyaltyDashboardPage,
});

function LoyaltyDashboardPage() {
  const brand = useBrand();
  const { lang, t } = useI18n();
  const isAr = lang === "ar";

  const [activeTab, setActiveTab] = useState<string>("tiers");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  // 1. Fetch loyalty program settings
  const { data: program } = useQuery<BrandLoyaltyProgram | null>({
    queryKey: ["brand_loyalty_program", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("brand_loyalty_programs")
        .select("*")
        .eq("brand_id", brand.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // 2. Fetch loyalty tiers
  const { data: tiers = [] } = useQuery<LoyaltyTier[]>({
    queryKey: ["brand_loyalty_tiers", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("brand_loyalty_tiers")
        .select("*")
        .eq("brand_id", brand.id)
        .order("min_spend", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // 3. Fetch loyalty ledger
  const {
    data: ledger = [],
    isLoading: loadingLedger,
    refetch: refetchLedger,
  } = useQuery({
    queryKey: ["brand_loyalty_ledger", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("loyalty_ledger")
        .select("*, customers(name, email, phone)")
        .eq("brand_id", brand.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  // 4. Fetch loyalty accounts aggregate KPI summary
  const { data: accountsSummary = { totalActive: 0, totalRedeemed: 0, customerCount: 0 } } =
    useQuery({
      queryKey: ["brand_loyalty_accounts_summary", brand.id],
      queryFn: async () => {
        const { data, error } = await (supabase as any)
          .from("loyalty_accounts")
          .select("active_points, lifetime_spent_points")
          .eq("brand_id", brand.id);
        if (error) throw error;

        const totalActive = (data || []).reduce((acc: number, row: any) => acc + (row.active_points || 0), 0);
        const totalRedeemed = (data || []).reduce(
          (acc: number, row: any) => acc + (row.lifetime_spent_points || 0),
          0,
        );

        return {
          totalActive,
          totalRedeemed,
          customerCount: (data || []).length,
        };
      },
    });

  const redemptionRate = program?.redemption_rate || 0.010;
  const estimatedActiveValue = (accountsSummary.totalActive * redemptionRate).toFixed(3);
  const totalRedeemedValue = (accountsSummary.totalRedeemed * redemptionRate).toFixed(3);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <LoyaltyCommandHeader
        isEnabled={program?.is_enabled ?? true}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAdjust={() => setAdjustOpen(true)}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? "النقاط النشطة المتداولة" : "Active Points Balance"}
            </span>
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-foreground">
              {accountsSummary.totalActive.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground block mt-1">
              {isAr
                ? `تعادل تقريباً ${estimatedActiveValue} د.ب`
                : `~${estimatedActiveValue} BHD liability`}
            </span>
          </div>
        </Card>

        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? "إجمالي النقاط المستردة" : "Total Redeemed Points"}
            </span>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-foreground">
              {accountsSummary.totalRedeemed.toLocaleString()}
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 block mt-1 font-medium">
              {isAr ? `قيمة مستخدمة ${totalRedeemedValue} د.ب` : `${totalRedeemedValue} BHD saved`}
            </span>
          </div>
        </Card>

        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? "أعضاء برنامج الولاء" : "Loyalty Members"}
            </span>
            <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-foreground">
              {accountsSummary.customerCount}
            </span>
            <span className="text-xs text-muted-foreground block mt-1">
              {isAr ? "عملاء لديهم محافظ ولاء" : "Enrolled customer wallets"}
            </span>
          </div>
        </Card>

        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? "معدل كسب النقاط" : "Earning Multiplier"}
            </span>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-foreground">
              {program?.points_per_currency_unit ?? 10} {isAr ? "نقطة / د.ب" : "pts / BHD"}
            </span>
            <span className="text-xs text-muted-foreground block mt-1">
              {isAr ? "مع دعم مضاعفات VIP" : "With dynamic VIP multipliers"}
            </span>
          </div>
        </Card>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted p-1 border border-border">
          <TabsTrigger value="tiers" className="gap-2 min-h-[38px]">
            <Award className="h-4 w-4" />
            <span>{isAr ? "مستويات العضوية (Tiers)" : "VIP Tiers & Perks"}</span>
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-2 min-h-[38px]">
            <Coins className="h-4 w-4" />
            <span>{isAr ? "سجل الحركات والرقابة (Ledger)" : "Points Ledger"}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tiers" className="space-y-4">
          <LoyaltyTiersManager brandId={brand.id} tiers={tiers} />
        </TabsContent>

        <TabsContent value="ledger" className="space-y-4">
          <LoyaltyLedgerTable
            entries={ledger as any}
            isLoading={loadingLedger}
            onRefresh={refetchLedger}
          />
        </TabsContent>
      </Tabs>

      {/* Program Settings Modal */}
      <LoyaltySettingsEditor
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        brandId={brand.id}
        initialSettings={program}
      />

      {/* Manual Adjustment Modal */}
      <LoyaltyManualAdjustmentDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        brandId={brand.id}
      />
    </div>
  );
}
