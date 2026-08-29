import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { SUPER_ADMIN_EMAIL } from "@/lib/profile-context";
import {
  approveTenantRequest,
  rejectTenantRequest,
  getPublicOnboardingPlans,
} from "@/lib/onboarding.functions";
import { getSubscriptionReceiptViewUrl } from "@/lib/saas-subscription.functions";
import {
  Clock as ClockIcon,
  Crown,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Building2,
  Sparkles,
  User,
  Mail,
  Phone,
  LayoutGrid,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { SuperCommandHeader } from "@/components/super/SuperCommandHeader";
import { SuperScopeSwitcher, type SuperScope } from "@/components/super/SuperScopeSwitcher";
import { SuperPlansManager } from "@/components/super/SuperPlansManager";
import { SuperAddonsManager } from "@/components/super/SuperAddonsManager";
import { SuperOverridesManager } from "@/components/super/SuperOverridesManager";

export const Route = createFileRoute("/_authenticated/admin/super/requests")({
  beforeLoad: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const email = (user.email || "").toLowerCase();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const isSuperAdmin = email === SUPER_ADMIN_EMAIL || profile?.role === "super_admin";
    if (!isSuperAdmin) throw redirect({ to: "/admin" });
  },
  component: SuperRequestsPage,
});

type TenantRequest = {
  id: string;
  full_name: string;
  email: string;
  contact_number: string;
  desired_subdomain: string;
  request_type: "trial" | "paid";
  status: "pending" | "approved" | "rejected";
  payment_verified: boolean;
  benefit_receipt_url: string | null;
  business_type?: string;
  selected_plan_id?: string | null;
  selected_plan_version_id?: string | null;
  billing_interval?: "monthly" | "annual" | "trial" | null;
  quoted_price?: number | null;
  quoted_currency?: string | null;
  selected_plan_snapshot?: {
    code?: string;
    name_ar?: string;
    name_en?: string;
    version_number?: number;
  } | null;
  created_at: string;
};

