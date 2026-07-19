import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { 
  Building2, 
  User, 
  Lock, 
  Palette, 
  Languages, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Store, 
  Sparkles, 
  CheckCircle2, 
  Loader2 
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/onboard")({
  ssr: false,
  component: OnboardPage,
});

const BRAND_COLORS = [
  { name: "Royal Maroon", value: "#800020" },
  { name: "Emerald Green", value: "#004B49" },
  { name: "Classic Navy", value: "#1B2A47" },
  { name: "Deep Charcoal", value: "#262626" },
  { name: "Rose Gold", value: "#B76E79" },
  { name: "Midnight Violet", value: "#2E1A47" },
];

function OnboardPage() {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();

  // Wizard Steps: 1 = Account, 2 = Boutique Brand Details
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form State - Account
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Form State - Brand
  const [storeNameEn, setStoreNameEn] = useState("");
  const [storeNameAr, setStoreNameAr] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#800020");

  // Slug validation states
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

  // Clean and check slug uniqueness
  useEffect(() => {
    if (!storeSlug) {
      setSlugAvailable(null);
      return;
    }

    const cleanedSlug = storeSlug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (cleanedSlug !== storeSlug) {
      setStoreSlug(cleanedSlug);
    }

    const checkUniqueness = async () => {
      setSlugChecking(true);
      try {
        const { data, error } = await supabase
          .from("brands")
          .select("id")
          .eq("slug", cleanedSlug)
          .maybeSingle();

        if (error) throw error;
        setSlugAvailable(!data);
      } catch {
        setSlugAvailable(false);
      } finally {
        setSlugChecking(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      void checkUniqueness();
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [storeSlug]);

  // Autofill slug from English store name
  useEffect(() => {
    if (step === 1 || storeSlug) return;
    const cleanName = storeNameEn
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");
    setStoreSlug(cleanName);
  }, [storeNameEn, step]);

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      toast.error(lang === "ar" ? "يرجى ملء جميع الحقول المطلوبة." : "Please fill out all required fields.");
      return;
    }
    if (password.length < 8) {
      toast.error(lang === "ar" ? "يجب أن تكون كلمة المرور 8 رموز على الأقل." : "Password must be at least 8 characters.");
      return;
    }
    setStep(2);
  };

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeNameEn || !storeSlug) {
      toast.error(lang === "ar" ? "يرجى ملء اسم المتجر والاسم التعريفي." : "Please fill in the store name and web address handle.");
      return;
    }

    if (slugAvailable === false) {
      toast.error(lang === "ar" ? "رابط المتجر هذا محجوز مسبقاً." : "This store handle is already taken.");
      return;
    }

    setLoading(true);

    try {
      // Step 1: Register Account in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: fullName,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Authentication failed.");

      // Step 2: Provision Brand & Settings in one atomic SQL operation
      const { data: brandId, error: rpcError } = await supabase.rpc("create_tenant_with_defaults" as any, {
        p_slug: storeSlug,
        p_name_en: storeNameEn,
        p_name_ar: storeNameAr || null,
        p_primary_color: primaryColor,
        p_owner_id: authData.user.id,
        p_owner_email: email,
        p_owner_name: fullName
      });

      if (rpcError) {
        // Safe Cleanup: if the DB setup failed, sign out immediately
        await supabase.auth.signOut();
        throw rpcError;
      }

      toast.success(
        lang === "ar" 
          ? "تهانينا! تم إنشاء متجرك الفاخر بنجاح." 
          : "Congratulations! Your luxury boutique is now live!"
      );

      // Step 3: Auto-login session and redirect directly to their dashboard
      await supabase.auth.signInWithPassword({ email, password });
      await navigate({ 
        to: "/admin/b/$slug/dashboard", 
        params: { slug: storeSlug } 
      });

    } catch (err: any) {
      console.error("Onboarding error:", err);
      toast.error(err.message || "An unexpected error occurred during setup.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Visual Brand Panel (Left on Desktop) */}
      <div className="hidden md:flex md:w-[40%] bg-zinc-950 text-white flex-col justify-between p-12 relative overflow-hidden shrink-0 border-r border-zinc-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(128,0,32,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.8))]" />

        <div className="relative z-10 flex items-center gap-2">
          <Store className="h-6 w-6 text-primary" style={{ color: primaryColor }} />
          <span className="font-display text-lg tracking-wider font-semibold">PURA SaaS</span>
        </div>

        <div className="relative z-10 space-y-6 max-w-sm">
          <Sparkles className="h-10 w-10 text-primary animate-pulse" style={{ color: primaryColor }} />
          <h2 className="text-4xl font-display font-medium leading-tight tracking-tight">
            {lang === "ar" ? "أطلق متجرك الرقمي الفاخر بدقائق معدودة" : "Launch your luxury boutique in minutes."}
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            {lang === "ar"
              ? "انضم لعشرات الماركات التجارية الفاخرة في البحرين والخليج العربي. تجربة متكاملة، دفع آمن، تحليلات متقدمة، وإعداد فوري."
              : "Join elite independent boutiques in Bahrain and the Gulf. Whitelabel design, seamless localization, custom domains, and zero maintenance."}
          </p>
        </div>

        <div className="relative z-10 text-xs text-zinc-500 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>{lang === "ar" ? "نظام سحابي آمن 100٪" : "100% Secure, Zero-Fee Sandbox Stack"}</span>
        </div>
      </div>

      {/* Interactive Wizard Form Panel (Right) */}
      <div className="flex-1 flex flex-col justify-between p-6 md:p-12 lg:p-16 max-w-3xl mx-auto w-full">
        {/* Header - Translation Selector */}
        <div className="flex justify-end items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-muted-foreground" />
            <Select value={lang} onValueChange={(v) => setLang(v as "en" | "ar")}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Dynamic Step Wizard */}
        <div className="my-auto py-8">
          <div className="mb-8">
            <div className="flex items-center gap-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
              <span>{lang === "ar" ? `الخطوة ${step} من 2` : `Step ${step} of 2`}</span>
              <span className="h-1 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-full relative overflow-hidden">
                <span 
                  className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all duration-300"
                  style={{ 
                    width: step === 1 ? "50%" : "100%",
                    backgroundColor: primaryColor
                  }}
                />
              </span>
            </div>
            <h1 className="text-3xl font-display font-medium text-foreground">
              {step === 1 
                ? (lang === "ar" ? "إنشاء حساب المدير" : "Create your Owner Account")
                : (lang === "ar" ? "تفاصيل هويتك التجارية" : "Configure your Boutique Store")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              {step === 1
                ? (lang === "ar" ? "أدخل بياناتك الشخصية لإدارة متجرك والتحكم به." : "Enter your administrator credentials to manage your store portals.")
                : (lang === "ar" ? "حدد الاسم، الرابط، ولون هويتك البصرية." : "Choose your store identity, web handles, and primary accent styling.")}
            </p>
          </div>

          <Card className="p-6 md:p-8 shadow-md border-zinc-100 dark:border-zinc-800/80">
            {step === 1 ? (
              /* STEP 1: Account Creation Form */
              <form onSubmit={handleNextStep} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {lang === "ar" ? "الاسم الكامل" : "Full Name"}
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4.5 w-4.5 text-zinc-400" />
                    <Input 
                      id="fullName" 
                      placeholder={lang === "ar" ? "جاسم المحمود" : "Jassim Al-Mahmood"} 
                      required 
                      className="pl-10"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {lang === "ar" ? "البريد الإلكتروني" : "Email Address"}
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4.5 w-4.5 text-zinc-400" />
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="jassim@boutique.bh" 
                      required 
                      className="pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {lang === "ar" ? "كلمة المرور" : "Password"}
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-zinc-400" />
                    <Input 
                      id="password" 
                      type="password" 
                      placeholder="••••••••" 
                      required 
                      minLength={8}
                      className="pl-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full mt-6 h-11 text-sm font-medium gap-2">
                  {lang === "ar" ? "المتابعة للعلامة التجارية" : "Continue to Brand Setup"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            ) : (
              /* STEP 2: Brand/Boutique Details Form */
              <form onSubmit={handleOnboard} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nameEn" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {lang === "ar" ? "اسم المتجر (English)" : "Boutique Name (English)"}
                    </Label>
                    <div className="relative">
                      <Store className="absolute left-3 top-2.5 h-4.5 w-4.5 text-zinc-400" />
                      <Input 
                        id="nameEn" 
                        placeholder="Velvet Abayas" 
                        required 
                        className="pl-10"
                        value={storeNameEn}
                        onChange={(e) => setStoreNameEn(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="nameAr" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {lang === "ar" ? "اسم المتجر (العربية)" : "Boutique Name (Arabic)"}
                    </Label>
                    <div className="relative">
                      <Store className="absolute left-3 top-2.5 h-4.5 w-4.5 text-zinc-400" />
                      <Input 
                        id="nameAr" 
                        placeholder="مخمل للعبايات" 
                        className="pl-10 text-right"
                        value={storeNameAr}
                        onChange={(e) => setStoreNameAr(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {lang === "ar" ? "رابط موقع متجرك الفرعي" : "Boutique Store Handle / URL Slug"}
                  </Label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-xs text-zinc-400 select-none font-medium">bh.pura/</span>
                    <Input 
                      id="slug" 
                      placeholder="velvet-abayas" 
                      required 
                      className="pl-18 pr-10 font-mono text-xs text-primary"
                      value={storeSlug}
                      onChange={(e) => setStoreSlug(e.target.value)}
                    />
                    <div className="absolute right-3 flex items-center">
                      {slugChecking && <Loader2 className="h-4 w-4 text-zinc-400 animate-spin" />}
                      {!slugChecking && storeSlug && slugAvailable === true && (
                        <Check className="h-4 w-4 text-emerald-500" />
                      )}
                      {!slugChecking && storeSlug && slugAvailable === false && (
                        <span className="text-[10px] font-bold text-red-500">{lang === "ar" ? "محجوز" : "Taken"}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {lang === "ar" 
                      ? "يسمح فقط بالأحرف الصغيرة، الأرقام، والواصلات (-). سيعمل كعنوان لموقعك." 
                      : "Only lowercase letters, numbers, and hyphens (-) allowed. This forms your unique web address."}
                  </p>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase flex items-center gap-1.5">
                    <Palette className="h-4 w-4 text-zinc-400" />
                    <span>{lang === "ar" ? "اللون الرئيسي لهويتك التجارية" : "Primary Accent Theme Color"}</span>
                  </Label>
                  <div className="flex flex-wrap gap-2.5 items-center">
                    {BRAND_COLORS.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setPrimaryColor(color.value)}
                        className="h-8 w-8 rounded-full border border-zinc-200 dark:border-zinc-800 relative transition-transform duration-150 active:scale-95 flex items-center justify-center cursor-pointer"
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      >
                        {primaryColor === color.value && (
                          <span className="bg-white/25 rounded-full p-1 border border-white/20">
                            <Check className="h-3.5 w-3.5 text-white" />
                          </span>
                        )}
                      </button>
                    ))}
                    <input 
                      type="color" 
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-8 w-12 rounded border border-zinc-200 dark:border-zinc-800 p-0.5 cursor-pointer bg-transparent"
                      title="Custom Color"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setStep(1)}
                    className="flex-1 h-11 text-xs font-medium gap-1.5"
                    disabled={loading}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    {lang === "ar" ? "رجوع" : "Back"}
                  </Button>
                  
                  <Button 
                    type="submit" 
                    className="flex-[2] h-11 text-xs font-medium gap-1.5 text-white"
                    disabled={loading || slugChecking || slugAvailable === false}
                    style={{ backgroundColor: primaryColor }}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {lang === "ar" ? "جاري تهيئة المتجر..." : "Creating Boutique..."}
                      </>
                    ) : (
                      <>
                        <Building2 className="h-3.5 w-3.5" />
                        {lang === "ar" ? "أطلق متجري الآن" : "Launch My Boutique"}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>

        {/* Footer - Sign in Redirect link */}
        <div className="text-center text-xs text-muted-foreground border-t border-zinc-100 dark:border-zinc-900 pt-6">
          <span>{lang === "ar" ? "لديك حساب بالفعل؟" : "Already have a boutique on PURA?"} </span>
          <Link to="/auth" className="text-primary hover:underline font-semibold" style={{ color: primaryColor }}>
            {lang === "ar" ? "تسجيل الدخول للوحة التحكم" : "Sign in to Dashboard"}
          </Link>
        </div>
      </div>
    </div>
  );
}
