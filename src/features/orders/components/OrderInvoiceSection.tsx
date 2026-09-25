import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type PaymentBadge } from "@/lib/payment-status";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import type { Order, SavedAddress } from "@/features/orders/types";
import { orderTotals } from "@/features/orders/lib/order-editor";
import { lazy, type Dispatch, type SetStateAction } from "react";
import type { OrderItem } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";

const InvoicePreview = lazy(() => import("@/components/orders/InvoicePreview"));
/** Invoice preview with print and send actions. */
export function OrderInvoiceSection({
  addressesQ,
  invoicePreviewOpen,
  items,
  lang,
  mobileTab,
  order,
  paymentBadge,
  productsQ,
  setInvoicePreviewOpen,
  settingsQ,
  storeProfile,
  totals,
}: {
  addressesQ: OrderDetailData["addressesQ"];
  invoicePreviewOpen: boolean;
  items: OrderItem[];
  lang: ReturnType<typeof useI18n>["lang"];
  mobileTab: "items" | "customer" | "activity";
  order: Order;
  paymentBadge: PaymentBadge;
  productsQ: OrderDetailData["productsQ"];
  setInvoicePreviewOpen: Dispatch<SetStateAction<boolean>>;
  settingsQ: OrderDetailData["settingsQ"];
  storeProfile: ReturnType<typeof useAdminStoreProfile>["profile"];
  totals: ReturnType<typeof orderTotals>;
}) {
  return (
    <div
      id="sec-invoice"
      className={cn("scroll-mt-24", mobileTab !== "activity" && "hidden sm:block")}
    >
      <div className="no-print mb-4 rounded-xl border bg-card">
        <button
          type="button"
          onClick={() => setInvoicePreviewOpen((open) => !open)}
          className="flex w-full items-center justify-between px-4 py-3 text-start font-medium hover:bg-muted/40"
          aria-expanded={invoicePreviewOpen}
        >
          <span>{lang === "ar" ? "معاينة الفاتورة" : "Preview Invoice"}</span>
          <span className="text-sm text-muted-foreground">{invoicePreviewOpen ? "−" : "+"}</span>
        </button>
      </div>
      <div className={invoicePreviewOpen ? "block" : "hidden print:block"}>
        {/* Printable invoice */}
        {(() => {
          const addrs = (addressesQ.data ?? []).filter((a) => a.customer_id === order.customer_id);
          const chosen =
            (order.delivery_address_snapshot as SavedAddress | null) ??
            addrs.find((a) => a.id === order.shipping_address_id) ??
            addrs.find((a) => a.is_default) ??
            null;
          return (
            <InvoicePreview
              order={{
                ...order,
                subtotal: totals.subtotal,
                tax_amount: totals.taxAmount,
                total: totals.total,
                advance_paid: totals.advancePaid,
              }}
              items={items.map((it) => ({
                ...it,
                product: (productsQ.data ?? []).find((p: any) => p.id === it.product_id),
              }))}
              settings={settingsQ.data}
              shippingAddress={chosen}
              paymentBadge={paymentBadge}
              brandAddons={storeProfile.addons}
              storeVertical={storeProfile.vertical}
            />
          );
        })()}
      </div>
    </div>
  );
}
