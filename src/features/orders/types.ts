/** Shapes used by the admin order editor (`/admin/b/$slug/orders/$id`). */

import type { OrderDetail } from "@/lib/data/orders";

/** A new order before its first save: only the fields the editor fills in exist yet. */
export type DraftOrder = Partial<OrderDetail> &
  Pick<
    OrderDetail,
    | "id"
    | "brand_id"
    | "invoice_number"
    | "currency"
    | "tax_rate"
    | "fulfillment_method"
    | "shipping"
    | "subtotal"
    | "total"
    | "discount"
    | "advance_paid"
    | "status"
    | "payment_status"
    | "fulfillment_status"
    | "payment_method"
    | "customer_id"
    | "shipping_address_id"
    | "branch_id"
    | "notes"
    | "delivery_notes"
    | "order_date"
  >;

/** The order the editor works on: a saved order as `ordersQueries.detail` reads it, or a draft. */
export type Order = OrderDetail | DraftOrder;

/** The order fields the editor can change, with defaults (see `normalizeOrderMin`). */
export type EditableOrderFields = {
  id: string | null;
  notes: string;
  delivery_notes: string;
  customer_id: string | null;
  shipping_address_id: string | null;
  branch_id: string | null;
  fulfillment_method: string;
  digital_delivery_channel: string | null;
  digital_delivery_contact: string | null;
  payment_status: string;
  fulfillment_status: string;
  status: string;
  payment_method: string | null;
  discount: number;
  shipping: number;
  tax_rate: number;
  advance_paid: number;
  order_date: string;
};

/** Anything carrying the editable fields: an order, a draft, or a snapshot. */
export type EditableOrderSource = {
  [K in keyof EditableOrderFields]?: EditableOrderFields[K] | null;
};

/** The editable fields and lines at the last load or save: change detection and "cancel" use it. */
export type OrderSnapshot = { order: EditableOrderSource; items: OrderItem[] };

/** One line in the order editor, as edited (numbers already parsed). */
export type OrderItem = {
  id?: string;
  product_id?: string | null;
  variant_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit_cost?: number | null;
  original_price?: number | null;
  customizations: { name: string; price_delta: number }[];
  customization_total: number;
  line_total: number;
  location: "main" | "incubator" | "custom";
  selected_variant?: { size?: string | null; color?: string | null; fabric?: string | null } | null;
  custom_field_values?: Array<{
    key: string;
    label_ar: string | null;
    label_en: string | null;
    value: string;
  }>;
};

export type SavedAddress = {
  id: string;
  customer_id: string;
  label: string | null;
  region: string | null;
  block: string | null;
  road: string | null;
  house: string | null;
  flat: string | null;
  floor: string | null;
  landmark: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  delivery_notes: string | null;
  is_default: boolean;
};
