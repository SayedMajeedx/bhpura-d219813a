import { useState } from "react";
import { type Brand } from "@/lib/brand-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { 
  getSubscriptionReceiptUploadUrl, 
  submitSubscriptionReceipt 
} from "@/lib/saas-subscription.functions";
import { 
  Check, 
  UploadCloud, 
  AlertCircle, 
  Clock, 
  ShieldCheck, 
  CreditCard, 
  QrCode, 
  Sparkles, 
  Loader2, 
  CalendarRange 
} from "lucide-react";

type SubscriptionCardProps = {
  brand: Brand;
};

const PLANS = [
  {
    id: "basic",
    nameEn: "Basic Boutique",
    nameAr: "الباقة الأساسية",
    price: "19 BHD",
    periodEn: "/month",
    periodAr: "/شهرياً",
    featuresEn: ["Single Brand Domain", "Unlimited Products", "Sleek Dashboard", "Local WhatsApp Concierge", "Cash on Delivery"],
    featuresAr: ["نطاق مخصص متاح", "منتجات غير محدودة", "لوحة تحكم ذكية", "دعم واتساب مباشر", "الدفع عند الاستلام"],
    color: "#800020"
  },
  {
    id: "growth",
    nameEn: "Growth VIP",
    nameAr: "الباقة المتقدمة",
    price: "49 BHD",
    periodEn: "/month",
    periodAr: "/شهرياً",
    featuresEn: ["Whitelabel Custom Domain", "SaaS Multi-Store Admin", "BenefitPay Automated Invoices", "Sms Marketing campaigns", "Priority Support 24/7"],
    featuresAr: ["نطاق خاص بالكامل", "إدارة متعددة المتاجر", "فواتير بنفت بي الآلية", "حملات تسويقية SMS", "دعم فني مخصص 24/7"],
    color: "#1B2A47"
  }
];

