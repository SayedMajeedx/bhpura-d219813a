import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { brandKeys, brandQueries } from "@/lib/data/brands";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Store,
  ExternalLink,
  Crown,
  Pencil,
  Trash2,
  DollarSign,
  Users,
  Clock as ClockIcon,
  Eye,
  CheckCircle,
  XCircle,
  TrendingUp,
  Loader2,
  Shield,
  Smartphone,
  Puzzle,
} from "lucide-react";
import { BrandWizardDialog } from "@/components/super-admin/brand-wizard/BrandWizardDialog";
import { toast } from "sonner";
import { useI18n, useT } from "@/lib/i18n";
import { SUPER_ADMIN_EMAIL } from "@/lib/profile-context";
import { startImpersonationSession } from "@/lib/impersonation.functions";
import {
  getSubscriptionReceiptViewUrl,
  approveSubscriptionSaaS,
  rejectSubscriptionSaaS,
} from "@/lib/saas-subscription.functions";
import { WhiteLabelAppsPanel } from "@/components/super-admin/WhiteLabelAppsPanel";
import { DeleteBrandDialog } from "@/components/super-admin/DeleteBrandDialog";
import { fetchCallerProfile } from "@/lib/data/profiles";
import { superAdminKeys, superAdminQueries } from "@/lib/data/super-admin";
import { getCurrentUser } from "@/lib/auth/session";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { EditBrandDialog, type Brand } from "@/components/super-admin/EditBrandDialog";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";

export const Route = createFileRoute("/_authenticated/admin/brands")({
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (!user) throw redirect({ to: "/auth" });
    const email = (user.email || "").toLowerCase();
    const profile = await fetchCallerProfile(user.id);
    const isSuperAdmin = email === SUPER_ADMIN_EMAIL || profile?.role === "super_admin";
    if (!isSuperAdmin) throw redirect({ to: "/admin" });
  },
  component: BrandsPage,
});

