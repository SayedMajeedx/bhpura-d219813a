import { useQuery } from "@tanstack/react-query";
import { supplierOrderQueries } from "@/lib/data/supplier-orders";
import { supplierAccountQueries } from "@/lib/data/supplier-orders/account";
import type { SupplierOrder } from "../lib/order-state";
import { supplierCredits } from "../lib/supplier-account";
import { SupplierPaymentDialog } from "./SupplierPaymentDialog";

/**
 * "Record payment" on an order: a payment to its supplier, with this order paid first and the
 * rest spread on their other orders, read with the supplier's other orders and credit.
 */
export function OrderSupplierPayment({
  open,
  onOpenChange,
  brandId,
  order,
  currency,
  moneyLabel,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  order: SupplierOrder;
  currency: string;
  moneyLabel: string;
  lang: "ar" | "en";
}) {
  const listQ = useQuery({
    ...supplierOrderQueries.list(brandId),
    enabled: open && Boolean(brandId),
  });
  const paymentsQ = useQuery({
    ...supplierAccountQueries.payments(brandId),
    enabled: open && Boolean(brandId),
  });
  const orders = listQ.data?.some((o) => o.id === order.id)
    ? listQ.data
    : [order, ...(listQ.data ?? [])];
  const credit = supplierCredits(paymentsQ.data ?? []).get(order.vendor_id) ?? 0;
  return (
    <SupplierPaymentDialog
      open={open}
      onOpenChange={onOpenChange}
      brandId={brandId}
      vendor={{ id: order.vendor_id, name: order.vendor_name }}
      orders={orders}
      credit={credit}
      firstOrderId={order.id}
      currency={currency}
      moneyLabel={moneyLabel}
      lang={lang}
    />
  );
}
