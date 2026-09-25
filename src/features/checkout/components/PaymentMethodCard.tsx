import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, Copy, CheckCircle2, X, UploadCloud } from "lucide-react";
import { ResponsiveImage } from "@/components/responsive-media";
import type { Dispatch, SetStateAction } from "react";
import type { Storefront } from "@/features/checkout/types";
import type { useCheckoutFulfillment } from "@/features/checkout/hooks/use-checkout-fulfillment";

/** The payment methods for this destination, the Benefit transfer details and receipt upload, and the card note. */
export function PaymentMethodCard({
  availableMethods,
  benefitReceipt,
  brand,
  fulfillment,
  lang,
  method,
  selectedDestination,
  setBenefitReceipt,
  setMethod,
  settings,
  t,
}: {
  availableMethods: ReturnType<typeof useCheckoutFulfillment>["availableMethods"];
  benefitReceipt: File | null;
  brand: Storefront["brand"];
  fulfillment: ReturnType<typeof useCheckoutFulfillment>["fulfillment"];
  lang: Storefront["lang"];
  method: ReturnType<typeof useCheckoutFulfillment>["method"];
  selectedDestination: ReturnType<typeof useCheckoutFulfillment>["selectedDestination"];
  setBenefitReceipt: Dispatch<SetStateAction<File | null>>;
  setMethod: ReturnType<typeof useCheckoutFulfillment>["setMethod"];
  settings: Storefront["settings"];
  t: Storefront["t"];
}) {
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display text-xl">{t("طريقة الدفع", "Payment method")}</h2>
      {availableMethods.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("لا توجد طرق دفع مفعّلة حالياً.", "No payment methods enabled yet.")}
        </p>
      )}
      <div className="grid gap-2">
        {availableMethods.map((m: any) => {
          const Icon = m.icon;
          const active = method === m.id;
          return (
            <Button
              key={m.id}
              type="button"
              variant={active ? "outline" : "ghost"}
              onClick={() => setMethod(m.id)}
              className={`text-start flex items-center justify-start gap-3 p-3 rounded-lg border h-auto ${
                active ? "border-primary bg-primary/10" : "border-border"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="font-medium">{lang === "ar" ? m.ar : m.en}</span>
            </Button>
          );
        })}
      </div>

      {fulfillment === "delivery" && selectedDestination !== "BH" && (
        <p className="text-xs text-muted-foreground pt-1">
          {t(
            "طرق الدفع المتاحة مخصصة بحسب وجهة الشحن المختارة.",
            "Available payment methods correspond to your selected shipping destination.",
          )}
        </p>
      )}

      {method === "benefit" && (
        <div className="mt-3 p-4 border rounded-lg bg-muted/40 text-center">
          <p className="text-sm mb-3">
            {t(
              "امسح رمز الاستجابة السريعة أدناه لإتمام الدفع عن طريق البنفت، ثم اضغط تأكيد الطلب.",
              "Scan the QR code below to complete payment via Benefit, then confirm your order.",
            )}
          </p>
          {settings.benefit_qr_url ? (
            <div className="space-y-3">
              <ResponsiveImage
                src={settings.benefit_qr_url}
                alt="Benefit QR"
                preset="thumb"
                sizes="240px"
                className="mx-auto max-w-[240px] rounded-lg border bg-white p-2"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={async () => {
                  try {
                    const response = await fetch(settings.benefit_qr_url!);
                    const blob = await response.blob();
                    const href = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = href;
                    a.download = `${brand.slug}-benefit-qr.png`;
                    a.click();
                    URL.revokeObjectURL(href);
                  } catch {
                    window.open(settings.benefit_qr_url!, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                <Download className="me-2 h-4 w-4" />
                {t("اضغط هنا لحفظ الباركود في الاستوديو", "Save QR Code to Gallery")}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("لم يقم المتجر برفع رمز البنفت بعد.", "Store hasn't uploaded a Benefit QR yet.")}
            </p>
          )}
          {settings.benefit_account_number && (
            <div className="mt-4 rounded-lg border bg-background p-3">
              <p className="mb-2 break-all font-semibold" dir="ltr">
                {settings.benefit_account_number}
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(settings.benefit_account_number!);
                  toast.success(t("تم نسخ رقم الحساب", "Account number copied"));
                }}
              >
                <Copy className="me-2 h-4 w-4" />
                {t("نسخ رقم الحساب", "Copy Account Number")}
              </Button>
            </div>
          )}
          <div className="mt-4 text-start">
            <Label htmlFor="benefit-receipt" className="mb-2 block font-semibold">
              {t(
                "يرجى إرفاق صورة إيصال التحويل لتأكيد الطلب",
                "Please attach a screenshot of the payment receipt",
              )}
            </Label>
            <label
              className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-background p-4 text-center hover:bg-muted/40"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) setBenefitReceipt(file);
              }}
            >
              <input
                id="benefit-receipt"
                name="benefit-receipt"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setBenefitReceipt(e.target.files?.[0] ?? null)}
              />
              {benefitReceipt ? (
                <>
                  <CheckCircle2 className="mb-2 h-7 w-7 text-emerald-600" />
                  <span className="max-w-full truncate font-medium">{benefitReceipt.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 inline-flex items-center text-xs text-destructive hover:text-destructive h-auto p-1"
                    onClick={(e) => {
                      e.preventDefault();
                      setBenefitReceipt(null);
                    }}
                  >
                    <X className="me-1 h-3 w-3" />
                    {t("إزالة", "Remove")}
                  </Button>
                </>
              ) : (
                <>
                  <UploadCloud className="mb-2 h-8 w-8 text-muted-foreground" />
                  <span>
                    {t("اسحب الصورة هنا أو اضغط للاختيار", "Drop the image here or tap to choose")}
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">JPG, PNG, WebP · 8 MB</span>
                </>
              )}
            </label>
          </div>
        </div>
      )}

      {method === "card" && (
        <div className="mt-3 p-4 border rounded-lg text-sm text-center font-medium text-amber-800 border-amber-200/50 bg-amber-500/10 dark:text-amber-400 dark:border-amber-900/50 dark:bg-amber-950/10">
          {t(
            "سيتم تحويلك بشكل آمن إلى بوابة الدفع لإتمام عملية الدفع بالبطاقة فور تأكيد الطلب.",
            "You will be securely redirected to the payment gateway to complete your card payment upon placing the order.",
          )}
        </div>
      )}
    </Card>
  );
}
