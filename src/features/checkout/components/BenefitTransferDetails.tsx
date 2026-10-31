import { CheckCircle2, Copy, Download, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ResponsiveImage } from "@/components/responsive-media";
import type { Storefront } from "@/features/checkout/types";

/**
 * How to pay a store by BenefitPay transfer: its QR code (to save to the phone's photos), its
 * account number to copy, and the receipt's screenshot to attach. Checkout's payment step and
 * the gift card page both draw it.
 */
export function BenefitTransferDetails({
  brand,
  settings,
  receipt,
  setReceipt,
  t,
}: {
  brand: Pick<Storefront["brand"], "slug">;
  settings: { benefit_qr_url?: string | null; benefit_account_number?: string | null };
  receipt: File | null;
  setReceipt: (file: File | null) => void;
  t: Storefront["t"];
}) {
  return (
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
            if (file) setReceipt(file);
          }}
        >
          <input
            id="benefit-receipt"
            name="benefit-receipt"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
          />
          {receipt ? (
            <>
              <CheckCircle2 className="mb-2 h-7 w-7 text-emerald-600" />
              <span className="max-w-full truncate font-medium">{receipt.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 inline-flex items-center text-xs text-destructive hover:text-destructive h-auto p-1"
                onClick={(e) => {
                  e.preventDefault();
                  setReceipt(null);
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
  );
}
