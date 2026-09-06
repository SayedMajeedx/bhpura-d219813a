// ==============================================================================
// BOUTQ OS: BRAND SUBSCRIPTION & ENTITLEMENTS HUB
// ==============================================================================

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBrandSubscriptionDetails,
  cancelBrandSubscription,
} from "@/lib/saas-billing/saas-billing.functions";
import {
  getSubscriptionReceiptUploadUrl,
  submitSubscriptionReceipt,
} from "@/lib/saas-subscription.functions";
import { supabase } from "@/integrations/supabase/client";
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
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  CreditCard,
  PackageCheck,
  TrendingUp,
  Loader2,
  Check,
  XCircle,
  HelpCircle,
  Info,
  Clock,
  Copy,
  QrCode,
  UploadCloud,
  FileImage,
  X,
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
import { PayPalSubscriptionButton } from "./PayPalSubscriptionButton";

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

  // Subscription upgrade & payment states
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [selectedPlanForUpgrade, setSelectedPlanForUpgrade] = useState<any | null>(null);
  const [inlineSelectedPlanId, setInlineSelectedPlanId] = useState<string | null>(null);
  const [upgradeBillingInterval, setUpgradeBillingInterval] = useState<"monthly" | "annual">("annual");
  const [inlinePaymentMethod, setInlinePaymentMethod] = useState<"paypal" | "benefit">("paypal");
  const [dialogPaymentMethod, setDialogPaymentMethod] = useState<"paypal" | "benefit">("paypal");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch BenefitPay system settings
  const { data: systemSettings } = useQuery({
    queryKey: ["system_settings_billing"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("system_settings")
        .select(
          "base_price_bhd, discount_price_bhd, benefit_pay_qr_url, merchant_account_name, subscription_iban",
        )
        .eq("id", 1)
        .maybeSingle();
      return (
        data ?? {
          merchant_account_name: "BOUTQ-OFFICIAL",
          subscription_iban: "BH12KHCB0000001234567890",
          benefit_pay_qr_url: null,
        }
      );
    },
  });

  const handleCopyIban = () => {
    const iban = systemSettings?.subscription_iban || "BH12KHCB0000001234567890";
    navigator.clipboard.writeText(iban);
    setCopiedIban(true);
    toast.success(isAr ? "تم نسخ رقم الآيبان بنجاح!" : "IBAN copied to clipboard!");
    setTimeout(() => setCopiedIban(false), 2500);
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error(isAr ? "يرجى اختيار صورة بصيغة JPG أو PNG أو WebP." : "Please upload a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(isAr ? "حجم الصورة كبير جداً، الحد الأقصى هو 10 ميجابايت." : "File is too large, maximum 10MB allowed.");
      return;
    }

    setReceiptFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setReceiptPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadAndConfirmUpgrade = async (overridePlan?: any) => {
    const planToUpgrade = overridePlan || selectedPlanForUpgrade;
    if (!receiptFile || !planToUpgrade) {
      toast.error(isAr ? "يرجى إرفاق صورة إشعار التحويل أولاً." : "Please attach the transfer receipt image first.");
      return;
    }

    setIsUploadingReceipt(true);
    const toastId = toast.loading(
      isAr ? "جاري رفع إشعار التحويل وتأكيد الترقية..." : "Uploading receipt and confirming upgrade...",
    );

    try {
      // 1. Request presigned R2 upload URL
      const { objectKey, uploadUrl } = await getSubscriptionReceiptUploadUrl({
        data: {
          brandId,
          contentType: receiptFile.type as "image/jpeg" | "image/png" | "image/webp",
          size: receiptFile.size,
          isUpgrade: true,
        },
      });

      // 2. Upload file directly to private R2 storage
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": receiptFile.type },
        body: receiptFile,
      });

      if (!putRes.ok) {
        throw new Error("Failed to upload receipt file to storage.");
      }

      // 3. Submit receipt to update brand to pending_verification and record upgrade intent
      await submitSubscriptionReceipt({
        data: {
          brandId,
          objectKey,
          targetPlanId: planToUpgrade.id,
          billingInterval: upgradeBillingInterval,
        },
      });

      toast.success(
        isAr
          ? "تم إرسال إشعار الدفع بنجاح! طلب ترقية متجرك قيد المراجعة لدى إدارة المنصة وسيتم اعتماد الباقة فوراً."
          : "Payment receipt submitted successfully! Your plan upgrade is pending admin verification.",
        { id: toastId, duration: 6000 },
      );

      setIsUpgradeModalOpen(false);
      setSelectedPlanForUpgrade(null);
      setReceiptFile(null);
      setReceiptPreview(null);

      void queryClient.invalidateQueries({ queryKey: ["brand_subscription_details", brandId] });
      void queryClient.invalidateQueries({ queryKey: ["brand", brandSlug] });
      void queryClient.invalidateQueries({ queryKey: ["brands"] });
    } catch (err: any) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Failed to submit upgrade receipt", { id: toastId });
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const handlePaymentSuccess = () => {
    setIsUpgradeModalOpen(false);
    setSelectedPlanForUpgrade(null);
    void queryClient.invalidateQueries({ queryKey: ["brand_subscription_details", brandId] });
    void queryClient.invalidateQueries({ queryKey: ["brand", brandSlug] });
    void queryClient.invalidateQueries({ queryKey: ["brands"] });
  };

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

  const {
    subscription = {} as any,
    currentPlan = {} as any,
    currentVersion,
    activeAddons = [],
    availableAddons = [],
    allPlans = [],
    usageSummary = {} as any,
    brand = {} as any,
  } = subData;

  // Derive status
  const isFounder = currentPlan?.code === "lifetime_founder";
  const isTrial = currentPlan?.code === "trial" || subscription?.status === "trialing" || subscription?.billing_interval === "trial";
  const isInGrace = subscription?.status === "grace_period";
  const isCancelled = subscription?.status === "cancelled" || subscription?.cancel_at_period_end;
  const isPendingVerification = brand?.subscription_status === "pending_verification";

  const trialEndsAtDate = isTrial
    ? (subscription?.trial_ends_at || brand?.trial_ends_at)
    : null;
  const trialDaysRemaining = trialEndsAtDate
    ? Math.max(0, Math.ceil((new Date(trialEndsAtDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  // Filter eligible paid plans for upgrade
  const upgradeEligiblePlans = allPlans.filter(
    (p: any) => p.code !== "trial" && p.code !== "lifetime_founder" && p.is_active,
  );

  // Highest/recommended available plan (e.g. Pro or Growth)
  const defaultRecommendedPlan =
    upgradeEligiblePlans.find((p: any) => p.code === "pro") ||
    upgradeEligiblePlans.find((p: any) => p.code === "growth") ||
    upgradeEligiblePlans[upgradeEligiblePlans.length - 1] ||
    upgradeEligiblePlans[0];

  const inlineSelectedPlan =
    upgradeEligiblePlans.find((p: any) => p.id === inlineSelectedPlanId) ||
    defaultRecommendedPlan ||
    null;

  const getPlanCurrentVersion = (plan: any) => {
    if (!plan?.versions || !Array.isArray(plan.versions)) return null;
    return plan.versions.find((v: any) => v.is_current) || plan.versions[0] || null;
  };

  const getPlanPrice = (plan: any, interval: "monthly" | "annual") => {
    const version = getPlanCurrentVersion(plan);
    if (!version) return 0;
    return interval === "annual"
      ? Number(version.price_annual ?? 0)
      : Number(version.price_monthly ?? 0);
  };

  const activeInlinePrice = inlineSelectedPlan
    ? getPlanPrice(inlineSelectedPlan, upgradeBillingInterval)
    : 0;

  const shouldShowInlineUpgradeCard =
    isTrial || isInGrace || subscription?.status === "expired" || isPendingVerification;

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
                  className={
                    isTrial
                      ? "bg-sky-500/10 text-sky-600 border-sky-500/20 text-xs font-bold"
                      : currentPlan?.badge_color || "bg-primary/10 text-primary border-primary/20 text-xs font-bold"
                  }
                >
                  {isTrial
                    ? (isAr ? "باقة تجريبية (3 أيام)" : "3-DAY TRIAL")
                    : (currentPlan?.code || "PLAN").toUpperCase()}
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
                    subscription?.status === "active"
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs font-semibold"
                      : subscription?.status === "trialing" || isTrial
                        ? "bg-sky-500/10 text-sky-600 border-sky-500/20 text-xs font-semibold"
                        : "bg-destructive/10 text-destructive border-destructive/20 text-xs font-semibold"
                  }
                >
                  {subscription?.status === "active"
                    ? (isAr ? "نشط" : "ACTIVE")
                    : subscription?.status === "trialing" || isTrial
                      ? (isAr ? "فترة تجريبية نشطة" : "ACTIVE TRIAL")
                      : (subscription?.status || "ACTIVE").toUpperCase()}
                </Badge>
              </div>

              <CardTitle className="text-2xl font-extrabold text-foreground mt-2">
                {isAr
                  ? (currentPlan?.name_ar || (isTrial ? "الفترة التجريبية (3 أيام)" : "الخطة الأساسية"))
                  : (currentPlan?.name_en || (isTrial ? "3-Day Free Trial" : "Base Plan"))}
                <span className="text-xs font-normal text-muted-foreground ms-2">
                  (v{currentVersion?.version_number || 1})
                </span>
              </CardTitle>
              <CardDescription className="text-xs max-w-xl">
                {isAr
                  ? (currentPlan?.description_ar || (isTrial ? "تجربة كاملة ومجانية لكافة مزايا وموارد المتجر لمدة 3 أيام." : ""))
                  : (currentPlan?.description_en || (isTrial ? "Full-featured 3-day trial of all store capabilities." : ""))}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-background/60 border border-border/60 backdrop-blur-sm">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                {isTrial
                  ? (isAr ? "نوع الحساب" : "Account Mode")
                  : (isAr ? "حماية الأسعار" : "Grandfathering")}
              </span>
              {isTrial ? (
                <span className="text-sm font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{isAr ? "تجربة كاملة المزايا" : "Full Access Trial"}</span>
                </span>
              ) : (
                <span className="text-sm font-bold text-emerald-600 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{isAr ? "سعر محمي" : "Locked v" + (currentVersion?.version_number || 1)}</span>
                </span>
              )}
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                {isAr ? "فترة الفوترة" : "Billing Cycle"}
              </span>
              <span className="text-sm font-bold text-foreground">
                {isTrial
                  ? (isAr ? "فترة تجريبية (3 أيام)" : "Free Trial (3 Days)")
                  : subscription?.billing_interval === "annual"
                    ? (isAr ? "سنوي" : "Annual")
                    : (isAr ? "شهري" : "Monthly")}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                {isTrial
                  ? (isAr ? "تاريخ انتهاء التجربة" : "Trial Expiry Date")
                  : (isAr ? "تاريخ التجديد القادم" : "Next Renewal Date")}
              </span>
              <span className="text-sm font-bold text-foreground font-mono">
                {isTrial && trialEndsAtDate
                  ? `${new Date(trialEndsAtDate).toLocaleDateString(isAr ? "ar-BH" : "en-US", { year: "numeric", month: "short", day: "numeric" })} ${
                      trialDaysRemaining !== null ? `(${isAr ? `متبقي ${trialDaysRemaining} أيام` : `${trialDaysRemaining}d left`})` : ""
                    }`
                  : subscription?.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleDateString(isAr ? "ar-BH" : "en-US", { year: "numeric", month: "short", day: "numeric" })
                    : isFounder
                      ? (isAr ? "دائم" : "Never")
                      : "-"}
              </span>
            </div>
          </div>

          {/* Pending Verification Notice Banner */}
          {isPendingVerification && (
            <div className="mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 animate-pulse" />
                <div>
                  <p className="font-bold text-amber-800 dark:text-amber-300">
                    {isAr ? "طلب الترقية قيد المراجعة والتحقق" : "Upgrade Request Pending Verification"}
                  </p>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                    {isAr
                      ? "تم استلام إشعار التحويل عبر BenefitPay بنجاح. جاري مطابقة التحويل من قبل إدارة المنصة وسيتم تفعيل الباقة فور الاعتماد."
                      : "BenefitPay transfer receipt submitted. Admin verification is in progress."}
                  </p>
                </div>
              </div>
              <Badge className="bg-amber-500 text-white shrink-0 text-[10px] font-bold">
                {isAr ? "بانتظار الاعتماد" : "Pending Approval"}
              </Badge>
            </div>
          )}

          {/* Active Trial Notice Banner */}
          {isTrial && !isPendingVerification && (
            <div className="mt-4 p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-900 dark:text-sky-200 flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
              <span>
                {isAr
                  ? `أنت حالياً في الفترة التجريبية المجانية (${trialDaysRemaining !== null ? `متبقي ${trialDaysRemaining} أيام` : "3 أيام"}). جميع مزايا المنصة متاحة لك بالكامل.`
                  : `You are currently in your free trial (${trialDaysRemaining !== null ? `${trialDaysRemaining} days remaining` : "3 days"}). All platform features are unlocked.`}
              </span>
            </div>
          )}

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
                  ? `سينتهي اشتراكك في ${subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "-"}. بياناتك ومنتجاتك محفوظة بأمان ولن تُحذف.`
                  : `Your plan will end on ${subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "-"}. Your data and store remain completely safe.`}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 1.5 Prominent Upgrade & Activation Section (For Trial, Expired, Grace or Pending Verification) */}
      {shouldShowInlineUpgradeCard && !isPendingVerification && (
        <Card className="border-2 border-primary/20 bg-gradient-to-b from-card via-card to-primary/5 shadow-md rounded-3xl overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/50 bg-muted/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2.5">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <span>{isAr ? "ترقية الباقة وتفعيل الاشتراك" : "Upgrade Plan & Activate Subscription"}</span>
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  {isAr
                    ? "اختر الباقة المناسبة وسدد عبر PayPal أو البطاقة البنكية للتفعيل الفوري، أو عبر BenefitPay باعتماد الإدارة."
                    : "Select your plan and pay via PayPal/Card for instant activation, or via BenefitPay with admin review."}
                </CardDescription>
              </div>
              {inlinePaymentMethod === "paypal" ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-bold gap-1.5 self-start sm:self-center">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{isAr ? "تفعيل فوري تلقائي" : "Instant Activation"}</span>
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-xs font-bold gap-1.5 self-start sm:self-center">
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span>{isAr ? "تفعيل يدوي باعتماد الإدارة" : "Admin Approval Required"}</span>
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-5 pb-6">
            {/* Step 1: Tier Selector & Billing Cycle */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground">
                  {isAr ? "1. اختر الباقة ودورة الفوترة:" : "1. Select Plan & Billing Interval:"}
                </span>

                {/* Billing Cycle Switcher */}
                <div className="inline-flex items-center p-1 rounded-xl bg-muted/60 border border-border/60 self-start sm:self-auto">
                  <Button
                    type="button"
                    variant={upgradeBillingInterval === "monthly" ? "default" : "ghost"}
                    size="sm"
                    className="h-8 text-xs font-bold px-3 rounded-lg"
                    onClick={() => setUpgradeBillingInterval("monthly")}
                  >
                    {isAr ? "اشتراك شهري" : "Monthly"}
                  </Button>
                  <Button
                    type="button"
                    variant={upgradeBillingInterval === "annual" ? "default" : "ghost"}
                    size="sm"
                    className="h-8 text-xs font-bold px-3 rounded-lg gap-1.5"
                    onClick={() => setUpgradeBillingInterval("annual")}
                  >
                    <span>{isAr ? "اشتراك سنوي" : "Annual"}</span>
                    <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold px-1.5 py-0 border-0">
                      {isAr ? "وفّر شهرين!" : "2 Mos Free"}
                    </Badge>
                  </Button>
                </div>
              </div>

              {/* Dynamic Plan Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {upgradeEligiblePlans.filter((p: any) => p.code !== "enterprise").map((plan: any) => {
                  const isSelected = (inlineSelectedPlan?.id === plan.id);
                  const isRecommended = plan.code === "pro";
                  const currentVer = getPlanCurrentVersion(plan);
                  const price = getPlanPrice(plan, upgradeBillingInterval);

                  return (
                    <div
                      key={plan.id}
                      onClick={() => setInlineSelectedPlanId(plan.id)}
                      className={`cursor-pointer relative p-4 rounded-2xl border transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                          : "border-border/70 hover:border-border hover:bg-muted/30 bg-card"
                      }`}
                    >
                      {isRecommended && (
                        <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground shadow-xs">
                          {isAr ? "الأكثر طلباً ⭐" : "Most Popular ⭐"}
                        </span>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-foreground">
                          {isAr ? plan.name_ar : plan.name_en}
                        </span>
                        {currentVer && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            v{currentVer.version_number}
                          </span>
                        )}
                      </div>

                      <div className="mt-2.5 flex items-baseline gap-1">
                        <span className="text-xl font-black text-primary font-mono">
                          {price.toFixed(3)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {isAr ? "د.ب" : "BHD"} / {upgradeBillingInterval === "annual" ? (isAr ? "سنة" : "year") : (isAr ? "شهر" : "mo")}
                        </span>
                      </div>

                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                        {isAr ? plan.description_ar : plan.description_en}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Payment Method Choice */}
            <div className="space-y-3 pt-2 border-t border-border/50">
              <span className="text-xs font-bold text-foreground block">
                {isAr ? "2. اختر وسيلة الدفع:" : "2. Select Payment Method:"}
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setInlinePaymentMethod("paypal")}
                  className={`h-auto p-4 rounded-2xl text-start transition-all flex flex-col justify-between items-start gap-3 w-full border ${
                    inlinePaymentMethod === "paypal"
                      ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                      : "border-border/70 hover:border-border hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-foreground">
                          PayPal & Cards
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {isAr ? "فيزا / ماستركارد / Apple Pay" : "Visa / Mastercard / Apple Pay"}
                        </div>
                      </div>
                    </div>
                    <Badge variant="default" className="text-[10px] font-bold bg-primary text-primary-foreground">
                      {isAr ? "تفعيل فوري" : "Instant"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-normal">
                    {isAr
                      ? "سداد إلكتروني مباشر عبر حساب PayPal أو أي بطاقة بنكية، وتفعيل فوري للباقة دون انتظار."
                      : "Instant online payment via PayPal account or bank card with automatic tier activation."}
                  </p>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setInlinePaymentMethod("benefit")}
                  className={`h-auto p-4 rounded-2xl text-start transition-all flex flex-col justify-between items-start gap-3 w-full border ${
                    inlinePaymentMethod === "benefit"
                      ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                      : "border-border/70 hover:border-border hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-xl bg-muted text-foreground flex items-center justify-center font-bold text-xs">
                        BP
                      </div>
                      <div>
                        <div className="text-xs font-bold text-foreground">
                          BenefitPay (Fawri+)
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {isAr ? "تحويل محلي بالدينار البحريني" : "Local BHD Transfer"}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground">
                      {isAr ? "اعتماد يدوي" : "Manual Review"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-normal">
                    {isAr
                      ? "تحويل فوري بدون رسوم بوابة عبر تطبيق بنفت باي، وإرفاق الإشعار لاعتماد الإدارة."
                      : "Zero gateway fees via BenefitPay app; submit receipt for admin approval."}
                  </p>
                </Button>
              </div>
            </div>

            {/* Instant PayPal / Card Checkout */}
            {inlinePaymentMethod === "paypal" && inlineSelectedPlan && (
              <div className="space-y-3 pt-2 border-t border-border/50">
                <span className="text-xs font-bold text-foreground block">
                  {isAr ? "3. إتمام الدفع والتفعيل الفوري:" : "3. Complete Payment & Instant Activation:"}
                </span>

                <PayPalSubscriptionButton
                  brandId={brandId}
                  targetPlanId={inlineSelectedPlan.id}
                  planNameAr={inlineSelectedPlan.name_ar}
                  planNameEn={inlineSelectedPlan.name_en}
                  bhdAmount={activeInlinePrice}
                  billingInterval={upgradeBillingInterval}
                  isAr={isAr}
                  onSuccess={handlePaymentSuccess}
                />
              </div>
            )}

            {/* Manual BenefitPay Transfer Section */}
            {inlinePaymentMethod === "benefit" && (
              <>
                {/* Step 3: BenefitPay Account & Transfer Instructions */}
                <div className="space-y-3 pt-2 border-t border-border/50">
                  <span className="text-xs font-bold text-foreground block">
                    {isAr ? "3. تفاصيل التحويل عبر BenefitPay (Fawri+):" : "3. BenefitPay Transfer Details (Fawri+):"}
                  </span>

                  {/* Dynamic Due Amount Banner */}
                  <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">
                      {isAr ? "المبلغ الإجمالي المطلوب تحويله:" : "Total Amount Due:"}
                    </span>
                    <div className="flex items-baseline gap-1.5 font-bold">
                      <span className="text-2xl font-black text-primary font-mono">
                        {activeInlinePrice.toFixed(3)}
                      </span>
                      <span className="text-sm font-bold text-primary">
                        {isAr ? "دينار بحريني" : "BHD"}
                      </span>
                      <span className="text-xs text-muted-foreground font-normal ms-1">
                        ({upgradeBillingInterval === "annual" ? (isAr ? "اشتراك سنوي كامل" : "Full Annual") : (isAr ? "اشتراك شهري" : "Monthly")})
                      </span>
                    </div>
                  </div>

                  {/* QR and IBAN */}
                  <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4 p-4 rounded-2xl bg-muted/20 border border-border/60">
                    <div className="flex flex-col items-center justify-center p-3 rounded-xl border border-border/60 bg-background text-center">
                      {systemSettings?.benefit_pay_qr_url ? (
                        <img
                          src={systemSettings.benefit_pay_qr_url}
                          alt="BenefitPay QR"
                          className="mx-auto aspect-square w-32 object-contain rounded-lg"
                        />
                      ) : (
                        <div className="mx-auto grid aspect-square w-32 place-items-center rounded-lg bg-muted text-muted-foreground">
                          <QrCode className="h-10 w-10 text-primary/70" />
                        </div>
                      )}
                      <span className="mt-2 text-[11px] font-bold text-foreground">
                        {systemSettings?.merchant_account_name || "BOUTQ-OFFICIAL"}
                      </span>
                    </div>

                    <div className="space-y-3 flex flex-col justify-center">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                          {isAr ? "رقم الآيبان الرسمي (IBAN):" : "Official IBAN:"}
                        </span>
                        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-border/80 bg-background">
                          <code dir="ltr" className="break-all text-xs font-bold font-mono text-foreground">
                            {systemSettings?.subscription_iban || "BH12KHCB0000001234567890"}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCopyIban}
                            className="h-8 text-xs font-bold shrink-0 gap-1"
                          >
                            {copiedIban ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                                <span className="text-emerald-600">{isAr ? "تم النسخ" : "Copied"}</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>{isAr ? "نسخ" : "Copy"}</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="text-[11px] text-muted-foreground space-y-1">
                        <p className="font-semibold text-foreground">
                          {isAr ? "طريقة الدفع في تطبيق BenefitPay:" : "How to transfer in BenefitPay:"}
                        </p>
                        <p>• {isAr ? "افتح تطبيق بنفت باي واختر تحويل فوري Fawri+." : "Open BenefitPay app and select Fawri+ transfer."}</p>
                        <p>• {isAr ? "الصق رقم الآيبان أعلاه، وتأكد من كتابة المبلغ المطلوب بدقة." : "Paste the IBAN above and enter the exact total amount."}</p>
                        <p>• {isAr ? "احفظ صورة إشعار التحويل المالي أو لقطة شاشة للعملية." : "Save the confirmation receipt screenshot after transfer."}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 4: Receipt Upload & Submit */}
                <div className="space-y-3 pt-2 border-t border-border/50">
                  <span className="text-xs font-bold text-foreground block">
                    {isAr ? "4. إرفاق صورة إشعار التحويل البنكي:" : "4. Upload Payment Receipt Screenshot:"}
                  </span>

                  {receiptPreview ? (
                    <div className="flex items-center justify-between gap-4 p-3.5 rounded-2xl border border-primary/30 bg-primary/5">
                      <div className="flex items-center gap-3">
                        <img
                          src={receiptPreview}
                          alt="Receipt Preview"
                          className="h-16 w-16 object-cover rounded-xl border border-border"
                        />
                        <div>
                          <p className="text-xs font-bold text-foreground line-clamp-1">{receiptFile?.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {receiptFile ? (receiptFile.size / 1024 / 1024).toFixed(2) : 0} MB
                          </p>
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-bold mt-0.5">
                            <CheckCircle2 className="h-3 w-3" />
                            {isAr ? "جاهز للإرسال" : "Ready for submission"}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setReceiptFile(null);
                          setReceiptPreview(null);
                        }}
                      >
                        {isAr ? "إزالة الصورة" : "Remove"}
                      </Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-background/50 hover:bg-primary/5 cursor-pointer transition-colors group">
                      <UploadCloud className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="mt-2 text-xs font-bold text-foreground">
                        {isAr ? "انقر لاختيار صورة الإيصال أو اسحب الملف إلى هنا" : "Click to select receipt or drag & drop"}
                      </span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">
                        PNG, JPG, WebP {isAr ? "حتى 10 ميجابايت" : "up to 10MB"}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleReceiptFileChange}
                        disabled={isUploadingReceipt}
                      />
                    </label>
                  )}

                  {/* Clarification Notice: Manual Super-Admin Approval */}
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                    <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-800 dark:text-amber-300">
                        {isAr ? "ملاحظة هامة حول آلية التفعيل:" : "Important Activation Note:"}
                      </p>
                      <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5 leading-relaxed">
                        {isAr
                          ? "التفعيل ليس تلقائياً أو فورياً. بعد إرسال الإيصال، يقوم السوبر أدمن بالتحقق من استلام المبلغ في الحساب البنكي ثم تفعيل الباقة والموارد الجديدة لحساب متجرك يدوياً."
                          : "Activation is not instant. After submitting the receipt, the super-admin verifies the bank transfer and manually activates your upgraded tier."}
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="lg"
                    disabled={!receiptFile || isUploadingReceipt}
                    onClick={() => void handleUploadAndConfirmUpgrade(inlineSelectedPlan)}
                    className="w-full min-h-[48px] text-sm font-bold gap-2 shadow-md bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {isUploadingReceipt ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{isAr ? "جاري رفع الإيصال وإرساله للاعتماد..." : "Uploading & Submitting for Approval..."}</span>
                      </>
                    ) : (
                      <>
                        <PackageCheck className="h-4.5 w-4.5" />
                        <span>
                          {isAr
                            ? `إرسال الإيصال لاعتماد السوبر أدمن (${activeInlinePrice.toFixed(3)} د.ب)`
                            : `Submit Receipt for Super-Admin Approval (${activeInlinePrice.toFixed(3)} BHD)`}
                        </span>
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* When pending verification, show prominent reassurance card right in place */}
      {shouldShowInlineUpgradeCard && isPendingVerification && (
        <Card className="border border-amber-500/30 bg-amber-500/5 shadow-sm rounded-3xl overflow-hidden p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <Clock className="h-7 w-7 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-500 hover:bg-amber-500 text-white font-bold text-xs">
                    {isAr ? "طلب الترقية قيد المراجعة" : "Upgrade Pending Verification"}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    BenefitPay Fawri+
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground mt-2">
                  {isAr
                    ? "تم استلام إشعار التحويل بنجاح، جاري التحقق من الدفع"
                    : "Payment Receipt Received, Verification in Progress"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                  {isAr
                    ? "يقوم فريق إدارة المنصة بمطابقة رقم الحوالة وإشعار التحويل البنكي لحساب متجرك. سيتم اعتماد الترقية وتفعيل باقتك فور المطابقة دون توقف لخدمات المتجر."
                    : "Our operations team is currently matching your BenefitPay transfer receipt. Your upgraded tier and quotas will activate immediately upon verification."}
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="shrink-0 text-xs font-bold gap-2 min-h-[44px]"
              onClick={() => {
                setSelectedPlanForUpgrade(inlineSelectedPlan);
                setIsUpgradeModalOpen(true);
              }}
            >
              <UploadCloud className="h-4 w-4" />
              <span>{isAr ? "رفع إشعار تحويل بديل" : "Re-upload Receipt"}</span>
            </Button>
          </div>
        </Card>
      )}

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
            currentUsage={usageSummary.products?.current_usage ?? (usageSnapshots["products.limit"]?.current_usage || 0)}
            limitValue={usageSummary.products?.limit_value ?? (entitlements?.limits["products.limit"] ?? 25)}
            isUnlimited={usageSummary.products?.is_unlimited ?? (entitlements?.limits["products.limit"] === -1)}
            unitAr="منتج"
            unitEn="items"
          />

          {/* Monthly Orders Meter */}
          <UsageMeterBar
            labelAr="طلبات المتجر الشهرية"
            labelEn="Monthly Orders Quota"
            currentUsage={usageSummary.orders?.current_usage ?? (usageSnapshots["orders.monthly_limit"]?.current_usage || 0)}
            limitValue={usageSummary.orders?.limit_value ?? (entitlements?.limits["orders.monthly_limit"] ?? 50)}
            isUnlimited={usageSummary.orders?.is_unlimited ?? (entitlements?.limits["orders.monthly_limit"] === -1)}
            unitAr="طلب"
            unitEn="orders"
          />

          {/* Monthly API Requests Meter */}
          <UsageMeterBar
            labelAr="استدعاءات الـ API الشهرية"
            labelEn="Monthly API Requests"
            currentUsage={usageSummary.api_requests?.current_usage ?? (usageSnapshots["api.monthly_requests"]?.current_usage || 0)}
            limitValue={usageSummary.api_requests?.limit_value ?? (entitlements?.limits["api.monthly_requests"] ?? 2500)}
            isUnlimited={usageSummary.api_requests?.is_unlimited ?? (entitlements?.limits["api.monthly_requests"] === -1)}
            unitAr="استدعاء"
            unitEn="reqs"
          />

          {/* Abandoned Cart Messages */}
          <UsageMeterBar
            labelAr="رسائل استرجاع السلات المتروكة"
            labelEn="Abandoned Cart Messages"
            currentUsage={usageSummary.abandoned_cart_messages?.current_usage ?? (usageSnapshots["abandoned_carts.monthly_messages"]?.current_usage || 0)}
            limitValue={usageSummary.abandoned_cart_messages?.limit_value ?? (entitlements?.limits["abandoned_carts.monthly_messages"] ?? 50)}
            isUnlimited={usageSummary.abandoned_cart_messages?.is_unlimited ?? (entitlements?.limits["abandoned_carts.monthly_messages"] === -1)}
            unitAr="رسالة"
            unitEn="msgs"
          />

          {/* Team Staff Accounts */}
          <UsageMeterBar
            labelAr="أعضاء فريق العمل والموظفين"
            labelEn="Team Members Limit"
            currentUsage={usageSummary.team_members?.current_usage ?? (usageSnapshots["team.members_limit"]?.current_usage || 1)}
            limitValue={usageSummary.team_members?.limit_value ?? (entitlements?.limits["team.members_limit"] ?? 2)}
            isUnlimited={usageSummary.team_members?.is_unlimited ?? (entitlements?.limits["team.members_limit"] === -1)}
            unitAr="حساب"
            unitEn="members"
          />

          {/* Webhook Deliveries */}
          <UsageMeterBar
            labelAr="إرساليات الويب هوك الشهرية"
            labelEn="Monthly Webhook Deliveries"
            currentUsage={usageSummary.webhooks?.current_usage ?? (usageSnapshots["webhooks.monthly_deliveries"]?.current_usage || 0)}
            limitValue={usageSummary.webhooks?.limit_value ?? (entitlements?.limits["webhooks.monthly_deliveries"] ?? 5000)}
            isUnlimited={usageSummary.webhooks?.is_unlimited ?? (entitlements?.limits["webhooks.monthly_deliveries"] === -1)}
            unitAr="إرسالية"
            unitEn="events"
          />
        </div>
      </div>

      {/* 3. Active Unlocked Features Summary */}
      <Card className="border border-border bg-card shadow-sm rounded-2xl">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-4.5 w-4.5 text-primary" />
            <span>{isAr ? "الميزات والقدرات المفعلة في خطتك" : "Active Plan Entitlements & Features"}</span>
          </CardTitle>
          <CardDescription className="text-xs">
            {isAr
              ? "الميزات البرمجية والتسويقية المتاحة لمتجرك بناءً على باقتك الحالية."
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
          <span>{isAr ? "هل ترغب في إدارة اشتراكك؟" : "Manage your store plan?"}</span>
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

      {/* Upgrade / Change Plan & BenefitPay Payment Dialog */}
      {isUpgradeModalOpen && (
        <Dialog
          open={isUpgradeModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedPlanForUpgrade(null);
              setReceiptFile(null);
              setReceiptPreview(null);
            }
            setIsUpgradeModalOpen(open);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {!selectedPlanForUpgrade ? (
              // STEP 1: Plan Selection & Billing Interval Switcher
              <>
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

                {/* Billing Interval Switcher */}
                <div className="flex items-center justify-center p-1 bg-muted/60 rounded-xl max-w-xs mx-auto my-2 border border-border">
                  <button
                    type="button"
                    onClick={() => setUpgradeBillingInterval("monthly")}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                      upgradeBillingInterval === "monthly"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {isAr ? "اشتراك شهري" : "Monthly"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpgradeBillingInterval("annual")}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all relative ${
                      upgradeBillingInterval === "annual"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {isAr ? "اشتراك سنوي (وفّر شهرين!)" : "Annual (2 Mo Free!)"}
                  </button>
                </div>

                {/* Plans Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
                  {allPlans
                    .filter((p) => p.code !== "lifetime_founder" && p.code !== "trial")
                    .map((plan) => {
                      const isCurrent = plan.id === currentPlan.id;
                      const currentVer =
                        (plan as any).versions?.find((v: any) => v.is_current) ||
                        (plan as any).versions?.[0];
                      const monthlyPrice = currentVer?.price_monthly ?? 0;
                      const annualPrice = currentVer?.price_annual ?? 0;
                      const currency = currentVer?.currency || "BHD";
                      const effectivePrice =
                        upgradeBillingInterval === "annual" ? annualPrice : monthlyPrice;

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
                              <Badge
                                variant="outline"
                                className={plan.badge_color || "bg-primary/10 text-primary font-bold"}
                              >
                                {plan.code}
                              </Badge>
                              {isCurrent && (
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-500/10 text-emerald-600 font-bold text-[10px]"
                                >
                                  {isAr ? "خطتك الحالية" : "Current"}
                                </Badge>
                              )}
                              {currentVer && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  v{currentVer.version_number}
                                </span>
                              )}
                            </div>
                            <h4 className="text-base font-bold text-foreground">
                              {isAr ? plan.name_ar : plan.name_en}
                            </h4>
                            <p className="text-[11px] text-muted-foreground line-clamp-2">
                              {isAr ? plan.description_ar : plan.description_en}
                            </p>
                          </div>

                          <div className="pt-2 border-t border-border/50 space-y-3">
                            <div className="font-mono text-sm font-bold text-foreground">
                              {plan.code === "enterprise" ? (
                                <span>{isAr ? "اتفاقية خاصة" : "Custom Enterprise"}</span>
                              ) : currentVer ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-foreground">
                                      {effectivePrice}
                                    </span>
                                    <span className="text-xs text-muted-foreground font-normal">
                                      {currency} / {upgradeBillingInterval === "annual" ? (isAr ? "سنوياً" : "year") : (isAr ? "شهرياً" : "mo")}
                                    </span>
                                  </div>
                                  {upgradeBillingInterval === "annual" && Number(monthlyPrice) > 0 && (
                                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                      {isAr
                                        ? `(يعادل ${(Number(annualPrice) / 12).toFixed(1)} د.ب / شهرياً فقط)`
                                        : `(Equivalent to ${(Number(annualPrice) / 12).toFixed(1)} BHD/mo)`}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span>{isAr ? "حسب العرض" : "On Request"}</span>
                              )}
                            </div>

                            <Button
                              type="button"
                              variant={isCurrent ? "outline" : "default"}
                              size="sm"
                              disabled={isCurrent}
                              onClick={() => setSelectedPlanForUpgrade(plan)}
                              className="w-full font-bold text-xs min-h-[44px]"
                            >
                              {isCurrent
                                ? (isAr ? "الخطة الحالية" : "Current Plan")
                                : (isAr ? "اختيار الباقة والمتابعة للدفع" : "Select Plan & Pay")}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </>
            ) : (
              // STEP 2: BenefitPay Payment Checkout & Transfer Receipt Upload
              (() => {
                const currentVer =
                  selectedPlanForUpgrade.versions?.find((v: any) => v.is_current) ||
                  selectedPlanForUpgrade.versions?.[0];
                const duePrice =
                  upgradeBillingInterval === "annual"
                    ? currentVer?.price_annual ?? 0
                    : currentVer?.price_monthly ?? 0;
                const currency = currentVer?.currency || "BHD";
                const merchantName = systemSettings?.merchant_account_name || "BOUTQ-OFFICIAL";
                const iban = systemSettings?.subscription_iban || "BH12KHCB0000001234567890";
                const qrUrl = systemSettings?.benefit_pay_qr_url;

                return (
                  <div className="space-y-4">
                    <DialogHeader>
                      <div className="flex items-center justify-between">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedPlanForUpgrade(null)}
                          className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        >
                          {isAr ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
                          <span>{isAr ? "العودة لتغيير الباقة" : "Change Plan"}</span>
                        </Button>
                        <Badge variant="outline" className="font-mono text-xs">
                          {selectedPlanForUpgrade.code}
                        </Badge>
                      </div>

                      <DialogTitle className="text-lg font-bold flex items-center gap-2 mt-2">
                        <CreditCard className="h-5 w-5 text-primary" />
                        <span>{isAr ? "الدفع وتفعيل ترقية الباقة" : "Pay & Activate Plan Upgrade"}</span>
                      </DialogTitle>
                      <DialogDescription className="text-xs">
                        {isAr
                          ? "سدد إلكترونياً عبر PayPal أو البطاقة البنكية للتفعيل الفوري، أو حوّل عبر BenefitPay وارفع الإشعار للاعتماد."
                          : "Pay online via PayPal / Card for instant activation, or transfer via BenefitPay with receipt upload."}
                      </DialogDescription>
                    </DialogHeader>

                    {/* Order Summary Card */}
                    <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/80 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] text-muted-foreground block">
                          {isAr ? "الباقة ودورة الفوترة:" : "Selected Plan & Cycle:"}
                        </span>
                        <span className="text-sm font-bold text-foreground">
                          {isAr ? selectedPlanForUpgrade.name_ar : selectedPlanForUpgrade.name_en}
                          <span className="text-xs font-normal text-muted-foreground ms-1.5">
                            ({upgradeBillingInterval === "annual" ? (isAr ? "سنوي" : "Annual") : (isAr ? "شهري" : "Monthly")})
                          </span>
                        </span>
                      </div>
                      <div className="text-end">
                        <span className="text-[11px] text-muted-foreground block">
                          {isAr ? "المبلغ المستحق:" : "Total Amount:"}
                        </span>
                        <span className="text-lg font-black text-primary font-mono">
                          {duePrice} {currency}
                        </span>
                      </div>
                    </div>

                    {/* Payment Method Switcher in Dialog */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDialogPaymentMethod("paypal")}
                        className={`h-auto p-3.5 rounded-xl text-start transition-all flex flex-col justify-between items-start gap-2 border ${
                          dialogPaymentMethod === "paypal"
                            ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                            : "border-border/70 hover:border-border hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <span className="text-xs font-bold text-foreground">PayPal & Cards</span>
                          </div>
                          <Badge variant="default" className="text-[9px] font-bold bg-primary text-primary-foreground">
                            {isAr ? "تفعيل فوري" : "Instant"}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-normal">
                          {isAr ? "بطاقات فيزا، ماستركارد، Apple Pay" : "Visa, Mastercard, Apple Pay"}
                        </p>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDialogPaymentMethod("benefit")}
                        className={`h-auto p-3.5 rounded-xl text-start transition-all flex flex-col justify-between items-start gap-2 border ${
                          dialogPaymentMethod === "benefit"
                            ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                            : "border-border/70 hover:border-border hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground">BenefitPay</span>
                          </div>
                          <Badge variant="outline" className="text-[9px] font-semibold text-muted-foreground">
                            {isAr ? "اعتماد يدوي" : "Manual Review"}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-normal">
                          {isAr ? "تحويل محلي مباشر بالدينار" : "Direct Local BHD Transfer"}
                        </p>
                      </Button>
                    </div>

                    {/* PayPal & Cards Checkout in Dialog */}
                    {dialogPaymentMethod === "paypal" ? (
                      <div className="pt-2">
                        <PayPalSubscriptionButton
                          brandId={brandId}
                          targetPlanId={selectedPlanForUpgrade.id}
                          planNameAr={selectedPlanForUpgrade.name_ar}
                          planNameEn={selectedPlanForUpgrade.name_en}
                          bhdAmount={duePrice}
                          billingInterval={upgradeBillingInterval}
                          isAr={isAr}
                          onSuccess={handlePaymentSuccess}
                        />
                      </div>
                    ) : (
                      <>
                        {/* BenefitPay Transfer Details Card */}
                        <div className="p-4 rounded-2xl bg-primary/[0.03] border border-primary/20 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                BP
                              </div>
                              <div>
                                <h5 className="text-xs font-bold text-foreground">
                                  {isAr ? "بيانات التحويل عبر BenefitPay" : "BenefitPay Transfer Account"}
                                </h5>
                                <p className="text-[11px] text-muted-foreground font-mono">
                                  {merchantName}
                                </p>
                              </div>
                            </div>
                            {qrUrl && (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <QrCode className="h-3 w-3" />
                                <span>{isAr ? "رمز QR متاح" : "QR Available"}</span>
                              </Badge>
                            )}
                          </div>

                          {/* QR Display if available */}
                          {qrUrl && (
                            <div className="flex justify-center p-2 bg-background rounded-xl border border-border/50 max-w-[160px] mx-auto">
                              <img
                                src={qrUrl}
                                alt="BenefitPay QR"
                                className="max-h-36 w-auto object-contain rounded-lg"
                              />
                            </div>
                          )}

                          {/* IBAN Copy Box */}
                          <div className="p-3 rounded-xl bg-background border border-border flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] text-muted-foreground font-medium block">
                                {isAr ? "رقم الآيبان (IBAN):" : "IBAN Number:"}
                              </span>
                              <span className="font-mono text-xs font-bold text-foreground break-all select-all">
                                {iban}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleCopyIban}
                              className="shrink-0 h-8 px-2.5 text-xs gap-1.5"
                            >
                              {copiedIban ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  <span className="text-emerald-600 font-bold">{isAr ? "تم النسخ" : "Copied"}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" />
                                  <span>{isAr ? "نسخ" : "Copy"}</span>
                                </>
                              )}
                            </Button>
                          </div>

                          {/* Transfer Instructions */}
                          <div className="space-y-1 text-[11px] text-muted-foreground leading-relaxed pt-1">
                            <p>1. {isAr ? "افتح تطبيق BenefitPay واختر تحويل الأموال Fawri+." : "Open BenefitPay app and choose Fawri+ transfer."}</p>
                            <p>2. {isAr ? `حوّل المبلغ المطلوب (${duePrice} ${currency}) إلى رقم الآيبان الموضح أعلاه.` : `Transfer exact amount (${duePrice} ${currency}) to the IBAN above.`}</p>
                            <p>3. {isAr ? "احفظ لقطة شاشة لإشعار التحويل الناجح وارفعها في الحقل أدناه." : "Take a screenshot of the successful transfer receipt and upload below."}</p>
                          </div>
                        </div>

                        {/* Receipt Upload Input */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-foreground block">
                            {isAr ? "صورة إشعار التحويل (مطلوبة):" : "Transfer Receipt Screenshot (Required):"}
                          </label>

                          {!receiptPreview ? (
                            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-2xl cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all">
                              <UploadCloud className="h-8 w-8 text-primary mb-2" />
                              <span className="text-xs font-semibold text-foreground">
                                {isAr ? "اضغط هنا لاختيار صورة الإيصال" : "Click to select transfer receipt"}
                              </span>
                              <span className="text-[10px] text-muted-foreground mt-1">
                                PNG, JPG, WebP ({isAr ? "حتى 10 ميجابايت" : "up to 10MB"})
                              </span>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={handleReceiptFileChange}
                                className="hidden"
                              />
                            </label>
                          ) : (
                            <div className="p-3 rounded-2xl bg-muted/30 border border-border flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <img
                                  src={receiptPreview}
                                  alt="Receipt Preview"
                                  className="h-14 w-14 rounded-xl object-cover border border-border shrink-0"
                                />
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-foreground truncate block">
                                    {receiptFile?.name}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {receiptFile && (receiptFile.size / (1024 * 1024)).toFixed(2)} MB
                                  </span>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setReceiptFile(null);
                                  setReceiptPreview(null);
                                }}
                                className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
                              >
                                <X className="h-4 w-4 me-1" />
                                <span>{isAr ? "إزالة" : "Remove"}</span>
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Super-admin approval note */}
                        <p className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
                          {isAr
                            ? "تنويه: يتم تدقيق الإيصال واعتماد التفعيل يدوياً من السوبر أدمن فور مطابقة التحويل البنكي."
                            : "Note: The super-admin will manually verify the receipt and activate your plan upon bank transfer confirmation."}
                        </p>

                        {/* Confirmation Footer */}
                        <DialogFooter className="gap-2 sm:gap-0 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="default"
                            disabled={isUploadingReceipt}
                            onClick={() => setSelectedPlanForUpgrade(null)}
                            className="min-h-[44px]"
                          >
                            {isAr ? "العودة" : "Back"}
                          </Button>
                          <Button
                            type="button"
                            variant="default"
                            size="default"
                            disabled={!receiptFile || isUploadingReceipt}
                            onClick={handleUploadAndConfirmUpgrade}
                            className="font-bold min-h-[44px] gap-2 shadow-sm"
                          >
                            {isUploadingReceipt ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>{isAr ? "جاري الرفع والإرسال للاعتماد..." : "Uploading & Submitting..."}</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-4 w-4" />
                                <span>{isAr ? "إرسال الإيصال لاعتماد السوبر أدمن" : "Submit Receipt for Super-Admin Approval"}</span>
                              </>
                            )}
                          </Button>
                        </DialogFooter>
                      </>
                    )}
                  </div>
                );
              })()
            )}
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
