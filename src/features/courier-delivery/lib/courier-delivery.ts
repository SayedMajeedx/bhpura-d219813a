import { orderNumberLabel, orderNumberText, type OrderNumberFormat } from "@/lib/order-number";
import { realSize } from "@/lib/default-variant";

/**
 * A delivery as its courier needs to read it: who, where, what to hand over, how much to
 * collect, and what to do next. Pure: `CourierDeliveryPage` shows it and runs the actions.
 *
 * A courier is not office staff: no prices per line, no costs, no editing. Only what the
 * doorstep needs.
 */

type Lang = "ar" | "en";

export type CourierOrder = {
  id: string;
  invoice_number?: number | string | null;
  status?: string | null;
  fulfillment_status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  total?: number | string | null;
  advance_paid?: number | string | null;
  currency?: string | null;
  notes?: string | null;
  delivery_notes?: string | null;
  customer_name_snapshot?: string | null;
  customer_phone_snapshot?: string | null;
  customers?: { name?: string | null; phone?: string | null } | null;
  delivery_address_snapshot?: unknown;
  shipping_address?: CourierAddress | null;
  order_items?: Array<{
    id?: string;
    description?: string | null;
    quantity?: number | string | null;
    selected_variant?: {
      size?: string | null;
      color?: string | null;
      fabric?: string | null;
    } | null;
  }> | null;
};

export type CourierAddress = {
  label?: string | null;
  region?: string | null;
  block?: string | null;
  road?: string | null;
  house?: string | null;
  flat?: string | null;
  floor?: string | null;
  landmark?: string | null;
  formatted_address?: string | null;
  delivery_notes?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

/** Where the delivery stands, as the courier sees it. */
export type CourierStage = "pick_up" | "on_the_way" | "delivered" | "cancelled";

export type CourierDelivery = {
  number: string;
  stage: CourierStage;
  customerName: string;
  /** Digits only, with the country code: for a call and for WhatsApp. Null when unusable. */
  phone: string | null;
  /** The phone as the store wrote it, to show. */
  phoneText: string | null;
  addressLines: string[];
  /** Notes the customer left for the address ("ring the side bell"). */
  addressNote: string | null;
  mapsUrl: string | null;
  /** The note on the order and the delivery notes, whichever exist. */
  notes: string[];
  items: Array<{ key: string; title: string; quantity: number; detail: string }>;
  pieces: number;
  total: number;
  toCollect: number;
  currency: string;
};

const text = (value: unknown) => String(value ?? "").trim();

export function courierStage(order: Pick<CourierOrder, "status" | "fulfillment_status">) {
  const fulfillment = text(order.fulfillment_status).toUpperCase();
  const status = text(order.status).toUpperCase();
  if (fulfillment === "CANCELLED" || status === "CANCELLED") return "cancelled" as const;
  if (
    ["COMPLETED", "DELIVERED"].includes(fulfillment) ||
    ["COMPLETED", "DELIVERED"].includes(status)
  ) {
    return "delivered" as const;
  }
  if (["SHIPPED", "OUT_FOR_DELIVERY"].includes(fulfillment)) return "on_the_way" as const;
  return "pick_up" as const;
}

/** A number a phone can dial and WhatsApp can open: an 8-digit Bahrain number gets 973. */
export function dialablePhone(phone: string | null | undefined): string | null {
  let digits = text(phone).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8) digits = `973${digits}`;
  return digits.length >= 8 ? digits : null;
}

function addressOf(order: CourierOrder): CourierAddress | null {
  if (order.shipping_address) return order.shipping_address;
  const snapshot = order.delivery_address_snapshot;
  return snapshot && typeof snapshot === "object" ? (snapshot as CourierAddress) : null;
}

