import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Check,
  ArrowRight,
  Zap,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Smartphone,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StorefrontLivePreview } from "@/components/onboarding/StorefrontLivePreview";
import {
  registerInstantTrial,
  getPublicOnboardingPlans,
  getOnboardingTrialDays,
} from "@/lib/onboarding.functions";

function arabicToLatinSlug(text: string): string {
  const map: Record<string, string> = {
    أ: "a",
    إ: "e",
    آ: "a",
    ا: "a",
    ب: "b",
    ت: "t",
    ث: "th",
    ج: "j",
    ح: "h",
    خ: "kh",
    د: "d",
    ذ: "th",
    ر: "r",
    ز: "z",
    س: "s",
    ش: "sh",
    ص: "s",
    ض: "d",
    ط: "t",
    ظ: "z",
    ع: "a",
    غ: "gh",
    ف: "f",
    ق: "q",
    ك: "k",
    ل: "l",
    م: "m",
    ن: "n",
    ه: "h",
    و: "w",
    ي: "y",
    ى: "a",
    ة: "h",
    ء: "a",
    ئ: "e",
    ؤ: "o",
    پ: "p",
    چ: "ch",
    ڤ: "v",
    گ: "g",
  };

  let result = "";
  for (const char of text) {
    if (map[char]) {
      result += map[char];
    } else if (/[a-zA-Z0-9]/.test(char)) {
      result += char.toLowerCase();
    } else if (/[\s\-_]/.test(char)) {
      result += "-";
    }
  }
  return result.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
}

export const Route = createFileRoute("/onboard")({
  ssr: false,
  component: OnboardPage,
});

