import { useState } from "react";
import { Gift, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { orderGift } from "@/lib/gift-order";
import { giftReceiptHtml, giftReceiptPieces, type GiftReceiptLine } from "@/lib/gift-receipt";
import { displayPhone } from "@/lib/invoice-display";
import type { OrderNumberFormat } from "@/lib/order-number";

/**
 * Printing a gift order's gift receipt (`giftReceiptHtml`): what is in the box and the order to
 * bring for an exchange, with no price on it, in Arabic or English. Shown only for a gift order.
 */
export function GiftReceiptButton({
  order,
  items,
  storeName,
  logoUrl,
  settings,
  lang,
}: {
  order: {
    gift?: unknown;
    notes?: string | null;
    invoice_number?: number | null;
    order_date?: string | null;
    created_at?: string | null;
  };
  items: readonly GiftReceiptLine[];
  storeName: string;
  logoUrl?: string | null;
  settings?: (OrderNumberFormat & { whatsapp_number?: string | null }) | null;
  lang: "ar" | "en";
}) {
  const [printLang, setPrintLang] = useState<"ar" | "en">(lang);
  const gift = orderGift(order);
  if (!gift) return null;
  const isAr = lang === "ar";

  const print = () => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) {
      toast.error(isAr ? "اسمح للنوافذ المنبثقة لتطبع." : "Allow pop-ups to print.");
      return;
    }
    const day = order.order_date ?? order.created_at ?? null;
    const html = giftReceiptHtml({
      storeName,
      logoUrl,
      orderNumber: order.invoice_number ?? null,
      numberFormat: settings ?? null,
      orderDate: day
        ? new Date(day).toLocaleDateString(printLang === "ar" ? "ar-BH-u-nu-latn" : "en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : null,
      gift,
      pieces: giftReceiptPieces(items, printLang),
      contact: settings?.whatsapp_number ? displayPhone(settings.whatsapp_number) : null,
      lang: printLang,
    });
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Gift className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-foreground">
            {isAr ? "إيصال الهدية" : "Gift receipt"}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isAr
              ? "يوضع في الصندوق: القطع ورقم الطلب للاستبدال، بلا أي سعر."
              : "Goes in the box: the pieces and the order number for an exchange, with no prices."}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label={isAr ? "لغة الإيصال" : "Receipt language"}
          className="inline-flex rounded-md border border-border p-0.5"
        >
          {(["ar", "en"] as const).map((code) => (
            <Button
              key={code}
              type="button"
              size="sm"
              variant={printLang === code ? "secondary" : "ghost"}
              role="radio"
              aria-checked={printLang === code}
              onClick={() => setPrintLang(code)}
              className="h-8 px-3"
            >
              {code === "ar" ? "عربي" : "English"}
            </Button>
          ))}
        </div>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={print}>
          <Printer className="size-4" aria-hidden />
          {isAr ? "طباعة إيصال الهدية" : "Print gift receipt"}
        </Button>
      </div>
    </div>
  );
}
