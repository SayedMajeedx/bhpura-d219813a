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
  ChevronDown,
  ChevronRight,
  Info,
  PhoneCall,
  QrCode,
  Copy,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  Instagram,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getOnboardingReceiptUploadUrl,
  createTenantRequest,
  getOnboardingPrice,
  getPublicOnboardingPlans,
  getOnboardingTrialDays,
} from "@/lib/onboarding.functions";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { InstantInstagramOnboardingModal } from "@/components/onboarding/InstantInstagramOnboardingModal";

export const Route = createFileRoute("/onboard")({
  ssr: false,
  component: OnboardPage,
});

function OnboardPage() {
  const { lang, setLang } = useI18n();
  const [liveSales, setLiveSales] = useState(4284.15);
  const [activeNotifyIdx, setActiveNotifyIdx] = useState(0);
  const [instagramModalOpen, setInstagramModalOpen] = useState(false);
  const [showFeaturesModal, setShowFeaturesModal] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);
  const [activeOnboardTab, setActiveOnboardTab] = useState<"trial" | "paid">("trial");
  const [publicPlans, setPublicPlans] = useState<any[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("annual");
  const [trialDays, setTrialDays] = useState(14);

  const notifications = [
    {
      name_en: "Sofia Al Khalifa",
      name_ar: "صوفيا آل خليفة",
      item: "Organza Silk Abaya",
      price: "145.000 BHD",
    },
    {
      name_en: "Fatima Al Doseri",
      name_ar: "فاطمة الدوسري",
      item: "Velvet Gown",
      price: "280.000 BHD",
    },
    {
      name_en: "Amina Al Jalahma",
      name_ar: "أمينة الجلاهمة",
      item: "Linen Trench Abaya",
      price: "110.000 BHD",
    },
  ];

  useEffect(() => {
    const salesInterval = setInterval(() => {
      setLiveSales((prev) => {
        const next = prev + (Math.random() * 0.15 + 0.05);
        return next > 4300 ? 4284.15 : Number(next.toFixed(3));
      });
    }, 4000);

    const notifyInterval = setInterval(() => {
      setActiveNotifyIdx((prev) => (prev + 1) % notifications.length);
    }, 6000);

    return () => {
      clearInterval(salesInterval);
      clearInterval(notifyInterval);
    };
  }, [notifications.length]);

  const [loadingPrice, setLoadingPrice] = useState(true);
  const [basePrice, setBasePrice] = useState(55);
  const [discountPrice, setDiscountPrice] = useState<number | null>(null);
  const [platformIconUrl, setPlatformIconUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [benefitPayQrUrl, setBenefitPayQrUrl] = useState<string | null>(null);
  const [merchantAccountName, setMerchantAccountName] = useState("BOUTQ-OFFICIAL");
  const [subscriptionIban, setSubscriptionIban] = useState("BH12KHCB0000001234567890");
  const [whatsappNumber, setWhatsappNumber] = useState("97339955508");

  // Load Dynamic Settings on mount
  useEffect(() => {
    async function loadDynamicSettings() {
      try {
        const { data, error } = await (supabase as any)
          .from("system_settings")
          .select(
            "base_price_bhd, discount_price_bhd, platform_icon_url, whatsapp_support_number, benefit_pay_qr_url, merchant_account_name, subscription_iban",
          )
          .eq("id", 1)
          .maybeSingle();

        if (data && !error) {
          if (data.base_price_bhd) setBasePrice(Number(data.base_price_bhd));
          setDiscountPrice(data.discount_price_bhd ? Number(data.discount_price_bhd) : null);
          setPlatformIconUrl(data.platform_icon_url || null);
          setBenefitPayQrUrl(data.benefit_pay_qr_url || null);
          if (data.merchant_account_name) setMerchantAccountName(data.merchant_account_name);
          if (data.subscription_iban) setSubscriptionIban(data.subscription_iban);
          if (data.whatsapp_support_number) setWhatsappNumber(data.whatsapp_support_number);
        } else {
          // Fallback to getOnboardingPrice server function if direct query fails
          const price = await getOnboardingPrice();
          const priceStr = typeof price === "string" ? price : "55";
          const parsed = parseFloat(priceStr.replace(/[^0-9.]/g, "")) || 55;
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

  useEffect(() => {
    async function loadPublicPlans() {
      try {
        const [plans, configuredTrialDays] = await Promise.all([
          getPublicOnboardingPlans(),
          getOnboardingTrialDays(),
        ]);
        setTrialDays(configuredTrialDays);
        const paidPlans = (plans ?? []).filter(
          (plan: any) =>
            plan.code !== "trial" &&
            (Number(plan.version?.price_monthly || 0) > 0 ||
              Number(plan.version?.price_annual || 0) > 0),
        );
        setPublicPlans(paidPlans);
        setSelectedPlanId((current) => current || paidPlans[0]?.id || null);
      } catch (error) {
        console.error("Failed to load public SaaS catalog", error);
        toast.error(
          lang === "ar"
            ? "تعذر تحميل الباقات حالياً. يرجى إعادة المحاولة."
            : "Plans are temporarily unavailable. Please retry.",
        );
      } finally {
        setPlansLoading(false);
      }
    }
    void loadPublicPlans();
  }, [lang]);

  const selectedPlan = publicPlans.find((plan) => plan.id === selectedPlanId) ?? null;
  const availableBillingIntervals = (["monthly", "annual"] as const).filter((interval) =>
    publicPlans.some(
      (plan) =>
        Number(
          interval === "monthly"
            ? plan.version?.price_monthly || 0
            : plan.version?.price_annual || 0,
        ) > 0,
    ),
  );
  const chooseBillingInterval = (interval: "monthly" | "annual") => {
    const currentSupportsInterval =
      selectedPlan &&
      Number(
        interval === "monthly"
          ? selectedPlan.version.price_monthly
          : selectedPlan.version.price_annual,
      ) > 0;
    const fallbackPlan = publicPlans.find(
      (plan) =>
        Number(
          interval === "monthly" ? plan.version.price_monthly : plan.version.price_annual,
        ) > 0,
    );
    setBillingInterval(interval);
    if (!currentSupportsInterval) setSelectedPlanId(fallbackPlan?.id || null);
  };
  const selectedPrice = selectedPlan
    ? Number(
        billingInterval === "monthly"
          ? selectedPlan.version.price_monthly
          : selectedPlan.version.price_annual,
      )
    : discountPrice !== null
      ? discountPrice
      : basePrice;
  const displayPrice = `${selectedPrice} ${selectedPlan?.version?.currency || "BHD"}`;

  // Form Fields - Isolated for Trial or Official Packages
  const [trialFullName, setTrialFullName] = useState("");
  const [trialContactNumber, setTrialContactNumber] = useState("");
  const [trialEmail, setTrialEmail] = useState("");
  const [trialSubdomain, setTrialSubdomain] = useState("");
  const [trialBusinessType, setTrialBusinessType] = useState("Fashion");
  const [trialSubdomainChecking, setTrialSubdomainChecking] = useState(false);
  const [trialSubdomainAvailable, setTrialSubdomainAvailable] = useState<boolean | null>(null);

  const [officialFullName, setOfficialFullName] = useState("");
  const [officialContactNumber, setOfficialContactNumber] = useState("");
  const [officialEmail, setOfficialEmail] = useState("");
  const [officialSubdomain, setOfficialSubdomain] = useState("");
  const [officialBusinessType, setOfficialBusinessType] = useState("Fashion");
  const [officialSubdomainChecking, setOfficialSubdomainChecking] = useState(false);
  const [officialSubdomainAvailable, setOfficialSubdomainAvailable] = useState<boolean | null>(
    null,
  );

  // File Uploader state for Card B (Official Paid Activation)
  const [uploading, setUploading] = useState(false);
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  const [trialTurnstileToken, setTrialTurnstileToken] = useState<string | null>(null);
  const [paidUploadTurnstileToken, setPaidUploadTurnstileToken] = useState<string | null>(null);
  const [paidSubmitTurnstileToken, setPaidSubmitTurnstileToken] = useState<string | null>(null);
  const [trialTurnstileReset, setTrialTurnstileReset] = useState(0);
  const [paidUploadTurnstileReset, setPaidUploadTurnstileReset] = useState(0);
  const [paidSubmitTurnstileReset, setPaidSubmitTurnstileReset] = useState(0);

  // Success Confirmation overlay trigger
  const [isDeployedPending, setIsDeployedPending] = useState(false);
  const [submittedSubdomain, setSubmittedSubdomain] = useState("");
  const [isTrialSuccess, setIsTrialSuccess] = useState(false);

  // Clean and check Trial subdomain uniqueness
  useEffect(() => {
    if (!trialSubdomain) {
      setTrialSubdomainAvailable(null);
      return;
    }

    const cleaned = trialSubdomain
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (cleaned !== trialSubdomain) {
      setTrialSubdomain(cleaned);
    }

    const checkUniqueness = async () => {
      setTrialSubdomainChecking(true);
      try {
        const { data: available, error } = await (supabase.rpc as any)(
          "is_tenant_subdomain_available",
          { p_subdomain: cleaned },
        );
        if (error) throw error;
        setTrialSubdomainAvailable(available === true);
      } catch {
        setTrialSubdomainAvailable(false);
      } finally {
        setTrialSubdomainChecking(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      void checkUniqueness();
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [trialSubdomain]);

  // Clean and check Official subdomain uniqueness
  useEffect(() => {
    if (!officialSubdomain) {
      setOfficialSubdomainAvailable(null);
      return;
    }

    const cleaned = officialSubdomain
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (cleaned !== officialSubdomain) {
      setOfficialSubdomain(cleaned);
    }

    const checkUniqueness = async () => {
      setOfficialSubdomainChecking(true);
      try {
        const { data: available, error } = await (supabase.rpc as any)(
          "is_tenant_subdomain_available",
          { p_subdomain: cleaned },
        );
        if (error) throw error;
        setOfficialSubdomainAvailable(available === true);
      } catch {
        setOfficialSubdomainAvailable(false);
      } finally {
        setOfficialSubdomainChecking(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      void checkUniqueness();
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [officialSubdomain]);

  // Upload receipt to Private R2 Bucket
  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!paidUploadTurnstileToken) {
      toast.error(
        lang === "ar"
          ? "يرجى إكمال فحص الأمان قبل رفع الإيصال."
          : "Please complete the security check before uploading the receipt.",
      );
      e.target.value = "";
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error(
        lang === "ar"
          ? "يرجى تحميل صورة صالحة (JPEG, PNG, WEBP)."
          : "Please upload a valid image file (JPEG, PNG, WEBP).",
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(
        lang === "ar" ? "الحد الأقصى لحجم الملف هو 5 ميجابايت." : "Maximum file size is 5MB.",
      );
      return;
    }

    setUploading(true);
    const toastId = toast.loading(
      lang === "ar" ? "جاري تجهيز رفع الإيصال..." : "Preparing secure receipt upload...",
    );

    try {
      const { objectKey, uploadUrl } = await getOnboardingReceiptUploadUrl({
        data: {
          contentType: file.type as any,
          size: file.size,
          turnstileToken: paidUploadTurnstileToken,
        },
      });

      toast.loading(
        lang === "ar"
          ? "جاري رفع إيصال الدفع..."
          : "Encrypting and storing receipt screenshot in Private R2 Bucket...",
        { id: toastId },
      );
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!response.ok) {
        throw new Error("S3 direct PUT upload failed.");
      }

      setReceiptKey(objectKey);
      toast.success(
        lang === "ar"
          ? "تم رفع إيصال الدفع بنجاح."
          : "Payment receipt uploaded and encrypted securely!",
        { id: toastId },
      );
    } catch (err: any) {
      console.error(err);
      toast.error(
        lang === "ar"
          ? "فشل تحميل إيصال الدفع. يرجى المحاولة لاحقاً."
          : "Failed to upload payment receipt. Please retry.",
        { id: toastId },
      );
    } finally {
      setUploading(false);
      setPaidUploadTurnstileToken(null);
      setPaidUploadTurnstileReset((value) => value + 1);
    }
  };

  // Submission Flow - CARD A: admin-configured free trial
  const handleRegisterTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trialFullName || !trialContactNumber || !trialEmail || !trialSubdomain) {
      toast.error(
        lang === "ar" ? "يرجى ملء جميع الحقول المطلوبة." : "Please fill out all required fields.",
      );
      return;
    }

    if (trialSubdomainAvailable === false) {
      toast.error(
        lang === "ar" ? "رابط المتجر هذا محجوز مسبقاً." : "This store subdomain is already taken.",
      );
      return;
    }

    if (!trialTurnstileToken) {
      toast.error(
        lang === "ar"
          ? "يرجى إكمال فحص الأمان أولاً."
          : "Please complete the security check first.",
      );
      return;
    }

    const toastId = toast.loading(
      lang === "ar" ? "جاري إرسال طلب تفعيل النسخة التجريبية..." : "Sending trial request...",
    );

    try {
      // Save metadata lead safely to tenant_requests with status 'pending'
      await createTenantRequest({
        data: {
          fullName: trialFullName,
          contactNumber: trialContactNumber,
          email: trialEmail,
          desiredSubdomain: trialSubdomain,
          requestType: "trial",
          businessType: trialBusinessType,
          turnstileToken: trialTurnstileToken,
        },
      });

      const waMessage =
        lang === "ar"
          ? `مرحباً دعم بوتيك (Boutq)! لقد أرسلت للتو طلب تفعيل التجربة المجانية لمدة ${trialDays} يوماً لمتجري باسم: "${trialFullName}" والرابط المطلوب: "${trialSubdomain}.boutq.store". البريد الإلكتروني: ${trialEmail}.`
          : `Hello Boutq Support! I just submitted a ${trialDays}-day free trial request. Owner: "${trialFullName}", Desired subdomain: "${trialSubdomain}.boutq.store", Contact: ${trialContactNumber}, Email: ${trialEmail}.`;

      const encodedMessage = encodeURIComponent(waMessage);
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;

      toast.success(
        lang === "ar"
          ? "وصلنا طلبك بنجاح، وبنتواصل معك قريباً."
          : "Request Received - Waiting for Manual Activation",
        { id: toastId },
      );

      setSubmittedSubdomain(trialSubdomain);
      setIsTrialSuccess(true);
      setIsDeployedPending(true);

      // Open WhatsApp safely to speed up onboarding activation
      setTimeout(() => {
        window.open(whatsappUrl, "_blank");
      }, 1200);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "An unexpected error occurred during submission.", {
        id: toastId,
      });
    } finally {
      setTrialTurnstileToken(null);
      setTrialTurnstileReset((value) => value + 1);
    }
  };

  // Submission Flow - CARD B: Paid Official Store Activation
  const handleRegisterPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!officialFullName || !officialContactNumber || !officialEmail || !officialSubdomain) {
      toast.error(
        lang === "ar" ? "يرجى ملء جميع الحقول المطلوبة." : "Please fill out all required fields.",
      );
      return;
    }

    if (!selectedPlan) {
      toast.error(
        lang === "ar" ? "يرجى اختيار باقة متاحة أولاً." : "Please select an available plan first.",
      );
      return;
    }

    if (officialSubdomainAvailable === false) {
      toast.error(
        lang === "ar" ? "رابط المتجر هذا محجوز مسبقاً." : "This store subdomain is already taken.",
      );
      return;
    }

    if (!receiptKey) {
      toast.error(
        lang === "ar"
          ? "يرجى رفع لقطة شاشة تأكيد الدفع قبل المتابعة."
          : "Please upload your payment receipt screenshot before submitting.",
      );
      return;
    }

    if (!paidSubmitTurnstileToken) {
      toast.error(
        lang === "ar"
          ? "يرجى إكمال فحص الأمان أولاً."
          : "Please complete the security check first.",
      );
      return;
    }

    const toastId = toast.loading(
      lang === "ar"
        ? "جاري إرسال طلب تفعيل متجرك الرسمي..."
        : "Sending official store activation request...",
    );

    try {
      // Save metadata lead safely to tenant_requests as 'pending'
      await createTenantRequest({
        data: {
          fullName: officialFullName,
          contactNumber: officialContactNumber,
          email: officialEmail,
          desiredSubdomain: officialSubdomain,
          requestType: "paid",
          selectedPlanId: selectedPlan.id,
          selectedPlanVersionId: selectedPlan.version.id,
          billingInterval,
          benefitReceiptUrl: receiptKey,
          businessType: officialBusinessType,
          turnstileToken: paidSubmitTurnstileToken,
        },
      });

      toast.success(
        lang === "ar"
          ? "وصلنا طلب تفعيل متجرك بنجاح، وبنراجع الدفع ونتواصل معك قريباً."
          : "Request Received - Waiting for Manual Activation",
        { id: toastId, duration: 6000 },
      );

      setSubmittedSubdomain(officialSubdomain);
      setIsTrialSuccess(false);
      setIsDeployedPending(true);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "An unexpected error occurred during activation submission.", {
        id: toastId,
      });
    } finally {
      setPaidSubmitTurnstileToken(null);
      setPaidSubmitTurnstileReset((value) => value + 1);
    }
  };

  const handleCopyIban = (ibanStr: string) => {
    navigator.clipboard.writeText(ibanStr.replace(/\s+/g, ""));
    setCopiedIban(true);
    toast.success(lang === "ar" ? "تم نسخ الـ IBAN بنجاح!" : "IBAN copied to clipboard!");
    setTimeout(() => setCopiedIban(false), 2000);
  };

  // SUCCESS CONFIRMATION OVERLAY (Waiting for Manual Activation freeze state)
  if (isDeployedPending) {
    return (
      <div
        dir={lang === "ar" ? "rtl" : "ltr"}
        className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-6 relative overflow-hidden text-white dark"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(128,0,32,0.1),transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.9))]" />

        <Card className="max-w-xl w-full border-zinc-900 bg-zinc-900/40 backdrop-blur-md shadow-2xl relative z-10 p-8 text-center text-white">
          <div className="h-16 w-16 bg-primary/10 rounded-full border border-primary/20 flex items-center justify-center mx-auto mb-6 text-primary">
            {isTrialSuccess ? (
              <Sparkles className="h-8 w-8 animate-pulse text-primary" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-emerald-500 animate-bounce" />
            )}
          </div>

          <h1 className="text-2xl md:text-3xl font-display font-medium tracking-tight mb-3">
            {lang === "ar"
              ? "تم استلام طلبك"
              : "Request Received - Waiting for Manual Activation"}
          </h1>

          <p className="text-zinc-400 text-sm leading-relaxed mb-6 text-center">
            {lang === "ar" ? (
              <>
                تم إرسال طلب تفعيل متجرك{" "}
                <bdi dir="ltr" className="inline-block">
                  &quot;{submittedSubdomain}.boutq.store&quot;
                </bdi>{" "}
                بنجاح إلى فريق الإدارة.
              </>
            ) : (
              `Your luxury boutique registration request for "${submittedSubdomain}.boutq.store" has been recorded in our activation queue.`
            )}
          </p>

          <div
            className={`bg-zinc-950/60 border border-zinc-900 rounded-lg p-5 mb-8 space-y-4 ${
              lang === "ar" ? "text-right" : "text-left"
            }`}
          >
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-xs text-zinc-400 leading-relaxed">
                <p className="font-semibold text-zinc-200 mb-1">
                  {lang === "ar"
                    ? "شنو الخطوة التالية؟"
                    : "What is the deployment procedure?"}
                </p>
                {isTrialSuccess ? (
                  <p>
                    {lang === "ar"
                      ? "بنجهز متجرك ونرسل لك رابط الدخول على الواتساب بمجرد ما يكون جاهز."
                      : "A superadmin is currently reviewing your trial request. Once approved, your temporary 3-day workspace will be spun up. Message support on WhatsApp to fast-track approval."}
                  </p>
                ) : (
                  <p>
                    {lang === "ar"
                      ? "بنراجع إيصال الدفع، وبعدها بنرسل لك رابط المتجر وبيانات الدخول على الواتساب."
                      : "An administrator will verify your uploaded BenefitPay transfer reference screenshot. Once approved, your official brand platform and manager dashboards will be manually deployed within 2 hours."}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="outline"
              className="bg-transparent hover:bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all"
              onClick={() => {
                setIsDeployedPending(false);
                setTrialFullName("");
                setTrialContactNumber("");
                setTrialEmail("");
                setTrialSubdomain("");
                setOfficialFullName("");
                setOfficialContactNumber("");
                setOfficialEmail("");
                setOfficialSubdomain("");
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
              {lang === "ar" ? "تواصل معنا على الواتساب" : "Contact us on WhatsApp"}
            </a>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbfaf8] text-foreground">
      {/* Immersive product hero */}
      <div className="flex min-h-[620px] w-full bg-[#120b0d] text-white flex-col justify-between px-6 py-7 sm:px-10 lg:min-h-[680px] lg:px-16 lg:py-10 relative overflow-hidden select-none">
        <style>{`
          @keyframes float-slow {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-10px) rotate(0.5deg); }
          }
          @keyframes float-slower {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(12px) rotate(-1deg); }
          }
          @keyframes pulse-soft {
            0%, 100% { opacity: 0.15; transform: scale(1); }
            50% { opacity: 0.35; transform: scale(1.05); }
          }
          @keyframes banner-slide {
            0%, 100% { transform: translateY(-20px); opacity: 0; }
            8%, 92% { transform: translateY(0); opacity: 1; }
          }
          .animate-float-slow {
            animation: float-slow 8s ease-in-out infinite;
          }
          .animate-float-slower {
            animation: float-slower 10s ease-in-out infinite;
          }
          .animate-pulse-soft {
            animation: pulse-soft 6s ease-in-out infinite;
          }
          .animate-banner-slide {
            animation: banner-slide 6s ease-in-out infinite;
          }
        `}</style>

        {/* Dynamic moving luxury gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,rgba(137,25,43,0.32),transparent_34%),radial-gradient(circle_at_10%_100%,rgba(130,88,70,0.18),transparent_42%)] z-0" />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(18,11,13,0.98)_0%,rgba(18,11,13,0.88)_44%,rgba(10,7,8,0.7)_100%)] z-0" />

        {/* Showcase Canvas Background (Animated Cards) */}
        <div className={`absolute inset-y-0 hidden w-[52%] pointer-events-none opacity-80 lg:block z-0 ${lang === "ar" ? "left-0" : "right-0"}`}>
          {/* Glowing gradient backdrops */}
          <div className="absolute top-[20%] right-[-10%] w-72 h-72 rounded-full bg-rose-500/10 blur-3xl animate-pulse-soft" />
          <div
            className="absolute bottom-[25%] left-[-10%] w-80 h-80 rounded-full bg-primary/15 blur-3xl animate-pulse-soft"
            style={{ animationDelay: "2s" }}
          />

          {/* New Order Pill Notification */}
          <div className="absolute top-[18%] left-[8%] right-[8%] z-20 animate-banner-slide">
            <div className="bg-zinc-900/90 border border-emerald-500/30 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-950/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[9px] font-bold tracking-wider text-emerald-400 uppercase">
                  {lang === "ar" ? "طلب جديد" : "NEW ORDER"}
                </span>
              </div>
              <div className="text-[10px] font-medium text-zinc-200 truncate max-w-[120px]">
                {lang === "ar"
                  ? `${notifications[activeNotifyIdx].name_ar} • ${notifications[activeNotifyIdx].item}`
                  : `${notifications[activeNotifyIdx].name_en} • ${notifications[activeNotifyIdx].item}`}
              </div>
              <div className="text-[10px] font-bold text-emerald-400 whitespace-nowrap">
                {notifications[activeNotifyIdx].price}
              </div>
            </div>
          </div>

          {/* Live Sales Dashboard Card */}
          <div className="absolute top-[34%] left-[13%] right-[6%] bg-white/[0.06] border border-white/10 backdrop-blur-xl p-6 rounded-[28px] shadow-2xl shadow-black/40 animate-float-slow">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[9px] text-zinc-400 font-bold tracking-widest uppercase">
                {lang === "ar" ? "المبيعات المباشرة" : "LIVE MERCHANT SALES"}
              </span>
              <span className="text-[8px] bg-rose-500/10 text-rose-400 font-bold border border-rose-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping" />
                LIVE
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-zinc-100 flex items-baseline gap-1.5">
              <span>{liveSales.toFixed(3)}</span>
              <span className="text-xs text-zinc-400 font-sans font-medium">BHD</span>
            </div>
            {/* Sparkline visualization */}
            <div className="h-8 mt-4 flex items-end gap-1.5">
              {[40, 55, 45, 60, 75, 50, 70, 85, 90, 80, 95].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-zinc-800/60 transition-all duration-500"
                  style={{
                    height: `${h}%`,
                    backgroundColor: i === 10 ? "var(--color-primary)" : undefined,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Luxury Abaya Product Card */}
          <div
            className="absolute bottom-[13%] left-[5%] w-[62%] bg-white/[0.06] border border-white/10 backdrop-blur-xl p-4 rounded-2xl shadow-2xl animate-float-slower"
            style={{ animationDelay: "1s" }}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-zinc-800/80 flex items-center justify-center border border-border">
                <Store className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-zinc-200 truncate">
                  {lang === "ar" ? "عباية الحرير الأورجانزا" : "Silk Organza Abaya"}
                </p>
                <p className="text-[8px] text-zinc-400">
                  {lang === "ar" ? "المخزون: 4 قطع متبقية" : "Stock: 4 remaining"}
                </p>
              </div>
              <span className="text-[10px] font-bold text-primary whitespace-nowrap">145 BHD</span>
            </div>
          </div>

          {/* Floating VIP customer tag */}
          <div
            className="absolute bottom-[23%] right-[7%] bg-rose-500/10 border border-rose-400/20 text-rose-200 text-[9px] font-bold px-3 py-1.5 rounded-full shadow-md animate-float-slow"
            style={{ animationDelay: "2.5s" }}
          >
            {lang === "ar" ? "عملاء كبار الشخصيات VIP" : "VIP CONCIERGE"}
          </div>
        </div>

        {/* Top Header Section */}
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
          {platformIconUrl && !logoError ? (
            <img
              src={platformIconUrl}
              alt="Boutq Logo"
              className="h-8 object-contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <>
              <Store className="h-6 w-6 text-primary" />
              <span className="font-display text-lg tracking-wider font-semibold">Boutq</span>
            </>
          )}
          </div>
          <div className="hidden items-center gap-2 text-[11px] text-zinc-400 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" />
            {lang === "ar" ? "المنصة تعمل الآن" : "Platform operational"}
          </div>
        </div>

        {/* Central Overlay Text with luxury branding content */}
        <div className={`relative z-10 my-auto max-w-xl space-y-7 pt-14 lg:w-[43%] lg:pt-0 ${lang === "ar" ? "lg:mr-[4%] lg:ml-auto" : "lg:ml-[4%]"}`}>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-rose-100 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-rose-300" />
            {lang === "ar" ? "من الفكرة إلى متجر متكامل" : "FROM IDEA TO A COMPLETE STORE"}
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-display font-medium leading-[1.12] tracking-[-0.035em]">
            {lang === "ar"
              ? "كل اللي يحتاجه متجرك، في مكان واحد."
              : "Your store, operations, and growth. One platform."}
          </h2>
          <p className="max-w-lg text-sm leading-7 text-zinc-300 sm:text-base">
            {lang === "ar"
              ? "أنشئ متجرك، تابع طلباتك ومخزونك، واعرف مبيعاتك بسهولة من لوحة تحكم واحدة."
              : "Boutq OS brings storefront, orders, inventory, customers, analytics and marketing into one experience built for ambitious brands."}
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#start" className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-[#330a0a] shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:bg-rose-50">
              {lang === "ar" ? "ابدأ الآن" : "Get started"}
              <ArrowUpRight className="h-4 w-4" />
            </a>
            <button type="button" onClick={() => setShowFeaturesModal(true)} className="inline-flex h-12 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-6 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/[0.09]">
              {lang === "ar" ? "استكشف المنصة" : "Explore the platform"}
            </button>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-400" />{lang === "ar" ? "بياناتك محفوظة" : "Enterprise security"}</span>
            <span className="flex items-center gap-1.5"><Zap className="h-4 w-4 text-amber-300" />{lang === "ar" ? "متجرك جاهز بسرعة" : "Fast launch"}</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-sky-300" />{lang === "ar" ? "دعم مباشر" : "Direct support"}</span>
          </div>
        </div>

        {/* Footer info badge */}
        <div className="relative z-10 text-[11px] text-zinc-500 flex items-center gap-1.5 mt-auto">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>
            {lang === "ar" ? "تجربة آمنة وسريعة" : "Secure, reliable cloud platform"}
          </span>
        </div>
      </div>

      {/* Main Interaction Area */}
      <main id="start" className="mx-auto flex w-full max-w-[1240px] flex-col justify-between px-5 py-10 sm:px-8 lg:px-10 lg:py-16">
        {/* Top bar with Translation selector */}
        <div className="flex justify-between items-center gap-4 mb-14">
          <div className="flex items-center gap-2 md:hidden">
            {platformIconUrl && !logoError ? (
              <img
                src={platformIconUrl}
                alt="Boutq Logo"
                className="h-6 object-contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <>
                <Store className="h-5 w-5 text-primary" />
                <span className="font-display text-base tracking-wider font-semibold">Boutq</span>
              </>
            )}
          </div>
          <div className="flex justify-end items-center gap-4 ml-auto">
            <a
              href="https://pura.boutq.store"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 hover:bg-primary/20 border border-primary/20 text-xs font-semibold text-primary rounded-full transition-all select-none"
            >
              <Sparkles className="h-3 w-3" />
              {lang === "ar" ? "المتجر النموذج" : "Live Demo"}
            </a>
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <Select value={lang} onValueChange={(v) => setLang(v as "en" | "ar")}>
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="mx-auto mb-14 max-w-3xl text-center">
          <div className="mb-4 flex flex-col items-center gap-4">
            <span className="rounded-full border border-primary/15 bg-primary/[0.045] px-3 py-1 text-[10px] font-bold tracking-[0.16em] text-primary">
              {lang === "ar" ? "خلنا نبدأ" : "START YOUR BOUTQ JOURNEY"}
            </span>
            <h1 className="text-3xl md:text-5xl font-display font-semibold text-foreground tracking-[-0.035em]">
              {lang === "ar" ? "اختر الطريقة المناسبة لبدء متجرك" : "Choose the start that fits your ambition"}
            </h1>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFeaturesModal(true)}
              className="border-primary/20 hover:border-primary text-primary bg-white hover:bg-primary/5 rounded-full font-semibold px-4 h-9 self-center shrink-0"
            >
              ✨ {lang === "ar" ? "اكتشف جميع مميزات منصة Boutq" : "Discover All Boutq Features"}
            </Button>
          </div>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground leading-7">
            {lang === "ar"
              ? `جرّب Boutq مجاناً لمدة ${trialDays} يوماً، أو اختر باقتك وابدأ متجرك مباشرة.`
              : `Start with a ${trialDays}-day free trial or activate your plan immediately. Pricing, features and trial duration stay synchronized with Boutq OS.`}
          </p>
        </div>

        {/* Live SaaS catalog: sourced from the current public versions managed by Super Admin. */}
        <section className="mb-14 space-y-6 rounded-[32px] border border-black/[0.06] bg-white p-5 shadow-[0_24px_70px_rgba(51,10,10,0.07)] sm:p-8" aria-labelledby="plans-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-primary">
                <Sparkles className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
                  {lang === "ar" ? "باقات Boutq" : "Boutq plans"}
                </span>
              </div>
              <h2 id="plans-heading" className="font-display text-2xl font-semibold">
                {lang === "ar" ? "اختر الباقة المناسبة لك" : "Choose the right foundation for growth"}
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                {lang === "ar"
                  ? "شوف تفاصيل كل باقة واختر اللي يناسب حجم متجرك واحتياجك."
                  : "Pricing and capabilities are published directly from Boutq OS. Hidden or retired plans never appear here."}
              </p>
            </div>
            <div className="inline-flex self-start rounded-xl border border-border bg-muted/40 p-1 shadow-sm">
              {availableBillingIntervals.map((interval) => (
                <button
                  key={interval}
                  type="button"
                  onClick={() => chooseBillingInterval(interval)}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                    billingInterval === interval
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {interval === "monthly"
                    ? lang === "ar"
                      ? "شهري"
                      : "Monthly"
                    : lang === "ar"
                      ? "سنوي"
                      : "Annual"}
                </button>
              ))}
            </div>
          </div>

          {plansLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-64 animate-pulse rounded-2xl border bg-muted/40" />
              ))}
            </div>
          ) : publicPlans.length === 0 ? (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6 text-center text-sm text-amber-700 dark:text-amber-300">
              {lang === "ar"
                ? "لا توجد باقات منشورة حالياً. تواصل معنا وسنساعدك في اختيار الحل المناسب."
                : "No plans are currently published. Contact us and we will tailor the right setup."}
            </div>
          ) : (
            <div className={`grid gap-5 ${publicPlans.length === 1 ? "mx-auto w-full max-w-2xl" : "md:grid-cols-2 xl:grid-cols-3"}`}>
              {publicPlans.map((plan) => {
                const active = selectedPlanId === plan.id;
                const price = Number(
                  billingInterval === "monthly"
                    ? plan.version.price_monthly
                    : plan.version.price_annual,
                );
                const monthlyEquivalent = Number(plan.version.price_annual) / 12;
                const availableForInterval = price > 0;
                return (
                  <button
                    type="button"
                    key={plan.id}
                    onClick={() => {
                      if (!availableForInterval) return;
                      setSelectedPlanId(plan.id);
                      setActiveOnboardTab("paid");
                    }}
                    disabled={!availableForInterval}
                    className={`group relative overflow-hidden rounded-[24px] border p-6 text-start transition-all duration-300 ${
                      active
                        ? "border-primary bg-[linear-gradient(145deg,rgba(51,10,10,.035),rgba(255,255,255,1))] shadow-2xl shadow-primary/10 ring-1 ring-primary"
                        : "border-border bg-card shadow-sm hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
                    } ${!availableForInterval ? "cursor-not-allowed opacity-55" : ""}`}
                  >
                    {active && (
                      <span className="absolute end-4 top-4 rounded-full bg-primary px-2.5 py-1 text-[9px] font-bold text-primary-foreground">
                        {lang === "ar" ? "اختيارك" : "SELECTED"}
                      </span>
                    )}
                    <div className="pe-16">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                        {plan.code}
                      </p>
                      <h3 className="mt-1 font-display text-xl font-semibold">
                        {lang === "ar" ? plan.name_ar : plan.name_en}
                      </h3>
                      <p className="mt-1 min-h-9 text-xs leading-relaxed text-muted-foreground">
                        {lang === "ar" ? `كل ما تحتاجه لإدارة متجرك، مع ${plan.features.length} مزايا أساسية.` : ((plan.description_en as string) || "Everything you need to run your store.")}
                      </p>
                    </div>
                    <div className="my-5 flex items-end gap-1 border-y border-border/60 py-4">
                      <span className="font-display text-3xl font-bold text-foreground">{price}</span>
                      <span className="pb-1 text-xs text-muted-foreground">
                        {plan.version.currency} / {billingInterval === "monthly" ? (lang === "ar" ? "شهر" : "mo") : (lang === "ar" ? "سنة" : "yr")}
                      </span>
                    </div>
                    {billingInterval === "annual" && monthlyEquivalent > 0 && (
                      <p className="-mt-3 mb-4 text-[10px] font-medium text-emerald-600">
                        {lang === "ar"
                          ? `يعادل ${monthlyEquivalent.toFixed(0)} د.ب شهرياً`
                          : `Equivalent to ${monthlyEquivalent.toFixed(0)} BHD/month`}
                      </p>
                    )}
                    <div className="space-y-2.5">
                      {plan.features.slice(0, 6).map((feature: any) => (
                        <div key={feature.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/10">
                            <Check className="h-3 w-3 text-emerald-600" />
                          </span>
                          <span>{lang === "ar" ? feature.name_ar : feature.name_en}</span>
                          {feature.numeric_value != null && feature.numeric_value !== 0 && (
                            <strong className="ms-auto text-foreground">
                              {feature.numeric_value === -1 ? "∞" : feature.numeric_value.toLocaleString()}
                            </strong>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className={`mt-5 rounded-xl py-2.5 text-center text-xs font-bold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground group-hover:bg-primary/10 group-hover:text-primary"}`}>
                      {!availableForInterval
                        ? lang === "ar"
                          ? "غير متوفرة حالياً"
                          : "Unavailable for this interval"
                        : active
                          ? lang === "ar"
                            ? "تم اختيار الباقة"
                            : "Plan selected"
                          : lang === "ar"
                            ? "اختر هذه الباقة"
                            : "Choose this plan"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Compact live proof for small screens */}
        <div className="hidden bg-zinc-950 text-white border border-primary/30 rounded-2xl p-4 mb-6 shadow-lg shadow-rose-950/5 flex-col gap-3.5 relative overflow-hidden select-none">
          {/* Background glow orb */}
          <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full bg-primary/10 blur-xl animate-pulse-soft" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[9px] text-zinc-400 font-bold uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping shrink-0" />
              {lang === "ar" ? "نشاط منصة BOUTQ المباشر" : "LIVE BOUTQ NETWORK TRACKER"}
            </div>
            <span className="text-[11px] font-mono text-emerald-500 font-bold tracking-tight bg-emerald-500/10 px-2.5 py-0.5 rounded-md animate-pulse">
              {liveSales.toLocaleString(undefined, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}{" "}
              BHD
            </span>
          </div>

          {/* Small Rotating Order Notification Pill */}
          <div className="bg-zinc-900/50 border border-border rounded-xl px-3 py-2 text-xs flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-zinc-300 font-medium text-[11px] truncate">
                {lang === "ar" ? "طلب جديد من" : "New order from"}{" "}
                <strong className="text-white">
                  {lang === "ar"
                    ? notifications[activeNotifyIdx].name_ar
                    : notifications[activeNotifyIdx].name_en}
                </strong>
              </span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
              {notifications[activeNotifyIdx].price}
            </span>
          </div>
        </div>

        {/* Instant Instagram AI Launch Banner */}
        <div className="mx-auto mb-6 w-full max-w-3xl rounded-2xl border border-primary/20 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-amber-500/10 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-500 text-white flex items-center justify-center shrink-0 shadow-md">
              <Instagram className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">
                  {lang === "ar" ? "عندك حساب انستقرام للمتجر؟" : "Have an Instagram Store?"}
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                  {lang === "ar" ? "تلقائي بثوانٍ" : "Auto Import"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {lang === "ar"
                  ? "نسحب المنتجات والصور والأسعار وننشئ متجرك تلقائياً بدون تعبئة بيانات يدوية."
                  : "We'll scrape your posts, images, and prices with AI and launch your store in seconds."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => setInstagramModalOpen(true)}
            className="w-full sm:w-auto shrink-0 bg-gradient-to-tr from-pink-600 via-rose-600 to-amber-600 text-white font-bold text-xs h-9 px-4 rounded-xl shadow-md hover:opacity-95"
          >
            <Sparkles className="size-3.5 me-1.5" />
            {lang === "ar" ? "استيراد الكتالوج الفوري" : "Instant Catalog Import"}
          </Button>
        </div>

        <InstantInstagramOnboardingModal
          open={instagramModalOpen}
          onOpenChange={setInstagramModalOpen}
        />

        {/* One clear decision at a time keeps the application concise. */}
        <div className="mx-auto mb-7 flex w-full max-w-3xl rounded-2xl border border-black/[0.06] bg-white p-1.5 shadow-sm select-none relative z-10">
          <button
            onClick={() => setActiveOnboardTab("trial")}
            className={`flex-1 px-3 py-3 text-center text-xs font-semibold rounded-xl transition-all sm:text-sm ${
              activeOnboardTab === "trial"
                ? "bg-[#330a0a] text-white shadow-md font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {lang === "ar" ? `تجربة مجانية (${trialDays} يوماً)` : `${trialDays}-Day Free Trial`}
          </button>
          <button
            onClick={() => setActiveOnboardTab("paid")}
            className={`flex-1 px-3 py-3 text-center text-xs font-semibold rounded-xl transition-all sm:text-sm ${
              activeOnboardTab === "paid"
                ? "bg-[#330a0a] text-white shadow-md font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {lang === "ar" ? "تفعيل المتجر الرسمي" : "Official Store Activation"}
          </button>
        </div>

        {/* Dual Card responsive Grid */}
        <div className="mx-auto grid w-full max-w-3xl grid-cols-1 items-start gap-7 mb-12">
          {/* CARD A: admin-configured free trial */}
          <Card
            className={`rounded-[28px] border-black/[0.07] bg-white shadow-[0_18px_60px_rgba(51,10,10,0.07)] flex-col relative overflow-hidden group ${
              activeOnboardTab === "trial" ? "flex" : "hidden"
            }`}
          >
            <div className="absolute top-0 right-0 p-4 opacity-[0.02] select-none pointer-events-none">
              <Sparkles className="h-32 w-32" />
            </div>

            <CardHeader className="border-b border-zinc-50 dark:border-zinc-900 pb-5">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <CardTitle className="text-lg font-display font-medium text-zinc-900 dark:text-zinc-100">
                    {lang === "ar" ? `تجربة مجانية لمدة ${trialDays} يوماً` : `${trialDays}-Day Free Trial`}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {lang === "ar"
                      ? `اختبر المتجر ولوحة الإدارة لمدة ${trialDays} يوماً، ثم اختر الباقة المناسبة عند الترقية.`
                      : `Explore the storefront and admin workspace for ${trialDays} days, then choose your plan when you upgrade.`}
                  </CardDescription>
                </div>
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded font-semibold tracking-wider">
                  {lang === "ar" ? "مجانـي" : "FREE"}
                </span>
              </div>
            </CardHeader>

            <details className="group/features border-b border-border bg-zinc-50 dark:bg-zinc-900/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-3 text-xs font-semibold text-foreground transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">
                <span>{lang === "ar" ? "عرض مميزات التجربة" : "View trial features"}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/features:rotate-180" />
              </summary>
              <div className="space-y-2.5 border-t border-border/60 px-6 py-4 text-xs select-none">
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>
                    {lang === "ar"
                      ? "استخدم لوحة التحكم وتابع مبيعاتك"
                      : "Full admin dashboard & revenue reporting"}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>
                    {lang === "ar"
                      ? "شاهد متجرك مثل ما راح يشوفه عملاؤك"
                      : "Live customer-facing storefront preview"}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>
                    {lang === "ar"
                      ? "نساعدك في الإعداد عن طريق الواتساب"
                      : "Instant concierge setup via WhatsApp"}
                  </span>
                </div>
              </div>
            </details>

            <CardContent className="pt-6 space-y-4">
              <form onSubmit={handleRegisterTrial} className="space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="trial-name"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {lang === "ar" ? "الاسم الكامل" : "Owner Full Name"}
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4.5 w-4.5 text-zinc-400" />
                    <Input
                      id="trial-name"
                      placeholder={lang === "ar" ? "أدخل اسمك الكامل" : "Enter your full name"}
                      required
                      className="pl-10 text-sm"
                      value={trialFullName}
                      onChange={(e) => setTrialFullName(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="trial-phone"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {lang === "ar" ? "رقم الهاتف / الواتساب" : "WhatsApp Number"}
                    </Label>
                    <Input
                      id="trial-phone"
                      placeholder={
                        lang === "ar"
                          ? "أدخل رقم الواتساب (مثال: 39955508)"
                          : "Enter WhatsApp number (e.g. 39955508)"
                      }
                      required
                      className="text-sm"
                      value={trialContactNumber}
                      onChange={(e) => setTrialContactNumber(e.target.value)}
                      autoComplete="off"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="trial-email"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {lang === "ar" ? "البريد الإلكتروني" : "Email Address"}
                    </Label>
                    <Input
                      id="trial-email"
                      type="email"
                      placeholder={
                        lang === "ar"
                          ? "أدخل البريد الإلكتروني (مثال: name@domain.com)"
                          : "Enter email address (e.g. name@domain.com)"
                      }
                      required
                      className="text-sm"
                      value={trialEmail}
                      onChange={(e) => setTrialEmail(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="trial-subdomain"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {lang === "ar" ? "رابط موقع متجرك المطلوب" : "Desired Boutique Subdomain"}
                  </Label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-xs text-zinc-400 font-medium font-mono select-none">
                      https://
                    </span>
                    <Input
                      id="trial-subdomain"
                      placeholder={
                        lang === "ar"
                          ? "أدخل اسم المتجر المطلوب (مثال: velvet)"
                          : "Enter boutique name (e.g. velvet)"
                      }
                      required
                      className="pl-16 pr-24 font-mono text-xs text-primary"
                      value={trialSubdomain}
                      onChange={(e) => setTrialSubdomain(e.target.value)}
                      autoComplete="off"
                    />
                    <span className="absolute right-3 text-[10px] text-zinc-400 font-mono font-bold select-none">
                      .boutq.store
                    </span>
                  </div>

                  {trialSubdomain && (
                    <p className="text-[10px] flex items-center gap-1 mt-1">
                      {trialSubdomainChecking ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                          <span className="text-muted-foreground">
                            {lang === "ar"
                              ? "جاري التحقق من التوافر..."
                              : "Checking availability..."}
                          </span>
                        </>
                      ) : trialSubdomainAvailable === true ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" />
                          <span className="text-emerald-500 font-semibold">
                            {lang === "ar"
                              ? "ممتاز، هذا الرابط متوفر."
                              : "Subdomain handle is available!"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 inline-block" />
                          <span className="text-rose-500 font-semibold">
                            {lang === "ar"
                              ? "هذا الرابط مستخدم، جرّب اسماً آخر."
                              : "This subdomain is already taken."}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="trial-business-type"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {lang === "ar" ? "نوع النشاط التجاري" : "Business / Store Type"}
                  </Label>
                  <Select value={trialBusinessType} onValueChange={setTrialBusinessType}>
                    <SelectTrigger
                      id="trial-business-type"
                      className="h-10 text-xs text-primary bg-background border-zinc-200"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Fashion">
                        {lang === "ar" ? "أزياء وملابس (Fashion)" : "Fashion & Apparel"}
                      </SelectItem>
                      <SelectItem value="Cafe / Restaurant">
                        {lang === "ar" ? "مقهى / مطعم (Cafe)" : "Cafe & Restaurant"}
                      </SelectItem>
                      <SelectItem value="Consulting / Services">
                        {lang === "ar" ? "خدمات / استشارات (Services)" : "Consulting & Services"}
                      </SelectItem>
                      <SelectItem value="Digital store">
                        {lang === "ar" ? "متجر رقمي (Digital)" : "Digital Store"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <TurnstileWidget
                  language={lang}
                  onVerify={setTrialTurnstileToken}
                  resetKey={trialTurnstileReset}
                />

                <Button
                  type="submit"
                  className="w-full h-11 text-xs font-semibold uppercase tracking-wider gap-2 bg-primary hover:bg-primary/90 text-primary-foreground mt-4"
                  disabled={
                    trialSubdomainChecking ||
                    trialSubdomainAvailable === false ||
                    !trialTurnstileToken
                  }
                >
                  {lang === "ar"
                    ? `ابدأ تجربتك المجانية لمدة ${trialDays} يوماً`
                    : `Start Your ${trialDays}-Day Free Trial`}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* CARD B: Official Paid Registration */}
          <Card
            className={`rounded-[28px] border-primary/20 bg-white shadow-[0_18px_60px_rgba(51,10,10,0.09)] flex-col relative overflow-hidden group ring-1 ring-primary/30 ${
              activeOnboardTab === "paid" ? "flex" : "hidden"
            }`}
          >
            <div className="absolute top-0 right-0 p-4 opacity-[0.02] select-none pointer-events-none">
              <Building2 className="h-32 w-32" />
            </div>

            <CardHeader className="border-b border-zinc-50 dark:border-zinc-900 pb-5">
              <div className="flex">
                <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-600">
                  {lang === "ar"
                    ? "✓ السعر والمزايا موضحة قبل تأكيد طلبك"
                    : "✓ LIVE SYNC WITH BOUTQ OS CATALOG"}
                </div>
              </div>

              <div className="flex justify-between items-start gap-4">
                <div>
                  <CardTitle className="text-lg font-display font-medium text-zinc-900 dark:text-zinc-100">
                    {selectedPlan
                      ? lang === "ar"
                        ? selectedPlan.name_ar
                        : selectedPlan.name_en
                      : lang === "ar"
                        ? "اختر باقة للمتابعة"
                        : "Choose a published plan"}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    {selectedPlan
                      ? (lang === "ar" ? `باقة متكاملة تشمل ${selectedPlan.features.length} مزايا تساعدك في إدارة متجرك.` : selectedPlan.description_en)
                      : lang === "ar"
                        ? "اختر الباقة المناسبة من الأعلى عشان تكمل."
                        : "Select one of the live plans above to continue."}
                  </CardDescription>
                </div>
                <div className="text-right">
                  {plansLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-auto text-primary" />
                  ) : (
                    <span className="text-lg font-bold font-display text-primary block">
                      {displayPrice}
                    </span>
                  )}
                  <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider block mt-0.5">
                    {billingInterval === "annual"
                      ? lang === "ar"
                        ? "اشتراك سنوي"
                        : "ANNUAL SUBSCRIPTION"
                      : lang === "ar"
                        ? "اشتراك شهري"
                        : "MONTHLY SUBSCRIPTION"}
                  </span>
                </div>
              </div>
            </CardHeader>

            <details className="group/features border-b border-primary/10 bg-primary/5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 [&::-webkit-details-marker]:hidden">
                <span>
                  {lang === "ar" ? "المزايا اللي تحصل عليها" : "Selected plan capabilities"}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/features:rotate-180" />
              </summary>
              <div className="space-y-2.5 border-t border-primary/10 px-6 py-4 text-xs select-none">
                {(selectedPlan?.features ?? []).slice(0, 8).map((feature: any) => (
                  <div key={feature.key} className="flex items-center gap-2.5 text-muted-foreground">
                    <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{lang === "ar" ? feature.name_ar : feature.name_en}</span>
                    {feature.numeric_value != null && feature.numeric_value !== 0 && (
                      <strong className="ms-auto text-foreground">
                        {feature.numeric_value === -1 ? "∞" : feature.numeric_value.toLocaleString()}
                      </strong>
                    )}
                  </div>
                ))}
              </div>
            </details>

            <CardContent className="pt-6 space-y-4">
              <form onSubmit={handleRegisterPaid} className="space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="paid-name"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {lang === "ar" ? "الاسم الكامل" : "Owner Full Name"}
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4.5 w-4.5 text-zinc-400" />
                    <Input
                      id="paid-name"
                      placeholder={lang === "ar" ? "أدخل اسمك الكامل" : "Enter your full name"}
                      required
                      className="pl-10 text-sm"
                      value={officialFullName}
                      onChange={(e) => setOfficialFullName(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="paid-phone"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {lang === "ar" ? "رقم الهاتف / الواتساب" : "WhatsApp Number"}
                    </Label>
                    <Input
                      id="paid-phone"
                      placeholder={
                        lang === "ar"
                          ? "أدخل رقم الواتساب (مثال: 39955508)"
                          : "Enter WhatsApp number (e.g. 39955508)"
                      }
                      required
                      className="text-sm"
                      value={officialContactNumber}
                      onChange={(e) => setOfficialContactNumber(e.target.value)}
                      autoComplete="off"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="paid-email"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {lang === "ar" ? "البريد الإلكتروني" : "Email Address"}
                    </Label>
                    <Input
                      id="paid-email"
                      type="email"
                      placeholder={
                        lang === "ar"
                          ? "أدخل البريد الإلكتروني (مثال: name@domain.com)"
                          : "Enter email address (e.g. name@domain.com)"
                      }
                      required
                      className="text-sm"
                      value={officialEmail}
                      onChange={(e) => setOfficialEmail(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="paid-subdomain"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {lang === "ar" ? "رابط موقع متجرك المطلوب" : "Desired Boutique Subdomain"}
                  </Label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-xs text-zinc-400 font-medium font-mono select-none">
                      https://
                    </span>
                    <Input
                      id="paid-subdomain"
                      placeholder={
                        lang === "ar"
                          ? "أدخل اسم المتجر المطلوب (مثال: velvet)"
                          : "Enter boutique name (e.g. velvet)"
                      }
                      required
                      className="pl-16 pr-24 font-mono text-xs text-primary"
                      value={officialSubdomain}
                      onChange={(e) => setOfficialSubdomain(e.target.value)}
                      autoComplete="off"
                    />
                    <span className="absolute right-3 text-[10px] text-zinc-400 font-mono font-bold select-none">
                      .boutq.store
                    </span>
                  </div>

                  {officialSubdomain && (
                    <p className="text-[10px] flex items-center gap-1 mt-1">
                      {officialSubdomainChecking ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                          <span className="text-muted-foreground">
                            {lang === "ar" ? "جاري التحقق..." : "Checking availability..."}
                          </span>
                        </>
                      ) : officialSubdomainAvailable === true ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" />
                          <span className="text-emerald-500 font-semibold">
                            {lang === "ar"
                              ? "الرابط متوفر وصالح للاستخدام!"
                              : "Subdomain handle is available!"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 inline-block" />
                          <span className="text-rose-500 font-semibold">
                            {lang === "ar"
                              ? "الرابط محجوز مسبقاً!"
                              : "This subdomain is already taken."}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="paid-business-type"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {lang === "ar" ? "نوع النشاط التجاري" : "Business / Store Type"}
                  </Label>
                  <Select value={officialBusinessType} onValueChange={setOfficialBusinessType}>
                    <SelectTrigger
                      id="paid-business-type"
                      className="h-10 text-xs text-primary bg-background border-zinc-200"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Fashion">
                        {lang === "ar" ? "أزياء وملابس (Fashion)" : "Fashion & Apparel"}
                      </SelectItem>
                      <SelectItem value="Cafe / Restaurant">
                        {lang === "ar" ? "مقهى / مطعم (Cafe)" : "Cafe & Restaurant"}
                      </SelectItem>
                      <SelectItem value="Consulting / Services">
                        {lang === "ar" ? "خدمات / استشارات (Services)" : "Consulting & Services"}
                      </SelectItem>
                      <SelectItem value="Digital store">
                        {lang === "ar" ? "متجر رقمي (Digital)" : "Digital Store"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Secure BenefitPay QR Mechanism inside Card B */}
                <div className="border border-zinc-100 dark:border-zinc-900 rounded-lg p-4 bg-zinc-50/50 dark:bg-zinc-950/20 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    <QrCode className="h-4 w-4 text-primary" />
                    <span>
                      {lang === "ar"
                        ? "مسح السداد عبر بنفت بي (BenefitPay)"
                        : "Scan & Pay via BenefitPay QR"}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-zinc-950 p-3 rounded border border-zinc-100 dark:border-zinc-900">
                    {/* Simulated or Custom Merchant QR Image */}
                    <div className="h-24 w-24 bg-zinc-50 dark:bg-zinc-900 rounded p-1.5 border border-zinc-100 dark:border-zinc-800 flex flex-col items-center justify-center shrink-0 overflow-hidden">
                      {benefitPayQrUrl ? (
                        <img
                          src={benefitPayQrUrl}
                          alt="BenefitPay QR"
                          className="h-full w-full object-contain animate-fade-in"
                        />
                      ) : (
                        <>
                          <QrCode className="h-16 w-16 stroke-[1.25] text-zinc-900 dark:text-zinc-100" />
                          <span className="text-[6px] font-bold text-zinc-400 dark:text-zinc-500 font-mono tracking-wider">
                            BOUTQ-MERCHANT
                          </span>
                        </>
                      )}
                    </div>

                    <div className="text-left space-y-1.5">
                      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        Merchant Account: {merchantAccountName}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        {lang === "ar"
                          ? `امسح رمز الاستجابة السريع سدد المبلغ الموضح (${displayPrice})، ثم ارفع لقطة شاشة تأكيد الدفع لتأكيد المعاملة.`
                          : `Scan QR with BenefitPay, transfer ${displayPrice} to merchant, then upload the receipt screenshot below.`}
                      </p>
                    </div>
                  </div>

                  {/* IBAN Copy Field */}
                  <div className="bg-zinc-50 dark:bg-zinc-900/40 p-2.5 rounded-xl border border-border flex items-center justify-between gap-3 text-xs select-none">
                    <div className="space-y-0.5 text-left">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold">
                        {lang === "ar"
                          ? "رقم الحساب الدولي (IBAN)"
                          : "International Bank Account Number (IBAN)"}
                      </span>
                      <code className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200 font-bold">
                        {subscriptionIban}
                      </code>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleCopyIban(subscriptionIban)}
                      className="h-8 w-8 text-primary hover:text-white hover:bg-primary border-primary/20 shrink-0"
                    >
                      {copiedIban ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>

                  {!receiptKey && (
                    <TurnstileWidget
                      language={lang}
                      onVerify={setPaidUploadTurnstileToken}
                      resetKey={paidUploadTurnstileReset}
                    />
                  )}

                  {/* Receipt screenshot uploader */}
                  <div className="relative">
                    <input
                      id="onboarding-receipt-uploader"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleUploadReceipt}
                      className="hidden"
                      disabled={uploading || !paidUploadTurnstileToken}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-10 border-dashed border-primary/45 bg-primary/[0.01] hover:bg-primary/[0.04]"
                      disabled={uploading}
                      onClick={() =>
                        document.getElementById("onboarding-receipt-uploader")?.click()
                      }
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span className="text-xs">
                            {lang === "ar" ? "جاري رفع الإيصال..." : "Uploading receipt..."}
                          </span>
                        </>
                      ) : receiptKey ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-500" />
                          <span className="text-xs text-emerald-500 font-semibold">
                            {lang === "ar"
                              ? "تم رفع إيصال الدفع بنجاح!"
                              : "Receipt Screenshot Saved!"}
                          </span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="h-4 w-4 text-primary" />
                          <span className="text-xs">
                            {lang === "ar"
                              ? "تحميل لقطة شاشة إيصال الدفع"
                              : "Upload Receipt Screenshot"}
                          </span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="bg-zinc-100/60 dark:bg-zinc-900/30 p-3 rounded text-[10px] text-muted-foreground flex gap-2">
                  <Info className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                  <p className="leading-normal">
                    {lang === "ar"
                      ? "السعر الظاهر هو السعر اللي راح نعتمده لطلبك، حتى لو تغيّر سعر الباقة بعدين."
                      : "Your selected plan version and displayed price are locked when the request is submitted, protecting the quoted offer during review."}
                  </p>
                </div>

                {receiptKey && (
                  <TurnstileWidget
                    language={lang}
                    onVerify={setPaidSubmitTurnstileToken}
                    resetKey={paidSubmitTurnstileReset}
                  />
                )}

                <Button
                  type="submit"
                  className="w-full h-11 text-xs font-semibold uppercase tracking-wider gap-2 bg-primary text-white mt-4"
                  disabled={
                    officialSubdomainChecking ||
                    officialSubdomainAvailable === false ||
                    uploading ||
                    !receiptKey ||
                    !paidSubmitTurnstileToken
                  }
                >
                  <Building2 className="h-4 w-4" />
                  {lang === "ar" ? "إرسال طلب تفعيل المتجر" : "Submit Registration & Pay"}
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
      </main>

      {/* Catalog-driven feature sheet: no marketing claims are hardcoded here. */}
      {showFeaturesModal && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#120b0d]/70 p-4 backdrop-blur-xl animate-in fade-in duration-200">
          <div dir={lang === "ar" ? "rtl" : "ltr"} className="relative w-full max-w-3xl overflow-hidden rounded-[32px] border border-black/[0.07] bg-[#fbfaf8] shadow-[0_32px_100px_rgba(0,0,0,.35)] animate-in fade-in zoom-in-95 duration-200">
            <button onClick={() => setShowFeaturesModal(false)} aria-label={lang === "ar" ? "إغلاق" : "Close"} className={`absolute top-5 z-10 grid h-10 w-10 place-items-center rounded-full border border-black/[0.06] bg-white text-zinc-500 shadow-sm transition hover:text-primary ${lang === "ar" ? "left-5" : "right-5"}`}>
              ✕
            </button>
            <div className="border-b border-black/[0.06] bg-white px-6 py-7 sm:px-9">
              <div className="mb-3 inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-primary">
                <ShieldCheck className="h-4 w-4" />
                {lang === "ar" ? "تفاصيل الباقة" : "PLAN DETAILS"}
              </div>
              <h3 className="pe-12 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                {lang === "ar" ? "شنو تحصل عليه مع باقتك؟" : "What is included in your plan?"}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {lang === "ar" ? "هذي أهم المزايا والحدود الموجودة في الباقة اللي اخترتها." : "These are the capabilities and limits included in your selected plan."}
              </p>
            </div>
            <div className="max-h-[58vh] overflow-y-auto p-6 sm:p-9">
              {selectedPlan ? (
                <>
                  <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-[#330a0a] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.18em] text-rose-200">{selectedPlan.code}</p>
                      <h4 className="mt-1 text-xl font-semibold">{lang === "ar" ? selectedPlan.name_ar : selectedPlan.name_en}</h4>
                    </div>
                    <div className="text-start sm:text-end">
                      <strong className="text-2xl">{selectedPrice}</strong>
                      <span className="ms-1 text-xs text-rose-100">{selectedPlan.version.currency} / {billingInterval === "annual" ? (lang === "ar" ? "سنة" : "year") : (lang === "ar" ? "شهر" : "month")}</span>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedPlan.features.map((feature: any) => (
                      <div key={feature.key} className="flex items-center gap-3 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50"><Check className="h-4 w-4 text-emerald-600" /></span>
                        <span className="text-sm text-zinc-700">{lang === "ar" ? feature.name_ar : feature.name_en}</span>
                        {feature.numeric_value != null && feature.numeric_value !== 0 && <strong className="ms-auto text-sm text-[#330a0a]">{feature.numeric_value === -1 ? "∞" : feature.numeric_value.toLocaleString()}</strong>}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">{lang === "ar" ? "اختر باقة لعرض تفاصيلها." : "Choose a plan to see its details."}</div>
              )}
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-black/[0.06] bg-white px-6 py-5 sm:px-9">
              <span className="text-[11px] text-muted-foreground">{lang === "ar" ? `التجربة المجانية: ${trialDays} يوماً` : `Free trial: ${trialDays} days`}</span>
              <Button onClick={() => setShowFeaturesModal(false)} className="h-10 rounded-full bg-[#330a0a] px-6 text-xs font-semibold text-white hover:bg-[#4a1111]">
                {lang === "ar" ? "العودة لاختيار الباقة" : "Back to plans"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
