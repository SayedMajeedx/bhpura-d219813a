import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStorefront } from "@/lib/storefront-context";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { customersKeys, updateCustomer } from "@/lib/data/customers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { PhoneInput } from "@/components/phone-input";
import type { Customer } from "@/features/storefront-account/lib/account-shared";

export function ProfileSection({
  isAr,
  customer,
  loadingCustomer,
}: {
  isAr: boolean;
  customer: Customer | null | undefined;
  loadingCustomer: boolean;
}) {
  const { session, t } = useStorefront();
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name ?? "",
        phone: customer.phone ?? "",
        email: customer.email ?? session?.user?.email ?? "",
      });
    } else if (session) {
      setForm((f) => ({ ...f, email: session.user?.email ?? "" }));
    }
  }, [customer, session]);

  if (loadingCustomer) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const save = async () => {
    if (!customer) {
      toast.error(
        t(
          "لا يوجد ملف عميل مرتبط بعد. أنشئ أول طلب لإنشائه.",
          "No customer profile linked yet. Place your first order to create one.",
        ),
      );
      return;
    }
    const name = form.name.trim();
    if (!name) return toast.error(t("الاسم مطلوب", "Name is required"));
    setSaving(true);
    try {
      await updateCustomer(customer.brand_id, customer.id, {
        name,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      });
    } catch (error) {
      return toast.error(getFriendlyErrorMessage(error));
    } finally {
      setSaving(false);
    }
    toast.success(t("تم حفظ التغييرات بنجاح", "Your changes have been saved successfully"));
    qc.invalidateQueries({ queryKey: customersKeys.own(customer.brand_id) });
  };

  return (
    <Card
      dir={isAr ? "rtl" : "ltr"}
      className={`p-5 sm:p-6 space-y-5 max-w-2xl border border-border-strong rounded-xl bg-card ${isAr ? "text-end" : "text-start"}`}
    >
      <div className="border-b pb-3 mb-2">
        <h3 className="font-semibold text-base" style={{ color: "var(--sf-heading)" }}>
          {t("الملف الشخصي", "Profile details")}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t(
            "يرجى تحديث بياناتك الشخصية للتأكد من وصول الشحنات والإشعارات في الوقت المناسب.",
            "Please keep your profile details updated to ensure smooth communication and deliveries.",
          )}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label
            htmlFor="account-name"
            className={`text-xs font-bold ${isAr ? "block text-end" : "block text-start"}`}
          >
            {t("الاسم الكامل", "Full name")}
          </Label>
          <Input
            id="account-name"
            name="name"
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            dir={isAr ? "rtl" : "ltr"}
            className={`h-11 text-sm ${isAr ? "text-end" : "text-start"}`}
            placeholder={t("اكتب اسمك الكامل", "Your full name")}
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="account-phone"
            className={`text-xs font-bold ${isAr ? "block text-end" : "block text-start"}`}
          >
            {t("رقم الهاتف", "Phone number")}
          </Label>
          <PhoneInput
            id="account-phone"
            name="phone"
            value={form.phone}
            onChange={(phone) => setForm({ ...form, phone })}
            placeholder="12345678"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="account-email"
            className={`text-xs font-bold ${isAr ? "block text-end" : "block text-start"}`}
          >
            {t("البريد الإلكتروني", "Email")}
          </Label>
          <Input
            id="account-email"
            name="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            type="email"
            dir="ltr"
            className="text-start h-11 text-sm"
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div className="pt-2 flex justify-start">
        <Button
          onClick={save}
          disabled={saving}
          className="h-11 text-xs font-semibold px-5 shadow-xs"
        >
          {saving && <Loader2 className="h-4 w-4 me-1 animate-spin" />}
          {t("حفظ التغييرات", "Save changes")}
        </Button>
      </div>
    </Card>
  );
}
