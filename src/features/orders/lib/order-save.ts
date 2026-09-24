import { variantSpecs } from "@/lib/order-variant-specs";
import type { Order, OrderItem } from "@/features/orders/types";
import {
  orderItemFromRow,
  simplifyItem,
  type orderTotals,
} from "@/features/orders/lib/order-editor";

/**
 * Pure rules for saving the admin order editor: what blocks a save, the order
 * and item rows written, which changes are logged, and whether items changed.
 */

type Totals = ReturnType<typeof orderTotals>;

/**
 * Why the order can't be saved yet, or null. A brand-new order needs a customer
 * or an item; pickup needs a branch; delivery needs an address.
 */
export function orderSaveBlocker(
  order: Order,
  items: OrderItem[],
  id: string,
  lang: string,
): string | null {
  if (id === "new" && !order.customer_id && items.length === 0) {
    return lang === "ar"
      ? "أضف عميلاً أو منتجاً واحداً على الأقل قبل حفظ الطلب."
      : "Add at least one customer or product before saving the order.";
  }
  const fulfillmentMethod = order.fulfillment_method ?? "delivery";
  if (fulfillmentMethod === "pickup" && !order.branch_id) {
    return lang === "ar" ? "اختر فرع الاستلام" : "Select a pickup branch";
  }
  if (fulfillmentMethod === "delivery" && !order.shipping_address_id) {
    return lang === "ar" ? "اختر عنوان التوصيل" : "Select a delivery address";
  }
  return null;
}

/**
 * The `orders` columns saved from the editor. Only the fields of the chosen
 * fulfillment method are kept (branch for pickup, address for delivery,
 * channel and contact for digital); money comes from the computed totals.
 */
export function orderSavePayload(
  order: Order,
  totals: Totals,
  appliedPromo: { code: string; id: string } | null,
  currency: string,
) {
  const fulfillmentMethod = order.fulfillment_method ?? "delivery";
  return {
    customer_id: order.customer_id,
    status: order.status,
    notes: order.notes,
    fulfillment_method: fulfillmentMethod,
    branch_id: fulfillmentMethod === "pickup" ? (order.branch_id ?? null) : null,
    shipping_address_id:
      fulfillmentMethod === "delivery" ? (order.shipping_address_id ?? null) : null,
    digital_delivery_channel:
      fulfillmentMethod === "digital" ? order.digital_delivery_channel : null,
    digital_delivery_contact:
      fulfillmentMethod === "digital" ? order.digital_delivery_contact : null,
    payment_method: order.payment_method ?? null,
    payment_status: order.payment_status ?? "unpaid",
    fulfillment_status: order.fulfillment_status ?? "ON_HOLD",
    discount: totals.discount,
    tax_rate: order.tax_rate,
    tax_amount: totals.taxAmount,
    promo_code: appliedPromo?.code ?? null,
    promo_code_id: appliedPromo?.id || null,
    shipping: totals.shipping,
    subtotal: totals.subtotal,
    total: totals.total,
    advance_paid: totals.advancePaid,
    currency,
    order_date: order.order_date,
  };
}

/** An `order_items` row for an editor line. */
export function orderItemRow(
  item: OrderItem,
  ids: { user_id: string; brand_id: string; order_id: string },
) {
  return {
    user_id: ids.user_id,
    brand_id: ids.brand_id,
    order_id: ids.order_id,
    product_id: item.product_id ?? null,
    variant_id: item.variant_id ?? null,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    unit_cost: item.unit_cost == null ? null : Number(item.unit_cost),
    original_price: item.original_price ?? null,
    customizations: item.customizations,
    customization_total: item.customization_total,
    line_total: item.line_total,
    location: item.location ?? "main",
    selected_variant: variantSpecs(item.selected_variant),
    custom_field_values: item.custom_field_values ?? [],
  };
}

export type OrderChangeLog = { action: string; en: string; ar: string; order_id: string };

/** Activity entries for status, payment status and advance changes against the saved order. */
export function orderChangeLogs(
  prev: Order,
  order: Order,
  nextAdvance: number,
  currency: string,
): OrderChangeLog[] {
  const logs: OrderChangeLog[] = [];
  if (prev.status !== order.status) {
    logs.push({
      action: "status_change",
      order_id: order.id,
      en: `Order status changed from "${prev.status ?? "—"}" to "${order.status}"`,
      ar: `تم تغيير حالة الطلب من "${prev.status ?? "—"}" إلى "${order.status}"`,
    });
  }
  const prevPay = prev.payment_status ?? "unpaid";
  const nextPay = order.payment_status ?? "unpaid";
  if (prevPay !== nextPay) {
    logs.push({
      action: "payment_change",
      order_id: order.id,
      en: `Payment status manually changed from "${prevPay}" to "${nextPay}"`,
      ar: `تم تغيير حالة الدفع يدوياً من "${prevPay}" إلى "${nextPay}"`,
    });
  }
  const prevAdvance = Number(prev.advance_paid ?? 0);
  if (prevAdvance !== nextAdvance) {
    logs.push({
      action: "advance_change",
      order_id: order.id,
      en: `Advance payment updated from ${prevAdvance} to ${nextAdvance} ${currency}`,
      ar: `تم تحديث المبلغ المقدم من ${prevAdvance} إلى ${nextAdvance} ${currency}`,
    });
  }
  return logs;
}

/** Whether the lines differ from the saved `order_items` rows (count, ids or content). */
export function haveOrderItemsChanged(
  originalRows: Array<{ id?: unknown }>,
  items: OrderItem[],
): boolean {
  if (originalRows.length !== items.length) return true;
  for (const item of items) {
    const orig = originalRows.find((o) => o.id === item.id);
    if (!orig) return true;
    if (
      JSON.stringify(simplifyItem(orderItemFromRow(orig))) !== JSON.stringify(simplifyItem(item))
    ) {
      return true;
    }
  }
  return false;
}
