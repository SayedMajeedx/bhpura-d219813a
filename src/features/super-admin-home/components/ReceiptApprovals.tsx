import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Clock, Eye, Loader2, TrendingUp, XCircle } from "lucide-react";
import { toast } from "sonner";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { Button } from "@/components/ui/button";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { superAdminKeys, superAdminQueries } from "@/lib/data/super-admin";
import {
  approveSubscriptionSaaS,
  getSubscriptionReceiptViewUrl,
  rejectSubscriptionSaaS,
} from "@/lib/saas-subscription.functions";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { storeName, type HomeStore } from "../lib/stores";

type Lang = "ar" | "en";
type PlanName = { name_ar?: string | null; name_en?: string | null } | null;

/** Subscription receipts waiting for the super admin: view, approve on a plan, or reject. */
export function ReceiptApprovals({
  stores,
  lang,
  onChanged,
}: {
  stores: HomeStore[];
  lang: Lang;
  onChanged: () => void;
}) {
  const ar = lang === "ar";
  const qc = useQueryClient();
  const { data: plans = [] } = useQuery(superAdminQueries.activePlans());
  const { data: subscriptions = [] } = useQuery(
    superAdminQueries.pendingSubscriptions(stores.map((s) => s.id)),
  );
  const [approving, setApproving] = useState<HomeStore | null>(null);
  const [planId, setPlanId] = useState("");
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const choosable = plans.filter((p) => p.code !== "trial" && p.code !== "lifetime_founder");

  const viewReceipt = async (objectKey: string) => {
    try {
      const { viewUrl } = await getSubscriptionReceiptViewUrl({ data: { objectKey } });
      window.open(viewUrl, "_blank");
    } catch (error) {
      toast.error(getFriendlyErrorMessage(error));
    }
  };

  const startApprove = (store: HomeStore) => {
    const sub = subscriptions.find((s) => s.brand_id === store.id);
    const plan =
      plans.find((p) => p.id === sub?.renewal_target_plan_id) ??
      plans.find((p) => p.code === "pro") ??
      choosable[0] ??
      plans[0];
    setPlanId(plan?.id ?? "");
    setInterval(sub?.billing_interval === "monthly" ? "monthly" : "annual");
    setApproving(store);
  };

  const approve = async () => {
    if (!approving) return;
    setBusy(true);
    try {
      await approveSubscriptionSaaS({
        data: {
          brandId: approving.id,
          targetPlanId: planId || undefined,
          billingInterval: interval,
        },
      });
      toast.success(ar ? "فُعّل الاشتراك ومُدّدت صلاحيته" : "Subscription approved and extended");
      setApproving(null);
      onChanged();
      void qc.invalidateQueries({ queryKey: superAdminKeys.pendingSubscriptionsAll() });
    } catch (error) {
      toast.error(getFriendlyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const reject = async (store: HomeStore) => {
    const ok = await confirmDialog({
      title: ar ? "رفض هذا الإيصال؟" : "Reject this receipt?",
      description: ar
        ? "يُحذف ملف الإيصال ويبقى المتجر بلا اشتراك نشط."
        : "The receipt file is deleted and the store stays without an active subscription.",
      destructive: true,
    });
    if (!ok) return;
    setRejecting(store.id);
    try {
      await rejectSubscriptionSaaS({ data: { brandId: store.id } });
      toast.success(ar ? "رُفض الإيصال وحُذف ملفه" : "Receipt rejected and its file removed");
      onChanged();
    } catch (error) {
      toast.error(getFriendlyErrorMessage(error));
    } finally {
      setRejecting(null);
    }
  };

  if (stores.length === 0) {
    return (
      <OsEmptyState
        icon={CheckCircle}
        title={ar ? "لا إيصالات تنتظر" : "No receipts waiting"}
        description={
          ar
            ? "تظهر هنا إيصالات الاشتراك حين ترفعها المتاجر."
            : "Subscription receipts show here as stores upload them."
        }
      />
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {stores.map((store) => {
          const sub = subscriptions.find((s) => s.brand_id === store.id);
          const plan = sub?.target_plan as PlanName;
          return (
            <li
              key={store.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/10 text-warning">
                  <Clock className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div dir="auto" className="text-page-start break-words font-semibold">
                    {storeName(store, lang)}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground" dir="ltr">
                    /{store.slug}
                  </div>
                  {plan && (
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                      <TrendingUp className="size-3.5" aria-hidden="true" />
                      {ar
                        ? `طلب: ${plan.name_ar || plan.name_en} (${sub?.billing_interval === "monthly" ? "شهري" : "سنوي"})`
                        : `Asked for: ${plan.name_en || plan.name_ar} (${sub?.billing_interval === "monthly" ? "monthly" : "annual"})`}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    store.payment_receipt_url && void viewReceipt(store.payment_receipt_url)
                  }
                >
                  <Eye className="size-4" />
                  {ar ? "عرض الإيصال" : "View receipt"}
                </Button>
                <Button size="sm" onClick={() => startApprove(store)}>
                  <CheckCircle className="size-4" />
                  {ar ? "اعتماد" : "Approve"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  disabled={rejecting === store.id}
                  onClick={() => void reject(store)}
                >
                  {rejecting === store.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <XCircle className="size-4" />
                  )}
                  {ar ? "رفض" : "Reject"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <AppDialog
        open={!!approving}
        onOpenChange={(open) => !open && !busy && setApproving(null)}
        kind="form"
        busy={busy}
      >
        <AppDialogHeader
          icon={<CheckCircle />}
          title={ar ? "اعتماد الاشتراك" : "Approve the subscription"}
          description={approving ? storeName(approving, lang) : undefined}
        />
        <AppDialogBody>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="approve-plan">{ar ? "الباقة" : "Plan"}</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger id="approve-plan" className="w-full">
                  <SelectValue placeholder={ar ? "اختر الباقة" : "Choose a plan"} />
                </SelectTrigger>
                <SelectContent>
                  {choosable.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {ar ? p.name_ar : p.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="approve-interval">{ar ? "المدة" : "Period"}</Label>
              <Select value={interval} onValueChange={(v: "monthly" | "annual") => setInterval(v)}>
                <SelectTrigger id="approve-interval" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">
                    {ar ? "شهر من اليوم" : "A month from today"}
                  </SelectItem>
                  <SelectItem value="annual">
                    {ar ? "سنة من اليوم" : "A year from today"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {ar
                ? `ينتقل المتجر إلى الباقة المختارة فوراً، وتنتهي تجربته، وتمتد صلاحيته ${interval === "monthly" ? "شهراً" : "سنة"}.`
                : `The store moves to the chosen plan now, its trial ends, and its access runs for ${interval === "monthly" ? "a month" : "a year"}.`}
            </p>
          </div>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => setApproving(null)} disabled={busy}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={() => void approve()} disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle className="size-4" />
            )}
            {ar ? "اعتماد وتفعيل" : "Approve and activate"}
          </Button>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}
