import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { AdvancedOnly } from "@/features/settings/FieldVisibility";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Sparkles, Truck } from "lucide-react";

export function TemplatesGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;
  const brand = form.brand;

  const brandDisplayName =
    (isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug || "Boutique";

  return (
    <div className="space-y-6">
      {/* 1. Order Confirmation Email Greetings */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Mail className="size-4 text-primary" />
            <span>
              {isAr ? "رسائل تأكيد الطلب بالبريد الإلكتروني" : "Order Confirmation Email"}
            </span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "تحكم في اسم المرسل والرسائل الترحيبية التي تصل إلى العميل فور إتمام الطلب."
              : "Customize the sender display name and greeting message sent automatically to buyers."}
          </p>
        </div>

        {/* Sender Name */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            {isAr ? "اسم مرسل رسائل البريد الإلكتروني" : "Email Sender Display Name"}
          </Label>
          <Input
            className="text-xs h-9"
            value={bs.email_sender_name ?? ""}
            placeholder={brandDisplayName}
            onChange={(e) => setBs({ email_sender_name: e.target.value || null })}
          />
        </div>

        {/* Email Greetings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div dir="rtl">
            <Label className="text-xs font-medium">
              {isAr ? "مقدمة بريد تأكيد الطلب (عربي)" : "Email Greeting (Arabic)"}
            </Label>
            <Textarea
              className="mt-1.5 text-end text-xs min-h-[64px]"
              value={bs.email_intro_ar ?? ""}
              placeholder={
                isAr
                  ? "شكراً لتسوقكم معنا! تم استلام طلبكم وجاري تجهيزه بكل حب وعناية."
                  : "Greeting in Arabic..."
              }
              onChange={(e) => setBs({ email_intro_ar: e.target.value || null })}
            />
          </div>

          <div dir="ltr">
            <Label className="text-xs font-medium">
              {isAr ? "مقدمة بريد تأكيد الطلب (إنجليزي)" : "Email Greeting (English)"}
            </Label>
            <Textarea
              className="mt-1.5 text-start text-xs min-h-[64px]"
              value={bs.email_intro_en ?? ""}
              placeholder="Thank you for your order! We have received your order and are preparing it with love and care."
              onChange={(e) => setBs({ email_intro_en: e.target.value || null })}
            />
          </div>
        </div>

        {/* Advanced Email Footers */}
        <AdvancedOnly
          fieldKey="email_footer_ar"
          reason={
            isAr
              ? "تخصيص الخاتمة والتوقيع الرسمي لرسائل البريد"
              : "Customize email sign-off and footer"
          }
        >
          <div className="rounded-xl border border-border p-4 bg-muted/5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h4 className="text-xs font-semibold">
                {isAr ? "خاتمة وتذييل رسائل البريد الإلكتروني" : "Email Footer & Sign-Off"}
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div dir="rtl">
                <Label className="text-xs font-medium">
                  {isAr ? "خاتمة البريد (عربي)" : "Email Footer (Arabic)"}
                </Label>
                <Textarea
                  className="mt-1.5 text-end text-xs min-h-[60px]"
                  value={bs.email_footer_ar ?? ""}
                  placeholder={isAr ? "مع أطيب التحيات، فريق خدمة العملاء" : "Sign-off..."}
                  onChange={(e) => setBs({ email_footer_ar: e.target.value || null })}
                />
              </div>

              <div dir="ltr">
                <Label className="text-xs font-medium">
                  {isAr ? "خاتمة البريد (إنجليزي)" : "Email Footer (English)"}
                </Label>
                <Textarea
                  className="mt-1.5 text-start text-xs min-h-[60px]"
                  value={bs.email_footer_en ?? ""}
                  placeholder="Warm regards, Customer Care Team"
                  onChange={(e) => setBs({ email_footer_en: e.target.value || null })}
                />
              </div>
            </div>
          </div>
        </AdvancedOnly>
      </div>

      {/* 2. Courier Out For Delivery Notification */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Truck className="size-4 text-primary" />
            <span>
              {isAr ? "رسائل السائق: الطلب خرج للتوصيل" : "Courier Out for Delivery Dispatch"}
            </span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "نص رسالة SMS أو الواتساب التي يرسلها السائق للعميل عند خروج الشحنة في طريقها للتوصيل."
              : "WhatsApp / SMS template sent to customer when the courier begins transit."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div dir="rtl">
            <Label className="text-xs font-medium">
              {isAr ? "رسالة التوصيل (عربي)" : "Delivery Dispatch Message (Arabic)"}
            </Label>
            <Textarea
              className="mt-1.5 text-end text-xs min-h-[64px]"
              value={bs.courier_out_for_delivery_message_ar ?? ""}
              placeholder={
                isAr
                  ? "طلبكم في الطريق إليكم الآن مع السائق، يرجى التكرم بالرد على الاتصال."
                  : "Message in Arabic..."
              }
              onChange={(e) =>
                setBs({ courier_out_for_delivery_message_ar: e.target.value || null })
              }
            />
          </div>

          <div dir="ltr">
            <Label className="text-xs font-medium">
              {isAr ? "رسالة التوصيل (إنجليزي)" : "Delivery Dispatch Message (English)"}
            </Label>
            <Textarea
              className="mt-1.5 text-start text-xs min-h-[64px]"
              value={bs.courier_out_for_delivery_message_en ?? ""}
              placeholder="Your order is currently out for delivery with our driver. Please be available to receive."
              onChange={(e) =>
                setBs({ courier_out_for_delivery_message_en: e.target.value || null })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
