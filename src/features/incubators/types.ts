/**
 * The partners' page reads these shapes: the typed database rows with their joined columns
 * narrowed to what the page uses.
 */

export type CommissionType = "percentage" | "fixed";

export type Incubator = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  commission_type: CommissionType;
  commission_value: number;
  settlement_day: number | null;
  currency: string;
  notes: string | null;
  is_active: boolean;
  packaging_policy: "incubator" | "our_bom" | "fixed";
  fixed_packaging_cost: number;
  /** A shopper may collect an order here (the store's choice), with what the checkout shows. */
  pickup_enabled?: boolean;
  pickup_address_ar?: string | null;
  pickup_address_en?: string | null;
  pickup_location_url?: string | null;
  pickup_notes_ar?: string | null;
  pickup_notes_en?: string | null;
  /** Days to bring a piece from this partner to the store's branch. */
  transfer_days?: number | null;
};

type ProductName = { id?: string; name: string; name_ar: string | null; image_url?: string | null };

/** One piece (a variant) a partner holds. */
export type StockItem = {
  id: string;
  incubator_id: string;
  variant_id: string;
  external_code: string | null;
  quantity: number;
  consignment_price: number;
  commission_type: CommissionType;
  commission_value: number;
  product_variants: {
    id: string;
    sku: string | null;
    barcode: string | null;
    size: string | null;
    color: string | null;
    stock_main: number;
    stock_incubator?: number | null;
    selling_price: number;
    products: ProductName | null;
  } | null;
};

export type Sale = {
  id: string;
  incubator_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  gross_amount: number;
  commission_amount: number;
  net_due: number;
  paid_amount: number;
  sold_at: string;
  status: "confirmed" | "reversed";
  reversal_reason?: string | null;
  /** What the pieces cost the store, kept with the sale (staff who see financials only). */
  product_cost_snapshot?: number | null;
  packaging_cost_snapshot?: number | null;
  product_variants: {
    sku: string | null;
    size?: string | null;
    color?: string | null;
    products: ProductName | null;
  } | null;
};

export type Payment = {
  id: string;
  incubator_id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  reference: string | null;
  notes?: string | null;
  /** Set when the payment was taken back: it is on record, and no longer counts. */
  voided_at?: string | null;
  void_reason?: string | null;
};

/** Which sale a payment settled, and by how much. */
export type PaymentAllocation = { payment_id: string; sale_id: string; amount: number };

export type MovementType =
  | "transfer_in"
  | "return"
  | "sale"
  | "sale_reversal"
  | "adjustment"
  | "order_reserve"
  | "order_release";

/** One line of a partner's history: pieces in, out, sold, taken by an order. */
export type Movement = {
  id: string;
  incubator_id: string;
  variant_id: string;
  movement_type: MovementType | string;
  quantity_delta: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  occurred_at: string;
  product_variants: {
    sku: string | null;
    size?: string | null;
    color?: string | null;
    products: ProductName | null;
  } | null;
};

export type IncubatorDialog =
  | "incubator"
  | "edit_incubator"
  | "edit_item"
  | "transfer"
  | "sale"
  | "payment"
  | "return"
  | "statement"
  | null;
