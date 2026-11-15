import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsServicesStore, useStorefront } from "@/lib/storefront-context";
import { subscribeToNewsletter } from "@/lib/storefront-leads.functions";
import { toast } from "sonner";
import { CheckCircle2, MessageCircle, Mail } from "lucide-react";

interface NewsletterFormProps {
  className?: string;
  source?: string;
}

export function NewsletterForm({ className = "", source = "footer" }: NewsletterFormProps) {
  const { brand, settings, lang, t } = useStorefront();
  const isAr = lang === "ar";
  const servicesStore = useIsServicesStore();

  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const title = isAr
    ? settings?.newsletter_title_ar ||
      (servicesStore
        ? "اشترك في نشرتنا لتصلك عروضنا والمواعيد المتاحة"
        : "اشترك في نشرتنا لتصلك أحدث المنتجات والعروض")
    : settings?.newsletter_title_en ||
      (servicesStore
        ? "Subscribe for our offers and open dates"
        : "Subscribe for exclusive updates & new arrivals");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanContact = contact.trim();
    if (!cleanContact) {
      toast.error(
        channel === "whatsapp"
          ? t("يرجى كتابة رقم الواتساب", "Please enter your WhatsApp number")
          : t("يرجى كتابة البريد الإلكتروني", "Please enter your email"),
      );
      return;
    }

    if (channel === "whatsapp") {
      const digitsOnly = cleanContact.replace(/\D/g, "");
      if (digitsOnly.length < 8) {
        toast.error(t("رقم الواتساب غير صالح", "Invalid WhatsApp number"));
        return;
      }
    } else {
      if (!cleanContact.includes("@") || !cleanContact.includes(".")) {
        toast.error(t("البريد الإلكتروني غير صالح", "Invalid email address"));
        return;
      }
    }

    setSubmitting(true);
    try {
      await subscribeToNewsletter({
        data: {
          brandId: brand.id,
          channel,
          contact: cleanContact,
          lang: lang === "ar" ? "ar" : "en",
          source,
        },
      });
      setSuccess(true);
      toast.success(
        t(
          "شكراً لاشتراكك! سنوافيك بجديدنا دائماً",
          "Thank you for subscribing! We will keep you updated.",
        ),
      );
    } catch (err: any) {
      const code = String(err?.message ?? "");
      toast.error(
        code.includes("RATE_LIMITED")
          ? t("محاولات كثيرة، يرجى المحاولة لاحقاً", "Too many attempts, please try again later")
          : t("حدث خطأ، يرجى المحاولة لاحقاً", "An error occurred, please try again"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div
        role="status"
        className={`flex items-center gap-2 rounded-lg border border-current/20 p-3 text-sm font-medium ${className}`}
        style={{ color: "var(--sf-footer-fg)" }}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>{t("تم تسجيل اشتراكك بنجاح!", "You have successfully subscribed!")}</span>
      </div>
    );
  }

  const otherChannel = channel === "whatsapp" ? "email" : "whatsapp";

  // One field (the footer review of 2026-11-15: a WhatsApp / email switch came first). Its colours
  // are the footer's own, the button the footer's turned round, so it stands out on any footer:
  // the store's primary colour sat a shade off Pura's near-black footer.
  return (
    <div
      className={`space-y-3 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:space-y-0 ${className}`}
    >
      <p
        className="text-sm leading-relaxed lg:max-w-md lg:text-lg lg:font-display"
        style={{ color: "var(--sf-footer-fg)" }}
      >
        {title}
      </p>
      <div className="space-y-1 lg:w-full lg:max-w-md lg:shrink-0">
        <form onSubmit={handleSubmit} className="flex w-full max-w-md items-stretch gap-2">
          <Input
            type={channel === "whatsapp" ? "tel" : "email"}
            inputMode={channel === "whatsapp" ? "tel" : "email"}
            autoComplete={channel === "whatsapp" ? "tel" : "email"}
            aria-label={
              channel === "whatsapp"
                ? t("رقم الواتساب", "WhatsApp number")
                : t("البريد الإلكتروني", "Email address")
            }
            placeholder={channel === "whatsapp" ? "+973 3XXXXXXX" : "name@example.com"}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            dir="ltr"
            required
            className="h-11 min-w-0 flex-1 rounded-lg border-current/20 bg-transparent text-sm text-inherit placeholder:text-current/45 focus-visible:ring-2 focus-visible:ring-current/60"
            style={{ color: "var(--sf-footer-fg)" }}
          />
          <Button
            type="submit"
            disabled={submitting}
            className="h-11 shrink-0 gap-1.5 rounded-lg px-4 text-sm font-semibold hover:opacity-90"
            style={{ backgroundColor: "var(--sf-footer-fg)", color: "var(--sf-footer-bg)" }}
          >
            {submitting ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/40 border-t-current" />
            ) : (
              <span>{t("اشتراك", "Join")}</span>
            )}
          </Button>
        </form>

        <Button
          type="button"
          variant="link"
          onClick={() => {
            setChannel(otherChannel);
            setContact("");
          }}
          className="h-auto min-h-11 gap-1.5 p-0 text-xs font-normal underline-offset-4 opacity-75 hover:opacity-100 sm:min-h-0"
          style={{ color: "var(--sf-footer-fg)" }}
        >
          {otherChannel === "email" ? (
            <Mail aria-hidden className="h-3.5 w-3.5" />
          ) : (
            <MessageCircle aria-hidden className="h-3.5 w-3.5" />
          )}
          {otherChannel === "email"
            ? t("أو اشترك بالبريد الإلكتروني", "Or use email")
            : t("أو اشترك بالواتساب", "Or use WhatsApp")}
        </Button>
      </div>
    </div>
  );
}