function addressLines(address: CourierAddress | null, lang: Lang): string[] {
  if (!address) return [];
  const isAr = lang === "ar";
  const part = (ar: string, en: string, value: unknown) =>
    text(value) ? `${isAr ? ar : en} ${text(value)}` : "";
  const street = [
    part("مجمع", "Block", address.block),
    part("طريق", "Road", address.road),
    part("مبنى", "Building", address.house),
  ].filter(Boolean);
  const inside = [part("شقة", "Flat", address.flat), part("طابق", "Floor", address.floor)].filter(
    Boolean,
  );
  const lines = [
    text(address.region),
    street.join(isAr ? "، " : ", "),
    inside.join(isAr ? "، " : ", "),
    part("علامة مميزة:", "Landmark:", address.landmark),
  ].filter(Boolean);
  return lines.length > 0 ? lines : [text(address.formatted_address)].filter(Boolean);
}

function mapsUrl(address: CourierAddress | null, lines: string[]): string | null {
  if (!address) return null;
  const lat = Number(address.latitude);
  const lng = Number(address.longitude);
  if (text(address.latitude) && text(address.longitude) && Number.isFinite(lat + lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  // Without a pin, a written address still finds the street.
  const query = text(address.formatted_address) || lines.slice(0, 2).join(", ");
  return query && (address.block || address.road || address.formatted_address)
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null;
}

export function courierDelivery(order: CourierOrder, lang: Lang): CourierDelivery {
  const address = addressOf(order);
  const lines = addressLines(address, lang);
  const total = Number(order.total ?? 0);
  const paid = Number(order.advance_paid ?? 0);
  const settled = text(order.payment_status).toLowerCase() === "paid";
  const phoneText = text(order.customer_phone_snapshot) || text(order.customers?.phone) || null;
  const items = (order.order_items ?? []).map((item, index) => {
    const variant = item.selected_variant;
    return {
      key: item.id ?? String(index),
      title: text(item.description) || (lang === "ar" ? "قطعة" : "Item"),
      quantity: Number(item.quantity) || 1,
      detail: [text(variant?.color), realSize(text(variant?.size)), text(variant?.fabric)]
        .filter(Boolean)
        .join(" · "),
    };
  });

  return {
    number: text(order.invoice_number) || order.id.slice(0, 8),
    stage: courierStage(order),
    customerName:
      text(order.customer_name_snapshot) ||
      text(order.customers?.name) ||
      (lang === "ar" ? "عميل" : "Customer"),
    phone: dialablePhone(phoneText),
    phoneText,
    addressLines: lines,
    addressNote: text(address?.delivery_notes) || null,
    mapsUrl: mapsUrl(address, lines),
    notes: [text(order.notes), text(order.delivery_notes)].filter(Boolean),
    items,
    pieces: items.reduce((sum, item) => sum + item.quantity, 0),
    total,
    // What is still owed is collected at the door; a paid order collects nothing.
    toCollect: settled ? 0 : Math.max(0, Math.round((total - paid) * 1000) / 1000),
    currency: text(order.currency) || "BHD",
  };
}

/** What the courier's main button does at each stage. */
export function courierNextStep(stage: CourierStage): "confirm_pickup" | "deliver" | null {
  if (stage === "pick_up") return "confirm_pickup";
  if (stage === "on_the_way") return "deliver";
  return null;
}

/** A message the courier can send the customer on WhatsApp, in the customer's reading language. */
export function onMyWayMessage(input: {
  isAr: boolean;
  storeName: string;
  customerName: string;
  number: string;
  /** How the store writes its order numbers (`orderNumberLabel`); none: "#1042". */
  numberFormat?: OrderNumberFormat | null;
}): string {
  return input.isAr
    ? `مرحباً ${input.customerName}، معك مندوب التوصيل من ${input.storeName}. طلبك رقم ${orderNumberText(input.number, input.numberFormat)} في الطريق إليك. هل العنوان والوقت مناسبان؟`
    : `Hello ${input.customerName}, this is the courier from ${input.storeName}. Your order ${orderNumberLabel(input.number, input.numberFormat)} is on its way. Is the address and time fine for you?`;
}
