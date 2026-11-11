import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsServicesStore } from "@/lib/storefront-context";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { CheckoutForm, SetCheckoutForm, Storefront } from "@/features/checkout/types";
import type { useCheckoutFulfillment } from "@/features/checkout/hooks/use-checkout-fulfillment";
import type { useRegisteredAccountCheck } from "@/features/checkout/hooks/use-registered-account-check";

/** Name, phone and email (offering sign-in when they match an account), the gift note, order notes and the opt-ins. */
export function CustomerDetailsCard({
  checkRegisteredAccount,
  form,
  fulfillment,
  giftFields,
  saveToProfile,
  session,
  setForm,
  setSaveToProfile,
  setWhatsappOrderUpdates,
  t,
  whatsappOrderUpdates,
  whatsappUpdatesReady,
}: {
  checkRegisteredAccount: ReturnType<typeof useRegisteredAccountCheck>["checkRegisteredAccount"];
  form: CheckoutForm;
  /** The gift order's fields (`GiftOrderFields`), by the store's settings. */
  giftFields?: ReactNode;
  fulfillment: ReturnType<typeof useCheckoutFulfillment>["fulfillment"];
  saveToProfile: boolean;
  session: Storefront["session"];
  setForm: SetCheckoutForm;
  setSaveToProfile: Dispatch<SetStateAction<boolean>>;
  setWhatsappOrderUpdates: Dispatch<SetStateAction<boolean>>;
  t: Storefront["t"];
  whatsappOrderUpdates: boolean;
  /** The store can send WhatsApp order updates now: only then is the opt-in offered. */
  whatsappUpdatesReady: boolean;
}) {
  const servicesStore = useIsServicesStore();
  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-display text-xl">{t("بيانات العميل", "Customer details")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="checkout-name">
            {t("الاسم الكامل", "Full name")}
            <span className="text-destructive font-bold ms-1" aria-hidden="true">
              *
            </span>
          </Label>
          <Input
            id="checkout-name"
            name="name"
            required
            autoComplete="name"
            className="h-11"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="checkout-phone">
            {t("رقم الهاتف", "Phone")}
            {fulfillment !== "digital" && (
              <span className="text-destructive font-bold ms-1" aria-hidden="true">
                *
              </span>
            )}
          </Label>
          <Input
            id="checkout-phone"
            name="phone"
            required={fulfillment !== "digital"}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="h-11"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            onBlur={(e) => checkRegisteredAccount("phone", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="checkout-email">
            {t("البريد الإلكتروني (اختياري)", "Email (optional)")}
          </Label>
          <Input
            id="checkout-email"
            name="email"
            type="email"
            autoComplete="email"
            className="h-11"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            onBlur={(e) => checkRegisteredAccount("email", e.target.value)}
          />
        </div>
      </div>
      {/* The gift order's fields: not for a services store, where an order is a booking. */}
      {!servicesStore && giftFields}

      <div>
        <Label htmlFor="checkout-notes">{t("ملاحظات", "Notes")}</Label>
        <Textarea
          id="checkout-notes"
          name="notes"
          className="min-h-[90px] rounded-xl shadow-2xs resize-y"
          placeholder={t(
            "أي ملاحظات خاصة بالطلب أو التوصيل...",
            "Any special instructions for order or delivery...",
          )}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      {session?.user && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-strong bg-muted/20 p-3">
          <Checkbox
            className="mt-0.5"
            checked={saveToProfile}
            onCheckedChange={(checked) => setSaveToProfile(checked === true)}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              {t("حفظ الاسم ورقم الهاتف في ملفي", "Save name and phone to my profile")}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              {t(
                "لن تتغير بيانات ملفك ما لم تحدد هذا الخيار. تغيير البريد الإلكتروني يتطلب التحقق من الحساب.",
                "Your profile stays unchanged unless selected. Email changes require account verification.",
              )}
            </span>
          </span>
        </label>
      )}
      {whatsappUpdatesReady && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
          <Checkbox
            className="mt-0.5"
            checked={whatsappOrderUpdates}
            onCheckedChange={(checked) => setWhatsappOrderUpdates(checked === true)}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              {t(
                "أرسل لي تحديثات هذا الطلب عبر واتساب",
                "Send me updates for this order on WhatsApp",
              )}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              {t(
                "سنستخدم رقم الهاتف أعلاه لإرسال تحديثات الطلب فقط. يمكنك إيقاف الرسائل في أي وقت.",
                "We will use the phone number above for order updates only. You can opt out at any time.",
              )}
            </span>
          </span>
        </label>
      )}
    </Card>
  );
}
