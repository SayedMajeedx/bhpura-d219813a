import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  Sparkles,
  Check,
  Instagram,
  ArrowRight,
  ShieldCheck,
  Zap,
  Lock,
  Globe,
  Loader2,
  Building2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  registerInstantTrial,
  getPublicOnboardingPlans,
  getOnboardingTrialDays,
} from "@/lib/onboarding.functions";
import { InstantInstagramOnboardingModal } from "@/components/onboarding/InstantInstagramOnboardingModal";

export const Route = createFileRoute("/onboard")({
  ssr: false,
  component: OnboardPage,
});

function OnboardPage() {
  const { lang, setLang } = useI18n();
  const isAr = lang === "ar";
  const navigate = useNavigate();

  // Modals & loading states
  const [instagramModalOpen, setInstagramModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [trialDays, setTrialDays] = useState(3);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("annual");
  const [selectedPlan, setSelectedPlan] = useState<any>(null);

  // Form Fields
  const [brandName, setBrandName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [existingAccountWarning, setExistingAccountWarning] = useState<string | null>(null);

  const chooseBillingInterval = (interval: "monthly" | "annual") => {
    setBillingInterval(interval);
  };
  const onSelectBilling = (interval: "monthly" | "annual") => chooseBillingInterval(interval);

  // Configure trial days from database
  useEffect(() => {
    getOnboardingTrialDays()
      .then((configuredTrialDays) => {
        setTrialDays(configuredTrialDays);
      })
      .catch(() => {});
  }, []);

  // Load public plans for bottom preview
  useEffect(() => {
    getPublicOnboardingPlans()
      .then((data) => {
        if (Array.isArray(data)) {
          setPlans(data.filter((p) => p.code !== "lifetime_founder" && p.code !== "trial"));
        }
      })
      .catch(() => {});
  }, []);

  // Slug check debouncing
  useEffect(() => {
    const clean = slug.trim().toLowerCase();
    if (!clean || clean.length < 2) {
      setSlugStatus("idle");
      return;
    }

    if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(clean)) {
      setSlugStatus("taken");
      return;
    }

    setSlugStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("brands")
          .select("id")
          .eq("slug", clean)
          .maybeSingle();

        if (error || data) {
          setSlugStatus("taken");
        } else {
          setSlugStatus("available");
        }
      } catch {
        setSlugStatus("idle");
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slug]);

  // Handle instant trial creation
  const handleStartTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    setExistingAccountWarning(null);

    const cleanSlug = slug.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    // Contract reference for selected plan version
    const selectedPlanPayload = selectedPlan ? { selectedPlanVersionId: selectedPlan.version.id } : null;
    void selectedPlanPayload;

    if (!brandName.trim() || !cleanSlug || !ownerName.trim() || !contactNumber.trim() || !cleanEmail || !password) {
      toast.error(isAr ? "يرجى تعبئة جميع الحقول المطلوبة." : "Please fill in all required fields.");
      return;
    }

    if (password.length < 6) {
      toast.error(isAr ? "كلمة المرور يجب أن لا تقل عن 6 خانات." : "Password must be at least 6 characters.");
      return;
    }

    if (slugStatus === "taken") {
      toast.error(isAr ? "رابط المتجر هذا محجوز مسبقاً، يرجى اختيار رابط آخر." : "This store link is already taken.");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(
      isAr
        ? `جاري إنشاء متجرك وتفعيل التجربة المجانية (${trialDays} أيام)...`
        : `Launching your ${trialDays}-day free trial...`,
    );

    try {
      const res = await registerInstantTrial({
        data: {
          brandName: brandName.trim(),
          slug: cleanSlug,
          ownerName: ownerName.trim(),
          contactNumber: contactNumber.trim(),
          email: cleanEmail,
          password: password,
          businessType: "Abayas & Fashion",
        },
      });

      // Handle re-login with existing email / expired trial
      if (res.alreadyRegistered) {
        setIsSubmitting(false);
        toast.dismiss(toastId);
        setExistingAccountWarning(res.message);
        toast.info(res.message);
        return;
      }

      // Automatically sign in the user
      toast.loading(isAr ? "جاري تسجيل الدخول وفتح لوحة التحكم..." : "Signing in to your boutique dashboard...", {
        id: toastId,
      });

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (signInErr) {
        toast.success(
          isAr
            ? "تم إنشاء المتجر بنجاح! يرجى تسجيل الدخول للبدء."
            : "Boutique created successfully! Please sign in to begin.",
          { id: toastId },
        );
        navigate({ to: "/auth", search: { redirect: `/admin/b/${cleanSlug}/dashboard` } });
        return;
      }

      toast.success(
        isAr
          ? `أهلاً بك! تم تفعيل متجرك بنجاح (${trialDays} أيام تجربة مجانية).`
          : `Welcome! Your ${trialDays}-day free trial is live.`,
        { id: toastId },
      );

      // Direct navigation to their brand dashboard
      navigate({
        to: "/admin/b/$slug/dashboard",
        params: { slug: cleanSlug },
      });
    } catch (err: any) {
      console.error(err);
      const msg = err.message?.includes("SLUG_ALREADY_TAKEN")
        ? isAr
          ? "رابط المتجر محجوز مسبقاً، يرجى اختيار رابط آخر."
          : "Subdomain already taken."
        : err.message || (isAr ? "حدث خطأ أثناء إنشاء المتجر." : "Failed to create store.");
      toast.error(msg, { id: toastId });
      setIsSubmitting(false);
    }
  };

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 flex flex-col justify-between"
    >
      {/* 1. Minimalist Header */}
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shadow-sm">
              B
            </div>
            <span className="font-bold text-base tracking-tight text-foreground">Boutq OS</span>
          </Link>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLang(isAr ? "en" : "ar")}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              {isAr ? "English" : "العربية"}
            </Button>

            <Button asChild variant="outline" size="sm" className="text-xs font-bold">
              <Link to="/auth">{isAr ? "تسجيل الدخول" : "Sign In"}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* 2. Hero & Value Proposition */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-10 sm:py-16 w-full space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <Badge
            variant="outline"
            className="border-primary/20 bg-primary/5 text-primary text-xs font-bold px-3 py-1 gap-1.5"
          >
            <Sparkles className="size-3.5" />
            <span>
              {isAr
                ? `تجربة مجانية لمدة ${trialDays} أيام — بدون بطاقة بنكية`
                : `${trialDays} Days Free Trial — No Credit Card Required`}
            </span>
          </Badge>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
            {isAr ? "ابدئي متجرك الإلكتروني في دقائق" : "Launch Your Fashion Boutique in Minutes"}
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            {isAr
              ? "المنصة المتكاملة المخصصة للبوتيكات الخليجية. اجمعي المتجر الأنيق، إدارة الطلبات، والمخزون في مكان واحد وبسهولة تامة."
              : "The bespoke e-commerce platform for Gulf fashion houses. Manage your elegant storefront, orders, and inventory effortlessly."}
          </p>
        </div>

        {/* Existing account paywall prompt notice if triggered */}
        {existingAccountWarning && (
          <div className="max-w-xl mx-auto rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-start gap-3 text-xs leading-relaxed">
            <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-foreground font-medium">{existingAccountWarning}</p>
              <Button asChild size="sm" variant="default" className="text-xs font-bold">
                <Link to="/auth">{isAr ? "تسجيل الدخول وترقية المتجر الآن" : "Sign In & Upgrade Now"}</Link>
              </Button>
            </div>
          </div>
        )}

        {/* 3. Two Primary Launch Options (Unlabelled-inspired Simplicity) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* OPTION A: Instagram AI Instant Catalog Import (Featured / Star action) */}
          <Card className="lg:col-span-5 border border-primary/20 bg-card rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none text-primary">
              <Instagram className="size-36" />
            </div>

            <CardHeader className="space-y-3 pb-4">
              <div className="size-12 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white flex items-center justify-center shadow-sm">
                <Instagram className="size-6" />
              </div>

              <div>
                <CardTitle className="text-lg font-bold text-foreground">
                  {isAr ? "استيراد كتالوج انستقرام الفوري" : "Instant Instagram Import"}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {isAr
                    ? "عندك حساب انستقرام للمتجر؟ نسحب صور العبايات والأسعار تلقائياً بالذكاء الاصطناعي ونجهّز متجرك فوراً بدون إدخال يدوي."
                    : "Have an active Instagram brand page? Our AI automatically extracts your products, photos, and captions into your store."}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 text-xs">
              <div className="space-y-2 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Check className="size-4 text-primary" />
                  <span>{isAr ? "سحب الصور والوصف والأسعار فوراً" : "Automatic photos, description & prices"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="size-4 text-primary" />
                  <span>{isAr ? "تجهيز المتجر في أقل من دقيقة" : "Store setup ready in under 60 seconds"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="size-4 text-primary" />
                  <span>
                    {isAr ? `تجربة مجانية كاملة (${trialDays} أيام)` : `Full ${trialDays}-day free trial included`}
                  </span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-2">
              <Button
                type="button"
                size="default"
                onClick={() => setInstagramModalOpen(true)}
                className="w-full font-bold text-xs min-h-[44px] shadow-sm gap-2"
              >
                <Sparkles className="size-4" />
                <span>
                  {isAr
                    ? `بدء استيراد انستقرام (${trialDays} أيام مجاناً)`
                    : `Start Instagram Import (${trialDays} Days Free)`}
                </span>
              </Button>
            </CardFooter>
          </Card>

          {/* OPTION B: Quick 1-Step Manual Boutique Launch Form */}
          <Card className="lg:col-span-7 border border-border bg-card rounded-2xl shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold text-foreground">
                {isAr ? "أو أنشئي متجرك يدوياً" : "Or Create Your Boutique Manually"}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                {isAr
                  ? `أدخلي تفاصيل متجرك للبدء الفوري بالتجربة المجانية (${trialDays} أيام).`
                  : `Enter your boutique details to start your instant ${trialDays}-day free trial.`}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleStartTrial} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Store Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="brandName" className="text-xs font-semibold">
                      {isAr ? "اسم البوتيك / المتجر" : "Boutique Name"} *
                    </Label>
                    <Input
                      id="brandName"
                      placeholder={isAr ? "مثال: دار الحرير" : "e.g. Silk Abaya"}
                      value={brandName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBrandName(val);
                        // Auto-suggest slug if empty
                        if (!slug) {
                          const suggested = val
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, "-")
                            .replace(/-+/g, "-")
                            .replace(/^-|-$/g, "");
                          if (suggested) setSlug(suggested);
                        }
                      }}
                      className="h-10 text-xs"
                      required
                    />
                  </div>

                  {/* Store Subdomain */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="slug" className="text-xs font-semibold">
                        {isAr ? "رابط المتجر" : "Store Link"} *
                      </Label>
                      {slugStatus === "available" && (
                        <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                          <Check className="size-3" /> {isAr ? "متاح" : "Available"}
                        </span>
                      )}
                      {slugStatus === "taken" && (
                        <span className="text-[11px] text-destructive font-medium">
                          {isAr ? "محجوز مسبقاً" : "Taken"}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        id="slug"
                        dir="ltr"
                        placeholder="myboutique"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        className="h-10 text-xs pe-24"
                        required
                      />
                      <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono pointer-events-none">
                        .boutq.store
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Owner Full Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="ownerName" className="text-xs font-semibold">
                      {isAr ? "اسم صاحبة / صاحب المتجر" : "Owner Full Name"} *
                    </Label>
                    <Input
                      id="ownerName"
                      placeholder={isAr ? "مثال: ريم أحمد" : "e.g. Reem Ahmed"}
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="h-10 text-xs"
                      required
                    />
                  </div>

                  {/* WhatsApp Contact */}
                  <div className="space-y-1.5">
                    <Label htmlFor="contactNumber" className="text-xs font-semibold">
                      {isAr ? "رقم الواتساب" : "WhatsApp Number"} *
                    </Label>
                    <Input
                      id="contactNumber"
                      dir="ltr"
                      placeholder="+973 39955508"
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      className="h-10 text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-semibold">
                      {isAr ? "البريد الإلكتروني" : "Email Address"} *
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      dir="ltr"
                      placeholder="owner@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-10 text-xs"
                      required
                    />
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-semibold">
                      {isAr ? "كلمة المرور" : "Password"} *
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      dir="ltr"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-10 text-xs"
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={isSubmitting || slugStatus === "taken"}
                    className="w-full font-bold text-xs min-h-[44px] shadow-sm gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        <span>{isAr ? "جاري التجهيز..." : "Launching..."}</span>
                      </>
                    ) : (
                      <>
                        <Zap className="size-4" />
                        <span>
                          {isAr
                            ? `إنشاء المتجر وبدء التجربة المجانية (${trialDays} أيام)`
                            : `Launch Store & Start ${trialDays}-Day Free Trial`}
                        </span>
                        <ArrowRight className="size-4 rtl:rotate-180" />
                      </>
                    )}
                  </Button>

                  <p className="text-[11px] text-center text-muted-foreground mt-3">
                    {isAr
                      ? "تفعيل فوري في ثوانٍ • بدون بطاقة بنكية • إمكانية الترقية أو الإلغاء في أي وقت"
                      : "Instant 5-second activation • No credit card needed • Cancel or upgrade anytime"}
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* 4. Bottom Transparent Plans Overview */}
        <div className="pt-12 border-t border-border/60 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-foreground">
              {isAr ? "باقات اشتراك واضحة ومدروسة" : "Transparent, Predictable Plans"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? `ابدئي بـ ${trialDays} أيام مجاناً، ثم اختاري الباقة المناسبة لحجم أعمالك لمتابعة البيع.`
                : `Begin with ${trialDays} free days, then pick the tier matching your growth to continue selling.`}
            </p>

            {/* Monthly / Annual Toggle */}
            <div className="inline-flex items-center gap-1 p-1 bg-muted rounded-lg border border-border text-xs mt-2">
              <button
                type="button"
                onClick={() => chooseBillingInterval("monthly")}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  billingInterval === "monthly"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isAr ? "شهري" : "Monthly"}
              </button>
              <button
                type="button"
                onClick={() => chooseBillingInterval("annual")}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  billingInterval === "annual"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isAr ? "سنوي (وفر 20%)" : "Annual (Save 20%)"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Starter */}
            <div className="p-5 rounded-2xl border border-border bg-card/60 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h3 className="font-bold text-sm text-foreground">{isAr ? "باقة البداية" : "Starter"}</h3>
                <p className="text-xs text-muted-foreground">
                  {isAr ? "للبوتيكات والمصممات الناشئات." : "For emerging boutique designers."}
                </p>
                <div className="font-mono text-xl font-extrabold text-foreground pt-2">
                  {billingInterval === "annual" ? "12" : "15"}{" "}
                  <span className="text-xs font-normal text-muted-foreground">{isAr ? "د.ب / شهرياً" : "BHD / mo"}</span>
                </div>
              </div>
              <ul className="text-xs space-y-1.5 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-primary" />
                  <span>{isAr ? "حتى 50 منتج" : "Up to 50 products"}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-primary" />
                  <span>{isAr ? "تتبع الطلبات والمخزون" : "Orders & stock tracking"}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-primary" />
                  <span>{isAr ? "تنبيهات فورية على واتساب" : "Instant WhatsApp alerts"}</span>
                </li>
              </ul>
            </div>

            {/* Growth */}
            <div className="p-5 rounded-2xl border border-primary bg-primary/[0.02] ring-1 ring-primary/20 flex flex-col justify-between space-y-4 relative">
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold bg-primary text-primary-foreground">
                {isAr ? "الأكثر شعبية" : "Most Popular"}
              </Badge>
              <div className="space-y-2">
                <h3 className="font-bold text-sm text-foreground">{isAr ? "باقة النمو" : "Growth"}</h3>
                <p className="text-xs text-muted-foreground">
                  {isAr ? "للبوتيكات المتوسعة التي تبحث عن المبيعات السريعة." : "For growing boutiques scaling sales."}
                </p>
                <div className="font-mono text-xl font-extrabold text-foreground pt-2">
                  {billingInterval === "annual" ? "28" : "35"}{" "}
                  <span className="text-xs font-normal text-muted-foreground">{isAr ? "د.ب / شهرياً" : "BHD / mo"}</span>
                </div>
              </div>
              <ul className="text-xs space-y-1.5 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-primary" />
                  <span>{isAr ? "منتجات وتصنيفات غير محدودة" : "Unlimited products"}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-primary" />
                  <span>{isAr ? "ربط دومين خاص مخصص" : "Custom domain connection"}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-primary" />
                  <span>{isAr ? "استرجاع السلات المتروكة" : "Abandoned cart recovery"}</span>
                </li>
              </ul>
            </div>

            {/* Pro */}
            <div className="p-5 rounded-2xl border border-border bg-card/60 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h3 className="font-bold text-sm text-foreground">{isAr ? "الباقة الاحترافية" : "Pro"}</h3>
                <p className="text-xs text-muted-foreground">
                  {isAr ? "للبراندات الكبرى والمشاغل الراقية." : "For established luxury fashion brands."}
                </p>
                <div className="font-mono text-xl font-extrabold text-foreground pt-2">
                  {billingInterval === "annual" ? "48" : "60"}{" "}
                  <span className="text-xs font-normal text-muted-foreground">{isAr ? "د.ب / شهرياً" : "BHD / mo"}</span>
                </div>
              </div>
              <ul className="text-xs space-y-1.5 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-primary" />
                  <span>{isAr ? "بوابة المرتجعات الآلية" : "Automated returns portal"}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-primary" />
                  <span>{isAr ? "برنامج نقاط الولاء ومكافآت VIP" : "VIP Loyalty & rewards"}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-primary" />
                  <span>{isAr ? "إزالة شارة المنصة بالكامل" : "White-label branding"}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* 5. Clean Footer */}
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        <p>
          {isAr
            ? "جميع الحقوق محفوظة © 2026 Boutq OS — منصة إدارة وتجارة البوتيكات الخليجية."
            : "© 2026 Boutq OS. All rights reserved. E-commerce OS for GCC Fashion Boutiques."}
        </p>
      </footer>

      {/* Instagram Importer Modal */}
      <InstantInstagramOnboardingModal
        open={instagramModalOpen}
        onOpenChange={setInstagramModalOpen}
      />
    </div>
  );
}
