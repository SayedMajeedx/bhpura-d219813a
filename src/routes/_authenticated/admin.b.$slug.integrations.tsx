import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plug, Plus, Pencil, Trash2, Copy, ShieldAlert, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useT, useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/integrations")({
  component: IntegrationsPage,
});

type Row = {
  id: string;
  brand_id: string;
  provider: string;
  base_url: string | null;
  api_key_masked: string | null;
  webhook_secret_masked: string | null;
  has_api_key: boolean;
  has_webhook_secret: boolean;
  is_active: boolean;
  notes: string | null;
  updated_at: string;
};

const PROVIDER_PRESETS = [
  { value: "aramex", label: "Aramex" },
  { value: "posta_plus", label: "Posta Plus" },
  { value: "stripe", label: "Stripe" },
  { value: "tap", label: "Tap Payments" },
  { value: "benefit", label: "Benefit Pay" },
  { value: "zoho_customer_email", label: "Zoho Customer Email (SMTP)" },
  { value: "sendpulse_admin", label: "SendPulse Admin Notifications" },
  { value: "custom", label: "Custom" },
];

function IntegrationsPage() {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const brandId = brand.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const q = useQuery({
    queryKey: ["integrations", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("list_integration_credentials", { p_brand_id: brandId });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const del = async (id: string) => {
    if (!confirm(isAr ? "حذف هذا التكامل؟" : "Delete this integration?")) return;
    const { error } = await (supabase.rpc as any)("delete_integration_credential", { p_id: id, p_brand_id: brandId });
    if (error) return toast.error(error.message);
    toast.success(t("common.delete"));
    qc.invalidateQueries({ queryKey: ["integrations", brandId] });
  };

  const webhookBase = typeof window !== "undefined" ? `${window.location.origin}/api/public/webhooks` : "https://…/api/public/webhooks";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary mb-1">
            <Plug className="h-3.5 w-3.5" /> {t("nav.integrations")}
          </div>
          <h1 className="text-3xl sm:text-4xl font-display">{t("integrations.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("integrations.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4 me-2" /> {t("integrations.new")}
            </Button>
          </DialogTrigger>
          <IntegrationDialog
            brandId={brandId}
            row={editing}
            onSaved={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["integrations", brandId] }); }}
          />
        </Dialog>
      </div>

      <Card className="p-3 mb-4 border-amber-500/40 bg-amber-500/5">
        <div className="flex items-start gap-2 text-sm">
          <ShieldAlert className="h-4 w-4 mt-0.5 text-amber-600" />
          <p>{t("integrations.warning")}</p>
        </div>
      </Card>

      <AnalyticsTrackingCard brandId={brandId} isAr={isAr} />
      <AdminNotificationRecipientsCard brandId={brandId} isAr={isAr} />
      <EmailActivityCard brandId={brandId} isAr={isAr} />

      {q.data && q.data.length === 0 ? (
        <Card className="p-12 text-center">
          <Plug className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">{t("integrations.none")}</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {(q.data ?? []).map((row) => {
            const webhookUrl = `${webhookBase}/${row.provider}/${brandId}`;
            const preset = PROVIDER_PRESETS.find((p) => p.value === row.provider);
            const isDirectEmailProvider = row.provider === "zoho_customer_email" || row.provider === "sendpulse_admin";
            return (
              <Card key={row.id} className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="font-display text-lg truncate">{preset?.label ?? row.provider}</div>
                    <div className="text-xs text-muted-foreground truncate">{row.base_url || "—"}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs uppercase tracking-wider px-2 py-1 rounded ${row.is_active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                      {row.is_active ? t("integrations.active") : isAr ? "معطّل" : "Off"}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(row); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => del(row.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <MaskedRow label={t("integrations.apiKey")} value={row.api_key_masked} />
                  <MaskedRow label={t("integrations.webhookSecret")} value={row.webhook_secret_masked} />
                </div>

                <div className="mt-3 pt-3 border-t border-border text-xs">
                  {isDirectEmailProvider ? (
                    <p className="text-muted-foreground">
                      {isAr
                        ? "يستخدم هذا المزود مباشرةً من خدمة البريد الآمنة في Boutq. لا يلزم إعداد رابط Webhook لدى المزود."
                        : "This provider is used directly by Boutq's secure email service. No provider webhook URL is required."}
                    </p>
                  ) : (
                    <>
                      <p className="text-muted-foreground mb-1">{t("integrations.webhookHint")}</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 truncate bg-secondary/40 rounded px-2 py-1">{webhookUrl}</code>
                        <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(webhookUrl); toast.success("Copied"); }}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                {row.notes && <p className="text-xs text-muted-foreground mt-3 italic">{row.notes}</p>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

type EmailActivityRow = {
  id: string;
  order_id: string | null;
  invoice_number: number | null;
  event_type: string;
  channel: "customer" | "admin";
  recipient: string | null;
  provider: string | null;
  status: "sent" | "failed" | "skipped";
  error_message: string | null;
  created_at: string;
};

function EmailActivityCard({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const [channel, setChannel] = useState<"all" | "customer" | "admin">("all");
  const q = useQuery({
    queryKey: ["brand-email-notifications", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("list_brand_email_notifications", {
        p_brand_id: brandId,
        p_limit: 100,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as EmailActivityRow[];
    },
    refetchInterval: 30_000,
  });

  const rows = (q.data ?? []).filter((row) => channel === "all" || row.channel === channel);
  const labels = {
    title: isAr ? "سجل المراسلات والبريد" : "Communications & email activity",
    description: isAr
      ? "سجل لكل رسالة عميل أو تنبيه إداري: المزود والمستلم والنتيجة. حالة «تم القبول» تعني أن المزود قبل الإرسال؛ تعرض سجلات Zoho أو SendPulse حالة التسليم النهائية عند توفرها."
      : "A record of every customer email and internal alert, including provider, recipient, and outcome. “Accepted” means the provider accepted the send; Zoho or SendPulse delivery reports remain the source of final inbox, bounce, and reply status.",
    all: isAr ? "الكل" : "All messages",
    customer: isAr ? "رسائل العملاء" : "Customer emails",
    admin: isAr ? "تنبيهات الإدارة" : "Admin alerts",
    event: isAr ? "الحدث" : "Event",
    recipient: isAr ? "المستلم" : "Recipient",
    channel: isAr ? "النوع" : "Channel",
    provider: isAr ? "المزود" : "Provider",
    result: isAr ? "النتيجة" : "Result",
    order: isAr ? "الطلب" : "Order",
    details: isAr ? "التفاصيل" : "Details",
    time: isAr ? "الوقت" : "Time",
    empty: isAr ? "لا توجد رسائل مسجلة لهذه العلامة بعد." : "No email activity has been recorded for this brand yet.",
    refresh: isAr ? "تحديث" : "Refresh",
  };

  const eventLabel = (event: string) => {
    const key = event.replaceAll("_", " ");
    return isAr ? key : key.replace(/\b\w/g, (letter) => letter.toUpperCase());
  };
  const providerLabel = (provider: string | null) => {
    if (provider === "zoho_customer_email" || provider === "zoho") return "Zoho SMTP";
    if (provider === "sendpulse_admin" || provider === "sendpulse") return "SendPulse";
    return provider || "—";
  };
  const statusLabel = (status: EmailActivityRow["status"]) => {
    if (isAr) return status === "sent" ? "تم قبول الإرسال" : status === "failed" ? "فشل" : "تم التخطي";
    return status === "sent" ? "Accepted" : status === "failed" ? "Failed" : "Skipped";
  };
  const detailLabel = (row: EmailActivityRow) => {
    if (row.error_message) return row.error_message;
    if (row.status !== "skipped") return "—";
    return row.channel === "admin"
      ? "No SendPulse request was made. Check this brand's SendPulse connection and active notification recipients."
      : "No email was sent because this message was not eligible for delivery.";
  };
  const statusClass = (status: EmailActivityRow["status"]) =>
    status === "sent"
      ? "bg-emerald-500/10 text-emerald-700"
      : status === "failed"
        ? "bg-destructive/10 text-destructive"
        : "bg-secondary text-muted-foreground";

  return (
    <Card className="mb-6 p-5" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex gap-3">
          <Mail className="h-5 w-5 mt-0.5 text-primary" />
          <div>
            <h2 className="font-display text-xl">{labels.title}</h2>
            <p className="text-sm text-muted-foreground max-w-3xl mt-1">{labels.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={channel} onValueChange={(value) => setChannel(value as "all" | "customer" | "admin")}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{labels.all}</SelectItem>
              <SelectItem value="customer">{labels.customer}</SelectItem>
              <SelectItem value="admin">{labels.admin}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { void q.refetch(); }} disabled={q.isFetching}>
            <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
            <span className="sr-only">{labels.refresh}</span>
          </Button>
        </div>
      </div>

      {q.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {isAr ? "تعذر تحميل سجل البريد. تأكد من تشغيل ترحيل سجل المراسلات." : "Could not load email activity. Ensure the communications-log migration has been applied."}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-7 text-center text-sm text-muted-foreground">{labels.empty}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-start">{labels.event}</th>
                <th className="px-3 py-3 text-start">{labels.recipient}</th>
                <th className="px-3 py-3 text-start">{labels.channel}</th>
                <th className="px-3 py-3 text-start">{labels.provider}</th>
                <th className="px-3 py-3 text-start">{labels.result}</th>
                <th className="px-3 py-3 text-start">{labels.order}</th>
                <th className="px-3 py-3 text-start">{labels.details}</th>
                <th className="px-3 py-3 text-start">{labels.time}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="px-3 py-3 font-medium whitespace-nowrap">{eventLabel(row.event_type)}</td>
                  <td className="px-3 py-3" dir="ltr">{row.recipient || "—"}</td>
                  <td className="px-3 py-3">{row.channel === "customer" ? labels.customer : labels.admin}</td>
                  <td className="px-3 py-3">{providerLabel(row.provider)}</td>
                  <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></td>
                  <td className="px-3 py-3">{row.invoice_number ? `#${row.invoice_number}` : "—"}</td>
                  <td className="px-3 py-3 max-w-[320px] break-words text-muted-foreground">{detailLabel(row)}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">{new Date(row.created_at).toLocaleString(isAr ? "ar-BH" : "en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

type TrackingForm = {
  google_analytics_enabled: boolean;
  google_analytics_id: string;
  meta_pixel_enabled: boolean;
  meta_pixel_id: string;
  consent_required: boolean;
};

function AnalyticsTrackingCard({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const [saving, setSaving] = useState(false);
  const defaults: TrackingForm = { google_analytics_enabled: false, google_analytics_id: "", meta_pixel_enabled: false, meta_pixel_id: "", consent_required: true };
  const [form, setForm] = useState<TrackingForm>(defaults);
  const q = useQuery({
    queryKey: ["brand-tracking-settings", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("brand_tracking_settings").select("*").eq("brand_id", brandId).maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data as Partial<TrackingForm> | null;
    },
  });
  useEffect(() => {
    if (!q.data) return;
    setForm({
      google_analytics_enabled: Boolean(q.data.google_analytics_enabled),
      google_analytics_id: q.data.google_analytics_id ?? "",
      meta_pixel_enabled: Boolean(q.data.meta_pixel_enabled),
      meta_pixel_id: q.data.meta_pixel_id ?? "",
      consent_required: q.data.consent_required ?? true,
    });
  }, [q.data]);
  const save = async () => {
    const ga = form.google_analytics_id.trim().toUpperCase();
    const meta = form.meta_pixel_id.trim();
    if (form.google_analytics_enabled && !/^G-[A-Z0-9]+$/.test(ga)) return toast.error(isAr ? "أدخل معرّف GA4 صحيحاً مثل G-XXXXXXXXXX" : "Enter a valid GA4 ID such as G-XXXXXXXXXX");
    if (form.meta_pixel_enabled && !/^\d{5,30}$/.test(meta)) return toast.error(isAr ? "معرّف Meta Pixel يجب أن يحتوي أرقاماً فقط" : "Meta Pixel ID must contain digits only");
    setSaving(true);
    const { error } = await (supabase as any).from("brand_tracking_settings").upsert({
      brand_id: brandId,
      google_analytics_enabled: form.google_analytics_enabled,
      google_analytics_id: ga || null,
      meta_pixel_enabled: form.meta_pixel_enabled,
      meta_pixel_id: meta || null,
      consent_required: form.consent_required,
    }, { onConflict: "brand_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isAr ? "تم حفظ إعدادات التتبع" : "Tracking settings saved");
  };
  return <Card className="mb-6 p-5" dir={isAr ? "rtl" : "ltr"}>
    <div className="mb-4">
      <h2 className="font-display text-xl">{isAr ? "التحليلات والتتبع" : "Analytics & Tracking"}</h2>
      <p className="text-sm text-muted-foreground">{isAr ? "أدخل المعرّفات الرسمية فقط. لا يتم قبول أكواد أو نصوص برمجية مخصصة." : "Enter official IDs only. Custom scripts are never accepted."}</p>
    </div>
    <div className="grid gap-4">
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3"><div><Label>Google Analytics 4</Label><p className="text-xs text-muted-foreground">G-XXXXXXXXXX</p></div><Switch checked={form.google_analytics_enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, google_analytics_enabled: v }))} /></div>
        <Input className="mt-3" dir="ltr" maxLength={32} value={form.google_analytics_id} onChange={(e) => setForm((f) => ({ ...f, google_analytics_id: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") }))} placeholder="G-XXXXXXXXXX" />
      </div>
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3"><div><Label>Meta Pixel</Label><p className="text-xs text-muted-foreground">{isAr ? "معرّف رقمي فقط" : "Numeric pixel ID only"}</p></div><Switch checked={form.meta_pixel_enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, meta_pixel_enabled: v }))} /></div>
        <Input className="mt-3" dir="ltr" inputMode="numeric" maxLength={30} value={form.meta_pixel_id} onChange={(e) => setForm((f) => ({ ...f, meta_pixel_id: e.target.value.replace(/\D/g, "") }))} placeholder="123456789012345" />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg border p-4"><div><Label>{isAr ? "طلب موافقة الزائر" : "Require visitor consent"}</Label><p className="text-xs text-muted-foreground">{isAr ? "موصى به للخصوصية والامتثال." : "Recommended for privacy and compliance."}</p></div><Switch checked={form.consent_required} onCheckedChange={(v) => setForm((f) => ({ ...f, consent_required: v }))} /></div>
      <Button onClick={save} disabled={saving || q.isLoading}>{saving ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isAr ? "حفظ إعدادات التتبع" : "Save tracking settings")}</Button>
    </div>
  </Card>;
}

type NotificationRecipient = {
  id: string;
  brand_id: string;
  email: string;
  name: string | null;
  receive_order_placed: boolean;
  receive_benefit_payment_approved: boolean;
  receive_benefit_payment_rejected: boolean;
  receive_order_cancelled: boolean;
  receive_order_delivered: boolean;
  active: boolean;
};

const NOTIFICATION_EVENT_FIELDS = [
  { key: "receive_order_placed", en: "New order / awaiting payment validation", ar: "طلب جديد / بانتظار التحقق" },
  { key: "receive_benefit_payment_approved", en: "BenefitPay approved", ar: "تم اعتماد بينفت" },
  { key: "receive_benefit_payment_rejected", en: "BenefitPay rejected", ar: "تم رفض بينفت" },
  { key: "receive_order_cancelled", en: "Order cancelled", ar: "إلغاء طلب" },
  { key: "receive_order_delivered", en: "Order delivered", ar: "تم توصيل الطلب" },
] as const;

function AdminNotificationRecipientsCard({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const emptyForm = {
    name: "",
    email: "",
    receive_order_placed: true,
    receive_benefit_payment_approved: true,
    receive_benefit_payment_rejected: true,
    receive_order_cancelled: true,
    receive_order_delivered: true,
  };
  const [form, setForm] = useState(emptyForm);
  const q = useQuery({
    queryKey: ["brand-notification-recipients", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("brand_notification_recipients")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: true });
      if (error) {
        // The UI remains usable before the SQL migration has been applied.
        if (error.code === "42P01" || /brand_notification_recipients/i.test(error.message ?? "")) return [] as NotificationRecipient[];
        throw error;
      }
      return (data ?? []) as NotificationRecipient[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["brand-notification-recipients", brandId] });
  const saveNew = async () => {
    const email = form.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error(isAr ? "أدخل بريداً إلكترونياً صحيحاً" : "Enter a valid email address");
    setSaving(true);
    const { error } = await (supabase as any).from("brand_notification_recipients").insert({
      brand_id: brandId,
      name: form.name.trim() || null,
      email,
      ...Object.fromEntries(NOTIFICATION_EVENT_FIELDS.map(({ key }) => [key, form[key]])),
    });
    setSaving(false);
    if (error) return toast.error(error.code === "23505" ? (isAr ? "هذا البريد مضاف بالفعل لهذه العلامة" : "This email is already added for this brand") : error.message);
    setForm(emptyForm);
    setAdding(false);
    refresh();
    toast.success(isAr ? "تمت إضافة المستلم" : "Recipient added");
  };
  const update = async (id: string, changes: Partial<NotificationRecipient>) => {
    const { error } = await (supabase as any).from("brand_notification_recipients").update(changes).eq("id", id).eq("brand_id", brandId);
    if (error) return toast.error(error.message);
    refresh();
  };
  const remove = async (id: string) => {
    if (!confirm(isAr ? "حذف هذا المستلم؟" : "Remove this recipient?")) return;
    const { error } = await (supabase as any).from("brand_notification_recipients").delete().eq("id", id).eq("brand_id", brandId);
    if (error) return toast.error(error.message);
    refresh();
  };

  return <Card className="mb-6 p-5" dir={isAr ? "rtl" : "ltr"}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-xl">{isAr ? "مستلمو تنبيهات الإدارة" : "Admin notification recipients"}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {isAr
            ? "يتلقى مديرو العلامة النشطون جميع التنبيهات تلقائياً. أضف مستلمين اختياريين، مثل المالك أو مدير المخزون، لكل نوع من التنبيهات أدناه."
            : "Active Brand Admins receive every internal alert automatically. Add optional recipients, such as an owner or stock manager, for selected notifications below."}
        </p>
      </div>
      <Button variant="outline" onClick={() => setAdding((value) => !value)}><Plus className="me-2 h-4 w-4" />{isAr ? "إضافة مستلم" : "Add recipient"}</Button>
    </div>

    {adding && <div className="mt-5 rounded-lg border bg-muted/20 p-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>{isAr ? "الاسم (اختياري)" : "Name (optional)"}</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
        <div><Label>{isAr ? "البريد الإلكتروني" : "Email address"}</Label><Input type="email" dir="ltr" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {NOTIFICATION_EVENT_FIELDS.map(({ key, en, ar }) => <label key={key} className="flex cursor-pointer items-center gap-2 rounded border bg-background px-3 py-2 text-sm">
          <input type="checkbox" checked={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} />
          {isAr ? ar : en}
        </label>)}
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAdding(false)}>{isAr ? "إلغاء" : "Cancel"}</Button><Button onClick={saveNew} disabled={saving}>{saving ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isAr ? "حفظ المستلم" : "Save recipient")}</Button></div>
    </div>}

    <div className="mt-5 space-y-3">
      {q.isLoading ? <p className="text-sm text-muted-foreground">{isAr ? "جارٍ التحميل..." : "Loading..."}</p> : q.data?.length ? q.data.map((recipient) => <div key={recipient.id} className="rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-medium">{recipient.name || recipient.email}</p>{recipient.name && <p className="text-sm text-muted-foreground" dir="ltr">{recipient.email}</p>}</div>
          <div className="flex items-center gap-2"><label className="flex items-center gap-2 text-sm"><Switch checked={recipient.active} onCheckedChange={(active) => update(recipient.id, { active })} />{recipient.active ? (isAr ? "مفعّل" : "Active") : (isAr ? "معطّل" : "Off")}</label><Button variant="ghost" size="icon" aria-label={isAr ? "حذف المستلم" : "Remove recipient"} onClick={() => remove(recipient.id)}><Trash2 className="h-4 w-4" /></Button></div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {NOTIFICATION_EVENT_FIELDS.map(({ key, en, ar }) => <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={Boolean(recipient[key])} onChange={(event) => update(recipient.id, { [key]: event.target.checked } as Partial<NotificationRecipient>)} />{isAr ? ar : en}</label>)}
        </div>
      </div>) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{isAr ? "لا توجد مستلمات إضافية. سيستمر إرسال التنبيهات لمديري العلامة النشطين فقط." : "No additional recipients yet. Notifications will continue to go only to active Brand Admins."}</p>}
    </div>
  </Card>;
}

function MaskedRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center gap-1">
        <code className="flex-1 truncate bg-secondary/40 rounded px-2 py-1 text-xs">
          {value || "—"}
        </code>
      </div>
    </div>
  );
}

function IntegrationDialog({ brandId, row, onSaved }: { brandId: string; row: Row | null; onSaved: () => void }) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    provider: row?.provider ?? "aramex",
    provider_custom: row && !PROVIDER_PRESETS.find((p) => p.value === row.provider) ? row.provider : "",
    base_url: row?.base_url ?? "",
    api_key: "",
    webhook_secret: "",
    is_active: row?.is_active ?? true,
    notes: row?.notes ?? "",
  });
  useEffect(() => {
    setForm({
      provider: row?.provider ?? "aramex",
      provider_custom: row && !PROVIDER_PRESETS.find((provider) => provider.value === row.provider) ? row.provider : "",
      base_url: row?.base_url ?? "",
      api_key: "",
      webhook_secret: "",
      is_active: row?.is_active ?? true,
      notes: row?.notes ?? "",
    });
  }, [row]);
  const providerValue = useMemo(() => form.provider === "custom" ? form.provider_custom.trim() : form.provider, [form.provider, form.provider_custom]);
  const isZohoCustomerEmail = providerValue === "zoho_customer_email";
  const isSendPulseAdmin = providerValue === "sendpulse_admin";
  const fieldLabels = isZohoCustomerEmail
    ? {
        base: isAr ? "خادم SMTP" : "SMTP host",
        api: isAr ? "بريد الإرسال من زوهو" : "Zoho sending email",
        secret: isAr ? "كلمة مرور تطبيق زوهو" : "Zoho app password",
        basePlaceholder: "smtp.zoho.com:465",
        apiPlaceholder: "orders@yourbrand.com",
        secretPlaceholder: "Zoho app password",
        help: isAr
          ? "يُستخدم لإرسال رسائل الطلبات للعملاء. أنشئ كلمة مرور تطبيق من زوهو ولا تستخدم كلمة مرور بريدك العادية."
          : "Used for customer order emails. Create a Zoho app password; never use your normal mailbox password.",
      }
    : isSendPulseAdmin
      ? {
          base: isAr ? "بريد المُرسل المعتمد" : "Verified sender email",
          api: isAr ? "معرّف عميل SendPulse" : "SendPulse client ID",
          secret: isAr ? "سر عميل SendPulse" : "SendPulse client secret",
          basePlaceholder: "notifications@yourbrand.com",
          apiPlaceholder: "SendPulse client ID",
          secretPlaceholder: "SendPulse client secret",
          help: isAr
            ? "يُستخدم لإرسال تفاصيل الطلب الداخلية إلى مديري هذه العلامة التجارية فقط."
            : "Used only for internal notifications sent to this brand's active administrators.",
        }
      : {
          base: t("integrations.baseUrl"),
          api: t("integrations.apiKey"),
          secret: t("integrations.webhookSecret"),
          basePlaceholder: "https://api.provider.com",
          apiPlaceholder: "sk_live_…",
          secretPlaceholder: "whsec_…",
          help: null,
        };

  const save = async () => {
    if (!providerValue) return toast.error(isAr ? "اسم الخدمة مطلوب" : "Provider is required");
    setSaving(true);
    const { error } = await (supabase.rpc as any)("save_integration_credential", {
      p_id: row?.id ?? null,
      p_brand_id: brandId,
      p_provider: providerValue,
      p_base_url: form.base_url.trim(),
      p_api_key: form.api_key.trim(),
      p_webhook_secret: form.webhook_secret.trim(),
      p_is_active: form.is_active,
      p_notes: form.notes.trim(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("common.save"));
    onSaved();
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{row ? (isAr ? "تعديل التكامل" : "Edit integration") : t("integrations.new")}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>{t("integrations.provider")}</Label>
          <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROVIDER_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {form.provider === "custom" && (
            <Input className="mt-2" placeholder={isAr ? "اسم الخدمة" : "Custom provider name"}
              value={form.provider_custom} onChange={(e) => setForm({ ...form, provider_custom: e.target.value })} />
          )}
        </div>
        {fieldLabels.help && <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">{fieldLabels.help}</p>}
        <div>
          <Label>{fieldLabels.base}</Label>
          <Input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder={fieldLabels.basePlaceholder} />
        </div>
        <div>
          <Label>{fieldLabels.api}</Label>
          <Input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder={row?.has_api_key ? (isAr ? "اتركه فارغاً للاحتفاظ بالمفتاح الحالي" : "Leave blank to keep the current key") : fieldLabels.apiPlaceholder} />
        </div>
        <div>
          <Label>{fieldLabels.secret}</Label>
          <Input type="password" value={form.webhook_secret} onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })} placeholder={row?.has_webhook_secret ? (isAr ? "اتركه فارغاً للاحتفاظ بالسر الحالي" : "Leave blank to keep the current secret") : fieldLabels.secretPlaceholder} />
        </div>
        <div>
          <Label>{t("integrations.notes")}</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex items-center justify-between border border-border rounded-md p-3">
          <p className="text-sm font-medium">{t("integrations.active")}</p>
          <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving}>{t("common.save")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
