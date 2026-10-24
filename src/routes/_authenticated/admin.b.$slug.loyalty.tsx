import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loyaltyQueries } from "@/lib/data/loyalty";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertCircle, Award, Coins, Users, ArrowUpRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { currencyLabel } from "@/lib/currency-label";
import { formatMoney } from "@/lib/format";
import { loyaltyProgramState } from "@/lib/loyalty-program";
import { LoyaltyMembersList } from "@/components/loyalty/LoyaltyMembersList";
import { LoyaltyCommandHeader } from "@/components/loyalty/LoyaltyCommandHeader";
import { LoyaltyTiersManager } from "@/components/loyalty/LoyaltyTiersManager";
import { LoyaltyLedgerTable } from "@/components/loyalty/LoyaltyLedgerTable";
import { LoyaltySettingsEditor } from "@/components/loyalty/LoyaltySettingsEditor";
import { LoyaltyManualAdjustmentDialog } from "@/components/loyalty/LoyaltyManualAdjustmentDialog";
import { arNoun } from "@/lib/arabic-count";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/loyalty")({
  component: LoyaltyDashboardPage,
});

function LoyaltyDashboardPage() {
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const [activeTab, setActiveTab] = useState<string>("members");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  // 1. Fetch loyalty program settings
  const { data: program } = useQuery(loyaltyQueries.program(brand.id));

  // 2. Fetch loyalty tiers
  const { data: tiers = [] } = useQuery(loyaltyQueries.tiers(brand.id));

  // 3. Fetch loyalty ledger
  const {
    data: ledger = [],
    isLoading: loadingLedger,
    refetch: refetchLedger,
  } = useQuery(loyaltyQueries.ledger(brand.id));

  // 4. Fetch loyalty accounts aggregate KPI summary
  const { data: accountsSummary = { totalActive: 0, totalRedeemed: 0, customerCount: 0 } } =
    useQuery(loyaltyQueries.summary(brand.id));

  const state = loyaltyProgramState(program);
  const currency = useStoreCurrency(brand.id);
  const locale = isAr ? "ar" : "en";
  const money = currencyLabel(currency, locale);
  const redemptionRate = program?.redemption_rate || 0.01;
  const estimatedActiveValue = formatMoney(
    accountsSummary.totalActive * redemptionRate,
    currency,
    locale,
  );
  const totalRedeemedValue = formatMoney(
    accountsSummary.totalRedeemed * redemptionRate,
    currency,
    locale,
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <LoyaltyCommandHeader
        state={state}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAdjust={() => setAdjustOpen(true)}
      />

      {/* Said plainly: with no programme saved, or one switched off, no customer earns a point. */}
      {state !== "on" && (
        <Card className="flex flex-col gap-3 border-warning/30 bg-warning-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              {state === "not_set_up"
                ? isAr
                  ? "برنامج الولاء غير مُعدّ بعد: لا يكسب أي عميل نقاطاً حتى تحفظ إعداداته."
                  : "The loyalty programme is not set up yet: no customer earns points until its settings are saved."
                : isAr
                  ? "برنامج الولاء متوقف: لا تُكسب نقاط ولا تُستخدم حتى تعيد تشغيله."
                  : "The loyalty programme is off: no points are earned or spent until it is switched back on."}
            </span>
          </p>
          <Button type="button" onClick={() => setSettingsOpen(true)} className="shrink-0">
            {state === "not_set_up"
              ? isAr
                ? "إعداد البرنامج"
                : "Set up the programme"
              : isAr
                ? "فتح الإعدادات"
                : "Open settings"}
          </Button>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "النقاط النشطة المتداولة" : "Active Points Balance"}
            </span>
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-foreground">
              {accountsSummary.totalActive.toLocaleString("en")}
            </span>
            <span className="text-xs text-muted-foreground block mt-1">
              {isAr
                ? `تعادل تقريباً ${estimatedActiveValue}`
                : `~${estimatedActiveValue} liability`}
            </span>
          </div>
        </Card>

        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "إجمالي النقاط المستردة" : "Total Redeemed Points"}
            </span>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-foreground">
              {accountsSummary.totalRedeemed.toLocaleString("en")}
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 block mt-1 font-medium">
              {isAr ? `قيمة مستخدمة ${totalRedeemedValue}` : `${totalRedeemedValue} saved`}
            </span>
          </div>
        </Card>

        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
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
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "معدل كسب النقاط" : "Earning Multiplier"}
            </span>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-foreground">
              {program
                ? isAr
                  ? `${arNoun(program.points_per_currency_unit, "point")} / ${money}`
                  : `${program.points_per_currency_unit} pts / ${money}`
                : "—"}
            </span>
            <span className="text-xs text-muted-foreground block mt-1">
              {isAr ? "مع دعم مضاعفات VIP" : "With dynamic VIP multipliers"}
            </span>
          </div>
        </Card>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex w-full items-center justify-start gap-1.5 overflow-x-auto no-scrollbar h-auto p-1 bg-muted border border-border rounded-xl overscroll-contain sm:w-auto">
          <TabsTrigger
            value="members"
            className="shrink-0 whitespace-nowrap gap-2 min-h-[38px] px-3"
          >
            <Users className="h-4 w-4" />
            <span>{isAr ? "الأعضاء" : "Members"}</span>
          </TabsTrigger>
          <TabsTrigger value="tiers" className="shrink-0 whitespace-nowrap gap-2 min-h-[38px] px-3">
            <Award className="h-4 w-4" />
            <span>{isAr ? "المستويات" : "Tiers"}</span>
          </TabsTrigger>
          <TabsTrigger
            value="ledger"
            className="shrink-0 whitespace-nowrap gap-2 min-h-[38px] px-3"
          >
            <Coins className="h-4 w-4" />
            <span>{isAr ? "سجل النقاط" : "Points ledger"}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <LoyaltyMembersList brandId={brand.id} tiers={tiers} isAr={isAr} />
        </TabsContent>

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
