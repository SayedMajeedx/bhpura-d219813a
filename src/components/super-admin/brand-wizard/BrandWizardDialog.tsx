import * as React from "react";
import { useState } from "react";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { provisionBrandWithOwner } from "@/lib/brand-provisioning";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { syncBrandVerticalCategories } from "@/lib/addons/vertical-categories";
import { getBrandTemplate } from "@/lib/brand-templates";
import { FONT_MOOD_PRESETS } from "@/components/settings/QuickThemeCustomizer";

import type { BrandWizardData, WizardStep, PipelineStepStatus } from "./types";
import { StepIdentity } from "./StepIdentity";
import { StepPalette } from "./StepPalette";
import { StepAdminPlan } from "./StepAdminPlan";
import { StepReview } from "./StepReview";

import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Copy,
  Store,
  Palette,
  ShieldCheck,
  CheckCircle2,
  Rocket,
} from "lucide-react";

interface BrandWizardDialogProps {
  onSaved: () => void;
  onClose?: () => void;
}

const INITIAL_DATA: BrandWizardData = {
  name_en: "",
  name_ar: "",
  slug: "",
  isSlugManuallyEdited: false,
  store_vertical: "fashion",
  logoFile: null,
  logoPreviewUrl: null,
  palette: null,
  accentColor: "#18181b",
  secondaryColor: "#a1a1aa",
  backgroundColor: "#ffffff",
  textColor: "#18181b",
  mood: "dominant",
  fontPreset: FONT_MOOD_PRESETS[1], // Modern
  radius: "0.5rem",
  owner_name: "",
  owner_email: "",
  owner_phone: "",
  owner_password: "",
  plan_type: "annual",
  createMobileApp: true,
};

const STEPS: { id: WizardStep; labelAr: string; labelEn: string; icon: React.ElementType }[] = [
  { id: "identity", labelAr: "الهوية والنشاط", labelEn: "Identity & Vertical", icon: Store },
  { id: "palette", labelAr: "الشعار والألوان", labelEn: "Logo & Palette", icon: Palette },
  { id: "admin", labelAr: "المدير والاشتراك", labelEn: "Admin & Plan", icon: ShieldCheck },
  { id: "review", labelAr: "المراجعة والإطلاق", labelEn: "Review & Launch", icon: Rocket },
];

