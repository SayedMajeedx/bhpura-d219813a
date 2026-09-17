import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  Crown,
  Instagram,
  Phone,
  Store,
  Shirt,
  Gift,
  UtensilsCrossed,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
  Share2,
  MessageCircle,
  HelpCircle,
  Zap,
} from "lucide-react";
import { publicSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/grant")({
  component: GrantSurveyPage,
});

const CATEGORIES = [
  { id: "fashion", label: "أزياء وعبايات", icon: Shirt },
  { id: "perfumes_beauty", label: "عطور وتجميل", icon: Sparkles },
  { id: "accessories_gifts", label: "إكسسوارات وهدايا", icon: Gift },
  { id: "food_sweets", label: "حلويات ومأكولات", icon: UtensilsCrossed },
  { id: "other", label: "نشاط آخر", icon: Store },
] as const;

const READINESS_OPTIONS = [
  {
    id: "ready_with_photos",
    title: "المنتجات والصور جاهزة تماماً",
    desc: "نملك صوراً جاهزة للمنتجات ومستعدون لإطلاق المتجر فوراً",
    highlight: true,
  },
  {
    id: "products_only",
    title: "المنتجات جاهزة وباقي الصور",
    desc: "المنتجات متوفرة ولكن نحتاج وقتاً بسيطاً لتجهيز وتصوير العينات",
    highlight: false,
  },
  {
    id: "idea_stage",
    title: "المشروع فكرة جديدة وقيد التجهيز",
    desc: "نعمل على التجهيز وسنبدأ قريباً",
    highlight: false,
  },
] as const;

const SALES_CHANNELS = [
  { id: "whatsapp_dm", title: "الواتساب والإنستغرام دايركت", desc: "نستقبل الطلبات يدويّاً عبر المحادثات" },
  { id: "existing_store", title: "متجر إلكتروني آخر", desc: "لدينا منصة حالية ونرغب بالترقية والانتقال لنظام أرقى" },
  { id: "physical_store", title: "محل / كشك / معرض فعلي", desc: "نبيع على أرض الواقع ونرغب بالتوسع أونلاين" },
  { id: "not_started", title: "لم نبدأ البيع بعد", desc: "ننتظر إطلاق المتجر الإلكتروني لبدء المبيعات" },
] as const;

function GrantSurveyPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  // Form State
  const [businessName, setBusinessName] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [productCategory, setProductCategory] = useState<string>("");
  const [readinessStatus, setReadinessStatus] = useState<string>("");
  const [currentSalesChannel, setCurrentSalesChannel] = useState<string>("");
  const [biggestChallenge, setBiggestChallenge] = useState("");

  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      toast.error("يرجى إدخال اسم المشروع أو البراند");
      return;
    }
    if (!instagramHandle.trim()) {
      toast.error("يرجى إدخال حساب الإنستغرام للمتجر");
      return;
    }
    if (!whatsappNumber.trim()) {
      toast.error("يرجى إدخال رقم الواتساب للتواصل");
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNextStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productCategory) {
      toast.error("يرجى اختيار مجال أو نوع منتجاتك");
      return;
    }
    if (!readinessStatus) {
      toast.error("يرجى تحديد حالة جاهزية منتجاتك");
      return;
    }
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSalesChannel) {
      toast.error("يرجى تحديد طريقة البيع الحالية");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await (publicSupabase.rpc as any)("submit_grant_application", {
        p_business_name: businessName.trim(),
        p_instagram_handle: instagramHandle.trim(),
        p_whatsapp_number: whatsappNumber.trim(),
        p_product_category: productCategory,
        p_readiness_status: readinessStatus,
        p_current_sales_channel: currentSalesChannel,
        p_biggest_challenge: biggestChallenge.trim() || null,
      });

      if (error) throw error;
      setSubmittedId(String(data || "success"));
      toast.success("تم إرسال طلبكم بنجاح!");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      console.error("Submission error:", err);
      toast.error(err.message || "حدث خطأ أثناء الإرسال، يرجى المحاولة مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyShareLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success("تم نسخ رابط التقديم بنجاح!");
  };

  return (
    <main dir="rtl" className="min-h-screen bg-muted/30 text-foreground selection:bg-primary/20 selection:text-primary">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-primary/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 py-8 sm:py-14 space-y-8">
        {/* Brand Header */}
        <header className="text-center space-y-4">
          {/* Official Boutq Logo */}
          <div className="flex justify-center pb-1">
            <div className="inline-flex items-center justify-center p-1 rounded-2xl bg-card/80 border border-border shadow-md transition-all duration-300 hover:shadow-primary/10 hover:border-primary/40">
              <img
                src="/boutq-grant-banner.png"
                alt="BOUTQ STORE • OS"
                className="h-11 sm:h-14 w-auto object-contain rounded-xl"
                width={1024}
                height={320}
                loading="eager"
              />
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1 text-xs font-bold text-primary shadow-xs">
            <Crown className="size-3.5" />
            <span>مبادرة دعم المشاريع والبراندات المحلية</span>
          </div>

          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            برنامج انطلاقة للمتاجر 🚀
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto leading-relaxed">
            منحة اشتراك مجاني كامل لمدة <span className="font-bold text-foreground">6 أشهر (نصف سنة)</span> لمتجرين محليين، مع مساعدة ومتابعة مباشرة حتى ينطلق متجركم الإلكتروني بأفضل صورة.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs text-muted-foreground font-medium">
            <span className="inline-flex items-center gap-1 bg-card px-2.5 py-1 rounded-full border border-border">
              <Check className="size-3 text-primary" /> بدون رسوم اشتراك
            </span>
            <span className="inline-flex items-center gap-1 bg-card px-2.5 py-1 rounded-full border border-border">
              <Check className="size-3 text-primary" /> دعم فني وإعداد مخصص
            </span>
            <span className="inline-flex items-center gap-1 bg-card px-2.5 py-1 rounded-full border border-border">
              <Zap className="size-3 text-primary" /> تعبئة الاستبيان: دقيقة واحدة
            </span>
          </div>
        </header>

        {/* Content Box */}
        {submittedId ? (
          <Card className="rounded-2xl border-border bg-card shadow-xl overflow-hidden">
            <div className="h-1.5 bg-primary" />
            <CardContent className="p-6 sm:p-10 text-center space-y-6">
              <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 shadow-inner">
                <CheckCircle2 className="size-10" />
              </div>

              <div className="space-y-2">
                <Badge variant="outline" className="border-primary/30 text-primary font-bold">
                  تم استلام طلبك بنجاح
                </Badge>
                <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-foreground">
                  شكراً لمشاركتنا شغفك ومشروعك 🌟
                </h2>
                <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto leading-relaxed">
                  سعيدون جداً باهتمامك يا فريق <span className="font-bold text-foreground">{businessName}</span>. سنقوم بمراجعة حسابكم والتواصل معكم عبر الواتساب في الموعد المحدد.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-4 text-xs sm:text-sm text-muted-foreground space-y-2 text-right">
                <div className="flex justify-between items-center border-b border-border/60 pb-2">
                  <span>اسم المشروع:</span>
                  <span className="font-bold text-foreground">{businessName}</span>
                </div>
                <div className="flex justify-between items-center border-b border-border/60 pb-2">
                  <span>حساب الإنستغرام:</span>
                  <span className="font-bold text-foreground" dir="ltr">@{instagramHandle.replace(/^@/, "")}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>رقم التواصل:</span>
                  <span className="font-bold text-foreground" dir="ltr">{whatsappNumber}</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={copyShareLink}
                  className="min-h-11 gap-2 font-bold"
                >
                  <Share2 className="size-4" />
                  مشاركة المبادرة مع صديق
                </Button>
                <Button
                  asChild
                  className="min-h-11 gap-2 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <a href={`https://instagram.com/${instagramHandle.replace(/^@/, "")}`} target="_blank" rel="noreferrer">
                    <Instagram className="size-4" />
                    معاينة الحساب
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl border-border bg-card shadow-xl overflow-hidden">
            {/* Step Progress Bar */}
            <div className="border-b border-border/60 bg-muted/20 px-6 py-4">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span className={cn(step >= 1 && "text-primary")}>1. بيانات المشروع</span>
                <span className={cn(step >= 2 && "text-primary")}>2. الجاهزية والنشاط</span>
                <span className={cn(step >= 3 && "text-primary")}>3. البيع والتحدي</span>
              </div>
              <div className="mt-2.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: step === 1 ? "33%" : step === 2 ? "66%" : "100%" }}
                />
              </div>
            </div>

            <CardContent className="p-6 sm:p-8">
              {/* STEP 1: BUSINESS BASICS */}
              {step === 1 && (
                <form onSubmit={handleNextStep1} className="space-y-6">
                  <div className="space-y-1">
                    <h2 className="font-heading text-xl font-bold text-foreground">
                      خطوة 1 من 3: بيانات المشروع والتواصل
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      عرفنا على اسم براندك وكيف يمكننا الوصول إليك ومراجعة منتجاتك.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="businessName" className="text-sm font-semibold flex items-center gap-1.5">
                        <Store className="size-4 text-primary" />
                        اسم المشروع أو البراند التجاري <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="businessName"
                        placeholder="مثال: لافندر بوتيك، أورورا ديزاين..."
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        required
                        className="min-h-11 rounded-xl text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="instagramHandle" className="text-sm font-semibold flex items-center gap-1.5">
                        <Instagram className="size-4 text-primary" />
                        حساب الإنستغرام للمتجر <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="instagramHandle"
                          placeholder="مثال: yourbrand"
                          value={instagramHandle}
                          onChange={(e) => setInstagramHandle(e.target.value)}
                          required
                          dir="ltr"
                          className="min-h-11 rounded-xl text-sm text-left ps-8"
                        />
                        <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">
                          @
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        سنقوم بمراجعة حسابك لمعاينة صور وتفاعل المتجر.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="whatsappNumber" className="text-sm font-semibold flex items-center gap-1.5">
                        <Phone className="size-4 text-primary" />
                        رقم الواتساب للتواصل <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="whatsappNumber"
                        placeholder="مثال: 97339000000 أو 0501234567"
                        value={whatsappNumber}
                        onChange={(e) => setWhatsappNumber(e.target.value)}
                        required
                        dir="ltr"
                        type="tel"
                        className="min-h-11 rounded-xl text-sm text-left"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        سنرسل نتائج الاختيار والعروض المخصصة عبر الواتساب.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button type="submit" className="min-h-11 w-full gap-2 text-sm font-bold">
                      المتابعة للخطوة التالية
                      <ArrowLeft className="size-4" />
                    </Button>
                  </div>
                </form>
              )}

              {/* STEP 2: CATEGORY & READINESS */}
              {step === 2 && (
                <form onSubmit={handleNextStep2} className="space-y-6">
                  <div className="space-y-1">
                    <h2 className="font-heading text-xl font-bold text-foreground">
                      خطوة 2 من 3: تصنيف المتجر والجاهزية
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      ساعدنا في فهم نوع منتجاتك ومدى استعدادك للبدء الفعلي.
                    </p>
                  </div>

                  {/* Category Selection */}
                  <div className="space-y-2.5">
                    <Label className="text-sm font-semibold block">
                      ما هو مجال أو نوع منتجاتك؟ <span className="text-destructive">*</span>
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {CATEGORIES.map((cat) => {
                        const Icon = cat.icon;
                        const isSelected = productCategory === cat.id;
                        return (
                          <div
                            key={cat.id}
                            onClick={() => setProductCategory(cat.id)}
                            className={cn(
                              "flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border cursor-pointer transition-all duration-200 select-none text-center min-h-[90px]",
                              isSelected
                                ? "border-primary bg-primary/10 text-primary font-bold shadow-xs scale-[1.02]"
                                : "border-border bg-card/60 hover:bg-muted/50 text-foreground"
                            )}
                          >
                            <Icon className="size-5" />
                            <span className="text-xs font-semibold">{cat.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Readiness Status */}
                  <div className="space-y-2.5">
                    <Label className="text-sm font-semibold block">
                      هل لديك منتجات وصور جاهزة للبيع حالياً؟ <span className="text-destructive">*</span>
                    </Label>
                    <div className="space-y-2">
                      {READINESS_OPTIONS.map((opt) => {
                        const isSelected = readinessStatus === opt.id;
                        return (
                          <div
                            key={opt.id}
                            onClick={() => setReadinessStatus(opt.id)}
                            className={cn(
                              "flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-200 select-none",
                              isSelected
                                ? "border-primary bg-primary/10 text-foreground shadow-xs"
                                : "border-border bg-card hover:bg-muted/50 text-muted-foreground"
                            )}
                          >
                            <div className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-background">
                              {isSelected && <div className="size-2.5 rounded-full bg-primary" />}
                            </div>
                            <div className="space-y-0.5 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className={cn("text-xs sm:text-sm font-bold", isSelected && "text-foreground")}>
                                  {opt.title}
                                </span>
                                {opt.highlight && (
                                  <Badge variant="outline" className="text-[10px] bg-primary/15 border-primary/30 text-primary font-bold">
                                    أولوية ترشيح ⚡
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {opt.desc}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2 flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStep(1)}
                      className="min-h-11 px-4 text-xs font-bold"
                    >
                      <ArrowRight className="size-4" />
                      رجوع
                    </Button>
                    <Button type="submit" className="min-h-11 flex-1 gap-2 text-sm font-bold">
                      المتابعة لآخر خطوة
                      <ArrowLeft className="size-4" />
                    </Button>
                  </div>
                </form>
              )}

              {/* STEP 3: SALES CHANNEL & CHALLENGE */}
              {step === 3 && (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-1">
                    <h2 className="font-heading text-xl font-bold text-foreground">
                      خطوة 3 من 3: قناة البيع وأكبر تحدي
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      أخبرنا عن طريقة بيعك الحالية والعقبات التي تريد التخلص منها.
                    </p>
                  </div>

                  {/* Current Channel */}
                  <div className="space-y-2.5">
                    <Label className="text-sm font-semibold block">
                      كيف تستقبل طلباتك وتبيع حالياً؟ <span className="text-destructive">*</span>
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {SALES_CHANNELS.map((ch) => {
                        const isSelected = currentSalesChannel === ch.id;
                        return (
                          <div
                            key={ch.id}
                            onClick={() => setCurrentSalesChannel(ch.id)}
                            className={cn(
                              "flex flex-col gap-1 p-3.5 rounded-xl border cursor-pointer transition-all duration-200 select-none",
                              isSelected
                                ? "border-primary bg-primary/10 text-foreground shadow-xs"
                                : "border-border bg-card hover:bg-muted/50 text-muted-foreground"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex size-4 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-background">
                                {isSelected && <div className="size-2 rounded-full bg-primary" />}
                              </div>
                              <span className={cn("text-xs sm:text-sm font-bold", isSelected && "text-foreground")}>
                                {ch.title}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground ps-6">
                              {ch.desc}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Biggest Challenge */}
                  <div className="space-y-1.5">
                    <Label htmlFor="biggestChallenge" className="text-sm font-semibold flex items-center justify-between">
                      <span>ما هو أكبر تحدٍ يواجهك في إدارة مبيعاتك وطلباتك؟</span>
                      <span className="text-[11px] font-normal text-muted-foreground">(اختياري)</span>
                    </Label>
                    <Textarea
                      id="biggestChallenge"
                      rows={3}
                      placeholder="مثال: ضياع تفاصيل الطلبات، تتبع التحويلات البنكية يدوياً، صعوبة جرد المخزون، أو الوقت الطويل المستغرق في الرد على الواتساب..."
                      value={biggestChallenge}
                      onChange={(e) => setBiggestChallenge(e.target.value)}
                      className="rounded-xl text-sm leading-relaxed"
                    />
                  </div>

                  <div className="pt-2 flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() => setStep(2)}
                      className="min-h-11 px-4 text-xs font-bold"
                    >
                      <ArrowRight className="size-4" />
                      رجوع
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="min-h-11 flex-1 gap-2 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          جارٍ إرسال الطلب...
                        </>
                      ) : (
                        <>
                          <Check className="size-4" />
                          إرسال طلب الانضمام للمنحة
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer info */}
        <footer className="text-center text-xs text-muted-foreground space-y-1 pt-4 border-t border-border/40">
          <p>© 2026 Boutq OS — منصة إدارة وتجارة البوتيكات الخليجية والمشاريع المحلية.</p>
          <p className="text-[11px]">يتم تقييم واختيار المشاريع بناءً على الجدية وجودة المنتجات لتوفير تجربة تشغيل متكاملة.</p>
        </footer>
      </div>
    </main>
  );
}