function BrandsPage() {
  useT();
  const { lang } = useI18n();
  const qc = useQueryClient();
  useNavigate();
  const [open, setOpen] = useState(false);

  const handleImpersonate = async (brandId: string, slug: string) => {
    // A stale read-only session must not block the super admin from starting a
    // fresh, explicitly selected tenant session from the platform dashboard.
    document.cookie = "boutq_impersonation_token=; path=/; max-age=0; samesite=lax";
    const toastId = toast.loading(
      lang === "ar"
        ? "جاري تفعيل قناة محاكاة المسؤول الخارق..."
        : "Initializing Superadmin Impersonation session...",
    );
    try {
      const res = await startImpersonationSession({ data: { targetTenantId: brandId } });
      if (res && "token" in res && res.token) {
        document.cookie = `boutq_impersonation_token=${res.token}; path=/; max-age=${60 * 60 * 24}; samesite=lax${window.location.protocol === "https:" ? "; secure" : ""}`;
      }
      toast.success(
        lang === "ar"
          ? "تم تسجيل الجلسة في سجل التدقيق الموثق! جاري التحويل..."
          : "Audit log recorded! Redirecting to merchant dashboard...",
        { id: toastId },
      );
      window.location.href = `/admin/b/${slug}/dashboard`;
    } catch (err: any) {
      console.error(err);
      toast.error(
        lang === "ar"
          ? "تعذر بدء محاكاة المتجر. تحقق من صلاحية وصول الدعم الفني ثم حاول مجدداً."
          : "Unable to start store impersonation. Verify support access and try again.",
        { id: toastId },
      );
    }
  };
  const [editing, setEditing] = useState<Brand | null>(null);
  const [deleting, setDeleting] = useState<Brand | null>(null);
  const [activeTab, setActiveTab] = useState("all-stores");

  // Approval Dialog States
  const [approvingBrand, setApprovingBrand] = useState<Brand | null>(null);
  const [approvingPlanId, setApprovingPlanId] = useState<string>("");
  const [approvingInterval, setApprovingInterval] = useState<"monthly" | "annual">("annual");
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const { data: saasPlans = [] } = useQuery(superAdminQueries.activePlans());

  const q = useQuery(brandQueries.list());

  const brands = (q.data ?? []) as unknown as Brand[];
  const refresh = () => qc.invalidateQueries({ queryKey: brandKeys.list() });

  // Filter pending approvals
  const pendingApprovals = brands.filter(
    (b) => b.subscription_status === "pending_verification" && b.payment_receipt_url,
  );

  const pendingBrandIds = pendingApprovals.map((b) => b.id);
  const { data: pendingSubscriptions = [] } = useQuery(
    superAdminQueries.pendingSubscriptions(pendingBrandIds),
  );

  // Compute Platform KPI Stats
  const activeSaaSCount = brands.filter((b) => b.subscription_status === "active").length;

  const totalAnnualRevenue = brands.reduce(
    (sum, brand) =>
      brand.subscription_status === "active" &&
      brand.plan_type !== "lifetime" &&
      brand.plan_type !== "trial"
        ? sum + (brand.plan_type === "monthly" ? 0 : 49)
        : sum,
    0,
  );

  const handleViewReceipt = async (objectKey: string) => {
    try {
      const { viewUrl } = await getSubscriptionReceiptViewUrl({ data: { objectKey } });
      window.open(viewUrl, "_blank");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate private view URL.");
    }
  };

  const handleApprove = async () => {
    if (!approvingBrand) return;
    setApproving(true);
    try {
      await approveSubscriptionSaaS({
        data: {
          brandId: approvingBrand.id,
          targetPlanId: approvingPlanId || undefined,
          billingInterval: approvingInterval,
        },
      });
      toast.success(
        lang === "ar"
          ? "تم تفعيل الاشتراك وتمديد الصلاحية بنجاح!"
          : "Subscription approved and extended successfully!",
      );
      setApprovingBrand(null);
      refresh();
      qc.invalidateQueries({ queryKey: superAdminKeys.pendingSubscriptionsAll() });
    } catch (err: any) {
      toast.error(err.message || "Failed to approve subscription.");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (brandId: string) => {
    const ar = lang === "ar";
    const ok = await confirmDialog({
      title: ar ? "رفض هذا الإيصال؟ سيُحذف الملف ويُعلَّق المتجر." : "Reject this receipt?",
      destructive: true,
    });
    if (!ok) return;
    setRejecting(brandId);
    try {
      await rejectSubscriptionSaaS({ data: { brandId } });
      toast.success(
        lang === "ar" ? "تم رفض وإزالة الإيصال بنجاح." : "Receipt rejected and storage cleaned.",
      );
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject subscription.");
    } finally {
      setRejecting(null);
    }
  };

  return (
    <div
      className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8 animate-fade-in"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-primary mb-1">
            <Crown className="h-3.5 w-3.5 text-amber-500 animate-pulse" />{" "}
            {lang === "ar" ? "المدير الأعلى" : "Super Admin Cockpit"}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {lang === "ar" ? "لوحة تحكم بوتيك" : "Boutq Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "ar"
              ? "مراقبة مستأجري المنصة، الموافقة على الطلبات، وإدارة المحلات متعددة المستأجرين."
              : "Monitor platform tenants, approve requests, and manage multi-tenant shops."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="h-11 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
              >
                <Plus className="h-4 w-4 me-2" />{" "}
                {lang === "ar" ? "معالج إطلاق متجر" : "Launch Brand Wizard"}
              </Button>
            </DialogTrigger>
            <BrandWizardDialog
              onSaved={() => {
                setOpen(false);
                refresh();
              }}
              onClose={() => setOpen(false)}
            />
          </Dialog>
        </div>
      </div>

      {/* Modern SaaS KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI: Total Brands */}
        <Card className="overflow-hidden border border-border-subtle shadow-lg rounded-2xl bg-card p-6 flex items-center gap-4 relative">
          <div className="p-3 rounded-full bg-primary/5 text-primary">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-muted-foreground block">
              {lang === "ar" ? "إجمالي البوتيكات" : "Total Boutique Tenants"}
            </span>
            <span className="text-2xl font-bold font-display mt-0.5 block">{brands.length}</span>
          </div>
        </Card>

        {/* KPI: Active SaaS Subscriptions */}
        <Card className="overflow-hidden border border-border-subtle shadow-lg rounded-2xl bg-card p-6 flex items-center gap-4 relative">
          <div className="p-3 rounded-full bg-emerald-500/5 text-emerald-500">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-muted-foreground block">
              {lang === "ar" ? "الاشتراكات النشطة" : "Active SaaS Subscriptions"}
            </span>
            <span className="text-2xl font-bold font-display text-emerald-600 dark:text-emerald-500 mt-0.5 block">
              {activeSaaSCount}
            </span>
          </div>
        </Card>

        {/* KPI: annual subscription revenue */}
        <Card className="overflow-hidden border border-border-subtle shadow-lg rounded-2xl bg-card p-6 flex items-center gap-4 relative">
          <div className="p-3 rounded-full bg-blue-500/5 text-blue-500">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-muted-foreground block">
              {lang === "ar" ? "إيراد الاشتراكات السنوية" : "Annual Subscription Revenue"}
            </span>
            <span className="text-2xl font-bold font-display text-blue-600 dark:text-blue-500 mt-0.5 block">
              {totalAnnualRevenue} BHD
            </span>
          </div>
        </Card>
      </div>

      {/* Interactive Tabs Layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full items-center gap-1.5 overflow-x-auto no-scrollbar h-auto p-1 mb-6 bg-muted/60 border border-border rounded-xl overscroll-contain sm:grid sm:grid-cols-3 sm:max-w-2xl sm:h-11">
          <TabsTrigger
            value="all-stores"
            className="shrink-0 whitespace-nowrap min-h-[38px] px-3 font-medium text-xs sm:shrink sm:min-w-0 sm:flex-1"
          >
            {lang === "ar" ? "المحلات المتاحة" : "All Shops"} ({brands.length})
          </TabsTrigger>
          <TabsTrigger
            value="receipt-approvals"
            className="shrink-0 whitespace-nowrap min-h-[38px] px-3 font-medium text-xs relative sm:shrink sm:min-w-0 sm:flex-1"
          >
            {lang === "ar" ? "إيصالات الاشتراكات" : "Receipt Approvals"}
            {pendingApprovals.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-rose-500 text-white rounded-full text-xs flex items-center justify-center font-bold animate-bounce">
                {pendingApprovals.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="mobile-apps"
            className="shrink-0 whitespace-nowrap min-h-[38px] px-3 font-medium text-xs gap-1.5 sm:shrink sm:min-w-0 sm:flex-1"
          >
            <Smartphone className="h-3.5 w-3.5" />
            {lang === "ar" ? "تطبيقات البراندات" : "Brand Apps"}
          </TabsTrigger>
        </TabsList>

        {/* TAB CONTENT: All Registered Tenants */}
        <TabsContent value="all-stores" className="space-y-4">
          {brands.length === 0 ? (
            <OsEmptyState
              icon={Store}
              title={lang === "ar" ? "لا توجد علامات تجارية" : "No brands found"}
              description={
                lang === "ar"
                  ? "لم يتم تسجيل أي علامات تجارية في المنظومة حتى الآن."
                  : "No store brands have been registered in the system yet."
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {brands.map((b) => (
                <Card
                  key={b.id}
                  className="overflow-hidden border border-border-subtle shadow-lg rounded-2xl bg-card p-6 relative flex flex-col justify-between h-56 transition-all duration-200 hover:shadow-xl hover:scale-[1.01]"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      {b.logo_url ? (
                        <img
                          src={b.logo_url}
                          alt={b.name_en}
                          className="h-10 w-10 rounded object-contain bg-secondary border border-border-subtle"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-secondary grid place-items-center border border-border-subtle">
                          <Store className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-display font-medium text-lg line-clamp-2 break-words">
                          {lang === "ar" ? b.name_ar || b.name_en : b.name_en}
                        </div>
                        <div className="text-xs text-muted-foreground truncate font-mono">
                          {b.slug}.boutq.store
                        </div>
                      </div>

                      {/* Subscription status badges */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {b.support_access_enabled === false && (
                          <Badge
                            variant="destructive"
                            className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold py-0 h-4"
                          >
                            {lang === "ar" ? "الخصوصية مفعلة" : "Privacy Lock"}
                          </Badge>
                        )}
                        {b.plan_type === "lifetime" ? (
                          <Badge className="bg-violet-600 text-white hover:bg-violet-700 text-xs">
                            {lang === "ar" ? "مشروع دائم" : "Permanent"}
                          </Badge>
                        ) : b.plan_type === "trial" || b.subscription_status === "trialing" ? (
                          <Badge className="bg-amber-500 text-white hover:bg-amber-600 text-xs">
                            {lang === "ar" ? "تجربة مجانية" : "Free Trial"}
                          </Badge>
                        ) : b.subscription_status === "active" ? (
                          <Badge className="bg-emerald-500 text-white hover:bg-emerald-600 text-xs">
                            {b.plan_type === "monthly"
                              ? lang === "ar"
                                ? "شهري نشط"
                                : "Monthly active"
                              : lang === "ar"
                                ? "سنوي نشط"
                                : "Annual active"}
                          </Badge>
                        ) : b.subscription_status === "pending_verification" ? (
                          <Badge className="bg-amber-500 text-white hover:bg-amber-600 text-xs animate-pulse">
                            Pending
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-muted text-muted-foreground border-border text-xs"
                          >
                            Unpaid
                          </Badge>
                        )}
                        {b.plan_type === "trial" && b.trial_ends_at && (
                          <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-0.5">
                            <ClockIcon className="h-2.5 w-2.5" />
                            {Math.max(
                              0,
                              Math.ceil(
                                (new Date(b.trial_ends_at).getTime() - Date.now()) / 86400000,
                              ),
                            )}{" "}
                            {lang === "ar" ? "أيام تجريبية متبقية" : "trial days left"}
                          </span>
                        )}
                        {b.subscription_expires_at &&
                          b.plan_type !== "lifetime" &&
                          b.plan_type !== "trial" && (
                            <span className="text-xs text-muted-foreground font-semibold flex items-center gap-0.5">
                              <ClockIcon className="h-2.5 w-2.5" />
                              {Math.max(
                                0,
                                Math.ceil(
                                  (new Date(b.subscription_expires_at).getTime() - Date.now()) /
                                    86400000,
                                ),
                              )}{" "}
                              {lang === "ar" ? "يوم متبقٍ" : "days left"}
                            </span>
                          )}
                        {b.renewal_intent && (
                          <Badge
                            className={
                              b.renewal_intent === "upgrade"
                                ? "bg-emerald-600 text-white hover:bg-emerald-700 text-xs"
                                : b.renewal_intent === "renew"
                                  ? "bg-blue-600 text-white hover:bg-blue-700 text-xs"
                                  : b.renewal_intent === "downgrade"
                                    ? "bg-amber-600 text-white hover:bg-amber-700 text-xs"
                                    : "bg-rose-600 text-white hover:bg-rose-700 text-xs"
                            }
                          >
                            {b.renewal_intent === "upgrade"
                              ? lang === "ar"
                                ? "طلب ترقية باقة"
                                : "Upgrade Request"
                              : b.renewal_intent === "renew"
                                ? lang === "ar"
                                  ? "يرغب بالتجديد"
                                  : "Wants to renew"
                                : b.renewal_intent === "downgrade"
                                  ? lang === "ar"
                                    ? "طلب خفض باقة"
                                    : "Downgrade Request"
                                  : lang === "ar"
                                    ? "لن يجدد"
                                    : "Will not renew"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 border-t border-border-subtle pt-3">
                    {b.support_access_enabled === false ? (
                      <div className="flex-1 flex flex-col gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full h-9 opacity-50 cursor-not-allowed"
                          disabled
                        >
                          <Shield className="h-3.5 w-3.5 me-1 text-muted-foreground" />
                          {lang === "ar" ? "المحاكاة معطلة" : "Impersonation Disabled"}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 h-9 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                        onClick={() => handleImpersonate(b.id, b.slug)}
                      >
                        <Shield className="h-3.5 w-3.5 me-1 text-amber-500 animate-pulse" />
                        {lang === "ar" ? "محاكاة اللوحة" : "Impersonate"}
                      </Button>
                    )}
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="flex-1 h-9 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                    >
                      <Link to="/$slug" params={{ slug: b.slug }}>
                        <ExternalLink className="h-3.5 w-3.5 me-1" />
                        {lang === "ar" ? "المتجر" : "Storefront"}
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-9 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                      title={lang === "ar" ? "إضافات المتجر" : "Store Add-ons"}
                    >
                      <Link to="/admin/b/$slug/addons" params={{ slug: b.slug }}>
                        <Puzzle className="h-3.5 w-3.5 text-primary" />
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                      onClick={() => setEditing(b)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 h-9 shadow-sm transition-all duration-200 hover:scale-[1.01] active:scale-95"
                      onClick={() => setDeleting(b)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mobile-apps" className="space-y-4">
          <WhiteLabelAppsPanel brands={brands} isAr={lang === "ar"} />
        </TabsContent>

        {/* TAB CONTENT: Subscription Receipt Approvals Queue */}
        <TabsContent value="receipt-approvals" className="space-y-4">
          {pendingApprovals.length === 0 ? (
            <OsEmptyState
              icon={CheckCircle}
              title={lang === "ar" ? "قائمة المراجعة فارغة تماماً!" : "Inbox is perfectly clean!"}
              description={
                lang === "ar"
                  ? "لا توجد إيصالات دفع معلقة للمراجعة في الوقت الحالي."
                  : "No boutique payment receipts are awaiting approval at the moment."
              }
            />
          ) : (
            <div className="space-y-3">
              {pendingApprovals.map((b) => {
                const sub = pendingSubscriptions.find((s) => s.brand_id === b.id);
                return (
                  <Card
                    key={b.id}
                    className="overflow-hidden border border-border-subtle shadow-lg rounded-2xl bg-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-full bg-amber-500/5 grid place-items-center text-amber-500">
                        <ClockIcon className="h-5 w-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="font-display font-medium text-base text-foreground">
                          {lang === "ar" ? b.name_ar || b.name_en : b.name_en}
                        </h4>
                        <p className="text-xs text-muted-foreground font-mono">
                          /{b.slug} • ID: {b.id.substring(0, 8)}...
                        </p>
                        {b.payment_receipt_uploaded_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {lang === "ar" ? "تم الرفع:" : "Uploaded:"}{" "}
                            {new Date(b.payment_receipt_uploaded_at).toLocaleString(
                              lang === "ar" ? "ar-BH-u-nu-latn" : "en-US",
                            )}
                          </p>
                        )}
                        {sub?.target_plan && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-lg w-fit border border-primary/20">
                            <TrendingUp className="h-3.5 w-3.5" />
                            <span className="font-semibold">
                              {lang === "ar"
                                ? `الترقية المطلوبة: ${(sub.target_plan as any).name_ar || (sub.target_plan as any).name_en} (${sub.billing_interval === "monthly" ? "شهري" : "سنوي"})`
                                : `Requested: ${(sub.target_plan as any).name_en || (sub.target_plan as any).name_ar} (${sub.billing_interval === "monthly" ? "Monthly" : "Annual"})`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* View R2 Receipt Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs font-medium shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                        onClick={() =>
                          b.payment_receipt_url && handleViewReceipt(b.payment_receipt_url)
                        }
                      >
                        <Eye className="h-4 w-4 text-primary" />
                        <span>{lang === "ar" ? "عرض إيصال R2" : "View Receipt"}</span>
                      </Button>

                      {/* Open Approve Dialog */}
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs font-medium shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                        onClick={() => {
                          setApprovingBrand(b);
                          const targetPlan =
                            saasPlans.find((p) => p.id === sub?.renewal_target_plan_id) ||
                            saasPlans.find((p) => p.code === "pro") ||
                            saasPlans.find(
                              (p) => p.code !== "trial" && p.code !== "lifetime_founder",
                            ) ||
                            saasPlans[0];
                          setApprovingPlanId(targetPlan?.id || "");
                          setApprovingInterval(
                            sub?.billing_interval === "monthly" ? "monthly" : "annual",
                          );
                        }}
                      >
                        <CheckCircle className="h-4 w-4" />
                        <span>{lang === "ar" ? "اعتماد" : "Approve"}</span>
                      </Button>

                      {/* Reject Receipt */}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={rejecting === b.id}
                        className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/5 gap-1 text-xs font-medium transition-all duration-200 hover:scale-[1.01] active:scale-95"
                        onClick={() => handleReject(b.id)}
                      >
                        {rejecting === b.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        <span>{lang === "ar" ? "رفض" : "Reject"}</span>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* DIALOG: Approve Subscription & Assign Plan/Interval */}
      {approvingBrand && (
        <AppDialog
          open={!!approvingBrand}
          onOpenChange={(v) => !v && setApprovingBrand(null)}
          kind="form"
        >
          <AppDialogHeader
            icon={<CheckCircle />}
            title={lang === "ar" ? "اعتماد اشتراك البوتيك" : "Approve SaaS Subscription"}
          />

          <AppDialogBody>
            <div className="space-y-4 py-3">
              <div className="p-3 bg-muted/40 border border-border-subtle rounded-xl font-mono text-xs">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest">
                  {lang === "ar" ? "المحل المختار" : "Boutique Brand"}
                </p>
                <p className="font-display font-semibold mt-0.5 text-foreground text-sm">
                  {lang === "ar"
                    ? approvingBrand.name_ar || approvingBrand.name_en
                    : approvingBrand.name_en}
                </p>
              </div>

              {/* Plan Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">
                  {lang === "ar" ? "الباقة المراد تفعيلها" : "Target Subscription Plan"}
                </Label>
                <Select value={approvingPlanId} onValueChange={setApprovingPlanId}>
                  <SelectTrigger className="w-full bg-background/50 border-border-subtle">
                    <SelectValue
                      placeholder={lang === "ar" ? "اختر الباقة..." : "Select Plan..."}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {saasPlans
                      .filter((p) => p.code !== "trial" && p.code !== "lifetime_founder")
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {lang === "ar" ? p.name_ar : p.name_en} ({p.code})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Billing Interval Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">
                  {lang === "ar" ? "فترة الاشتراك" : "Billing Interval"}
                </Label>
                <Select
                  value={approvingInterval}
                  onValueChange={(val: "monthly" | "annual") => setApprovingInterval(val)}
                >
                  <SelectTrigger className="w-full bg-background/50 border-border-subtle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">
                      {lang === "ar" ? "شهري (شهر واحد من تاريخ التفعيل)" : "Monthly (1 Month)"}
                    </SelectItem>
                    <SelectItem value="annual">
                      {lang === "ar" ? "سنوي (سنة كاملة من تاريخ التفعيل)" : "Annual (1 Year)"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {lang === "ar" ? "ملاحظة الاعتماد:" : "Activation note:"}
                </p>
                <p>
                  {lang === "ar"
                    ? `الموافقة ستقوم بترقية المتجر فورياً للباقة المختارة وإنهاء الفترة التجريبية وتمديد الصلاحية لمدة ${approvingInterval === "monthly" ? "شهر كامل" : "سنة كاملة"}.`
                    : `Approval will immediately upgrade the boutique to the selected plan, terminate the trial mode, and extend subscription for ${approvingInterval === "monthly" ? "1 month" : "1 full year"}.`}
                </p>
              </div>
            </div>
          </AppDialogBody>
          <AppDialogFooter>
            <Button
              variant="outline"
              onClick={() => setApprovingBrand(null)}
              disabled={approving}
              className="shadow-sm transition-all duration-200 hover:scale-[1.01] active:scale-95"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm transition-all duration-200 hover:scale-[1.01] active:scale-95"
            >
              {approving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{lang === "ar" ? "جاري الاعتماد..." : "Activating..."}</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>{lang === "ar" ? "تفعيل الحساب الآن" : "Authorize & Activate"}</span>
                </>
              )}
            </Button>
          </AppDialogFooter>
        </AppDialog>
      )}

      {/* Dialogs: Edit / Delete */}
      {editing && (
        <EditBrandDialog
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          brand={editing}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {deleting && (
        <DeleteBrandDialog
          brand={deleting}
          open={!!deleting}
          onOpenChange={(v) => !v && setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
