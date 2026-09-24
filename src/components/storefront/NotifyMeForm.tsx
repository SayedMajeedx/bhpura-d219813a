import React, { useState } from "react";
import { useStorefront } from "@/lib/storefront-context";
import { createBackInStockRequest } from "@/lib/storefront-leads.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bell, CheckCircle2, MessageCircle, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface NotifyMeFormProps {
  brandId: string;
  productId: string;
  variantId?: string | null;
  className?: string;
}

export function NotifyMeForm({ brandId, productId, variantId, className }: NotifyMeFormProps) {
  const { lang } = useStorefront();
  const isAr = lang === "ar";

  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [contactValue, setContactValue] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return; // bot detection

    const val = contactValue.trim();
    if (!val) {
      toast.error(
        isAr
          ? channel === "whatsapp"
            ? "يرجى إدخال رقم الواتساب"
            : "يرجى إدخال البريد الإلكتروني"
          : channel === "whatsapp"
            ? "Please enter your WhatsApp number"
            : "Please enter your email",
      );
      return;
    }

    if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      toast.error(isAr ? "يرجى إدخال بريد إلكتروني صحيح" : "Please enter a valid email");
      return;
    }

    if (channel === "whatsapp" && val.replace(/\D/g, "").length < 7) {
      toast.error(
        isAr
          ? "يرجى إدخال رقم هاتف صحيح مع رمز الدولة"
          : "Please enter a valid phone number with country code",
      );
      return;
    }

    // Idempotency hint only (real rate limiting happens server-side).
    const submittedKey = `notify_req_${productId}_${variantId || "all"}`;
    let alreadySubmitted = false;
    try {
      alreadySubmitted = Boolean(sessionStorage.getItem(submittedKey));
    } catch {
      // sessionStorage can be unavailable (private mode) — continue.
    }
    if (alreadySubmitted) {
      setSubmitted(true);
      toast.success(
        isAr
          ? "طلبك مسجل مسبقاً، سنقوم بإشعارك فور توفره"
          : "You are already on the notification list",
      );
      return;
    }

    setSubmitting(true);
    try {
      await createBackInStockRequest({
        data: {
          brandId,
          productId,
          variantId: variantId || null,
          channel,
          contact: val,
          lang: lang === "ar" ? "ar" : "en",
        },
      });

      try {
        sessionStorage.setItem(submittedKey, Date.now().toString());
      } catch {
        // ignore storage failures
      }
      setSubmitted(true);
      toast.success(
        isAr
          ? "تم تسجيل طلبك بنجاح! سنقوم بإشعارك فور التوفر."
          : "Notification request saved! We'll notify you once available.",
      );
    } catch (err: any) {
      const code = String(err?.message ?? "");
      toast.error(
        code.includes("RATE_LIMITED")
          ? isAr
            ? "محاولات كثيرة، حاول لاحقاً"
            : "Too many attempts, please try again later"
          : isAr
            ? "حدث خطأ أثناء حفظ الطلب"
            : "Failed to register request",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`rounded-xl border border-primary/20 bg-primary/5 p-4 text-center ${className ?? ""}`}
      >
        <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="size-5" />
        </div>
        <h4 className="text-sm font-semibold text-foreground">
          {isAr ? "سَنُخْطِرُكَ فَوْرَ تَوَفُّرِهَا!" : "We will notify you!"}
        </h4>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {isAr
            ? `سنرسل لك رسالة على ${channel === "whatsapp" ? "واتساب" : "بريدك"} فور توفر هذه القطعة مجدداً.`
            : `We will send you a message via ${channel === "whatsapp" ? "WhatsApp" : "email"} as soon as this item is back in stock.`}
        </p>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={isAr ? "إشعار عند توفر المنتج" : "Back in stock notification"}
      className={`rounded-xl border border-border bg-card/60 p-4 shadow-2xs ${className ?? ""}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bell className="size-4" />
        </div>
        <div>
          <h4 className="text-xs sm:text-sm font-semibold text-foreground">
            {isAr ? "المنتج غير متوفر حالياً؟" : "Item currently out of stock?"}
          </h4>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "أدخل بياناتك لنُرسل لك إشعاراً فور إعادة توفيره."
              : "Enter your contact info to be notified the moment it's back."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Honeypot field for bot suppression */}
        <input
          type="text"
          name="company"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          style={{ display: "none" }}
          tabIndex={-1}
          autoComplete="off"
        />

        {/* Channel toggle */}
        <div className="flex gap-1.5 rounded-lg bg-muted p-1" role="radiogroup">
          <Button
            type="button"
            size="sm"
            variant={channel === "whatsapp" ? "default" : "ghost"}
            onClick={() => setChannel("whatsapp")}
            className="flex-1 h-8 text-xs gap-1.5 rounded-md"
          >
            <MessageCircle className="size-3.5" />
            <span>{isAr ? "واتساب" : "WhatsApp"}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={channel === "email" ? "default" : "ghost"}
            onClick={() => setChannel("email")}
            className="flex-1 h-8 text-xs gap-1.5 rounded-md"
          >
            <Mail className="size-3.5" />
            <span>{isAr ? "بريد إلكتروني" : "Email"}</span>
          </Button>
        </div>

        {/* Input */}
        <div>
          <Label htmlFor="notify-contact-input" className="sr-only">
            {channel === "whatsapp"
              ? isAr
                ? "رقم واتساب"
                : "WhatsApp Number"
              : isAr
                ? "البريد الإلكتروني"
                : "Email Address"}
          </Label>
          <Input
            id="notify-contact-input"
            type={channel === "whatsapp" ? "tel" : "email"}
            dir={channel === "whatsapp" ? "ltr" : undefined}
            placeholder={
              channel === "whatsapp"
                ? isAr
                  ? "مثال: 97339000000+"
                  : "e.g. +973 39000000"
                : isAr
                  ? "name@example.com"
                  : "name@example.com"
            }
            value={contactValue}
            onChange={(e) => setContactValue(e.target.value)}
            className="h-10 text-xs sm:text-sm bg-background"
            required
          />
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={submitting}
          className="w-full h-10 text-xs sm:text-sm font-semibold gap-1.5"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
          <span>{isAr ? "أشعرني عند التوفر" : "Notify Me When Available"}</span>
        </Button>
      </form>
    </div>
  );
}