function SuperRequestsPage() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const [activeScope, setActiveScope] = useState<SuperScope>("requests");

  // Modal receipt viewer states
  const [selectedReceiptKey, setSelectedReceiptKey] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptViewUrl, setReceiptViewUrl] = useState<string | null>(null);

  // Approval Dialog States
  const [approvingRequest, setApprovingRequest] = useState<TenantRequest | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedBillingInterval, setSelectedBillingInterval] = useState<"monthly" | "annual">("annual");
  const [deploying, setDeploying] = useState(false);

  // Queries
  const requestsQuery = useQuery({
    queryKey: ["tenant-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as TenantRequest[];
    },
  });
  const publicPlansQuery = useQuery({
    queryKey: ["public-onboarding-plans", "admin"],
    queryFn: () => getPublicOnboardingPlans(),
  });

  const getFriendlyErrorMessage = (err: any): string => {
    if (!err) return "An unexpected error occurred.";
    const message = err.message || String(err);
    try {
      if (message.startsWith("[") && message.endsWith("]")) {
        const parsed = JSON.parse(message);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].message) {
          return parsed
            .map((issue: any) => {
              const pathStr = issue.path?.join(".") ? `(${issue.path.join(".")}) ` : "";
              return `${pathStr}${issue.message}`;
            })
            .join(", ");
        }
      }
    } catch (e) {
      // ignore
    }
    return message;
  };

  // View private R2 payment screenshot receipt
  const handleViewReceipt = async (objectKey: string) => {
    setSelectedReceiptKey(objectKey);
    setReceiptLoading(true);
    setReceiptViewUrl(null);

    try {
      const { viewUrl } = await getSubscriptionReceiptViewUrl({ data: { objectKey } });
      setReceiptViewUrl(viewUrl);
    } catch (err: any) {
      console.error(err);
      toast.error(
        lang === "ar"
          ? "فشل استرجاع رابط معاينة الإيصال."
          : "Failed to load pre-signed receipt viewer URL.",
      );
    } finally {
      setReceiptLoading(false);
    }
  };

  // Action: Open Approval Dialog Configuration
  const handleApprove = (request: TenantRequest) => {
    setApprovingRequest(request);
    const paidPlans = (publicPlansQuery.data ?? []).filter((plan: any) => plan.code !== "trial");
    setSelectedPlanId(request.selected_plan_id || paidPlans[0]?.id || null);
    setSelectedBillingInterval(
      request.billing_interval === "monthly" ? "monthly" : "annual",
    );
  };

  // Action: Approve & Mark Deployed on Confirmed dialog
  const executeApproval = async () => {
    if (!approvingRequest) return;
    setDeploying(true);
    const toastId = toast.loading(
      lang === "ar"
        ? "جاري تفعيل المساحة ونشر قواعد البيانات..."
        : "Deploying workspace structures...",
    );

    try {
      const selectedCatalogPlan = (publicPlansQuery.data ?? []).find(
        (plan: any) => plan.id === selectedPlanId,
      ) as any;
      await approveTenantRequest({
        data:
          approvingRequest.request_type === "trial"
            ? { requestId: approvingRequest.id, billingInterval: "trial" }
            : {
                requestId: approvingRequest.id,
                planId: selectedCatalogPlan?.id,
                planVersionId: selectedCatalogPlan?.version?.id,
                billingInterval: selectedBillingInterval,
              },
      });
      toast.success(
        lang === "ar"
          ? "تم تفعيل المتجر ونشر المساحة يدوياً بنجاح!"
          : "Workspace deployed successfully!",
        { id: toastId },
      );
      setApprovingRequest(null);
      void qc.invalidateQueries({ queryKey: ["tenant-requests"] });
    } catch (err: any) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Approval failed.", { id: toastId });
    } finally {
      setDeploying(false);
    }
  };

  // Action: Reject/Dismiss Request
  const handleReject = async (id: string, subdomain: string) => {
    const confirmReject = window.confirm(
      lang === "ar"
        ? `هل أنت متأكد من رفض طلب متجر "${subdomain}"؟`
        : `Are you sure you want to dismiss the tenant request for "${subdomain}"?`,
    );
    if (!confirmReject) return;

    const toastId = toast.loading(
      lang === "ar" ? "جاري رفض الطلب وأرشفته..." : "Dismissing request...",
    );

    try {
      await rejectTenantRequest({ data: { requestId: id } });
      toast.success(
        lang === "ar" ? "تم رفض وأرشفة الطلب بنجاح." : "Request dismissed and archived.",
        { id: toastId },
      );
      void qc.invalidateQueries({ queryKey: ["tenant-requests"] });
    } catch (err: any) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Rejection failed.", { id: toastId });
    }
  };

  const pendingRequests = requestsQuery.data ?? [];

  return (
    <div className="space-y-3.5">
      {/* 1. Command Header */}
      <SuperCommandHeader
        lang={lang === "ar" ? "ar" : "en"}
        pendingCount={pendingRequests.length}
        onRefresh={() => {
          void qc.invalidateQueries();
        }}
      />

      {/* 2. Scope Switcher */}
      <SuperScopeSwitcher
        lang={lang === "ar" ? "ar" : "en"}
        activeScope={activeScope}
        onScopeChange={(scope) => setActiveScope(scope)}
        pendingCount={pendingRequests.length}
      />

      {activeScope === "plans" ? (
        <SuperPlansManager />
      ) : activeScope === "addons" ? (
        <SuperAddonsManager />
      ) : activeScope === "overrides" ? (
        <SuperOverridesManager />
      ) : (
        <div className="w-full space-y-4">
          <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <ClockIcon className="h-4.5 w-4.5 text-primary" />
                    <span>
                      {lang === "ar" ? "قائمة الانتظار النشطة" : "Active Registration Waiting list"}
                    </span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {lang === "ar"
                      ? "طلبات تهيئة المتاجر المكتملة بانتظار التأكيد ونشر المساحة."
                      : "Manual tenant activations waiting super-admin approval."}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  {requestsQuery.data?.length ?? 0} {lang === "ar" ? "طلب معلق" : "Pending"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {requestsQuery.isLoading ? (
                <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-sm">
                    {lang === "ar"
                      ? "جاري سحب طلبات التفعيل المعلقة..."
                      : "Loading pending tenant requests..."}
                  </span>
                </div>
              ) : !requestsQuery.data || requestsQuery.data.length === 0 ? (
                <div className="p-16 text-center text-muted-foreground space-y-3">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto animate-bounce" />
                  <p className="text-sm font-medium text-foreground">
                    {lang === "ar"
                      ? "قائمة الانتظار فارغة بالكامل!"
                      : "All tenant requests processed!"}
                  </p>
                  <p className="text-xs max-w-sm mx-auto">
                    {lang === "ar"
                      ? "جميع طلبات الانضمام تم تفعيلها أو معالجتها بنجاح. ستظهر أي طلبات تسجيل جديدة هنا فور وصولها."
                      : "Great job! All pending brand registrations are fully vetted and verified."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 text-muted-foreground text-xs uppercase border-b border-border/60">
                          <th className="p-4 text-left font-semibold">
                            {lang === "ar" ? "صاحب المتجر" : "Owner Details"}
                          </th>
                          <th className="p-4 text-left font-semibold">
                            {lang === "ar" ? "الرابط المطلوب" : "Desired subdomain"}
                          </th>
                          <th className="p-4 text-left font-semibold">
                            {lang === "ar" ? "نوع الباقة" : "Plan Package"}
                          </th>
                          <th className="p-4 text-left font-semibold">
                            {lang === "ar" ? "نوع النشاط" : "Business Type"}
                          </th>
                          <th className="p-4 text-center font-semibold">
                            {lang === "ar" ? "إثبات الدفع" : "Benefit Receipt"}
                          </th>
                          <th className="p-4 text-right font-semibold">
                            {lang === "ar" ? "الإجراءات" : "Deployment Actions"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {requestsQuery.data.map((request) => (
                          <tr
                            key={request.id}
                            className="border-b border-border/40 hover:bg-muted/20 transition-colors"
                          >
                            <td className="p-4 space-y-1">
                              <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5 text-zinc-400" />
                                <span>{request.full_name}</span>
                              </div>
                              <div className="text-xs text-muted-foreground flex flex-col gap-0.5 font-mono">
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" /> {request.email}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" /> {request.contact_number}
                                </span>
                              </div>
                            </td>

                            <td className="p-4 font-mono text-xs">
                              <span className="font-bold text-primary">
                                {request.desired_subdomain}
                              </span>
                              <span className="text-muted-foreground">.boutq.store</span>
                            </td>

                            <td className="p-4">
                              <Badge
                                className={
                                  request.request_type === "trial"
                                    ? "bg-primary/10 text-primary border-none font-semibold text-[10px]"
                                    : "bg-emerald-500/10 text-emerald-500 border-none font-semibold text-[10px]"
                                }
                                variant="outline"
                              >
                                {request.request_type === "trial"
                                  ? lang === "ar"
                                    ? "تجربة 3 أيام"
                                    : "3-Day Trial"
                                  : (lang === "ar"
                                      ? request.selected_plan_snapshot?.name_ar
                                      : request.selected_plan_snapshot?.name_en) ||
                                    (lang === "ar" ? "متجر مدفوع" : "Official Paid")}
                              </Badge>
                              {request.quoted_price != null && request.request_type === "paid" && (
                                <p className="mt-1 text-[10px] font-semibold text-muted-foreground">
                                  {request.quoted_price} {request.quoted_currency || "BHD"} · {request.billing_interval === "monthly" ? (lang === "ar" ? "شهري" : "monthly") : (lang === "ar" ? "سنوي" : "annual")}
                                </p>
                              )}
                            </td>

                            <td className="p-4">
                              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 border border-border">
                                {request.business_type || (lang === "ar" ? "أزياء" : "Fashion")}
                              </span>
                            </td>

                            <td className="p-4 text-center">
                              {request.benefit_receipt_url ? (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="xs"
                                      onClick={() => handleViewReceipt(request.benefit_receipt_url!)}
                                      className="text-xs gap-1 h-8 border-dashed border-primary/35 hover:bg-primary/[0.04]"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      <span>{lang === "ar" ? "معاينة الإيصال" : "View Receipt"}</span>
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="sm:max-w-md bg-zinc-950 text-white border-zinc-900">
                                    <DialogHeader>
                                      <DialogTitle className="text-sm font-semibold flex items-center gap-1.5">
                                        <ClockIcon className="h-4.5 w-4.5 text-primary" />
                                        <span>
                                          {lang === "ar" ? "إيصال سداد الدفع" : "Proof of Payment"}
                                        </span>
                                      </DialogTitle>
                                    </DialogHeader>
                                    <div className="py-4 flex justify-center items-center min-h-[300px]">
                                      {receiptLoading ? (
                                        <div className="flex flex-col items-center gap-2">
                                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                          <span className="text-xs text-zinc-400">
                                            {lang === "ar"
                                              ? "جاري فك تشفير رابط الإيصال..."
                                              : "Generating secure viewer..."}
                                          </span>
                                        </div>
                                      ) : receiptViewUrl ? (
                                        <img
                                          src={receiptViewUrl}
                                          alt="Benefit Payment Receipt"
                                          className="max-h-[400px] w-auto rounded-lg object-contain border border-zinc-800"
                                        />
                                      ) : (
                                        <div className="text-xs text-zinc-500">
                                          {lang === "ar" ? "تعذر تحميل الإيصال" : "Receipt unavailable"}
                                        </div>
                                      )}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </td>

                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() =>
                                    handleReject(request.id, request.desired_subdomain)
                                  }
                                  className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 py-1 h-8 px-2"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  <span className="sr-only sm:not-sr-only sm:ms-1">
                                    {lang === "ar" ? "رفض" : "Dismiss"}
                                  </span>
                                </Button>
                                <Button
                                  size="xs"
                                  onClick={() => handleApprove(request)}
                                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white py-1 h-8 px-2.5 gap-1"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>{lang === "ar" ? "تفعيل ونشر" : "Approve"}</span>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
        </div>
      )}

      {/* Interactive Deployment Configuration Dialog */}
      <Dialog open={!!approvingRequest} onOpenChange={(open) => !open && setApprovingRequest(null)}>
        <DialogContent className="max-w-md bg-background/95 backdrop-blur-md border border-border/60 text-foreground p-6 rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-display font-medium flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <span>
                {lang === "ar" ? "تأكيد تفعيل المتجر ونشر المساحة" : "Approve & Deploy Workspace"}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-100 dark:border-zinc-900 text-xs space-y-1 font-mono">
              <p className="flex justify-between">
                <span className="text-muted-foreground">
                  {lang === "ar" ? "اسم المالك:" : "Owner Name:"}
                </span>
                <span className="font-semibold">{approvingRequest?.full_name}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">
                  {lang === "ar" ? "الرابط المطلوب:" : "Desired Domain:"}
                </span>
                <span className="font-semibold text-primary">
                  {approvingRequest?.desired_subdomain}.boutq.store
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                {lang === "ar" ? "اختر باقة تفعيل العميل" : "Select Deployment Access Plan"}
              </Label>

              {approvingRequest?.request_type === "trial" ? (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                  <div className="flex items-center gap-2 font-semibold">
                    <ClockIcon className="h-4 w-4 text-rose-500" />
                    {lang === "ar" ? "نسخة تجريبية 3 أيام" : "3-Day Free Trial"}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lang === "ar" ? "سيتم ربط المتجر تلقائياً بإصدار التجربة الحالي." : "The workspace will use the current trial plan version."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex rounded-lg border bg-muted/40 p-1">
                    {(["monthly", "annual"] as const).map((interval) => (
                      <button key={interval} type="button" onClick={() => setSelectedBillingInterval(interval)} className={`flex-1 rounded-md py-2 text-xs font-semibold ${selectedBillingInterval === interval ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}>
                        {interval === "monthly" ? (lang === "ar" ? "شهري" : "Monthly") : (lang === "ar" ? "سنوي" : "Annual")}
                      </button>
                    ))}
                  </div>
                  {(publicPlansQuery.data ?? []).filter((plan: any) => plan.code !== "trial").map((plan: any) => (
                    <button key={plan.id} type="button" onClick={() => setSelectedPlanId(plan.id)} className={`w-full rounded-xl border p-4 text-start transition-all ${selectedPlanId === plan.id ? "border-primary bg-primary/[0.03] ring-1 ring-primary" : "border-border"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-sm font-semibold"><Crown className="h-4 w-4 text-amber-500" />{lang === "ar" ? plan.name_ar : plan.name_en}</span>
                        <Badge variant="outline" className="text-[10px]">{selectedBillingInterval === "monthly" ? plan.version.price_monthly : plan.version.price_annual} {plan.version.currency}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">v{plan.version.version_number} · {plan.code}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 sm:flex-row flex-col">
            <Button
              variant="outline"
              onClick={() => setApprovingRequest(null)}
              disabled={deploying}
              className="text-xs h-9 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={executeApproval}
              disabled={deploying || (approvingRequest?.request_type === "paid" && !selectedPlanId)}
              className="text-xs h-9 bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
            >
              {deploying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              <span>{lang === "ar" ? "تأكيد ونشر" : "Confirm & Deploy"}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
