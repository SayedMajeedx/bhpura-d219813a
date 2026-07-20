import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { 
  Building2, 
  User, 
  Languages, 
  Check, 
  Store, 
  Sparkles, 
  CheckCircle2, 
  Loader2,
  UploadCloud,
  ChevronRight,
  Info,
  PhoneCall,
  QrCode
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  getOnboardingReceiptUploadUrl, 
  createTenantRequest, 
  getOnboardingPrice 
} from "@/lib/onboarding.functions";

export const Route = createFileRoute("/onboard")({
  ssr: false,
  component: OnboardPage,
});

function OnboardPage() {
  const { lang, setLang } = useI18n();
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [basePrice, setBasePrice] = useState(55);
  const [discountPrice, setDiscountPrice] = useState<number | null>(null);
  const [platformIconUrl, setPlatformIconUrl] = useState<string | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState("97339955508");

  // Load Dynamic Settings on mount
  useEffect(() => {
    async function loadDynamicSettings() {
      try {
        const { data, error } = await supabase
          .from("system_settings")
          .select("base_price_bhd, discount_price_bhd, platform_icon_url, whatsapp_support_number")
          .eq("id", 1)
          .maybeSingle();

        if (data && !error) {
          if (data.base_price_bhd) setBasePrice(Number(data.base_price_bhd));
          setDiscountPrice(data.discount_price_bhd ? Number(data.discount_price_bhd) : null);
          setPlatformIconUrl(data.platform_icon_url || null);
          if (data.whatsapp_support_number) setWhatsappNumber(data.whatsapp_support_number);
        } else {
          // Fallback to getOnboardingPrice server function if direct query fails
          const price = await getOnboardingPrice();
          const parsed = parseFloat(price.replace(/[^0-9.]/g, "")) || 55;
          setBasePrice(parsed);
        }
      } catch (err) {
        console.warn("Error loading live system settings, falling back.", err);
      } finally {
        setLoadingPrice(false);
      }
    }
    void loadDynamicSettings();
  }, []);

  const displayPrice = discountPrice !== null ? `${discountPrice} BHD` : `${basePrice} BHD`;

  // Form Fields - Shareable for both Trials or Official Packages
  const [fullName, setFullName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [subdomain, setSubdomain] = useState("");
  
  // File Uploader state for Card B (Official Paid Activation)
  const [uploading, setUploading] = useState(false);
  const [receiptKey, setReceiptKey] = useState<string | null>(null);

  // Subdomain uniqueness states
  const [subdomainChecking, setSubdomainChecking] = useState(false);
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null);

  // Success Confirmation overlay trigger
  const [isDeployedPending, setIsDeployedPending] = useState(false);
  const [submittedSubdomain, setSubmittedSubdomain] = useState("");
  const [isTrialSuccess, setIsTrialSuccess] = useState(false);

  // Clean and check subdomain uniqueness across existing brands AND tenant requests
  useEffect(() => {
    if (!subdomain) {
      setSubdomainAvailable(null);
      return;
    }

    const cleanedSubdomain = subdomain
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (cleanedSubdomain !== subdomain) {
      setSubdomain(cleanedSubdomain);
    }

    const checkUniqueness = async () => {
      setSubdomainChecking(true);
      try {
        // Check active brand slugs
        const { data: brandData, error: brandError } = await supabase
          .from("brands")
          .select("id")
          .eq("slug", cleanedSubdomain)
          .maybeSingle();

        if (brandError) throw brandError;

        // Check pending requests queue
        const { data: pendingData, error: pendingError } = await supabase
          .from("tenant_requests")
          .select("id")
          .eq("desired_subdomain", cleanedSubdomain)
          .eq("status", "pending")
          .maybeSingle();

        if (pendingError) throw pendingError;

        setSubdomainAvailable(!brandData && !pendingData);
      } catch {
        setSubdomainAvailable(false);
      } finally {
        setSubdomainChecking(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      void checkUniqueness();
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [subdomain]);

  // Upload receipt to Private R2 Bucket
  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error(lang === "ar" ? "يرجى تحميل صورة صالحة (JPEG, PNG, WEBP)." : "Please upload a valid image file (JPEG, PNG, WEBP).");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast.error(lang === "ar" ? "الحد الأقصى لحجم الملف هو 8 ميجابايت." : "Maximum file size is 8MB.");
      return;
    }

    setUploading(true);
    const toastId = toast.loading(lang === "ar" ? "جاري تفعيل قناة التحميل المشفرة..." : "Preparing secure R2 upload tunnel...");

    try {
      const { objectKey, uploadUrl } = await getOnboardingReceiptUploadUrl({
        contentType: file.type as any
      });

      toast.loading(lang === "ar" ? "جاري تشفير وحفظ لقطة الشاشة في R2 الخصوصي..." : "Encrypting and storing receipt screenshot in Private R2 Bucket...", { id: toastId });
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!response.ok) {
        throw new Error("S3 direct PUT upload failed.");
      }

      setReceiptKey(objectKey);
      toast.success(lang === "ar" ? "تم رفع إيصال الدفع وتشفيره بنجاح!" : "Payment receipt uploaded and encrypted securely!", { id: toastId });

    } catch (err: any) {
      console.error(err);
      toast.error(lang === "ar" ? "فشل تحميل إيصال الدفع. يرجى المحاولة لاحقاً." : "Failed to upload payment receipt. Please retry.", { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  // Submission Flow - CARD A: 3-Day Free Trial
  const handleRegisterTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !contactNumber || !email || !subdomain) {
      toast.error(lang === "ar" ? "يرجى ملء جميع الحقول المطلوبة." : "Please fill out all required fields.");
      return;
    }

    if (subdomainAvailable === false) {
      toast.error(lang === "ar" ? "رابط المتجر هذا محجوز مسبقاً." : "This store subdomain is already taken.");
      return;
    }

    const toastId = toast.loading(lang === "ar" ? "جاري إرسال طلب تفعيل النسخة التجريبية..." : "Sending trial request...");

    try {
      // Save metadata lead safely to tenant_requests with status 'pending'
      await createTenantRequest({
        fullName,
        contactNumber,
        email,
        desiredSubdomain: subdomain,
        requestType: "trial",
      });

      const waMessage = lang === "ar"
        ? `مرحباً دعم بوتيك (Boutq)! لقد أرسلت للتو طلب تفعيل باقة الـ 3 أيام المجانية لمتجري باسم: "${fullName}" والرابط المطلوب: "${subdomain}.boutq.store". البريد الإلكتروني: ${email}.`
        : `Hello Boutq Support! I just submitted a request for a 3-Day Free Trial workspace. Owner: "${fullName}", Desired subdomain: "${subdomain}.boutq.store", Contact: ${contactNumber}, Email: ${email}.`;

      const encodedMessage = encodeURIComponent(waMessage);
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;

      toast.success(lang === "ar" ? "تم تسجيل طلبك! بانتظار التفعيل اليدوي..." : "Request Received - Waiting for Manual Activation", { id: toastId });
      
      setSubmittedSubdomain(subdomain);
      setIsTrialSuccess(true);
      setIsDeployedPending(true);

      // Open WhatsApp safely to speed up onboarding activation
      setTimeout(() => {
        window.open(whatsappUrl, "_blank");
      }, 1200);

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "An unexpected error occurred during submission.", { id: toastId });
    }
  };

  // Submission Flow - CARD B: Paid Official Store Activation
  const handleRegisterPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !contactNumber || !email || !subdomain) {
      toast.error(lang === "ar" ? "يرجى ملء جميع الحقول المطلوبة." : "Please fill out all required fields.");
      return;
    }

    if (subdomainAvailable === false) {
      toast.error(lang === "ar" ? "رابط المتجر هذا محجوز مسبقاً." : "This store subdomain is already taken.");
      return;
    }

    if (!receiptKey) {
      toast.error(lang === "ar" ? "يرجى رفع لقطة شاشة تأكيد الدفع قبل المتابعة." : "Please upload your payment receipt screenshot before submitting.");
      return;
    }

    const toastId = toast.loading(lang === "ar" ? "جاري إرسال طلب تفعيل متجرك الرسمي..." : "Sending official store activation request...");

    try {
      // Save metadata lead safely to tenant_requests as 'pending'
      await createTenantRequest({
        fullName,
        contactNumber,
        email,
        desiredSubdomain: subdomain,
        requestType: "paid",
        benefitReceiptUrl: receiptKey,
      });

      toast.success(
        lang === "ar" 
          ? "تم إرسال طلب تفعيل متجرك بنجاح! طلبك الآن قيد التدقيق وسيتم تفعيله يدوياً." 
          : "Request Received - Waiting for Manual Activation",
        { id: toastId, duration: 6000 }
      );

      setSubmittedSubdomain(subdomain);
      setIsTrialSuccess(false);
      setIsDeployedPending(true);

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "An unexpected error occurred during activation submission.", { id: toastId });
    }
  };

  // SUCCESS CONFIRMATION OVERLAY (Waiting for Manual Activation freeze state)
  if (isDeployedPending) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-6 relative overflow-hidden text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(128,0,32,0.1),transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.9))]" />

        <Card className="max-w-xl w-full border-zinc-900 bg-zinc-900/40 backdrop-blur-md shadow-2xl relative z-10 p-8 text-center text-white">
          <div className="h-16 w-16 bg-primary/10 rounded-full border border-primary/20 flex items-center justify-center mx-auto mb-6 text-primary">
            {isTrialSuccess ? (
              <Sparkles className="h-8 w-8 animate-pulse text-[#B76E79]" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-emerald-500 animate-bounce" />
            )}
          </div>

          <h1 className="text-2xl md:text-3xl font-display font-medium tracking-tight mb-3">
            {lang === "ar" ? "تم استلام الطلب - بانتظار التفعيل" : "Request Received - Waiting for Manual Activation"}
          </h1>
          
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            {lang === "ar"
              ? `لقد تم إرسال طلب تفعيل مساحة متجرك الفاخرة "${submittedSubdomain}.boutq.store" بنجاح إلى فريق الإدارة.`
              : `Your luxury boutique registration request for "${submittedSubdomain}.boutq.store" has been recorded in our activation queue.`}
          </p>

          <div className="bg-zinc-950/60 border border-zinc-900 rounded-lg p-5 mb-8 text-left space-y-4">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-xs text-zinc-400 leading-relaxed">
                <p className="font-semibold text-zinc-200 mb-1">
                  {lang === "ar" ? "ما الخطوات التالية لتفعيل متجرك؟" : "What is the deployment procedure?"}
                </p>
                {isTrialSuccess ? (
                  <p>
                    {lang === "ar"
                      ? "سنقوم بتهيئة نسختك التجريبية وتفعيل الرابط فورياً. تواصل مع الدعم عبر الواتساب لتسريع العملية."
                      : "A superadmin is currently reviewing your trial request. Once approved, your temporary 3-day workspace will be spun up. Message support on WhatsApp to fast-track approval."}
                  </p>
                ) : (
                  <p>
                    {lang === "ar"
                      ? "سنقوم بمراجعة لقطة شاشة تأكيد عملية السداد المرفقة. سيتم تهيئة وتوفير مساحتك الفاخرة يدوياً وتزويدك بروابط الدخول والتحكم الكامل في غضون ساعتين كحد أقصى."
                      : "An administrator will verify your uploaded BenefitPay transfer reference screenshot. Once approved, your official brand platform and manager dashboards will be manually deployed within 2 hours."}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button 
              variant="outline" 
              className="border-zinc-800 hover:bg-zinc-800 text-white"
              onClick={() => {
                setIsDeployedPending(false);
                setFullName("");
                setContactNumber("");
                setEmail("");
                setSubdomain("");
                setReceiptKey(null);
              }}
            >
              {lang === "ar" ? "العودة للرئيسية" : "Start Over"}
            </Button>

            <a 
              href={`https://wa.me/${whatsappNumber}?text=Hello!%20Inquiring%20about%20my%20onboarding%20registration%20for%20subdomain:%20${submittedSubdomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-500 px-6 text-sm font-semibold text-white shadow transition-colors gap-2"
            >
              <PhoneCall className="h-4 w-4" />
              {lang === "ar" ? "تواصل مع الإدارة بالواتساب" : "Contact Superadmin Support"}
            </a>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Brand Visual Left Sidebar (Desktop only) */}
      <div className="hidden md:flex md:w-[35%] bg-zinc-950 text-white flex-col justify-between p-12 relative overflow-hidden shrink-0 border-r border-zinc-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(128,0,32,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.8))]" />

        <div className="relative z-10 flex items-center gap-2">
          {platformIconUrl ? (
            <img src={platformIconUrl} alt="Boutq Logo" className="h-8 object-contain" />
          ) : (
            <>
              <Store className="h-6 w-6 text-[#B76E79]" />
              <span className="font-display text-lg tracking-wider font-semibold">Boutq</span>
            </>
          )}
        </div>

        <div className="relative z-10 space-y-6 max-w-sm">
          <Sparkles className="h-10 w-10 text-[#B76E79] animate-pulse" />
          <h2 className="text-4xl font-display font-medium leading-tight tracking-tight">
            {lang === "ar" ? "أطلق مساحتك التجارية الفاخرة اليوم" : "Own your professional luxury boutique store."}
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            {lang === "ar"
              ? "منصة الإدارة المتكاملة لمصممي الأزياء، العبايات، وصالات العرض النخبوية في البحرين والخليج العربي. واجهات في غاية الفخامة والدقة."
              : "The premium management stack designed for visual designers, Abaya houses, and high-end couture stores in Bahrain and the GCC. Exquisite storefront interfaces."}
          </p>
        </div>

        <div className="relative z-10 text-xs text-zinc-500 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>{lang === "ar" ? "بنية سحابية فائقة الأمان" : "RLS-Secured Enterprise Deployment Stack"}</span>
        </div>
      </div>

      {/* Main Interaction Area */}
      <div className="flex-1 flex flex-col justify-between p-6 md:p-12 lg:p-16 max-w-7xl mx-auto w-full">
        {/* Top bar with Translation selector */}
        <div className="flex justify-between items-center gap-4 mb-8">
          <div className="flex items-center gap-2 md:hidden">
            {platformIconUrl ? (
              <img src={platformIconUrl} alt="Boutq Logo" className="h-6 object-contain" />
            ) : (
              <>
                <Store className="h-5 w-5 text-primary" />
                <span className="font-display text-base tracking-wider font-semibold">Boutq</span>
              </>
            )}
          </div>
          <div className="flex justify-end items-center gap-4 ml-auto">
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
        </div>

        <div className="text-center md:text-left mb-10 max-w-2xl">
          <h1 className="text-3xl md:text-4xl font-display font-medium text-foreground tracking-tight mb-3">
            {lang === "ar" ? "اختر باقة إطلاق متجرك" : "Select Your Boutq Activation"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {lang === "ar"
              ? "نحن نوفر خيارين مخصصين لبدء تجارتك. سواء كنت ترغب بتجربة المنصة لـ 3 أيام مجاناً، أو الحصول على رخصة المتجر المتكاملة مع الدعم الفني، بادر بتعبئة بياناتك وبدء مغامرتك فورياً."
              : "We provide two options to fit your boutique expansion. Start with our 3-day complimentary test drive via our WhatsApp concierge or launch your permanent brand portal immediately."}
          </p>
        </div>

        {/* Dual Card responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          
          {/* CARD A: 3-Day Free Trial */}
          <Card className="border-zinc-100 dark:border-zinc-800/80 shadow-md flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-[0.02] select-none pointer-events-none">
              <Sparkles className="h-32 w-32" />
            </div>
            
            <CardHeader className="border-b border-zinc-50 dark:border-zinc-900 pb-5">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <CardTitle className="text-lg font-display font-medium text-zinc-900 dark:text-zinc-100">
                    {lang === "ar" ? "تجربة مجانية لمدة 3 أيام" : "Complimentary 3-Day Trial"}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    {lang === "ar" ? "جرّب ميزات منصة Boutq الفاخرة مجاناً." : "Test-drive Boutq free of charge for 3 days."}
                  </CardDescription>
                </div>
                <span className="text-xs bg-[#B76E79]/10 text-[#B76E79] px-2 py-1 rounded font-semibold tracking-wider">
                  {lang === "ar" ? "مجانـي" : "FREE"}
                </span>
              </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-4">
              <form onSubmit={handleRegisterTrial} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="trial-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {lang === "ar" ? "الاسم الكامل" : "Owner Full Name"}
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4.5 w-4.5 text-zinc-400" />
                    <Input 
                      id="trial-name" 
                      placeholder={lang === "ar" ? "جاسم المحمود" : "Jassim Al-Mahmood"} 
                      required 
                      className="pl-10 text-sm"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="trial-phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {lang === "ar" ? "رقم الهاتف / الواتساب" : "WhatsApp Number"}
                    </Label>
                    <Input 
                      id="trial-phone" 
                      placeholder="39955508" 
                      required 
                      className="text-sm"
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="trial-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {lang === "ar" ? "البريد الإلكتروني" : "Email Address"}
                    </Label>
                    <Input 
                      id="trial-email" 
                      type="email" 
                      placeholder="jassim@boutique.com" 
                      required 
                      className="text-sm"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="trial-subdomain" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {lang === "ar" ? "رابط موقع متجرك المطلوب" : "Desired Boutique Subdomain"}
                  </Label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-xs text-zinc-400 font-medium font-mono select-none">https://</span>
                    <Input 
                      id="trial-subdomain" 
                      placeholder="velvet" 
                      required 
                      className="pl-16 pr-24 font-mono text-xs text-primary"
                      value={subdomain}
                      onChange={(e) => setSubdomain(e.target.value)}
                    />
                    <span className="absolute right-3 text-[10px] text-zinc-400 font-mono font-bold select-none">.boutq.store</span>
                  </div>
                  
                  {subdomain && (
                    <p className="text-[10px] flex items-center gap-1 mt-1">
                      {subdomainChecking ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                          <span className="text-muted-foreground">{lang === "ar" ? "جاري التحقق من التوافر..." : "Checking availability..."}</span>
                        </>
                      ) : subdomainAvailable === true ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" />
                          <span className="text-emerald-500 font-semibold">{lang === "ar" ? "الرابط متوفر وصالح للاستخدام!" : "Subdomain handle is available!"}</span>
                        </>
                      ) : (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 inline-block" />
                          <span className="text-rose-500 font-semibold">{lang === "ar" ? "الرابط محجوز مسبقاً!" : "This subdomain is already taken."}</span>
                        </>
                      )}
                    </p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-11 text-xs font-semibold uppercase tracking-wider gap-2 bg-[#B76E79] hover:bg-[#a35e69] text-white mt-4"
                  disabled={subdomainChecking || subdomainAvailable === false}
                >
                  {lang === "ar" ? "إرسال طلب تجربة الـ 3 أيام" : "Submit Request & Start 3-Day Trial"}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* CARD B: Official Paid Registration */}
          <Card className="border-zinc-100 dark:border-zinc-800/80 shadow-md flex flex-col justify-between relative overflow-hidden group ring-1 ring-primary/40 bg-primary/[0.01]">
            <div className="absolute top-0 right-0 p-4 opacity-[0.02] select-none pointer-events-none">
              <Building2 className="h-32 w-32" />
            </div>

            <CardHeader className="border-b border-zinc-50 dark:border-zinc-900 pb-5">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <CardTitle className="text-lg font-display font-medium text-zinc-900 dark:text-zinc-100">
                    {lang === "ar" ? "تفعيل المتجر الفاخر الرسمي" : "Official Store Activation"}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    {lang === "ar" ? "إصدار مرخص فوري ومدعوم بالكامل." : "Activate your lifetime whitelabel boutique brand platform."}
                  </CardDescription>
                </div>
                <div className="text-right">
                  {loadingPrice ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-auto text-primary" />
                  ) : discountPrice !== null ? (
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-muted-foreground line-through font-mono">
                        {basePrice} BHD
                      </span>
                      <span className="text-lg font-bold font-display text-emerald-500 animate-pulse">
                        {discountPrice} BHD
                      </span>
                    </div>
                  ) : (
                    <span className="text-lg font-bold font-display text-primary block">
                      {basePrice} BHD
                    </span>
                  )}
                  <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider block mt-0.5">
                    {lang === "ar" ? "دفع لمرة واحدة" : "ONE-TIME PAYMENT"}
                  </span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-4">
              <form onSubmit={handleRegisterPaid} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="paid-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {lang === "ar" ? "الاسم الكامل" : "Owner Full Name"}
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4.5 w-4.5 text-zinc-400" />
                    <Input 
                      id="paid-name" 
                      placeholder={lang === "ar" ? "جاسم المحمود" : "Jassim Al-Mahmood"} 
                      required 
                      className="pl-10 text-sm"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="paid-phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {lang === "ar" ? "رقم الهاتف / الواتساب" : "WhatsApp Number"}
                    </Label>
                    <Input 
                      id="paid-phone" 
                      placeholder="39955508" 
                      required 
                      className="text-sm"
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="paid-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {lang === "ar" ? "البريد الإلكتروني" : "Email Address"}
                    </Label>
                    <Input 
                      id="paid-email" 
                      type="email" 
                      placeholder="jassim@boutique.com" 
                      required 
                      className="text-sm"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="paid-subdomain" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {lang === "ar" ? "رابط موقع متجرك المطلوب" : "Desired Boutique Subdomain"}
                  </Label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-xs text-zinc-400 font-medium font-mono select-none">https://</span>
                    <Input 
                      id="paid-subdomain" 
                      placeholder="velvet" 
                      required 
                      className="pl-16 pr-24 font-mono text-xs text-primary"
                      value={subdomain}
                      onChange={(e) => setSubdomain(e.target.value)}
                    />
                    <span className="absolute right-3 text-[10px] text-zinc-400 font-mono font-bold select-none">.boutq.store</span>
                  </div>
                  
                  {subdomain && (
                    <p className="text-[10px] flex items-center gap-1 mt-1">
                      {subdomainChecking ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                          <span className="text-muted-foreground">{lang === "ar" ? "جاري التحقق..." : "Checking availability..."}</span>
                        </>
                      ) : subdomainAvailable === true ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" />
                          <span className="text-emerald-500 font-semibold">{lang === "ar" ? "الرابط متوفر وصالح للاستخدام!" : "Subdomain handle is available!"}</span>
                        </>
                      ) : (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 inline-block" />
                          <span className="text-rose-500 font-semibold">{lang === "ar" ? "الرابط محجوز مسبقاً!" : "This subdomain is already taken."}</span>
                        </>
                      )}
                    </p>
                  )}
                </div>

                {/* Secure BenefitPay QR Mechanism inside Card B */}
                <div className="border border-zinc-100 dark:border-zinc-900 rounded-lg p-4 bg-zinc-50/50 dark:bg-zinc-950/20 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    <QrCode className="h-4 w-4 text-primary" />
                    <span>{lang === "ar" ? "مسح السداد عبر بنفت بي (BenefitPay)" : "Scan & Pay via BenefitPay QR"}</span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-zinc-950 p-3 rounded border border-zinc-100 dark:border-zinc-900">
                    {/* Simulated Merchant QR Image */}
                    <div className="h-24 w-24 bg-zinc-50 rounded p-1.5 border border-zinc-100 flex flex-col items-center justify-center shrink-0">
                      <QrCode className="h-16 w-16 stroke-[1.25] text-zinc-900" />
                      <span className="text-[6px] font-bold text-zinc-400 font-mono tracking-wider">BOUTQ-MERCHANT</span>
                    </div>

                    <div className="text-left space-y-1.5">
                      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Merchant Account: BOUTQ-OFFICIAL</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        {lang === "ar" 
                          ? `امسح رمز الاستجابة السريع سدد المبلغ الموضح (${displayPrice})، ثم ارفع لقطة شاشة تأكيد الدفع لتأكيد المعاملة.` 
                          : `Scan QR with BenefitPay, transfer ${displayPrice} to merchant, then upload the receipt screenshot below.`}
                      </p>
                    </div>
                  </div>

                  {/* Receipt screenshot uploader */}
                  <div className="relative">
                    <input 
                      id="onboarding-receipt-uploader"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleUploadReceipt}
                      className="hidden"
                      disabled={uploading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-10 border-dashed border-primary/45 bg-primary/[0.01] hover:bg-primary/[0.04]"
                      disabled={uploading}
                      onClick={() => document.getElementById("onboarding-receipt-uploader")?.click()}
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span className="text-xs">{lang === "ar" ? "جاري تشفير الرفع..." : "Encrypting R2 upload..."}</span>
                        </>
                      ) : receiptKey ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-500" />
                          <span className="text-xs text-emerald-500 font-semibold">{lang === "ar" ? "تم رفع إيصال الدفع بنجاح!" : "Receipt Screenshot Saved!"}</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="h-4 w-4 text-primary" />
                          <span className="text-xs">{lang === "ar" ? "تحميل لقطة شاشة إيصال الدفع" : "Upload Receipt Screenshot"}</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="bg-zinc-100/60 dark:bg-zinc-900/30 p-3 rounded text-[10px] text-muted-foreground flex gap-2">
                  <Info className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                  <p className="leading-normal">
                    {lang === "ar"
                      ? "يشمل 6 أشهر من الدعم الفني المضمون. أي طلبات لميزات مخصصة في المستقبل سيتم تسعيرها عند الطلب."
                      : "6 months guaranteed technical support included. Future custom feature requests will be quoted on-demand."}
                  </p>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-11 text-xs font-semibold uppercase tracking-wider gap-2 bg-primary text-white mt-4"
                  disabled={subdomainChecking || subdomainAvailable === false || uploading || !receiptKey}
                >
                  <Building2 className="h-4 w-4" />
                  {lang === "ar" ? "إرسال طلب التفعيل الرسمي" : "Submit Registration & Pay"}
                </Button>
              </form>
            </CardContent>
          </Card>
          
        </div>

        {/* Footnote and sign-in links */}
        <div className="text-center text-xs text-muted-foreground border-t border-zinc-100 dark:border-zinc-900 pt-8 mt-10">
          <span>{lang === "ar" ? "لديك حساب بالفعل؟" : "Already have a boutique on Boutq?"} </span>
          <Link to="/auth" className="text-primary hover:underline font-semibold">
            {lang === "ar" ? "تسجيل الدخول للوحة التحكم" : "Sign in to Dashboard"}
          </Link>
        </div>
      </div>
    </div>
  );
}
