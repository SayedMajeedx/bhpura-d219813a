import React, { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Lock,
  Check,
  Sparkles,
  ArrowRight,
  LogOut,
  MessageCircle,
  CreditCard,
  Building2,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TrialExpiredPaywallProps {
  brand: {
    id: string;
    slug: string;
    name_ar?: string | null;
    name_en?: string | null;
    plan_type?: string | null;
    trial_ends_at?: string | null;
    subscription_status?: string | null;
  };
  reason?: "trial_expired" | "inactive";
}

export const TrialExpiredPaywall: React.FC<TrialExpiredPaywallProps> = ({
  brand,
  reason = "trial_expired",
}) => {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<string>("growth");
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const brandName = brand.name_ar || brand.name_en || brand.slug;

  const plans = [
    {
      id: "starter",
      nameAr: "باقة البداية",
      nameEn: "Starter Plan",
      descAr: "مثالية للبوتيكات الناشئة لتأسيس الحضور الرقمي واستقبال الطلبات.",
      descEn: "Perfect for emerging boutiques starting online sales.",
      priceMonthly: "15",
      priceAnnual: "144",
      featuresAr: [
        "إضافة حتى 50 عباية ومنتج",
        "واجهة متجر مخصصة وسريعة",
        "إشعارات الطلبات الفورية عبر واتساب",
        "تقارير المبيعات الأساسية",
      ],
      featuresEn: [
        "Up to 50 boutique products",
        "Custom high-speed storefront",
        "Instant WhatsApp order alerts",
        "Basic sales & inventory reports",
      ],
      badge: null,
    },
    {
      id: "growth",
      nameAr: "باقة النمو",
      nameEn: "Growth Plan",
      descAr: "الخيار الأكثر طلباً للبوتيكات المتوسعة التي تحتاج أدوات تسويقية متقدمة.",
      descEn: "Most popular for growing fashion boutiques requiring advanced growth tools.",
      priceMonthly: "35",
      priceAnnual: "336",
      featuresAr: [
        "منتجات وتصنيفات غير محدودة",
        "ربط دومين خاص مخصص",
        "استرجاع السلات المتروكة تلقائياً",
        "حملات الرسائل التسويقية للعملاء",
        "دعم فني وأولوية في المساعدة",
      ],
      featuresEn: [
        "Unlimited products & categories",
        "Custom boutique domain connection",
        "Automated abandoned carts recovery",
        "Targeted customer marketing campaigns",
        "Priority VIP support & assistance",
      ],
      badge: isAr ? "الأكثر طلباً" : "Most Popular",
    },
    {
      id: "pro",
      nameAr: "الباقة الاحترافية",
      nameEn: "Pro Plan",
      descAr: "للبراندات الكبرى والمشاغل التي تتطلب تكاملاً كاملاً وأتمتة شاملة.",
      descEn: "For established luxury fashion houses needing total automation.",
      priceMonthly: "60",
      priceAnnual: "576",
      featuresAr: [
        "جميع مزايا باقة النمو",
        "بوابة المرتجعات والاستبدال الآلية",
        "برنامج نقاط الولاء ومكافآت VIP",
        "ربط API وWebhooks مباشر",
        "إزالة شارة المنصة (White-label)",
      ],
      featuresEn: [
        "All Growth Plan features",
        "Automated returns & exchanges portal",
        "VIP loyalty points & rewards engine",
        "Direct API & Webhook integrations",
        "White-label branding removal",
      ],
      badge: isAr ? "شاملة المزايا" : "All-Inclusive",
    },
  ];

  const handleUpgradeViaWhatsApp = (planId: string) => {
    const selected = plans.find((p) => p.id === planId);
    const planTitle = isAr ? selected?.nameAr : selected?.nameEn;
    const intervalTitle = billingInterval === "annual" ? (isAr ? "سنوي" : "Annual") : (isAr ? "شهري" : "Monthly");
    const text = encodeURIComponent(
      `مرحباً فريق Boutq OS،\nأرغب بترقية وتفعيل متجري:\n- المتجر: ${brandName} (${brand.slug})\n- الباقة المطلوبة: ${planTitle} (${intervalTitle})\nيرجى تزويدي بطرق الدفع والتفعيل الفوري.`,
    );
    window.open(`https://wa.me/97339955508?text=${text}`, "_blank");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-4 sm:p-8 font-sans selection:bg-primary/20">
      {/* Top Bar with brand & signout */}
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between pb-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-base">
            <Building2 className="size-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground leading-none">{brandName}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">boutq.store/{brand.slug}</p>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
        >
          <LogOut className="size-4" />
          <span>{isAr ? "تسجيل الخروج" : "Sign Out"}</span>
        </Button>
      </div>

      {/* Main Lockout Notice & Paywall */}
      <div className="max-w-5xl w-full mx-auto my-auto py-8 space-y-8">
        {/* Banner Alert */}
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-start">
          <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
            <ShieldAlert className="size-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">
              {reason === "trial_expired"
                ? isAr
                  ? "انتهت الفترة التجريبية المجانية (3 أيام)"
                  : "3-Day Free Trial Has Expired"
                : isAr
                  ? "المتجر متوقف عن العمل حالياً"
                  : "Store Is Currently Suspended"}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              {isAr
                ? "لقد انتهت فترة الـ 3 أيام التجريبية الخاصة بمتجرك وتم إيقاف المتجر ولوحة التحكم مؤقتاً. للوصول إلى المنتجات والطلبات والعملاء وإعادة فتح المتجر للزوار، يرجى اختيار الباقة المناسبة والترقية الآن."
                : "Your 3-day free trial has concluded and your store access is temporarily paused. To unlock your dashboard, manage products and orders, and reopen your boutique to customers, please select a plan and upgrade."}
            </p>
          </div>
        </div>

        {/* Interval Selector */}
        <div className="flex items-center justify-center">
          <div className="inline-flex rounded-lg border border-border p-1 bg-muted/30">
            <button
              type="button"
              onClick={() => setBillingInterval("monthly")}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                billingInterval === "monthly"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isAr ? "دفع شهري" : "Monthly Billing"}
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("annual")}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                billingInterval === "annual"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{isAr ? "دفع سنوي" : "Annual Billing"}</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-600 px-1.5 py-0.2 rounded font-bold">
                {isAr ? "وفّر 20%" : "Save 20%"}
              </span>
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            const price = billingInterval === "annual" ? plan.priceAnnual : plan.priceMonthly;

            return (
              <Card
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`relative cursor-pointer transition-all rounded-xl border flex flex-col justify-between ${
                  isSelected
                    ? "border-primary ring-2 ring-primary/20 bg-card shadow-md"
                    : "border-border hover:border-primary/40 bg-card/60"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground font-bold text-[11px] px-3 shadow-sm">
                      {plan.badge}
                    </Badge>
                  </div>
                )}

                <CardHeader className="pt-6 pb-4">
                  <CardTitle className="text-base font-bold text-foreground flex items-center justify-between">
                    <span>{isAr ? plan.nameAr : plan.nameEn}</span>
                    {isSelected && (
                      <span className="size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                        <Check className="size-3" />
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground min-h-[32px] mt-1">
                    {isAr ? plan.descAr : plan.descEn}
                  </CardDescription>

                  <div className="pt-4 flex items-baseline gap-1 font-mono">
                    <span className="text-2xl font-extrabold text-foreground">{price}</span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {isAr ? "د.ب" : "BHD"} / {billingInterval === "annual" ? (isAr ? "سنة" : "yr") : (isAr ? "شهر" : "mo")}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2.5 pt-2 border-t border-border/60">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    {isAr ? "المزايا المشمولة:" : "Included Features:"}
                  </p>
                  {(isAr ? plan.featuresAr : plan.featuresEn).map((feature, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-foreground/90">
                      <Check className="size-3.5 text-primary shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </CardContent>

                <CardFooter className="pt-4 border-t border-border/60">
                  <Button
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    className="w-full font-bold text-xs min-h-[44px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpgradeViaWhatsApp(plan.id);
                    }}
                  >
                    <MessageCircle className="size-4 me-1.5" />
                    <span>{isAr ? "ترقية وتفعيل المتجر فوراً" : "Upgrade & Activate Now"}</span>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Support footer */}
      <div className="max-w-5xl w-full mx-auto text-center pt-6 border-t border-border text-xs text-muted-foreground">
        {isAr
          ? "تحتاج إلى مساعدة أو لديك استفسار حول الباقات؟ تواصل مع فريق خدمة عملاء بوتك عبر الواتساب على 97339955508+"
          : "Need assistance or have plan questions? Contact Boutq concierge on WhatsApp at +973 39955508"}
      </div>
    </div>
  );
};
