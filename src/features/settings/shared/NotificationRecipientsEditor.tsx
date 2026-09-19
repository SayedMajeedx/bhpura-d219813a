import * as React from "react";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export type NotificationRecipient = {
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

export const NOTIFICATION_EVENT_FIELDS = [
  {
    key: "receive_order_placed",
    en: "New order / awaiting payment validation",
    ar: "طلب جديد / بانتظار التحقق",
  },
  { key: "receive_benefit_payment_approved", en: "BenefitPay approved", ar: "تم اعتماد بينفت" },
  { key: "receive_benefit_payment_rejected", en: "BenefitPay rejected", ar: "تم رفض بينفت" },
  { key: "receive_order_cancelled", en: "Order cancelled", ar: "إلغاء طلب" },
  { key: "receive_order_delivered", en: "Order delivered", ar: "تم توصيل الطلب" },
] as const;

export interface NotificationRecipientsEditorProps {
  brandId: string;
  isAr?: boolean;
  externalAdding?: boolean;
  onResetAdding?: () => void;
}

export function NotificationRecipientsEditor({
  brandId,
  isAr = true,
  externalAdding,
  onResetAdding,
}: NotificationRecipientsEditorProps) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (externalAdding) {
      setAdding(true);
      onResetAdding?.();
    }
  }, [externalAdding, onResetAdding]);

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
        if (error.code === "42P01" || /brand_notification_recipients/i.test(error.message ?? ""))
          return [] as NotificationRecipient[];
        throw error;
      }
      return (data ?? []) as NotificationRecipient[];
    },
  });

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["brand-notification-recipients", brandId] });

  const saveNew = async () => {
    const email = form.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email))
      return toast.error(isAr ? "أدخل بريداً إلكترونياً صحيحاً" : "Enter a valid email address");
    setSaving(true);
    const { error } = await (supabase as any).from("brand_notification_recipients").insert({
      brand_id: brandId,
      name: form.name.trim() || null,
      email,
      ...Object.fromEntries(NOTIFICATION_EVENT_FIELDS.map(({ key }) => [key, (form as any)[key]])),
    });
    setSaving(false);
    if (error)
      return toast.error(
        error.code === "23505"
          ? isAr
            ? "هذا البريد مضاف بالفعل لهذه العلامة"
            : "This email is already added for this brand"
          : error.message
      );
    setForm(emptyForm);
    setAdding(false);
    refresh();
    toast.success(isAr ? "تمت إضافة المستلم" : "Recipient added");
  };

  const update = async (id: string, changes: Partial<NotificationRecipient>) => {
    const { error } = await (supabase as any)
      .from("brand_notification_recipients")
      .update(changes)
      .eq("id", id)
      .eq("brand_id", brandId);
    if (error) return toast.error(error.message);
    refresh();
  };

  const remove = async (id: string) => {
    if (!confirm(isAr ? "حذف هذا المستلم؟" : "Remove this recipient?")) return;
    const { error } = await (supabase as any)
      .from("brand_notification_recipients")
      .delete()
      .eq("id", id)
      .eq("brand_id", brandId);
    if (error) return toast.error(error.message);
    refresh();
  };

  return (
    <Card
      className="overflow-hidden rounded-2xl border-border bg-card p-4 shadow-sm sm:p-6"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">
            {isAr ? "مستلمو تنبيهات الإدارة" : "Admin notification recipients"}
          </h2>
          <p className="mt-1 max-w-2xl text-xs sm:text-sm text-muted-foreground">
            {isAr
              ? "يتلقى مديرو العلامة النشطون جميع التنبيهات تلقائياً. أضف مستلمين اختياريين، مثل المالك أو مدير المخزون، لكل نوع من التنبيهات أدناه."
              : "Active Brand Admins receive every internal alert automatically. Add optional recipients, such as an owner or stock manager, for selected notifications below."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAdding((value) => !value)}>
          <Plus className="me-2 h-4 w-4" />
          {isAr ? "إضافة مستلم" : "Add recipient"}
        </Button>
      </div>

      {(q.data ?? []).length <= 1 && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <div className="space-y-0.5">
            <p className="font-bold">
              {isAr
                ? "تنبيه استمرارية الأعمال: يوجد مستلم إداري واحد فقط للإشعارات"
                : "Operational Resilience Notice: Only 1 admin alert recipient"}
            </p>
            <p className="opacity-90 leading-relaxed">
              {isAr
                ? "يوصى بشدة بإضافة بريد إلكتروني احتياطي ثانٍ على الأقل لتفادي فقدان إشعارات الطلبات الجديدة وتحديثات الدفع في حال امتلاء البريد أو حدوث مشاكل تسليم."
                : "It is strongly recommended to register at least one backup recipient to avoid missing new order alerts and payment updates if delivery issues occur."}
            </p>
          </div>
        </div>
      )}

      {adding && (
        <div className="mt-5 rounded-lg border bg-muted/20 p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{isAr ? "الاسم (اختياري)" : "Name (optional)"}</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div>
              <Label>{isAr ? "البريد الإلكتروني" : "Email address"}</Label>
              <Input
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {NOTIFICATION_EVENT_FIELDS.map(({ key, en, ar }) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 rounded border bg-background px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={(form as any)[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.checked })}
                />
                {isAr ? ar : en}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdding(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={saveNew} disabled={saving}>
              {saving
                ? isAr
                  ? "جارٍ الحفظ..."
                  : "Saving..."
                : isAr
                  ? "حفظ المستلم"
                  : "Save recipient"}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">{isAr ? "جارٍ التحميل..." : "Loading..."}</p>
        ) : q.data?.length ? (
          q.data.map((recipient) => (
            <div
              key={recipient.id}
              className="rounded-lg border p-4 bg-card hover:shadow-sm transition-shadow"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{recipient.name || recipient.email}</p>
                  {recipient.name && (
                    <p className="text-sm text-muted-foreground" dir="ltr">
                      {recipient.email}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={recipient.active}
                      onCheckedChange={(active) => update(recipient.id, { active })}
                    />
                    {recipient.active ? (isAr ? "مفعّل" : "Active") : isAr ? "معطّل" : "Off"}
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={isAr ? "حذف المستلم" : "Remove recipient"}
                    onClick={() => remove(recipient.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {NOTIFICATION_EVENT_FIELDS.map(({ key, en, ar }) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean((recipient as any)[key])}
                      onChange={(event) =>
                        update(recipient.id, {
                          [key]: event.target.checked,
                        } as Partial<NotificationRecipient>)
                      }
                    />
                    {isAr ? ar : en}
                  </label>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {isAr
              ? "لا توجد مستلمات إضافية. سيستمر إرسال التنبيهات لمديري العلامة النشطين فقط."
              : "No additional recipients yet. Notifications will continue to go only to active Brand Admins."}
          </p>
        )}
      </div>
    </Card>
  );
}
