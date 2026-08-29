import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Award,
  Coins,
  Sparkles,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Truck,
  Percent,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import type {
  LoyaltyAccount,
  LoyaltyTier,
  LoyaltyLedgerEntry,
  BrandLoyaltyProgram,
} from "@/lib/loyalty.types";
import { DEFAULT_LOYALTY_TIERS } from "@/lib/loyalty.types";

interface CustomerLoyaltySectionProps {
  brandId: string;
  customerId: string;
  currency: string;
}

export function CustomerLoyaltySection({
  brandId,
  customerId,
  currency,
}: CustomerLoyaltySectionProps) {
  const { lang, t } = useI18n();
  const isAr = lang === "ar";

  // 1. Fetch loyalty account
  const { data: account, isLoading: loadingAccount } = useQuery<LoyaltyAccount | null>({
    queryKey: ["customer_loyalty_account", brandId, customerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("loyalty_accounts")
        .select("*")
        .eq("brand_id", brandId)
        .eq("customer_id", customerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!customerId,
  });

  // 2. Fetch brand loyalty program settings
  const { data: program } = useQuery<BrandLoyaltyProgram | null>({
    queryKey: ["customer_loyalty_program", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("brand_loyalty_programs")
        .select("*")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // 3. Fetch brand loyalty tiers
  const { data: tiers = [] } = useQuery<LoyaltyTier[]>({
    queryKey: ["customer_loyalty_tiers", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("brand_loyalty_tiers")
        .select("*")
        .eq("brand_id", brandId)
        .order("min_spend", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // 4. Fetch customer's loyalty ledger history
  const { data: ledger = [], isLoading: loadingLedger } = useQuery<LoyaltyLedgerEntry[]>({
    queryKey: ["customer_loyalty_ledger", brandId, customerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("loyalty_ledger")
        .select("*")
        .eq("brand_id", brandId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!customerId,
  });

  const activePoints = account?.active_points ?? 0;
  const pendingPoints = account?.pending_points ?? 0;
  const redemptionRate = program?.redemption_rate ?? 0.010;
  const cashEquivalent = (activePoints * redemptionRate).toFixed(3);

  const effectiveTiers = tiers.length > 0 ? tiers : (DEFAULT_LOYALTY_TIERS as any[]);
  const currentTierKey = account?.current_tier_key ?? "bronze";
  const currentTier = effectiveTiers.find((t: any) => t.tier_key === currentTierKey) || effectiveTiers[0];

  // Find next tier for progression bar
  const currentTierIdx = effectiveTiers.findIndex((t: any) => t.tier_key === currentTierKey);
  const nextTier = currentTierIdx >= 0 && currentTierIdx < effectiveTiers.length - 1
    ? effectiveTiers[currentTierIdx + 1]
    : null;

  return (
    <div className="space-y-6">
      {/* Hero Points Summary Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Active Points */}
        <Card className="p-6 border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                {isAr ? "رصيد النقاط المتاح" : "Available Points"}
              </span>
              <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                <Coins className="h-5 w-5" />
              </div>
            </div>
            <div>
              <span className="text-3xl sm:text-4xl font-extrabold font-mono text-foreground">
                {activePoints.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground block mt-1 font-medium">
                {isAr
                  ? `تعادل خصماً بقيمة ${cashEquivalent} ${currency} عند الدفع`
                  : `Equivalent to ${cashEquivalent} ${currency} at checkout`}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>
              {isAr
                ? "يمكنك استخدام نقاطك مباشرة في صفحة إتمام الطلب"
                : "Redeemable instantly during checkout"}
            </span>
          </div>
        </Card>

        {/* Pending Points (Holding Period) */}
        <Card className="p-6 border-border bg-card flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {isAr ? "نقاط معلقة (قيد الاعتماد)" : "Pending Points"}
              </span>
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Clock className="h-5 w-5" />
              </div>
            </div>
            <div>
              <span className="text-3xl font-extrabold font-mono text-foreground">
                {pendingPoints.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground block mt-1">
                {isAr
                  ? "تضاف تلقائياً لرصيدك بعد انتهاء فترة الاسترجاع"
                  : "Matures into active balance after return window"}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span>
              {isAr
                ? `فترة الاعتماد: ${program?.holding_period_days ?? 14} يوماً من استلام الطلب`
                : `Holding period: ${program?.holding_period_days ?? 14} days`}
            </span>
          </div>
        </Card>

        {/* Current VIP Tier Card */}
        <Card className="p-6 border-border bg-card flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {isAr ? "مستوى العضوية الحالي" : "Current VIP Tier"}
              </span>
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center text-white"
                style={{ backgroundColor: currentTier.badge_color || "var(--primary)" }}
              >
                <Award className="h-5 w-5" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-bold font-display text-foreground block">
                {isAr ? currentTier.name_ar : currentTier.name_en}
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-bold text-primary">
                  {currentTier.points_multiplier}x {isAr ? "مضاعف نقاط" : "multiplier"}
                </span>
                {currentTier.free_shipping && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <Truck className="h-3 w-3" />
                    {isAr ? "شحن مجاني" : "Free shipping"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {nextTier ? (
            <div className="mt-4 pt-3 border-t border-border/50 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{isAr ? "الترقية للمستوى التالي:" : "Next Tier:"}</span>
                <span className="font-semibold text-foreground">
                  {isAr ? nextTier.name_ar : nextTier.name_en} ({nextTier.min_spend} {currency})
                </span>
              </div>
              <Progress value={Math.min(100, Math.max(15, (activePoints / (nextTier.min_points || 1000)) * 100))} className="h-1.5" />
            </div>
          ) : (
            <div className="mt-4 pt-3 border-t border-border/50 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{isAr ? "أنت في أعلى مستويات العضوية!" : "You have reached the top tier!"}</span>
            </div>
          )}
        </Card>
      </div>

      {/* Tiers & Perks Showcase */}
      <Card className="p-6 border-border bg-card space-y-4">
        <h3 className="text-base font-bold font-display text-foreground flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          {isAr ? "مستويات ومزايا برنامج الولاء" : "Loyalty Tiers & Benefits"}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {effectiveTiers.map((t: any) => {
            const isCurrent = t.tier_key === currentTierKey;
            return (
              <div
                key={t.tier_key}
                className={`p-4 rounded-xl border transition-all ${
                  isCurrent
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border/70 bg-background/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-md"
                    style={{
                      backgroundColor: `${t.badge_color || "#64748b"}20`,
                      color: t.badge_color || "var(--foreground)",
                    }}
                  >
                    {isAr ? t.name_ar : t.name_en}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {isAr ? "مستواك الحالي" : "Your Tier"}
                    </span>
                  )}
                </div>

                <div className="text-xs text-muted-foreground mb-3 font-mono">
                  {Number(t.min_spend) > 0
                    ? `${t.min_spend} ${currency} ${isAr ? "إنفاق" : "spend"}`
                    : isAr
                    ? "مستوى البداية"
                    : "Starting Tier"}
                </div>

                <ul className="space-y-1.5 text-xs text-foreground/80">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>
                      {t.points_multiplier}x {isAr ? "مضاعف نقاط" : "Points Multiplier"}
                    </span>
                  </li>
                  {t.discount_percent > 0 && (
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>
                        {t.discount_percent}% {isAr ? "خصم دائم" : "Exclusive Discount"}
                      </span>
                    </li>
                  )}
                  {t.free_shipping && (
                    <li className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>{isAr ? "شحن مجاني على كل الطلبات" : "Free Shipping"}</span>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Points History Ledger */}
      <Card className="p-6 border-border bg-card space-y-4">
        <h3 className="text-base font-bold font-display text-foreground flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          {isAr ? "سجل حركة المكافآت والنقاط" : "Points History"}
        </h3>

        {ledger.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {isAr
              ? "لم تقم بأي حركات نقاط حتى الآن. ابدأ بالتسوق لكسب النقاط!"
              : "No points activity recorded yet. Start shopping to earn points!"}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {ledger.map((entry) => {
              const isPositive = entry.points > 0;
              return (
                <div key={entry.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                        isPositive
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {isPositive ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        {isAr ? entry.reference_note_ar : entry.reference_note_en}
                      </p>
                      <span className="text-[11px] text-muted-foreground block">
                        {new Date(entry.created_at).toLocaleDateString(isAr ? "ar-BH" : "en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-mono text-sm font-bold ${
                        isPositive
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {entry.points} {isAr ? "نقطة" : "pts"}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      {isAr ? "الرصيد: " : "Balance: "} {entry.balance_after}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
