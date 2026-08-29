// ==============================================================================
// BOUTQ OS: BRAND SUBSCRIPTION & ENTITLEMENTS HUB
// ==============================================================================

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBrandSubscriptionDetails,
  subscribeAddon,
  cancelAddon,
  cancelBrandSubscription,
} from "@/lib/saas-billing/saas-billing.functions";
import { useEntitlements } from "@/lib/saas-billing/use-entitlements";
import { UsageMeterBar } from "@/components/common/UsageMeterBar";
import { useI18n } from "@/lib/i18n";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import {
  Crown,
  Sparkles,
  Calendar,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  CreditCard,
  PackageCheck,
  TrendingUp,
  PackagePlus,
  Loader2,
  Check,
  XCircle,
  HelpCircle,
  Info,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface BrandSubscriptionHubProps {
  brandId: string;
  brandSlug: string;
}

export function BrandSubscriptionHub({ brandId, brandSlug }: BrandSubscriptionHubProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const queryClient = useQueryClient();

  const { data: subData, isLoading, error } = useQuery({
    queryKey: ["brand_subscription_details", brandId],
    queryFn: () => getBrandSubscriptionDetails({ data: { brandId } }),
    enabled: Boolean(brandId),
  });

  const {
    entitlements,
    usageSnapshots,
    isLoading: isEntitlementsLoading,
  } = useEntitlements({ brandId });

  const [selectedAddonForAction, setSelectedAddonForAction] = useState<{
    id: string;
    code: string;
    name: string;
    action: "subscribe" | "cancel";
  } | null>(null);

  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading || isEntitlementsLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-xs">{isAr ? "جاري فحص باقة واشتراك المتجر..." : "Checking store subscription and live quotas..."}</span>
      </div>
    );
  }

  if (error || !subData) {
    return (
      <div className="p-8 text-center text-destructive space-y-2">
        <AlertTriangle className="h-8 w-8 mx-auto" />
        <p className="text-sm font-bold">{isAr ? "فشل تحميل تفاصيل الاشتراك" : "Failed to load subscription details"}</p>
        <p className="text-xs text-muted-foreground">{getFriendlyErrorMessage(error)}</p>
      </div>
    );
  }

  const { subscription, currentPlan, currentVersion, activeAddons, availableAddons, allPlans } = subData;

  // Derive status
  const isFounder = currentPlan.code === "lifetime_founder";
  const isTrial = subscription.status === "trialing";
  const isInGrace = subscription.status === "grace_period";
  const isCancelled = subscription.status === "cancelled" || subscription.cancel_at_period_end;

  const handleAddonAction = async () => {
    if (!selectedAddonForAction) return;
    setIsSubmitting(true);
    const isSub = selectedAddonForAction.action === "subscribe";
    const toastId = toast.loading(isAr ? "جاري تحديث الاشتراك..." : "Updating add-on subscription...");

    try {
      if (isSub) {
        await subscribeAddon({
          data: {
            brandId,
            addonId: selectedAddonForAction.id,
            billingInterval: subscription.billing_interval || "monthly",
          },
        });
        toast.success(isAr ? "تم تفعيل الإضافة السحابية بنجاح!" : "Add-on activated successfully!", { id: toastId });
      } else {
        await cancelAddon({
          data: {
            brandId,
            addonId: selectedAddonForAction.id,
          },
        });
        toast.success(isAr ? "تم إلغاء الإضافة السحابية." : "Add-on cancelled.", { id: toastId });
      }

      setSelectedAddonForAction(null);
      void queryClient.invalidateQueries({ queryKey: ["brand_subscription_details", brandId] });
      void queryClient.invalidateQueries({ queryKey: ["brand_entitlements", brandId] });
    } catch (err) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Addon action failed", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSubscription = async () => {
    setIsSubmitting(true);
    const toastId = toast.loading(isAr ? "جاري معالجة الإلغاء..." : "Processing cancellation request...");

    try {
      await cancelBrandSubscription({
        data: {
          brandId,
          reason: "Merchant requested via settings",
        },
      });

      toast.success(
        isAr
          ? "تم ضبط الاشتراك للإلغاء في نهاية الفترة الحالية دون حذف أي بيانات."
          : "Subscription set to cancel at period end. No data will be deleted.",
        { id: toastId },
      );
      setIsCancelModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["brand_subscription_details", brandId] });
    } catch (err) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Failed to cancel subscription", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Header Banner & Current Subscription Overview */}
      <Card className="border border-border/80 bg-gradient-to-br from-card via-card/90 to-primary/5 shadow-sm rounded-3xl overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-5 select-none pointer-events-none text-primary">
          <Crown className="h-44 w-44" />
        </div>

        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={currentPlan.badge_color || "bg-primary/10 text-primary border-primary/20 text-xs font-bold"}
                >
                  {currentPlan.code.toUpperCase()}
                </Badge>
                {isFounder && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs font-bold gap-1">
                    <Sparkles className="h-3 w-3" />
                    <span>{isAr ? "باقة المؤسس مدى الحياة" : "Lifetime Founder"}</span>
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={
                    subscription.status === "active"
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs"
                      : subscription.status === "trialing"
                        ? "bg-sky-500/10 text-sky-600 border-sky-500/20 text-xs"
                        : "bg-destructive/10 text-destructive border-destructive/20 text-xs"
                  }
                >
                  {subscription.status.toUpperCase()}
                </Badge>
              </div>

              <CardTitle className="text-2xl font-extrabold text-foreground mt-2">
                {isAr ? currentPlan.name_ar : currentPlan.name_en}
                <span className="text-xs font-normal text-muted-foreground ms-2">
                  (v{currentVersion?.version_number || 1})
                </span>
              </CardTitle>
              <CardDescription className="text-xs max-w-xl">
                {isAr ? currentPlan.description_ar : currentPlan.description_en}
              </CardDescription>
            </div>

            {/* Quick Action CTAs */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => setIsUpgradeModalOpen(true)}
                className="gap-2 font-bold min-h-[44px] shadow-sm"
              >
                <TrendingUp className="h-4 w-4" />
                <span>{isAr ? "ترقية الخطة أو تغييرها" : "Upgrade / Change Plan"}</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-2 pb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-background/60 border border-border/60 backdrop-blur-sm">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                {isAr ? "فترة الفوترة" : "Billing Cycle"}
              </span>
              <span className="text-sm font-bold text-foreground capitalize">
                {subscription.billing_interval === "annual" ? (isAr ? "سنوي" : "Annual") : (isAr ? "شهري" : "Monthly")}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                {isAr ? "تاريخ التجديد القادم" : "Next Renewal Date"}
              </span>
              <span className="text-sm font-bold text-foreground font-mono">
                {subscription.current_period_end
                  ? new Date(subscription.current_period_end).toLocaleDateString()
                  : isFounder
                    ? isAr
                      ? "دائم"
                      : "Never"
                    : "-"}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                {isAr ? "الإضافات النشطة" : "Active Boost Add-ons"}
              </span>
              <span className="text-sm font-bold text-primary font-mono">
                {activeAddons.length} {isAr ? "إضافة" : "Add-ons"}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                {isAr ? "حماية الأسعار" : "Grandfathering"}
              </span>
              <span className="text-sm font-bold text-emerald-600 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{isAr ? "سعر محمي" : "Locked v" + (currentVersion?.version_number || 1)}</span>
              </span>
            </div>
          </div>

          {/* Grace Period or Cancellation Warning */}
          {isInGrace && (
            <div className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                {isAr
                  ? "انتهت فترة الاشتراك وحسابك في فترة سماح. يرجى تجديد الاشتراك لتفادي تحويل المتجر إلى وضع القراءة فقط."
                  : "Your subscription is currently in grace period. Please renew to avoid read-only mode."}
              </span>
            </div>
          )}

          {isCancelled && (
            <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0" />
              <span>
                {isAr
                  ? `سينتهي اشتراكك في ${new Date(subscription.current_period_end!).toLocaleDateString()}. بياناتك ومنتجاتك محفوظة بأمان ولن تُحذف.`
                  : `Your plan will end on ${new Date(subscription.current_period_end!).toLocaleDateString()}. Your data and store remain completely safe.`}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Live Usage Quotas & Limits Meters */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Zap className="h-4.5 w-4.5 text-primary" />
            <span>{isAr ? "استهلاك الحصص والحدود السحابية" : "Live Resource Usage & Quotas"}</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "متابعة دقيقة لاستهلاك الموارد مع تنبيهات تلقائية عند 80% و100% دون حذف أي بيانات سابقة."
              : "Live meter consumption with automatic threshold warnings and safe limit enforcement."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Products Meter */}
          <UsageMeterBar
            labelAr="عدد المنتجات في الكتالوج"
            labelEn="Catalog Products Limit"
            currentUsage={usageSnapshots["products.limit"]?.current_usage || 0}
            limitValue={entitlements?.limits["products.limit"] ?? 100}
            isUnlimited={entitlements?.limits["products.limit"] === -1}
            unitAr="منتج"
            unitEn="items"
          />

          {/* Monthly Orders Meter */}
          <UsageMeterBar
            labelAr="طلبات المتجر الشهرية"
            labelEn="Monthly Orders Quota"
            currentUsage={usageSnapshots["orders.monthly_limit"]?.current_usage || 0}
            limitValue={entitlements?.limits["orders.monthly_limit"] ?? 200}
            isUnlimited={entitlements?.limits["orders.monthly_limit"] === -1}
            unitAr="طلب"
            unitEn="orders"
          />

          {/* Monthly API Requests Meter */}
          <UsageMeterBar
            labelAr="استدعاءات الـ API الشهرية"
            labelEn="Monthly API Requests"
            currentUsage={usageSnapshots["api.monthly_requests"]?.current_usage || 0}
            limitValue={entitlements?.limits["api.monthly_requests"] ?? 10000}
            isUnlimited={entitlements?.limits["api.monthly_requests"] === -1}
            unitAr="استدعاء"
            unitEn="reqs"
          />

          {/* Abandoned Cart Messages */}
          <UsageMeterBar
            labelAr="رسائل استرجاع السلات المتروكة"
            labelEn="Abandoned Cart Messages"
            currentUsage={usageSnapshots["abandoned_carts.monthly_messages"]?.current_usage || 0}
            limitValue={entitlements?.limits["abandoned_carts.monthly_messages"] ?? 100}
            isUnlimited={entitlements?.limits["abandoned_carts.monthly_messages"] === -1}
            unitAr="رسالة"
            unitEn="msgs"
          />

          {/* Team Staff Accounts */}
          <UsageMeterBar
            labelAr="أعضاء فريق العمل والموظفين"
            labelEn="Team Members Limit"
            currentUsage={usageSnapshots["team.members_limit"]?.current_usage || 1}
            limitValue={entitlements?.limits["team.members_limit"] ?? 2}
            isUnlimited={entitlements?.limits["team.members_limit"] === -1}
            unitAr="حساب"
            unitEn="members"
          />

          {/* Webhook Deliveries */}
          <UsageMeterBar
            labelAr="إرساليات الويب هوك الشهرية"
            labelEn="Monthly Webhook Deliveries"
            currentUsage={usageSnapshots["webhooks.monthly_deliveries"]?.current_usage || 0}
            limitValue={entitlements?.limits["webhooks.monthly_deliveries"] ?? 5000}
            isUnlimited={entitlements?.limits["webhooks.monthly_deliveries"] === -1}
            unitAr="إرسالية"
            unitEn="events"
          />
        </div>
      </div>

      {/* 3. Modular SaaS Add-ons Store */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <PackagePlus className="h-4.5 w-4.5 text-primary" />
            <span>{isAr ? "متجر الإضافات السحابية الموديلية" : "Modular Capacity Add-ons Store"}</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "قم بتوسيع سعة متجرك بمرونة فورية عبر زيادة المنتجات أو الطلبات دون الحاجة لترقية الخطة بأكملها."
              : "Instantly expand catalog limits, order volumes, and storage without upgrading full plan tiers."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {availableAddons.map((addon) => {
            const isSubscribed = activeAddons.some((a: any) => a.addon_id === addon.id);

            return (
              <Card
                key={addon.id}
                className="border border-border bg-card shadow-sm rounded-2xl flex flex-col justify-between"
              >
                <CardHeader className="pb-3 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {addon.code}
                    </Badge>
                    {isSubscribed ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 text-[10px] font-bold">
                        {isAr ? "مفعل بالمتجر" : "Active"}
                      </Badge>
                    ) : (
                      <span className="text-xs font-mono font-bold text-foreground">
                        {addon.price_monthly} BHD<span className="text-[10px] font-normal text-muted-foreground">/{isAr ? "شهر" : "mo"}</span>
                      </span>
                    )}
                  </div>
                  <CardTitle className="text-sm font-bold text-foreground mt-2">
                    {isAr ? addon.name_ar : addon.name_en}
                  </CardTitle>
                  <CardDescription className="text-xs line-clamp-2">
                    {isAr ? addon.description_ar : addon.description_en}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-4 space-y-3">
                  <div className="p-2.5 rounded-xl bg-muted/40 border border-border/50 text-xs flex items-center justify-between">
                    <span className="text-muted-foreground">{isAr ? "السعة الإضافية:" : "Capacity Boost:"}</span>
                    <span className="font-bold text-foreground">
                      +{addon.grant_numeric_amount.toLocaleString()} ({addon.target_feature_key})
                    </span>
                  </div>

                  {isSubscribed ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSelectedAddonForAction({
                          id: addon.id,
                          code: addon.code,
                          name: isAr ? addon.name_ar : addon.name_en,
                          action: "cancel",
                        })
                      }
                      className="w-full text-xs font-bold text-destructive hover:bg-destructive/10 min-h-[44px]"
                    >
                      <XCircle className="h-3.5 w-3.5 me-1.5" />
                      <span>{isAr ? "إلغاء الإضافة" : "Cancel Add-on"}</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() =>
                        setSelectedAddonForAction({
                          id: addon.id,
                          code: addon.code,
                          name: isAr ? addon.name_ar : addon.name_en,
                          action: "subscribe",
                        })
                      }
                      className="w-full text-xs font-bold gap-1.5 min-h-[44px]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{isAr ? "تفعيل الإضافة الآن" : "Activate Add-on"}</span>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 4. Active Unlocked Features Summary */}
      <Card className="border border-border bg-card shadow-sm rounded-2xl">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-4.5 w-4.5 text-primary" />
            <span>{isAr ? "الميزات والقدرات المفعلة في خطتك" : "Active Plan Entitlements & Features"}</span>
          </CardTitle>
          <CardDescription className="text-xs">
            {isAr
              ? "الميزات البرمجية والتسويقية المتاحة لمتجرك بناءً على باقتك الحالية والإضافات المفعلة."
              : "Marketing, operations, and developer API capabilities unlocked for your store."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { key: "returns.enabled", labelAr: "بوابة المرتجعات الآلية", labelEn: "Self-Service Returns Portal" },
              { key: "loyalty.enabled", labelAr: "برنامج نقاط الولاء والمكافآت", labelEn: "Loyalty & Rewards Program" },
              { key: "abandoned_carts.enabled", labelAr: "استرجاع السلات المتروكة", labelEn: "Abandoned Carts Recovery" },
              { key: "api.enabled", labelAr: "مفاتيح وواجهات API المباشرة", labelEn: "Developer REST API Keys" },
              { key: "webhooks.enabled", labelAr: "إشعارات الويب هوك اللحظية", labelEn: "Live Outbound Webhooks" },
              { key: "white_label.enabled", labelAr: "إزالة علامة Boutq الرسمية", labelEn: "White Label Branding" },
              { key: "custom_domain.enabled", labelAr: "ربط دومين مخصص خاص", labelEn: "Custom Domain Connection" },
              { key: "mobile_factory.enabled", labelAr: "مصنع تطبيقات الموبايل", labelEn: "Mobile App Factory Builder" },
              { key: "affiliates.enabled", labelAr: "نظام المسوقين بالعمولة", labelEn: "Affiliates & Referrals Engine" },
            ].map((item) => {
              const isEnabled = entitlements?.features[item.key] ?? false;

              return (
                <div
                  key={item.key}
                  className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                    isEnabled
                      ? "bg-primary/[0.03] border-primary/20 text-foreground"
                      : "bg-muted/20 border-border/60 text-muted-foreground opacity-60"
                  }`}
                >
                  <span className="font-semibold">{isAr ? item.labelAr : item.labelEn}</span>
                  {isEnabled ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-none font-bold text-[10px]">
                      {isAr ? "مفعل" : "Unlocked"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted text-muted-foreground border-none text-[10px]">
                      {isAr ? "مغلق" : "Locked"}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
        <CardFooter className="pt-2 pb-4 border-t border-border/50 flex justify-between items-center text-xs text-muted-foreground">
          <span>{isAr ? "هل تحتاج إلى ميزة إضافية؟" : "Need more custom features?"}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsCancelModalOpen(true)}
            className="text-xs text-muted-foreground hover:text-destructive h-8"
          >
            {isAr ? "إدارة إلغاء الاشتراك" : "Manage Cancellation"}
          </Button>
        </CardFooter>
      </Card>

      {/* Upgrade / Change Plan Dialog */}
      {isUpgradeModalOpen && (
        <Dialog open={isUpgradeModalOpen} onOpenChange={setIsUpgradeModalOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <span>{isAr ? "ترقية خطة المتجر والمزايا" : "Upgrade / Select Plan"}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                {isAr
                  ? "اختر الباقة المناسبة لحجم أعمالك. يتم تفعيل المزايا فوراً دون أي انقطاع في الخدمة."
                  : "Select the plan that fits your growth. New quotas apply immediately without store downtime."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
              {allPlans
                .filter((p) => p.code !== "lifetime_founder" && p.code !== "trial")
                .map((plan) => {
                  const isCurrent = plan.id === currentPlan.id;

                  return (
                    <div
                      key={plan.id}
                      className={`p-4 rounded-2xl border flex flex-col justify-between text-xs space-y-3 ${
                        isCurrent
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border bg-card hover:border-border/80"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className={plan.badge_color || "bg-primary/10 text-primary font-bold"}>
                            {plan.code}
                          </Badge>
                          {isCurrent && (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 font-bold text-[10px]">
                              {isAr ? "خطتك الحالية" : "Current"}
                            </Badge>
                          )}
                        </div>
                        <h4 className="text-base font-bold text-foreground">
                          {isAr ? plan.name_ar : plan.name_en}
                        </h4>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {isAr ? plan.description_ar : plan.description_en}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-border/50 space-y-2">
                        <div className="font-mono text-sm font-bold text-foreground">
                          {plan.code === "enterprise" ? (isAr ? "اتفاقية خاصة" : "Custom") : "15 - 45 BHD/m"}
                        </div>
                        <Button
                          type="button"
                          variant={isCurrent ? "outline" : "default"}
                          size="sm"
                          disabled={isCurrent}
                          onClick={() => {
                            toast.info(
                              isAr
                                ? "يرجى تحويل الرسوم عبر BenefitPay وتأكيد طلب الترقية مع الإدارة."
                                : "Please transfer fee via BenefitPay and confirm receipt with admin.",
                            );
                            setIsUpgradeModalOpen(false);
                          }}
                          className="w-full font-bold text-xs min-h-[44px]"
                        >
                          {isCurrent ? (isAr ? "الخطة النشطة" : "Active Plan") : (isAr ? "اختيار الباقة" : "Select Plan")}
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add-on Action Dialog */}
      {selectedAddonForAction && (
        <Dialog
          open={Boolean(selectedAddonForAction)}
          onOpenChange={(open) => !open && setSelectedAddonForAction(null)}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                {selectedAddonForAction.action === "subscribe"
                  ? isAr
                    ? `تفعيل ${selectedAddonForAction.name}`
                    : `Subscribe to ${selectedAddonForAction.name}`
                  : isAr
                    ? `إلغاء ${selectedAddonForAction.name}`
                    : `Cancel ${selectedAddonForAction.name}`}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {selectedAddonForAction.action === "subscribe"
                  ? isAr
                    ? "سيتم إضافة السعة الإضافية إلى حسابك فوراً وإدراجها في دورة الفوترة القادمة."
                    : "The boost capacity will be immediately credited to your store."
                  : isAr
                    ? "عند الإلغاء، ستبقى السعة الإضافية متاحة حتى نهاية الفترة الحالية ولن يتم حذف أي بيانات."
                    : "Add-on remains active until period end. No existing data will be deleted."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="default"
                disabled={isSubmitting}
                onClick={() => setSelectedAddonForAction(null)}
                className="min-h-[44px]"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="button"
                variant={selectedAddonForAction.action === "subscribe" ? "default" : "destructive"}
                size="default"
                disabled={isSubmitting}
                onClick={handleAddonAction}
                className="font-bold min-h-[44px]"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                <span>
                  {selectedAddonForAction.action === "subscribe"
                    ? isAr
                      ? "تأكيد التفعيل"
                      : "Confirm Activation"
                    : isAr
                      ? "تأكيد الإلغاء"
                      : "Confirm Cancellation"}
                </span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Safe Cancellation Dialog */}
      {isCancelModalOpen && (
        <Dialog open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                <span>{isAr ? "طلب إلغاء تجديد الاشتراك" : "Cancel Auto-Renewal"}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                {isAr
                  ? "نحن نضمن حماية بياناتك بالكامل عند إلغاء التجديد."
                  : "Your data and store are fully preserved when cancelling renewal."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3 text-xs text-muted-foreground leading-relaxed">
              <p>
                {isAr
                  ? "• سيبقى متجرك نشطاً بكافة ميزاته حتى تاريخ انتهاء الفترة الحالية."
                  : "• Your store remains active with full quotas until current period ends."}
              </p>
              <p>
                {isAr
                  ? "• لن يتم حذف أي منتج أو طلب أو عميل إطلاقاً."
                  : "• Absolutely zero products, orders, or customer records will be deleted."}
              </p>
              <p>
                {isAr
                  ? "• بعد انتهاء الفترة، يتحول المتجر بأمان إلى وضع القراءة فقط حتى تعود للاشتراك في أي وقت."
                  : "• Post-expiry, excess resources gracefully become read-only until you resubscribe."}
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="default"
                disabled={isSubmitting}
                onClick={() => setIsCancelModalOpen(false)}
                className="min-h-[44px]"
              >
                {isAr ? "التراجع والبقاء" : "Keep Subscription"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="default"
                disabled={isSubmitting}
                onClick={handleCancelSubscription}
                className="font-bold min-h-[44px]"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                <span>{isAr ? "تأكيد إيقاف التجديد" : "Stop Auto-Renewal"}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
