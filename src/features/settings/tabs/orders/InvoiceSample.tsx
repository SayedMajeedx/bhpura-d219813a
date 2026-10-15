import * as React from "react";
import InvoicePreview from "@/components/orders/InvoicePreview";
import { sampleInvoice } from "./invoice-sample";

/**
 * The store's real invoice, drawn from a sample order and the settings being edited: every change
 * below shows here at once, in Arabic or English (the invoice's own switch). Thirty-one invoice
 * settings had only a small logo preview before.
 */
export function InvoiceSample({
  settings,
  brandId,
  isAr,
}: {
  settings: Record<string, unknown>;
  brandId: string;
  isAr: boolean;
}) {
  const { order, items } = React.useMemo(
    () => sampleInvoice(settings, brandId),
    [settings, brandId],
  );
  return (
    <div className="min-w-0 space-y-2">
      <div>
        <p className="text-sm font-semibold">{isAr ? "معاينة الفاتورة" : "Invoice preview"}</p>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "فاتورة متجرك الحقيقية بطلب تجريبي. تتغير مع كل تعديل هنا."
            : "Your store's real invoice, with a sample order. It changes with every edit here."}
        </p>
      </div>
      <div className="max-h-[36rem] overflow-auto rounded-xl border border-border bg-muted/30 p-2 sm:p-3">
        <InvoicePreview
          order={order}
          items={items}
          settings={settings}
          paymentBadge="paid"
          brandAddons={[]}
          storeVertical={
            typeof settings.store_vertical === "string" ? settings.store_vertical : null
          }
        />
      </div>
    </div>
  );
}
