import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Package,
  ReceiptText,
  Clock,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Copy,
  X,
} from "lucide-react";
import { useBrand } from "@/lib/brand-context";
import { getStorefrontUrl } from "@/lib/storefront-url";

import type { DashboardData } from "@/features/dashboard/hooks/use-dashboard-data";
import type { useOnboardingMilestones } from "@/features/dashboard/hooks/use-onboarding-milestones";

/** The launch checklist: add products, preview and share the store, record a first sale. */
export function OnboardingChecklist({
  brand,
  completedStepsCount,
  handleCopyStoreLink,
  handleDismissOnboarding,
  handlePreviewStorefront,
  isAllStepsCompleted,
  isAr,
  productsQ,
  slug,
  step1Done,
  step2Done,
  step3Done,
  togglePreviewMilestone,
  toggleSaleMilestone,
  totalOrdersCount,
}: {
  brand: ReturnType<typeof useBrand>;
  completedStepsCount: number;
  handleCopyStoreLink: ReturnType<typeof useOnboardingMilestones>["handleCopyStoreLink"];
  handleDismissOnboarding: ReturnType<typeof useOnboardingMilestones>["handleDismissOnboarding"];
  handlePreviewStorefront: ReturnType<typeof useOnboardingMilestones>["handlePreviewStorefront"];
  isAllStepsCompleted: boolean;
  isAr: boolean;
  productsQ: DashboardData["productsQ"];
  slug: string;
  step1Done: boolean;
  step2Done: boolean;
  step3Done: boolean;
  togglePreviewMilestone: ReturnType<typeof useOnboardingMilestones>["togglePreviewMilestone"];
  toggleSaleMilestone: ReturnType<typeof useOnboardingMilestones>["toggleSaleMilestone"];
  totalOrdersCount: number;
}) {
  return (
    <Card
      className={`p-5 sm:p-6 border-2 transition-all duration-300 rounded-3xl shadow-xs space-y-4 animate-in fade-in slide-in-from-top-2 ${
        isAllStepsCompleted
          ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-background to-secondary/15"
          : "border-primary/25 bg-gradient-to-br from-primary/5 via-background to-secondary/15"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-xs transition-colors ${
              isAllStepsCompleted
                ? "bg-emerald-600 text-white"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {isAllStepsCompleted ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
          </div>
          <div>
            <h3 className="font-heading font-extrabold text-base sm:text-lg text-foreground flex items-center gap-2">
              <span>
                {isAllStepsCompleted
                  ? isAr
                    ? "🎉 مبروك! اكتمل إعداد المتجر بنجاح"
                    : "🎉 Store Launch Checklist Complete!"
                  : isAr
                    ? "ابدأ هنا — 3 خطوات لإطلاق متجرك بنجاح"
                    : "Start Here — 3 Steps to Launch Your Store"}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAllStepsCompleted
                ? isAr
                  ? "أنجزت جميع خطوات الإطلاق الأساسية. متجرك الآن يعمل وجاهز لاستقبال عملائك ومبيعاتك."
                  : "All essential launch milestones are complete. Your store is ready to serve customers."
                : isAr
                  ? "أكمل هذه الخطوات البسيطة لبدء استقبال الطلبات ومتابعة أرباحك مباشرة"
                  : "Complete these simple steps to start receiving orders and tracking your live profits"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAllStepsCompleted ? (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              {isAr ? "مكتمل 3 من 3" : "3 of 3 Done"}
            </span>
          ) : (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
              {isAr ? `مكتمل ${completedStepsCount} من 3` : `${completedStepsCount} of 3 Done`}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDismissOnboarding}
            title={isAr ? "إخفاء لوحة البداية" : "Dismiss checklist"}
            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-xl"
          >
            <X className="h-3.5 w-3.5 me-1" />
            {isAr ? "إخفاء" : "Dismiss"}
          </Button>
        </div>
      </div>

      {/* Real Progress Bar */}
      <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            isAllStepsCompleted ? "bg-emerald-500" : "bg-primary"
          }`}
          style={{ width: `${Math.max(6, (completedStepsCount / 3) * 100)}%` }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
        {/* Step 1: Add First Product */}
        <div
          className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
            step1Done
              ? "bg-emerald-500/5 border-emerald-500/20 text-foreground"
              : "bg-card border-border shadow-2xs hover:border-primary/40"
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                {isAr ? "الخطوة 1" : "Step 1"}
              </span>
              {step1Done ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {isAr ? "تمت الإضافة" : "Completed"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
                  <Clock className="h-3.5 w-3.5" />
                  {isAr ? "بانتظارك" : "Pending"}
                </span>
              )}
            </div>
            <h4 className="font-bold text-sm text-foreground">
              {isAr ? "إضافة أول منتج" : "Add Your First Product"}
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {step1Done
                ? isAr
                  ? `لديك الآن ${productsQ.data?.length ?? 1} منتج جاهز للبيع في المتجر.`
                  : `You have ${productsQ.data?.length ?? 1} products ready to sell.`
                : isAr
                  ? "أدخل اسم وسعر وصورة أول منتج لعرضه فوراً أمام عملائك."
                  : "Add name, price, and photo of your first item to display."}
            </p>
          </div>
          <Button
            asChild
            size="sm"
            variant={step1Done ? "outline" : "default"}
            className={`w-full font-bold text-xs rounded-xl ${
              !step1Done ? "bg-primary text-primary-foreground shadow-xs" : ""
            }`}
          >
            <Link to="/admin/b/$slug/inventory" params={{ slug }}>
              <Package className="h-3.5 w-3.5 me-1.5" />
              {step1Done
                ? isAr
                  ? "إدارة المنتجات"
                  : "Manage Products"
                : isAr
                  ? "أضف منتجك الأول الآن"
                  : "Add Product Now"}
            </Link>
          </Button>
        </div>

        {/* Step 2: Preview & Share Storefront */}
        <div
          className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
            step2Done
              ? "bg-emerald-500/5 border-emerald-500/20 text-foreground"
              : "bg-card border-border shadow-2xs hover:border-primary/40"
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                {isAr ? "الخطوة 2" : "Step 2"}
              </span>
              {step2Done ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {isAr ? "تمت المعاينة" : "Completed"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  {isAr ? "جاهز للمعاينة" : "Ready"}
                </span>
              )}
            </div>
            <h4 className="font-bold text-sm text-foreground">
              {isAr ? "معاينة ومشاركة المتجر" : "Preview & Share Store"}
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {step2Done
                ? isAr
                  ? "تم التحقق من ظهور المتجر بنجاح. يمكنك معاينته مجدداً أو نسخ الرابط لمشاركته."
                  : "Storefront previewed. Link is ready to share with your customers."
                : isAr
                  ? "شاهد كيف يبدو متجرك لعملائك على الجوال، وشارك الرابط مع جمهورك."
                  : "See how your store looks to mobile buyers, and share the link with your audience."}
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Button
                asChild
                size="sm"
                variant={step2Done ? "outline" : "default"}
                className={`flex-1 font-bold text-xs rounded-xl ${
                  !step2Done
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "border-border hover:bg-secondary"
                }`}
              >
                <a
                  href={getStorefrontUrl(brand)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handlePreviewStorefront}
                >
                  <ExternalLink className="h-3.5 w-3.5 me-1.5 text-current" />
                  {isAr ? "معاينة المتجر ↗" : "Preview Store ↗"}
                </a>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopyStoreLink}
                title={isAr ? "نسخ رابط المتجر" : "Copy store link"}
                className="font-bold text-xs rounded-xl border-border hover:bg-secondary px-3"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => togglePreviewMilestone(!step2Done)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline decoration-dotted"
              >
                {step2Done
                  ? isAr
                    ? "تحديد كغير مكتمل"
                    : "Mark incomplete"
                  : isAr
                    ? "تحديد كمكتمل يدويًا ✓"
                    : "Mark as done ✓"}
              </button>
            </div>
          </div>
        </div>

        {/* Step 3: First Sale */}
        <div
          className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
            step3Done
              ? "bg-emerald-500/5 border-emerald-500/20 text-foreground"
              : "bg-card border-border shadow-2xs hover:border-primary/40"
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                {isAr ? "الخطوة 3" : "Step 3"}
              </span>
              {step3Done ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {isAr ? "تم التسجيل" : "Completed"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {isAr ? "الخطوة القادمة" : "Next Milestone"}
                </span>
              )}
            </div>
            <h4 className="font-bold text-sm text-foreground">
              {isAr ? "تسجيل أول عملية بيع" : "Record Your First Sale"}
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {step3Done
                ? totalOrdersCount > 0
                  ? isAr
                    ? `تم تسجيل ${totalOrdersCount} طلب بنجاح. لوحة المبيعات والتقارير المالية تعمل بكامل طاقتها.`
                    : `${totalOrdersCount} orders recorded successfully. Sales telemetry is active.`
                  : isAr
                    ? "تم تأكيد تسجيل المبيعات بنجاح. لوحة التحكم والتقارير جاهزة للاستخدام."
                    : "First sale milestone verified. Financial reports are active."
                : isAr
                  ? "استقبل أول طلب من متجرك الإلكتروني، أو سجّل طلباً يدوياً لتشغيل لوحة الأرباح والمخزون."
                  : "Receive your first online order or create a manual order to activate financial metrics."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Button
              asChild
              size="sm"
              variant={step3Done ? "outline" : "secondary"}
              className="w-full font-bold text-xs rounded-xl hover:bg-secondary/80"
            >
              <Link to="/admin/b/$slug/orders" params={{ slug }}>
                <ReceiptText className="h-3.5 w-3.5 me-1.5 text-primary" />
                {step3Done
                  ? isAr
                    ? "إدارة الطلبات والفواتير"
                    : "Manage Orders & Invoices"
                  : isAr
                    ? "الطلبات والفواتير"
                    : "Orders & Invoices"}
              </Link>
            </Button>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => toggleSaleMilestone(!step3Done)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline decoration-dotted"
              >
                {step3Done
                  ? isAr
                    ? "تحديد كغير مكتمل"
                    : "Mark incomplete"
                  : isAr
                    ? "تحديد كمكتمل يدويًا ✓"
                    : "Mark as done ✓"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
