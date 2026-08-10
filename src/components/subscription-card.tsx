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
    } catch {
      toast.error(
        isAr ? "تعذر حفظ القرار. حاول مرة أخرى." : "Unable to save the decision. Try again.",
        { id: toastId },
      );
    } finally {
      setSavingDecision(false);
    }
  };

  const handleUploadReceipt = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error(isAr ? "ارفع صورة JPEG أو PNG أو WEBP" : "Upload a JPEG, PNG, or WEBP image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(isAr ? "الحد الأقصى 5MB" : "Maximum file size is 5MB");
      return;
    }
    setUploading(true);
    const toastId = toast.loading(
      isAr ? "جاري رفع إيصال التجديد..." : "Uploading renewal receipt...",
    );
    try {
      const { objectKey, uploadUrl } = await getSubscriptionReceiptUploadUrl({
        data: { brandId: brand.id, contentType: file.type as any, size: file.size },
      });
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("RECEIPT_UPLOAD_FAILED");
      await submitSubscriptionReceipt({ data: { brandId: brand.id, objectKey } });
      toast.success(
        isAr
          ? "تم إرسال الإيصال. التجديد ينتظر موافقة السوبر أدمن."
          : "Receipt submitted. Renewal is pending super-admin approval.",
        { id: toastId },
      );
      window.setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "RECEIPT_SUBMISSION_FAILED", {
        id: toastId,
      });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const statusBadge = isPermanent ? (
    <Badge className="gap-1 bg-emerald-600 text-white">
      <ShieldCheck className="h-3.5 w-3.5" />
      {isAr ? "مشروع دائم" : "Permanent project"}
    </Badge>
  ) : pending ? (
    <Badge className="gap-1 bg-amber-500 text-white">
      <Clock className="h-3.5 w-3.5" />
      {isAr ? "بانتظار اعتماد الدفع" : "Payment approval pending"}
    </Badge>
  ) : expired ? (
    <Badge variant="destructive" className="gap-1">
      <AlertCircle className="h-3.5 w-3.5" />
      {isAr ? "منتهي" : "Expired"}
    </Badge>
  ) : (
    <Badge className="gap-1 bg-emerald-600 text-white">
      <Check className="h-3.5 w-3.5" />
      {isTrial ? (isAr ? "تجريبي" : "Trial") : isAr ? "سنوي نشط" : "Active annual"}
    </Badge>
  );

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/60 shadow-lg">
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <CardTitle>
                {isAr ? "اشتراك المنصة السحابي" : "Cloud platform subscription"}
              </CardTitle>
              <CardDescription>
                {isPermanent
                  ? isAr
                    ? "Pura مشروع المالك ولا يخضع للتجديد."
                    : "Pura is the owner project and does not expire."
                  : isAr
                    ? "الاشتراك سنوي من تاريخ التفعيل، والتجديد يحتاج اعتماد السوبر أدمن."
                    : "Annual from activation; renewals require super-admin approval."}
              </CardDescription>
            </div>
            {statusBadge}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 rounded-xl border border-border/50 bg-muted/20 p-5 md:grid-cols-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground">
                {isAr ? "نوع الترخيص" : "License"}
              </p>
              <p className="mt-1 text-sm font-semibold">
                {isPermanent
                  ? isAr
                    ? "دائم"
                    : "Permanent"
                  : isTrial
                    ? isAr
                      ? "تجربة 3 أيام"
                      : "3-day trial"
                    : isAr
                      ? "اشتراك سنوي"
                      : "Annual subscription"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground">
                {isAr ? "المدة المتبقية" : "Time remaining"}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                <CalendarRange className="h-4 w-4 text-muted-foreground" />
                {isPermanent
                  ? isAr
                    ? "لا ينتهي"
                    : "No expiry"
                  : expired
                    ? isAr
                      ? "انتهى الاشتراك"
                      : "Subscription expired"
                    : isAr
                      ? `${daysLeft} يوم متبقٍ`
                      : `${daysLeft} days left`}
              </p>
              {expiresAt && !isPermanent && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {isAr ? "ينتهي في" : "Expires"}:{" "}
                  {new Date(expiresAt).toLocaleDateString(isAr ? "ar-BH-u-nu-latn" : "en-GB")}
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground">
                {isAr ? "نطاق المتجر" : "Store domain"}
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-primary">
                {brand.slug}.boutq.store
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {renewalWindowOpen && (
        <Card className="overflow-hidden border-amber-300/70 bg-amber-50/40 shadow-lg dark:bg-amber-950/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-amber-600" />
              {expired
                ? isAr
                  ? "انتهى اشتراكك السنوي"
                  : "Your annual subscription has expired"
                : isAr
                  ? `باقي ${daysLeft} ${daysLeft === 1 ? "يوم" : "يوماً"} على انتهاء الاشتراك`
                  : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} until subscription expiry`}
            </CardTitle>
            <CardDescription>
              {isAr
                ? "اختر قرارك قبل انتهاء المدة. سيظهر القرار مباشرةً للسوبر أدمن."
                : "Choose before the term ends. Your decision is immediately visible to the super admin."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!renewalIntent ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  className="h-12 bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={savingDecision}
                  onClick={() => void saveRenewalDecision("renew")}
                >
                  <RefreshCw className="me-2 h-4 w-4" />
                  {isAr ? "نعم، أريد التجديد" : "Yes, I want to renew"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 border-rose-300 text-rose-700 hover:bg-rose-50"
                  disabled={savingDecision}
                  onClick={() => void saveRenewalDecision("cancel")}
                >
                  <XCircle className="me-2 h-4 w-4" />
                  {isAr ? "لا، لن أجدد" : "No, do not renew"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-xl border bg-background/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">
                    {renewalIntent === "renew"
                      ? isAr
                        ? "تم تسجيل رغبتك بالتجديد"
                        : "Renewal requested"
                      : isAr
                        ? "تم تسجيل قرار عدم التجديد"
                        : "Non-renewal recorded"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {renewalIntent === "renew"
                      ? isAr
                        ? "أكمل الدفع أدناه وارفع الإيصال للمراجعة."
                        : "Complete payment below and upload the receipt for review."
                      : isAr
                        ? "سيظل المتجر فعالاً حتى تاريخ الانتهاء، ويمكنك تغيير القرار قبل ذلك."
                        : "The store stays active until expiry; you may change this decision before then."}
                  </p>
                </div>
                {renewalIntent === "cancel" && (
                  <Button
                    type="button"
                    disabled={savingDecision}
                    onClick={() => void saveRenewalDecision("renew")}
                  >
                    {isAr ? "غيّرت رأيي، أريد التجديد" : "I changed my mind—renew"}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {renewalWindowOpen && renewalIntent === "renew" && (
        <Card className="overflow-hidden border-border/60 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-primary" />
              {isAr ? "دفع وتجديد الاشتراك السنوي" : "Annual subscription payment"}
            </CardTitle>
            <CardDescription>
              {isAr
                ? `قيمة التجديد ${settings.price.toFixed(3)} د.ب. ادفع عبر بنفت ثم ارفع الإيصال للمراجعة.`
                : `Renewal is BHD ${settings.price.toFixed(3)}. Pay via Benefit, then upload the receipt for review.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-[220px_1fr]">
            <div className="rounded-xl border border-border/60 bg-background p-4 text-center">
              {settings.qrUrl ? (
                <img
                  src={settings.qrUrl}
                  alt="BenefitPay QR"
                  className="mx-auto aspect-square w-44 object-contain"
                />
              ) : (
                <div className="mx-auto grid aspect-square w-44 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <QrCode className="h-14 w-14" />
                </div>
              )}
              <p className="mt-2 text-xs font-semibold">{settings.merchantName}</p>
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs font-semibold text-muted-foreground">IBAN</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <code dir="ltr" className="break-all text-sm font-bold">
                    {settings.iban}
                  </code>
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyIban()}>
                    <Copy className="me-1 h-4 w-4" /> {isAr ? "نسخ" : "Copy"}
                  </Button>
                </div>
              </div>
              <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 text-center hover:bg-primary/10">
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
                <p className="rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-xs text-amber-800">
                  {isAr
                    ? "تم استلام الإيصال. لن يتجدد تاريخ الاشتراك إلا بعد مراجعة السوبر أدمن والموافقة."
                    : "Receipt received. The expiry date changes only after super-admin review and approval."}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