export function BrandWizardDialog({ onSaved, onClose }: BrandWizardDialogProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const [currentStep, setCurrentStep] = useState<WizardStep>("identity");
  const [data, setData] = useState<BrandWizardData>(INITIAL_DATA);

  // Pipeline execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [createdBrandId, setCreatedBrandId] = useState<string | null>(null);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStepStatus[]>([
    {
      id: "provision",
      labelAr: "تهيئة المستأجر وإعدادات المتجر الأساسية",
      labelEn: "Provisioning tenant and store settings",
      status: "idle",
    },
    {
      id: "upload_logo",
      labelAr: "رفع شعار المتجر إلى التخزين السحابي",
      labelEn: "Uploading store logo to cloud storage",
      status: "idle",
    },
    {
      id: "finalize",
      labelAr: "تثبيت الأقسام الافتراضية للنشاط وتحديث الواجهة",
      labelEn: "Installing vertical categories and theme settings",
      status: "idle",
    },
    {
      id: "mobile_app",
      labelAr: "تجهيز تطبيق الموبايل التجريبي (Expo)",
      labelEn: "Provisioning white-label mobile app",
      status: "idle",
    },
  ]);
  const [executionComplete, setExecutionComplete] = useState(false);

  const updateData = (patch: Partial<BrandWizardData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  };

  const updatePipelineStep = (
    stepId: PipelineStepStatus["id"],
    status: PipelineStepStatus["status"],
    errorMessage?: string
  ) => {
    setPipelineSteps((prev) =>
      prev.map((step) =>
        step.id === stepId ? { ...step, status, errorMessage } : step
      )
    );
  };

  const validateStep = (step: WizardStep): boolean => {
    if (step === "identity") {
      const slug = data.slug.trim().toLowerCase();
      if (!data.name_en.trim()) {
        toast.error(isAr ? "يرجى كتابة اسم البراند بالإنجليزية" : "English brand name is required");
        return false;
      }
      if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(slug)) {
        toast.error(
          isAr
            ? "معرّف الرابط (Slug) غير صالح — أحرف إنجليزية صغيرة وأرقام وشرطات فقط"
            : "Invalid URL slug format"
        );
        return false;
      }
      return true;
    }

    if (step === "palette") {
      return true;
    }

    if (step === "admin") {
      if (!data.owner_name.trim()) {
        toast.error(isAr ? "يرجى كتابة اسم مدير البراند" : "Owner name is required");
        return false;
      }
      if (!data.owner_email.trim() || !data.owner_email.includes("@")) {
        toast.error(isAr ? "يرجى كتابة بريد إلكتروني صالح" : "Valid owner email is required");
        return false;
      }
      if (data.owner_password && data.owner_password.length < 8) {
        toast.error(
          isAr
            ? "كلمة المرور يجب أن تتكون من 8 خانات على الأقل"
            : "Password must be at least 8 characters"
        );
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) return;

    const currentIndex = STEPS.findIndex((s) => s.id === currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1].id);
    }
  };

  const handleBack = () => {
    const currentIndex = STEPS.findIndex((s) => s.id === currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].id);
    }
  };

  // Execution runner
  const handleLaunch = async () => {
    if (!validateStep("admin") || !validateStep("identity")) return;

    setIsExecuting(true);
    let brandId = createdBrandId;

    // Step 1: Provisioning tenant
    if (!brandId) {
      updatePipelineStep("provision", "running");
      try {
        const template = getBrandTemplate(data.store_vertical);
        const result = await provisionBrandWithOwner({
          slug: data.slug.trim().toLowerCase(),
          name_en: data.name_en.trim(),
          name_ar: data.name_ar.trim() || null,
          owner_name: data.owner_name.trim(),
          owner_email: data.owner_email.trim(),
          owner_phone: data.owner_phone.trim() || null,
          owner_password: data.owner_password || undefined,
          plan_type: data.plan_type,
          business_type: template.label.en,
          store_vertical: data.store_vertical,
          storefront_accent_color: data.accentColor,
          storefront_background_color: data.backgroundColor,
          brand_palette: data.palette || {
            primary: data.accentColor,
            secondary: data.secondaryColor,
            text: data.textColor,
            background: data.backgroundColor,
          },
          storefront_font_ar: data.fontPreset.fontAr,
          storefront_font_en: data.fontPreset.fontEn,
          storefront_radius: data.radius,
          template_defaults: {
            fulfillment: template.fulfillment,
            storefront_mode: template.storefrontMode,
            catalog_show_prices: template.catalogShowPrices,
            trust_badges: template.trustBadges,
          },
        });

        brandId = result.brand_id;
        setCreatedBrandId(brandId);
        updatePipelineStep("provision", "success");
      } catch (err: any) {
        updatePipelineStep("provision", "error", err.message || "Failed to provision brand");
        toast.error(err.message || "Failed to provision brand");
        return;
      }
    }

    // Step 2: Upload Logo (if provided)
    let uploadedLogoUrl: string | null = null;
    if (data.logoFile && brandId) {
      updatePipelineStep("upload_logo", "running");
      try {
        uploadedLogoUrl = await uploadPublicMedia(brandId, data.logoFile, "logo");
        updatePipelineStep("upload_logo", "success");
      } catch (err: any) {
        updatePipelineStep(
          "upload_logo",
          "error",
          err.message || "Failed to upload logo to storage"
        );
        // Note: brand is NOT deleted. Step can be retried!
      }
    } else {
      updatePipelineStep("upload_logo", "success");
    }

    // Step 3: Finalize Settings & Sync Categories
    if (brandId) {
      updatePipelineStep("finalize", "running");
      try {
        if (uploadedLogoUrl) {
          await Promise.all([
            supabase
              .from("business_settings")
              .update({ logo_url: uploadedLogoUrl })
              .eq("brand_id", brandId),
            (supabase.from("brands") as any)
              .update({ logo_url: uploadedLogoUrl })
              .eq("id", brandId),
          ]);
        }

        // Sync default categories
        await syncBrandVerticalCategories(brandId, data.store_vertical);
        updatePipelineStep("finalize", "success");
      } catch (err: any) {
        updatePipelineStep(
          "finalize",
          "error",
          err.message || "Failed to configure starter pack"
        );
      }
    }

    // Step 4: Provision Mobile App (if requested)
    if (brandId && data.createMobileApp) {
      updatePipelineStep("mobile_app", "running");
      try {
        const { error: appError } = await supabase.functions.invoke(
          "provision-white-label-app",
          { body: { brand_id: brandId, rebuild: false } }
        );
        if (appError) throw appError;
        updatePipelineStep("mobile_app", "success");
      } catch (err: any) {
        updatePipelineStep(
          "mobile_app",
          "error",
          err.message || "Mobile app provisioning pending"
        );
      }
    } else {
      updatePipelineStep("mobile_app", "success");
    }

    setExecutionComplete(true);
    toast.success(isAr ? "تم إطلاق وتجهيز البراند بنجاح!" : "Brand launched successfully!");
  };

  const handleCopyCredentials = () => {
    const text = `Boutq OS Credentials:
Brand: ${data.name_en}
URL: https://boutq.app/${data.slug}
Admin URL: https://boutq.app/admin/b/${data.slug}
Email: ${data.owner_email}
Password: ${data.owner_password || "(as provided)"}`;

    navigator.clipboard.writeText(text);
    toast.success(isAr ? "تم نسخ بيانات الدخول إلى الحافظة" : "Credentials copied to clipboard");
  };

  return (
    <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0 border-border bg-background shadow-2xl rounded-2xl">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-border/80 bg-muted/10">
        <DialogHeader className="text-start">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-1">
            <Sparkles className="h-4 w-4" />
            {isAr ? "معالج تجهيز وإطلاق البراندات" : "Brand Setup & Launch Wizard"}
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
            {isAr ? "إطلاق متجر بوتيك جديد" : "Launch a New Boutique Store"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? "معالج ذكي لتأسيس هوية المتجر، استخراج لوحة الألوان، تجهيز الأقسام وحساب المدير في دقائق."
              : "Smart wizard to establish brand identity, extract color palette, starter taxonomy, and admin account."}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper Navigation */}
        {!isExecuting && (
          <div className="grid grid-cols-4 gap-2 mt-5">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isCurrent = currentStep === step.id;
              const isPassed =
                STEPS.findIndex((s) => s.id === currentStep) > idx;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (isPassed) setCurrentStep(step.id);
                  }}
                  disabled={!isPassed && !isCurrent}
                  className={`flex items-center gap-2 p-2 rounded-xl text-start transition-all border ${
                    isCurrent
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : isPassed
                      ? "border-border/80 bg-card text-foreground cursor-pointer"
                      : "border-transparent text-muted-foreground opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div
                    className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-xs ${
                      isCurrent
                        ? "bg-primary text-primary-foreground font-bold"
                        : isPassed
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isPassed ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                  </div>
                  <div className="hidden sm:block truncate">
                    <div className="text-xs font-semibold truncate leading-tight">
                      {isAr ? step.labelAr : step.labelEn}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Body / Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isExecuting ? (
          <div className="space-y-6 py-4">
            <div className="text-center space-y-2">
              <div
                className={`mx-auto h-12 w-12 rounded-full flex items-center justify-center ${
                  executionComplete
                    ? "bg-emerald-500/20 text-emerald-600"
                    : "bg-primary/10 text-primary animate-pulse"
                }`}
              >
                {executionComplete ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : (
                  <RefreshCw className="h-6 w-6 animate-spin" />
                )}
              </div>
              <h3 className="text-lg font-bold text-foreground">
                {executionComplete
                  ? isAr
                    ? "تهانينا! تم إطلاق البراند وتجهيزه بنجاح"
                    : "Congratulations! Brand launched successfully"
                  : isAr
                  ? "جاري تهيئة المتجر وإعداد الأنظمة..."
                  : "Provisioning store and setting up systems..."}
              </h3>
              <p className="text-xs text-muted-foreground">
                {executionComplete
                  ? isAr
                    ? "جميع الأنظمة جاهزة للعمل. يمكنك الآن تسجيل الدخول كمدير أو زيارة المتجر."
                    : "All systems configured. You can now access the admin panel or visit the storefront."
                  : isAr
                  ? "يتم الآن إنشاء سجلات المتجر، رفع الملفات، وتوليد التصنيفات."
                  : "Creating store records, uploading assets, and generating taxonomy."}
              </p>
            </div>

            {/* Pipeline Step Tracker */}
            <div className="space-y-2.5 max-w-lg mx-auto p-4 rounded-xl border border-border bg-card">
              {pipelineSteps.map((step) => {
                return (
                  <div
                    key={step.id}
                    className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      {step.status === "running" && (
                        <RefreshCw className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
                      )}
                      {step.status === "success" && (
                        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      )}
                      {step.status === "error" && (
                        <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                      )}
                      {step.status === "idle" && (
                        <div className="h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0 ms-1" />
                      )}
                      <span
                        className={
                          step.status === "running"
                            ? "font-semibold text-primary"
                            : step.status === "error"
                            ? "font-semibold text-rose-600"
                            : "text-foreground"
                        }
                      >
                        {isAr ? step.labelAr : step.labelEn}
                      </span>
                    </div>

                    {step.status === "error" && (
                      <button
                        type="button"
                        onClick={handleLaunch}
                        className="text-xs text-rose-600 underline font-medium hover:opacity-80"
                      >
                        {isAr ? "إعادة المحاولة" : "Retry"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Success Card with Credentials and Links */}
            {executionComplete && (
              <div className="max-w-lg mx-auto space-y-4 pt-2">
                <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-foreground">
                      {isAr ? "بيانات الدخول لحساب المدير:" : "Admin Login Credentials:"}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyCredentials}
                      className="h-7 text-xs gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      {isAr ? "نسخ البيانات" : "Copy"}
                    </Button>
                  </div>
                  <div className="text-xs font-mono space-y-1 bg-background p-3 rounded-lg border border-border">
                    <div>
                      <span className="text-muted-foreground">Email: </span>
                      <span className="text-foreground font-semibold">{data.owner_email}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Password: </span>
                      <span className="text-foreground font-semibold">
                        {data.owner_password || "(as provided)"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <Button
                    asChild
                    className="flex-1 h-10 text-xs font-semibold gap-1.5"
                  >
                    <a
                      href={`/admin/b/${data.slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Store className="h-4 w-4" />
                      {isAr ? "لوحة تحكم المتجر" : "Open Brand Admin"}
                      <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                    </a>
                  </Button>

                  <Button
                    asChild
                    variant="outline"
                    className="flex-1 h-10 text-xs font-semibold gap-1.5"
                  >
                    <a
                      href={`/${data.slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {isAr ? "معاينة المتجر المباشر" : "Visit Live Storefront"}
                      <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {currentStep === "identity" && (
              <StepIdentity data={data} onChange={updateData} isAr={isAr} />
            )}
            {currentStep === "palette" && (
              <StepPalette data={data} onChange={updateData} isAr={isAr} />
            )}
            {currentStep === "admin" && (
              <StepAdminPlan data={data} onChange={updateData} isAr={isAr} />
            )}
            {currentStep === "review" && (
              <StepReview data={data} isAr={isAr} />
            )}
          </>
        )}
      </div>

      {/* Footer / Controls */}
      <div className="p-4 border-t border-border flex items-center justify-between bg-muted/10">
        {isExecuting ? (
          <div className="w-full flex justify-end">
            {executionComplete && (
              <Button
                onClick={() => {
                  onSaved();
                  onClose?.();
                }}
                className="h-9 font-semibold text-xs px-5"
              >
                {isAr ? "إغلاق وإنهاء" : "Finish & Close"}
              </Button>
            )}
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBack}
              disabled={currentStep === "identity"}
              className="gap-1.5 text-xs h-9"
            >
              {isAr ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {isAr ? "السابق" : "Back"}
            </Button>

            {currentStep !== "review" ? (
              <Button
                type="button"
                size="sm"
                onClick={handleNext}
                className="gap-1.5 text-xs h-9 font-semibold"
              >
                {isAr ? "التالي" : "Next"}
                {isAr ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={handleLaunch}
                className="gap-2 text-xs h-9 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                <Rocket className="h-4 w-4" />
                {isAr ? "إطلاق البراند والتهيئة الفورية" : "Launch & Provision Store"}
              </Button>
            )}
          </>
        )}
      </div>
    </DialogContent>
  );
}