export function SubscriptionCard({ brand }: SubscriptionCardProps) {
  const { lang } = useI18n();
  const [uploading, setUploading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("basic");

  const tier = brand.subscription_tier || "basic";
  const status = brand.subscription_status || "active";
  const expiresAt = brand.subscription_expires_at;

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error(lang === "ar" ? "يرجى تحميل صورة صالحة (JPEG, PNG, WEBP)." : "Please upload a valid image file (JPEG, PNG, WEBP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(lang === "ar" ? "الحد الأقصى لحجم الملف هو 5 ميجابايت." : "Maximum file size is 5MB.");
      return;
    }

    setUploading(true);
    const toastId = toast.loading(lang === "ar" ? "جاري تجهيز رابط التحميل..." : "Preparing secure upload channel...");

    try {
      // 1. Request secure pre-signed R2 upload link
      const { objectKey, uploadUrl } = await getSubscriptionReceiptUploadUrl({
        brandId: brand.id,
        contentType: file.type as any
      });

      // 2. Upload the receipt file directly to the Private R2 bucket
      toast.loading(lang === "ar" ? "جاري رفع الإيصال بأمان لـ R2 الخصوصي..." : "Uploading receipt securely to Private R2 Bucket...", { id: toastId });
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error("Failed to upload image file directly to secure storage R2.");
      }

      // 3. Finalize and submit the transaction receipt inside Supabase DB
      toast.loading(lang === "ar" ? "جاري توثيق إيصال الدفع في قاعدة البيانات..." : "Registering payment receipt inside system...", { id: toastId });
      await submitSubscriptionReceipt({
        brandId: brand.id,
        objectKey
      });

      toast.success(
        lang === "ar" 
          ? "تم رفع إيصال الاشتراك بنجاح! سيتم التحقق وتفعيله في غضون ساعتين." 
          : "Subscription receipt uploaded successfully! Activation is pending super-admin review (usually within 2 hours).",
        { id: toastId, duration: 6000 }
      );
      
      // Reload route/window to reflect the updated state instantly
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to submit subscription receipt. Please contact support.", { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> {lang === "ar" ? "نشط" : "Active"}</Badge>;
      case "pending_verification":
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-medium flex items-center gap-1 animate-pulse"><Clock className="h-3.5 w-3.5" /> {lang === "ar" ? "بانتظار التحقق" : "Pending Approval"}</Badge>;
      case "suspended":
        return <Badge className="bg-rose-500 hover:bg-rose-600 text-white font-medium flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> {lang === "ar" ? "موقوف" : "Suspended"}</Badge>;
      default:
        return <Badge className="bg-zinc-500 text-white font-medium">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Subscription Header Overview */}
      <Card className="border-zinc-100 dark:border-zinc-800/80 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] select-none pointer-events-none">
          <CreditCard className="h-36 w-36" />
        </div>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-display font-medium">{lang === "ar" ? "اشتراك المنصة السحابي" : "SaaS Platform Subscription"}</CardTitle>
              <CardDescription className="text-xs">
                {lang === "ar" ? "تتبع اشتراكك الحالي، قم بتجديده، أو ارفع إيصالات بنفت بي." : "Track your current active subscription, renew plans, or submit transaction receipts."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              <Badge variant="outline" className="text-xs uppercase tracking-wider font-semibold">
                {tier === "growth" ? (lang === "ar" ? "الباقة المتقدمة" : "Growth VIP") : (lang === "ar" ? "الباقة الأساسية" : "Basic")}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-zinc-50/50 dark:bg-zinc-900/30 p-5 rounded-lg border border-zinc-100 dark:border-zinc-900">
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">{lang === "ar" ? "حالة الاشتراك" : "Account Status"}</span>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 capitalize">
                {status === "active" && <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />}
                {status === "pending_verification" && <span className="h-2 w-2 rounded-full bg-amber-500 inline-block animate-ping" />}
                {status === "suspended" && <span className="h-2 w-2 rounded-full bg-rose-500 inline-block" />}
                {status === "active" ? (lang === "ar" ? "نشط ومؤمن" : "Active & Verified") : (lang === "ar" ? "بانتظار المراجعة" : "Verification in progress")}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">{lang === "ar" ? "صلاحية الاشتراك" : "Expiration Date"}</span>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <CalendarRange className="h-4 w-4 text-zinc-400" />
                <span>
                  {expiresAt 
                    ? new Date(expiresAt).toLocaleDateString(lang === "ar" ? "ar-BH" : "en-US", { year: "numeric", month: "long", day: "numeric" })
                    : (lang === "ar" ? "غير محدد" : "Indefinite / Trial")}
                </span>
              </p>
            </div>

            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">{lang === "ar" ? "النطاق المخصص" : "Platform Domain"}</span>
              <p className="text-sm font-semibold text-primary font-mono select-all">
                {brand.custom_domain || `${brand.slug}.pura.bh`}
              </p>
            </div>
          </div>
          
          {status === "pending_verification" && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 rounded-md text-amber-800 dark:text-amber-400 text-xs flex items-start gap-2">
              <Clock className="h-4 w-4 mt-0.5 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
              <div>
                <p className="font-semibold">{lang === "ar" ? "إيصال الدفع قيد التحقق حالياً" : "Your receipt is currently being verified"}</p>
                <p className="opacity-90 mt-0.5">{lang === "ar" ? "لقد استلمنا لقطة الشاشة المرفقة. يتم الآن التحقق منها بواسطة المشرف العام. لا تتردد في استخدام لوحة التحكم كالمعتاد." : "We have received your uploaded screenshot receipt. The platform super-admin is verifying the transaction. Your store remains fully active."}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subscription Plans Selection & Renewal Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plans list */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{lang === "ar" ? "اختر باقة التجديد" : "SaaS Renewal Subscriptions"}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={`text-left p-5 rounded-lg border cursor-pointer transition-all duration-150 relative overflow-hidden flex flex-col justify-between h-72 ${
                  selectedPlan === plan.id 
                    ? "border-primary dark:border-primary/80 bg-primary/[0.02] ring-1 ring-primary"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-background"
                }`}
              >
                {selectedPlan === plan.id && (
                  <div className="absolute top-0 right-0 bg-primary text-white p-1 rounded-bl-lg">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-4.5 w-4.5" style={{ color: plan.color }} />
                    <h4 className="font-display font-semibold text-zinc-900 dark:text-zinc-100">{lang === "ar" ? plan.nameAr : plan.nameEn}</h4>
                  </div>
                  <div className="flex items-baseline gap-1 mt-2 mb-4">
                    <span className="text-2xl font-bold font-display">{plan.price}</span>
                    <span className="text-xs text-muted-foreground">{lang === "ar" ? plan.periodAr : plan.periodEn}</span>
                  </div>
                  
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {(lang === "ar" ? plan.featuresAr : plan.featuresEn).map((f, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Scan & Upload Form */}
        <Card className="border-zinc-100 dark:border-zinc-800/80 shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <QrCode className="h-4.5 w-4.5 text-primary" />
              <span>{lang === "ar" ? "الدفع ببنفت بي (BenefitPay)" : "Scan & Renew via BenefitPay"}</span>
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              {lang === "ar" 
                ? "امسح رمز الاستجابة السريع (QR) وسدد القيمة، ثم ارفع الإيصال أدناه للتفعيل التلقائي." 
                : "Scan the payment QR code below, send the chosen amount, then upload the receipt screenshot."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Styled BenefitPay QR Scanner Frame */}
            <div className="bg-zinc-100 dark:bg-zinc-950 rounded-lg p-5 border border-dashed border-zinc-200 dark:border-zinc-900 flex flex-col items-center justify-center relative overflow-hidden group">
              <div className="absolute top-2 left-2 bg-rose-600 text-white text-[9px] font-bold uppercase px-1.5 py-0.5 rounded tracking-widest font-mono">
                BenefitPay
              </div>
              <div className="h-32 w-32 bg-white rounded-md p-1.5 border border-zinc-200 shadow-sm flex items-center justify-center transition-transform group-hover:scale-105 duration-200 mt-2">
                {/* Styled elegant QR code simulation vector */}
                <div className="relative h-full w-full flex flex-col items-center justify-center text-primary opacity-85">
                  <QrCode className="h-20 w-20 stroke-[1.25]" />
                  <span className="text-[8px] font-bold uppercase tracking-widest mt-1">BH-PURA-SaaS</span>
                </div>
              </div>
              <div className="text-center mt-3 space-y-1">
                <span className="text-xs font-mono font-bold text-zinc-700 dark:text-zinc-300">Merchant Account: PURA-BH</span>
                <span className="text-[10px] text-muted-foreground block">{lang === "ar" ? "رقم المرجعي: 33887754" : "Reference Number: 33887754"}</span>
              </div>
            </div>

            {/* R2 Secure Upload Input */}
            <div className="relative">
              <input
                id="subscription-receipt-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUploadReceipt}
                className="hidden"
                disabled={uploading}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 border-dashed border-primary/35 bg-primary/[0.01] hover:bg-primary/[0.04]"
                disabled={uploading}
                onClick={() => document.getElementById("subscription-receipt-file")?.click()}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-xs">{lang === "ar" ? "جاري الرفع لـ R2..." : "Uploading to Private R2..."}</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4 text-primary" />
                    <span className="text-xs">{lang === "ar" ? "تحميل إيصال تأكيد الدفع" : "Upload Receipt Screenshot"}</span>
                  </>
                )}
              </Button>
            </div>
            
            <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>{lang === "ar" ? "يتم تأمين الإيصال بخصم ثنائي وتشفير R2" : "Secured with Cloudflare Private R2 bucket."}</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
