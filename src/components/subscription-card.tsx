import { useEffect, useState } from "react";
import type { Brand } from "@/lib/brand-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  getSubscriptionReceiptUploadUrl,
  setSubscriptionRenewalDecision,
  submitSubscriptionReceipt,
} from "@/lib/saas-subscription.functions";
import { BrandSubscriptionHub } from "@/components/subscription/BrandSubscriptionHub";
import {
  AlertCircle,
  CalendarRange,
  Check,
  Clock,
  Copy,
  CreditCard,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";

type SubscriptionCardProps = { brand: Brand };
type PaymentSettings = {
  price: number;
  qrUrl: string | null;
  merchantName: string;
  iban: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function SubscriptionCard({ brand }: SubscriptionCardProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const isPermanent = brand.slug.toLowerCase() === "pura" || brand.plan_type === "lifetime";
  const isTrial = brand.plan_type === "trial";
  const expiresAt = isTrial ? brand.trial_ends_at : brand.subscription_expires_at;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS))
    : 0;
  const expired = !isPermanent && (!expiresAt || new Date(expiresAt).getTime() <= Date.now());
  const pending = brand.subscription_status === "pending_verification";
  const renewalWindowOpen = !isPermanent && !isTrial && (expired || daysLeft <= 30);
  const [uploading, setUploading] = useState(false);
  const [savingDecision, setSavingDecision] = useState(false);
  const [renewalIntent, setRenewalIntent] = useState<"renew" | "cancel" | null>(
    brand.renewal_intent ?? null,
  );
  const [settings, setSettings] = useState<PaymentSettings>({
    price: 49,
    qrUrl: null,
    merchantName: "BOUTQ-OFFICIAL",
    iban: "BH12KHCB0000001234567890",
  });

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any)
        .from("system_settings")
        .select(
          "base_price_bhd, discount_price_bhd, benefit_pay_qr_url, merchant_account_name, subscription_iban",
        )
        .eq("id", 1)
        .maybeSingle();
      if (!data) return;
      setSettings({
        price: Number(data.discount_price_bhd || data.base_price_bhd || 49),
        qrUrl: data.benefit_pay_qr_url || null,
        merchantName: data.merchant_account_name || "BOUTQ-OFFICIAL",
        iban: data.subscription_iban || "BH12KHCB0000001234567890",
      });
    })();
  }, []);

  const copyIban = async () => {
    await navigator.clipboard.writeText(settings.iban.replace(/\s+/g, ""));
    toast.success(isAr ? "تم نسخ رقم IBAN" : "IBAN copied");
  };

  const saveRenewalDecision = async (decision: "renew" | "cancel") => {
    setSavingDecision(true);
    const toastId = toast.loading(isAr ? "جاري حفظ قرار التجديد..." : "Saving renewal decision...");
    try {
      await setSubscriptionRenewalDecision({ data: { brandId: brand.id, decision } });
      setRenewalIntent(decision);
      toast.success(
        decision === "renew"
          ? isAr
            ? "تم تسجيل رغبتك بالتجديد وإبلاغ إدارة المنصة."
            : "Your renewal request was recorded and shared with the platform administrator."
          : isAr
            ? "تم تسجيل قرار عدم التجديد. سيبقى المتجر فعالاً حتى نهاية الاشتراك."
            : "Non-renewal recorded. Your store remains active until the subscription ends.",
        { id: toastId },
      );
    } catch (error) {
      console.error(error);
      toast.error(isAr ? "تعذر حفظ القرار، حاول ثانية." : "Failed to save decision.", {
        id: toastId,
      });
    } finally {
      setSavingDecision(false);
    }
  };

  const handleUploadReceipt = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error(isAr ? "يرجى رفع صورة الإيصال فقط." : "Please upload an image receipt only.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error(isAr ? "حجم الصورة يجب ألا يتجاوز 10 ميغابايت." : "Image must not exceed 10MB.");
      return;
    }

    setUploading(true);
    const toastId = toast.loading(isAr ? "جاري رفع الإيصال وتأمينه..." : "Uploading receipt securely...");

    try {
      const upload = await getSubscriptionReceiptUploadUrl({
        data: {
          brandId: brand.id,
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        },
      });

      const putRes = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!putRes.ok) {
        throw new Error("Failed to upload image directly to storage");
      }

      await submitSubscriptionReceipt({
        data: {
          brandId: brand.id,
          objectKey: upload.objectKey,
        },
      });

      toast.success(
        isAr
          ? "تم رفع الإيصال بنجاح وإرساله إلى الإدارة للمراجعة وتأكيد التجديد."
          : "Receipt uploaded and submitted for super-admin verification.",
        { id: toastId },
      );
    } catch (error) {
      console.error(error);
      toast.error(isAr ? "فشل رفع الإيصال، حاول مجدداً." : "Failed to upload receipt.", {
        id: toastId,
      });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Main SaaS Entitlements, Live Quotas & Versioned Subscriptions Hub */}
      <BrandSubscriptionHub brandId={brand.id} brandSlug={brand.slug} />

      {/* 2. BenefitPay Renewal & Receipt Upload Card */}
      {renewalWindowOpen && (
        <Card className="overflow-hidden border-border/80 shadow-md rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <CreditCard className="h-5 w-5 text-primary" />
              <span>{isAr ? "دفع وتجديد الاشتراك عبر BenefitPay" : "BenefitPay Manual Renewal & Transfer"}</span>
            </CardTitle>
            <CardDescription className="text-xs">
              {isAr
                ? `قيمة التجديد ${settings.price.toFixed(3)} د.ب. ادفع عبر بنفت ثم ارفع الإيصال للمراجعة.`
                : `Renewal is BHD ${settings.price.toFixed(3)}. Pay via BenefitPay, then upload the receipt for verification.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-muted-foreground">
                {isAr ? "القرار بالنسبة للتجديد:" : "Renewal Decision:"}
              </p>
              <Button
                type="button"
                variant={renewalIntent === "renew" ? "default" : "outline"}
                size="sm"
                disabled={savingDecision}
                onClick={() => saveRenewalDecision("renew")}
              >
                {isAr ? "نعم، أريد التجديد" : "Yes, Renew"}
              </Button>
              <Button
                type="button"
                variant={renewalIntent === "cancel" ? "destructive" : "outline"}
                size="sm"
                disabled={savingDecision}
                onClick={() => saveRenewalDecision("cancel")}
              >
                {isAr ? "لا، لن أجدد" : "No, Do not Renew"}
              </Button>
            </div>

            {renewalIntent === "renew" && (
              <div className="grid gap-5 md:grid-cols-[220px_1fr] pt-2 border-t border-border/50">
                <div className="rounded-xl border border-border/60 bg-background p-4 text-center">
                  {settings.qrUrl ? (
                    <img
                      src={settings.qrUrl}
                      alt="BenefitPay QR"
                      className="mx-auto aspect-square w-40 object-contain rounded-lg"
                    />
                  ) : (
                    <div className="mx-auto grid aspect-square w-40 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <QrCode className="h-12 w-12" />
                    </div>
                  )}
                  <p className="mt-2 text-xs font-bold">{settings.merchantName}</p>
                </div>
                <div className="space-y-4">
                  <div className="rounded-xl border border-border/60 p-3.5 bg-muted/20">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">IBAN</p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <code dir="ltr" className="break-all text-xs font-bold font-mono">
                        {settings.iban}
                      </code>
                      <Button type="button" variant="outline" size="sm" onClick={() => void copyIban()} className="h-8 text-xs font-bold">
                        <Copy className="me-1 h-3.5 w-3.5" /> {isAr ? "نسخ" : "Copy"}
                      </Button>
                    </div>
                  </div>
                  <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 text-center hover:bg-primary/10 transition-colors">
                    {uploading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <UploadCloud className="h-6 w-6 text-primary" />
                    )}
                    <span className="mt-2 text-xs font-semibold">
                      {uploading
                        ? isAr
                          ? "جاري الرفع..."
                          : "Uploading..."
                        : pending
                          ? isAr
                            ? "استبدال إيصال الدفع"
                            : "Replace payment receipt"
                          : isAr
                            ? "رفع إيصال دفع التجديد"
                            : "Upload renewal receipt"}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploading}
                      onChange={handleUploadReceipt}
                    />
                  </label>
                  {pending && (
                    <p className="rounded-lg border border-amber-300/50 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                      {isAr
                        ? "تم استلام الإيصال. سيتجدد تاريخ الاشتراك فور اعتماد السوبر أدمن للطلب."
                        : "Receipt received. Subscription renewals apply once approved by the administrator."}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
