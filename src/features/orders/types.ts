/** Shapes used by the admin order editor (`/admin/b/$slug/orders/$id`). */

/** Order rows are still read untyped from Supabase; see `docs/maintainability-roadmap.md`. */
export type Order = any;

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
