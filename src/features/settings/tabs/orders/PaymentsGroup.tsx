import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { AdvancedOnly } from "@/features/settings/FieldVisibility";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { toast } from "sonner";
import {
  Banknote,
  CreditCard,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  QrCode,
  Sparkles,
  Trash2,
} from "lucide-react";

export function PaymentsGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs, brandId } = useBrandSettingsFormContext();
  const bs = form.bs;

  const [showSecretKey, setShowSecretKey] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);

  const handleUploadQr = async (file: File) => {
    try {
      setUploadingQr(true);
      const url = await uploadPublicMedia(brandId, file, "payment-qr");
      setBs({ benefit_qr_url: url });
      toast.success(isAr ? "تم رفع باركود بنفت باي بنجاح" : "BenefitPay QR code uploaded");
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل رفع الباركود" : "Failed to upload QR code"));
    } finally {
      setUploadingQr(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Payment Methods (COD, BenefitPay, Cards) */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <CreditCard className="size-4 text-primary" />
            <span>{isAr ? "طرق الدفع والتحصيل (Payment Methods)" : "Payment Methods"}</span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "فعل بوابات الدفع الإلكترونية والدفع عند الاستلام وبنفت باي لتوفير تجربة شراء سلسة لعملائك."
              : "Enable card gateways, BenefitPay, or Cash on Delivery for checkout."}
          </p>
        </div>

        {/* Payment Toggles Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* BenefitPay */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5 bg-background">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <QrCode className="size-4" />
              </div>
              <div>
                <Label className="cursor-pointer text-xs font-semibold">
                  {isAr ? "بنفت باي" : "BenefitPay"}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr ? "تحويل فوري" : "Instant QR/IBAN"}
                </p>
              </div>
            </div>
            <Switch
              checked={bs.benefit_enabled ?? false}
              onCheckedChange={(checked) => setBs({ benefit_enabled: checked })}
            />
          </div>

          {/* Cash on Delivery */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5 bg-background">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-success/10 text-success flex items-center justify-center shrink-0">
                <Banknote className="size-4" />
              </div>
              <div>
                <Label className="cursor-pointer text-xs font-semibold">
                  {isAr ? "عند الاستلام" : "Cash on Delivery"}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr ? "نقداً للسائق" : "COD Payment"}
                </p>
              </div>
            </div>
            <Switch
              checked={bs.cod_enabled ?? true}
              onCheckedChange={(checked) => setBs({ cod_enabled: checked })}
            />
          </div>

          {/* Credit / Debit Cards */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5 bg-background">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-info/10 text-info flex items-center justify-center shrink-0">
                <CreditCard className="size-4" />
              </div>
              <div>
                <Label className="cursor-pointer text-xs font-semibold">
                  {isAr ? "بطاقات الدفع" : "Cards (Visa/MC)"}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr ? "بوابة دفع إلكترونية" : "Online Gateway"}
                </p>
              </div>
            </div>
            <Switch
              checked={bs.card_enabled ?? false}
              onCheckedChange={(checked) => setBs({ card_enabled: checked })}
            />
          </div>
        </div>

        {/* BenefitPay Details if enabled */}
        {bs.benefit_enabled && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <QrCode className="size-4 text-destructive" />
              <h4 className="text-xs font-semibold text-foreground">
                {isAr ? "بيانات حساب ورمز بنفت باي (BenefitPay)" : "BenefitPay Account & QR Setup"}
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {isAr ? "رقم الهاتف أو الآيبان لحساب بنفت" : "BenefitPay Mobile / IBAN"}
                </Label>
                <Input
                  className="text-xs h-9 font-mono"
                  value={bs.benefit_account_number ?? ""}
                  placeholder="+973 3xxxxxxx / BHxx..."
                  onChange={(e) => setBs({ benefit_account_number: e.target.value || null })}
                />
              </div>

              {/* QR Upload */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {isAr ? "رمز الاستجابة السريعة (QR Code)" : "QR Code Image"}
                </Label>
                <div className="flex items-center gap-2">
                  {bs.benefit_qr_url ? (
                    <div className="flex items-center gap-2 flex-1">
                      <img
                        src={bs.benefit_qr_url}
                        alt="Benefit QR"
                        className="size-9 rounded-md object-cover border border-border"
                      />
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {bs.benefit_qr_url}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => setBs({ benefit_qr_url: null })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs cursor-pointer">
                      {uploadingQr ? (
                        <Loader2 className="size-3.5 animate-spin text-primary" />
                      ) : (
                        <ImagePlus className="size-3.5 text-muted-foreground" />
                      )}
                      <span>{isAr ? "رفع صورة الباركود" : "Upload QR Image"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingQr}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) handleUploadQr(file);
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Advanced Gateway Credentials & Processing Fees */}
        <AdvancedOnly
          fieldKey="card_public_key"
          reason={
            isAr
              ? "إعداد مفاتيح بوابة الدفع الإلكتروني ورسوم المعالجة"
              : "Payment gateway credentials & fee configuration"
          }
        >
          <div className="rounded-xl border border-border p-4 bg-muted/5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h4 className="text-xs font-semibold">
                {isAr
                  ? "مفاتيح بوابة الدفع ورسوم العمليات"
                  : "Payment Gateway API Keys & Processing Fees"}
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {isAr ? "المفتاح العام للبوابة (Public Key)" : "Gateway Public Key"}
                </Label>
                <Input
                  className="text-xs h-9 font-mono"
                  value={bs.card_public_key ?? ""}
                  placeholder="pk_live_..."
                  onChange={(e) => setBs({ card_public_key: e.target.value || null })}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">
                    {isAr ? "المفتاح السري للبوابة (Secret Key)" : "Gateway Secret Key"}
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    {showSecretKey ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                    <span>
                      {showSecretKey ? (isAr ? "إخفاء" : "Hide") : isAr ? "إظهار" : "Show"}
                    </span>
                  </button>
                </div>
                <Input
                  type={showSecretKey ? "text" : "password"}
                  className="text-xs h-9 font-mono"
                  value={bs.card_secret_key ?? ""}
                  placeholder="sk_live_..."
                  onChange={(e) => setBs({ card_secret_key: e.target.value || null })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {isAr ? "رسوم معالجة البطاقات (%)" : "Card Processing Fee (%)"}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  className="text-xs h-9 font-mono"
                  value={bs.card_processing_fee ?? 0}
                  onChange={(e) =>
                    setBs({ card_processing_fee: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {isAr ? "رسوم معالجة بنفت باي (مبلغ ثابت)" : "BenefitPay Processing Fee (Flat)"}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="text-xs h-9 font-mono"
                  value={bs.benefit_processing_fee ?? 0}
                  onChange={(e) =>
                    setBs({ benefit_processing_fee: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>
            </div>
          </div>
        </AdvancedOnly>
      </div>
    </div>
  );
}
