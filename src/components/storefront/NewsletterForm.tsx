import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStorefront } from "@/lib/storefront-context";
import { subscribeToNewsletter } from "@/lib/storefront-leads.functions";
import { toast } from "sonner";
import { Send, CheckCircle2, MessageCircle, Mail } from "lucide-react";

interface NewsletterFormProps {
  className?: string;
  source?: string;
}

export function NewsletterForm({ className = "", source = "footer" }: NewsletterFormProps) {
  const { brand, settings, lang, t } = useStorefront();
  const isAr = lang === "ar";

  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const title = isAr
    ? settings?.newsletter_title_ar || "اشترك في نشرتنا لتصلك أحدث المنتجات والعروض"
    : settings?.newsletter_title_en || "Subscribe for exclusive updates & new arrivals";

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
        className={`flex items-center gap-2 text-xs text-primary font-medium p-3 rounded-lg bg-primary/10 border border-primary/20 ${className}`}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
        <span>{t("تم تسجيل اشتراكك بنجاح!", "You have successfully subscribed!")}</span>
      </div>
    );
  }

  return (
    <div className={`space-y-2.5 ${className}`}>
      <p className="text-xs leading-relaxed opacity-85" style={{ color: "var(--sf-footer-fg)" }}>
        {title}
      </p>

      {/* Channel Selector Pills */}
      <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-black/10 border border-white/10 w-fit">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setChannel("whatsapp")}
          className={`h-auto flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all hover:bg-white/10 ${
            channel === "whatsapp"
              ? "bg-white/20 text-white shadow-xs font-semibold"
              : "opacity-60 hover:opacity-100"
          }`}
          style={{ color: "var(--sf-footer-fg)" }}
        >
          <MessageCircle className="h-3 w-3" />
          <span>{t("واتساب", "WhatsApp")}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setChannel("email")}
          className={`h-auto flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all hover:bg-white/10 ${
            channel === "email"
              ? "bg-white/20 text-white shadow-xs font-semibold"
              : "opacity-60 hover:opacity-100"
          }`}
          style={{ color: "var(--sf-footer-fg)" }}
        >
          <Mail className="h-3 w-3" />
          <span>{t("بريد إلكتروني", "Email")}</span>
        </Button>
      </div>

      {/* Input & Submit Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-1.5 max-w-sm">
        <Input
          type={channel === "whatsapp" ? "tel" : "email"}
          placeholder={
            channel === "whatsapp"
              ? t("+973 3XXXXXXX", "+973 3XXXXXXX")
              : t("name@example.com", "name@example.com")
          }
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          dir="ltr"
          required
          className="h-9 text-xs bg-white/10 border-white/15 text-white placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
        />
        <Button
          type="submit"
          disabled={submitting}
          size="sm"
          className="h-9 px-3 gap-1 shrink-0 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium"
        >
          {submitting ? (
            <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              <span>{t("اشتراك", "Join")}</span>
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