function OnboardPage() {
  const { lang, setLang } = useI18n();
  const isAr = lang === "ar";
  const navigate = useNavigate();

  // Modals & loading states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [trialDays, setTrialDays] = useState(3);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("annual");
  const [platformBillingMode, setPlatformBillingMode] = useState<
    "both" | "monthly_only" | "annual_only"
  >("both");
  const [selectedPlan] = useState<any>(null);

  // Form Fields
  const [brandName, setBrandName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [slugArabicWarning, setSlugArabicWarning] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [existingAccountWarning, setExistingAccountWarning] = useState<string | null>(null);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  const chooseBillingInterval = (interval: "monthly" | "annual") => {
    setBillingInterval(interval);
  };
  const onSelectBilling = (interval: "monthly" | "annual") => chooseBillingInterval(interval);
  void onSelectBilling;

  // Configure trial days from database
  useEffect(() => {
    getOnboardingTrialDays()
      .then((configuredTrialDays) => {
        setTrialDays(configuredTrialDays);
      })
      .catch(() => {});
  }, []);

  // Clear any leftover impersonation cookies on the onboarding portal
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.cookie = "boutq_impersonation_token=; path=/; max-age=0; samesite=lax";
    }
  }, []);

  // Load public plans for bottom preview
  useEffect(() => {
    getPublicOnboardingPlans()
      .then((data) => {
        if (Array.isArray(data)) {
          const filtered = data.filter((p) => p.code !== "lifetime_founder" && p.code !== "trial");
          setPlans(filtered);
          const mode = data[0]?.platform_billing_interval_mode || "both";
          setPlatformBillingMode(mode);
          if (mode === "monthly_only") {
            setBillingInterval("monthly");
          } else if (mode === "annual_only") {
            setBillingInterval("annual");
          }
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
    const selectedPlanPayload = selectedPlan
      ? { selectedPlanVersionId: selectedPlan.version.id }
      : null;
    void selectedPlanPayload;

    if (
      !brandName.trim() ||
      !cleanSlug ||
      !ownerName.trim() ||
      !contactNumber.trim() ||
      !cleanEmail ||
      !password
    ) {
      toast.error(
        isAr ? "يرجى تعبئة جميع الحقول المطلوبة." : "Please fill in all required fields.",
      );
      return;
    }

    if (password.length < 6) {
      toast.error(
        isAr ? "كلمة المرور يجب أن لا تقل عن 6 خانات." : "Password must be at least 6 characters.",
      );
      return;
    }

    if (slugStatus === "taken") {
      toast.error(
        isAr
          ? "رابط المتجر هذا محجوز مسبقاً، يرجى اختيار رابط آخر."
          : "This store link is already taken.",
      );
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(
      isAr
        ? `جاري إنشاء متجرك وتفعيل التجربة المجانية (${trialDays} أيام)...`
        : `Launching your ${trialDays}-day free trial...`,
    );

    try {
      const cleanPhone = contactNumber.trim().startsWith("+")
        ? contactNumber.trim()
        : `+973${contactNumber.trim().replace(/^0+/, "")}`;

      const res = await registerInstantTrial({
        data: {
          brandName: brandName.trim(),
          slug: cleanSlug,
          ownerName: ownerName.trim(),
          contactNumber: cleanPhone,
          email: cleanEmail,
          password: password,
          businessType: "Boutique & Fashion",
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
      toast.loading(
        isAr ? "جاري تسجيل الدخول وفتح لوحة التحكم..." : "Signing in to your boutique dashboard...",
        {
          id: toastId,
        },
      );

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
      <header className="border-b border-border-subtle bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" dir="ltr" className="flex items-center gap-2.5 group">
            <img
              src="/boutq-logo-pack/boutq-icon-squircle.svg"
              alt="Boutq"
              className="size-8 rounded-xl shadow-sm object-contain"
            />
            <div className="flex flex-col text-start">
              <span className="font-black text-sm tracking-widest text-foreground font-mono leading-none">
                BOUTQ
              </span>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-500 tracking-widest leading-none mt-1">
                STORE • OS
              </span>
            </div>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 w-full space-y-12">
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
            {isAr ? "إطلاق متجرك الإلكتروني في دقائق" : "Launch Your Fashion Boutique in Minutes"}
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            {isAr
              ? "المنصة المتكاملة لإدارة وتجارة البوتيكات. منصة متطورة تجمع بين المتجر الإلكتروني، وإدارة الطلبات، والمخزون في مكان واحد وبسهولة تامة."
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
                <Link to="/auth">
                  {isAr ? "تسجيل الدخول وترقية المتجر الآن" : "Sign In & Upgrade Now"}
                </Link>
              </Button>
            </div>
          </div>
        )}

        {/* Mobile Quick Live Preview Trigger */}
        <div className="lg:hidden max-w-xl mx-auto w-full">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Smartphone className="size-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">
                  {isAr ? "شاهد تجربة حية لمتجرك" : "View Live Boutique Demo"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? "تصفح المنتجات والسلة كما يراها عميلك"
                    : "Browse products & test the cart"}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowMobilePreview(true)}
              className="text-xs font-bold shrink-0 gap-1.5"
            >
              <Eye className="size-3.5" />
              <span>{isAr ? "معاينة حية" : "Live Demo"}</span>
            </Button>
          </div>

          {/* Mobile Preview Modal */}
          <Dialog open={showMobilePreview} onOpenChange={setShowMobilePreview}>
            <DialogContent className="max-w-md w-[95vw] sm:w-full p-2 sm:p-5 bg-card border-border max-h-[94vh] overflow-y-auto">
              <DialogHeader className="pb-1">
                <DialogTitle className="text-sm font-bold flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <span>{isAr ? "المعاينة الحية للمتجر" : "Storefront Live Preview"}</span>
                </DialogTitle>
              </DialogHeader>
              <StorefrontLivePreview
                slug="pura"
                displaySlug={slug || (isAr ? "متجرك" : "your-brand")}
                brandName={brandName}
                isAr={isAr}
                onActionClick={() => setShowMobilePreview(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* 3. Boutique Launch Form & Live Storefront Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
          <div className="lg:col-span-7 w-full">
            <Card className="border border-border bg-card rounded-2xl shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-foreground">
                  {isAr ? "إطلاق متجرك الإلكتروني" : "Launch Your Boutique"}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {isAr
                    ? `أدخل تفاصيل متجرك للبدء الفوري بالتجربة المجانية (${trialDays} أيام).`
                    : `Enter your boutique details to start your instant ${trialDays}-day free trial.`}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleStartTrial} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Store Name */}
                    <div className="space-y-1.5">
                      <Label htmlFor="brandName" className="text-xs font-semibold">
                        {isAr ? "اسم المتجر" : "Boutique Name"} *
                      </Label>
                      <Input
                        id="brandName"
                        placeholder={isAr ? "اسم المتجر" : "Boutique name"}
                        value={brandName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBrandName(val);
                          // Auto-suggest transliterated slug if user hasn't typed a custom slug
                          if (!isSlugManuallyEdited) {
                            const transliterated = arabicToLatinSlug(val);
                            setSlug(transliterated);
                          }
                        }}
                        className="h-10 text-xs placeholder:text-muted-foreground placeholder:font-normal bg-background"
                        autoComplete="off"
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
                          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                            <Check className="size-3" /> {isAr ? "متاح" : "Available"}
                          </span>
                        )}
                        {slugStatus === "taken" && (
                          <span className="text-xs text-destructive font-medium">
                            {isAr ? "محجوز مسبقاً" : "Taken"}
                          </span>
                        )}
                      </div>
                      <div
                        dir="ltr"
                        className="flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 overflow-hidden h-10 transition-colors"
                      >
                        <input
                          id="slug"
                          type="text"
                          dir="ltr"
                          placeholder="dar-alanaqa"
                          value={slug}
                          onChange={(e) => {
                            setIsSlugManuallyEdited(true);
                            const raw = e.target.value;
                            if (/[\u0600-\u06FF]/.test(raw)) {
                              setSlugArabicWarning(true);
                            } else {
                              setSlugArabicWarning(false);
                            }
                            setSlug(raw.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                          }}
                          className="flex-1 min-w-0 bg-transparent px-3 text-xs text-foreground placeholder:text-muted-foreground placeholder:font-normal focus:outline-none font-mono"
                          autoComplete="off"
                          required
                        />
                        <span
                          dir="ltr"
                          className="px-3 py-2 text-xs text-muted-foreground font-mono bg-muted/40 border-s border-border select-none shrink-0"
                        >
                          .boutq.store
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {isAr
                          ? "يُقترح تلقائياً من اسم متجرك بحروف إنجليزية (مثال: dar-alanaqa)، ويمكنك تعديله."
                          : "Auto-suggested from your boutique name in English letters (e.g. dar-alanaqa)."}
                      </p>
                      {slugArabicWarning && (
                        <p className="text-xs text-amber-600 dark:text-amber-500 font-medium">
                          {isAr
                            ? "تنبيه: الرابط يقبل الحروف الإنجليزية فقط (a-z والأرقام)."
                            : "Note: Store links only support English letters (a-z) and numbers."}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Owner Full Name */}
                    <div className="space-y-1.5">
                      <Label htmlFor="ownerName" className="text-xs font-semibold">
                        {isAr ? "الاسم الكامل" : "Owner Full Name"} *
                      </Label>
                      <Input
                        id="ownerName"
                        placeholder={isAr ? "الاسم الكامل" : "Your name"}
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        className="h-10 text-xs placeholder:text-muted-foreground placeholder:font-normal bg-background"
                        autoComplete="name"
                        required
                      />
                    </div>

                    {/* WhatsApp Contact */}
                    <div className="space-y-1.5">
                      <Label htmlFor="contactNumber" className="text-xs font-semibold">
                        {isAr ? "رقم الواتساب" : "WhatsApp Number"} *
                      </Label>
                      <div
                        dir="ltr"
                        className="flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 overflow-hidden h-10 transition-colors"
                      >
                        <span
                          dir="ltr"
                          className="px-3 py-2 text-xs text-muted-foreground font-mono bg-muted/40 border-e border-border select-none shrink-0"
                        >
                          +973
                        </span>
                        <input
                          id="contactNumber"
                          type="tel"
                          dir="ltr"
                          placeholder="39955508"
                          value={contactNumber}
                          onChange={(e) => setContactNumber(e.target.value)}
                          className="flex-1 min-w-0 bg-transparent px-3 text-xs text-foreground placeholder:text-muted-foreground placeholder:font-normal focus:outline-none font-mono"
                          autoComplete="tel"
                          required
                        />
                      </div>
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
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-10 text-xs placeholder:text-muted-foreground placeholder:font-normal bg-background text-start"
                        autoComplete="email"
                        required
                      />
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                      <Label htmlFor="password" className="text-xs font-semibold">
                        {isAr ? "كلمة المرور" : "Password"} *
                      </Label>
                      <div className="relative" dir={isAr ? "rtl" : "ltr"}>
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          dir={isAr ? "rtl" : "ltr"}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={cn(
                            "h-10 text-xs rounded-xl pe-10 placeholder:text-muted-foreground placeholder:font-normal bg-background font-mono",
                            isAr ? "text-end" : "text-start",
                          )}
                          autoComplete="new-password"
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 z-10 transition-colors"
                          tabIndex={-1}
                          aria-label={
                            showPassword
                              ? isAr
                                ? "إخفاء كلمة المرور"
                                : "Hide password"
                              : isAr
                                ? "إظهار كلمة المرور"
                                : "Show password"
                          }
                        >
                          {showPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </button>
                      </div>
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

                    <p className="text-xs text-center text-muted-foreground mt-3">
                      {isAr
                        ? "تفعيل فوري في ثوانٍ • بدون بطاقة بنكية • إمكانية الترقية أو الإلغاء في أي وقت"
                        : "Instant 5-second activation • No credit card needed • Cancel or upgrade anytime"}
                    </p>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="hidden lg:flex lg:col-span-5 lg:sticky lg:top-24 flex-col items-center">
            <StorefrontLivePreview
              slug="pura"
              displaySlug={slug || (isAr ? "متجرك" : "your-brand")}
              brandName={brandName}
              isAr={isAr}
              onActionClick={() => {
                const input = document.getElementById("brandName");
                input?.focus();
                input?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            />
          </div>
        </div>

        {/* 4. Bottom Transparent Plans Overview */}
        <div className="pt-12 border-t border-border-subtle space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-foreground">
              {isAr ? "باقات اشتراك واضحة ومدروسة" : "Transparent, Predictable Plans"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? `تجربة مجانية لمدة ${trialDays} أيام، مع إمكانية اختيار الباقة المناسبة لحجم أعمالك لمتابعة البيع.`
                : `Begin with ${trialDays} free days, then pick the tier matching your growth to continue selling.`}
            </p>

            {/* Monthly / Annual Toggle (if platform allows both) */}
            {platformBillingMode === "both" && (
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
            )}
            {platformBillingMode === "monthly_only" && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-muted/60 rounded-full border border-border text-xs text-muted-foreground mt-2 font-medium">
                <span>{isAr ? "دورة الفوترة المتاحة: شهرياً" : "Available Cycle: Monthly"}</span>
              </div>
            )}
            {platformBillingMode === "annual_only" && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-muted/60 rounded-full border border-border text-xs text-muted-foreground mt-2 font-medium">
                <span>
                  {isAr
                    ? "دورة الفوترة المتاحة: سنوياً (بأفضل قيمة)"
                    : "Available Cycle: Annual (Best Value)"}
                </span>
              </div>
            )}
          </div>

          {/* DYNAMIC PLANS LIST */}
          <div
            className={cn(
              "grid gap-6 mx-auto",
              plans.length === 1
                ? "grid-cols-1 max-w-sm"
                : plans.length === 2
                  ? "grid-cols-1 md:grid-cols-2 max-w-2xl"
                  : "grid-cols-1 md:grid-cols-3 max-w-4xl",
            )}
          >
            {plans.map((plan) => {
              const isAnnual = billingInterval === "annual";
              const isPlanMonthlyOnly = plan.billing_interval_mode === "monthly_only";
              const isPlanAnnualOnly = plan.billing_interval_mode === "annual_only";

              let displayPrice: string | number = 0;
              let displayPeriod = isAr ? "د.ب / شهرياً" : "BHD / mo";

              if (isPlanMonthlyOnly) {
                displayPrice = Number(plan.version?.price_monthly ?? 0);
                displayPeriod = isAr ? "د.ب / شهرياً" : "BHD / mo";
              } else if (isPlanAnnualOnly || isAnnual) {
                const annualTotal = Number(plan.version?.price_annual ?? 0);
                const perMonth =
                  annualTotal > 0 ? (annualTotal / 12).toFixed(1).replace(/\.0$/, "") : "0";
                displayPrice = perMonth;
                displayPeriod = isAr
                  ? `د.ب / شهرياً (${annualTotal} د.ب سنوياً)`
                  : `BHD / mo (${annualTotal} BHD/yr)`;
              } else {
                displayPrice = Number(plan.version?.price_monthly ?? 0);
                displayPeriod = isAr ? "د.ب / شهرياً" : "BHD / mo";
              }

              const isPopular = plan.code === "growth" || plan.sort_order === 20;

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "p-5 rounded-2xl flex flex-col justify-between space-y-4 transition-all",
                    isPopular
                      ? "border border-primary bg-primary/[0.02] ring-1 ring-primary/20 relative"
                      : "border border-border bg-card/60",
                  )}
                >
                  {isPopular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold bg-primary text-primary-foreground">
                      {isAr ? "الأكثر شعبية" : "Most Popular"}
                    </Badge>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-sm text-foreground">
                        {isAr ? plan.name_ar : plan.name_en}
                      </h3>
                      {plan.billing_interval_mode === "monthly_only" && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md font-medium">
                          {isAr ? "شهري فقط" : "Monthly Only"}
                        </span>
                      )}
                      {plan.billing_interval_mode === "annual_only" && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md font-medium">
                          {isAr ? "سنوي فقط" : "Annual Only"}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {isAr ? plan.description_ar : plan.description_en}
                    </p>

                    <div className="font-mono text-xl font-extrabold text-foreground pt-2 flex items-baseline gap-1.5">
                      <span>{displayPrice}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {displayPeriod}
                      </span>
                    </div>
                  </div>

                  <ul className="text-xs space-y-1.5 text-muted-foreground flex-1">
                    {Array.isArray(plan.features) && plan.features.length > 0 ? (
                      plan.features.slice(0, 5).map((feat: any, idx: number) => {
                        const featName = isAr ? feat.name_ar : feat.name_en;
                        let text = featName;
                        if (feat.numeric_value && feat.numeric_value > 0) {
                          text = `${featName} (${feat.numeric_value} ${feat.unit ? (isAr ? feat.unit_ar || feat.unit : feat.unit) : ""})`;
                        }
                        return (
                          <li key={idx} className="flex items-center gap-2">
                            <Check className="size-3.5 text-primary shrink-0" />
                            <span className="line-clamp-1">{text}</span>
                          </li>
                        );
                      })
                    ) : (
                      <>
                        <li className="flex items-center gap-2">
                          <Check className="size-3.5 text-primary shrink-0" />
                          <span>{isAr ? "إدارة متجر متكاملة" : "Full store management"}</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="size-3.5 text-primary shrink-0" />
                          <span>{isAr ? "تتبع الطلبات والمخزون" : "Orders & stock tracking"}</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="size-3.5 text-primary shrink-0" />
                          <span>
                            {isAr ? "تنبيهات فورية على واتساب" : "Instant WhatsApp alerts"}
                          </span>
                        </li>
                      </>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* 5. Clean Footer */}
      <footer className="border-t border-border-subtle py-6 text-center text-xs text-muted-foreground">
        <p>
          {isAr
            ? "جميع الحقوق محفوظة © 2026 Boutq OS — منصة إدارة وتجارة البوتيكات الخليجية."
            : "© 2026 Boutq OS. All rights reserved. E-commerce OS for GCC Fashion Boutiques."}
        </p>
      </footer>
    </div>
  );
}
