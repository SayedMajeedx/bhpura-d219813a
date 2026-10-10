/** Row and form shapes shared by the inventory screens. */

export type MediaItem = {
  type: "image" | "video";
  url: string;
  stream_uid?: string;
  stream_iframe_url?: string;
  poster_url?: string;
};
export type CustomField = {
  key: string;
  label_ar: string | null;
  label_en: string | null;
  type: "text" | "number" | "select" | "file";
  options?: string[];
  required?: boolean;
};
export type Product = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  category: string | null;
  image_url: string | null;
  is_active: boolean;
  featured_trending: boolean;
  show_sale_badge: boolean;
  media: MediaItem[];
  custom_fields: CustomField[] | null;
  base_price?: number | null;
  cost_price?: number | null;
  variant_label_size_ar?: string | null;
  variant_label_size_en?: string | null;
  variant_label_color_ar?: string | null;
  variant_label_color_en?: string | null;
  variant_label_fabric_ar?: string | null;
  variant_label_fabric_en?: string | null;
  variant_label_four_ar?: string | null;
  variant_label_four_en?: string | null;
  variant_label_five_ar?: string | null;
  variant_label_five_en?: string | null;
  fabric_type?: string | null;
  occasion?: string | null;
  size_guide_id?: string | null;
  size_guide_hidden?: boolean | null;
  is_made_to_order?: boolean | null;
  /** Pieces that can still be made to order (null: no limit). Set through `setMadeToOrderLimit`. */
  made_to_order_available?: number | null;
  /** When the store paused making it to order (null: not paused). Set through `setMadeToOrderPaused`. */
  made_to_order_paused_at?: string | null;
  /** "service" for a service (sold only with a booking), else "product". */
  item_kind?: string | null;
  is_package?: boolean | null;
  /** A service priced by length: each hour past its longest length costs this. */
  extra_hour_price?: number | null;
  /** A service's place: customer, venue or both (null for products). */
  service_location?: string | null;
  /** What a service includes: [{ ar, en }] (empty for products). */
  service_includes?: unknown;
  /** A service's own booking rules (migration 20261001180000): see lib/bookings/service-capacity. */
  booking_capacity?: number | null;
  booking_scope?: string | null;
  booking_buffer_minutes?: number | null;
  booking_notice_hours?: number | null;
};
export type Variant = {
  id: string;
  product_id: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  fabric: string | null;
  option_four?: string | null;
  option_five?: string | null;
  cost_price: number;
  selling_price: number;
  original_price: number | null;
  stock: number;
  stock_main: number;
  stock_incubator: number;
  barcode: string | null;
  size_unit: string | null;
  created_at?: string;
  image_url: string | null;
};
export type Customization = {
  id: string;
  name: string;
  price_delta: number;
  product_ids?: string[] | null;
};

export type BulkVariantRow = {
  size: string;
  size_unit: string;
  color: string;
  fabric: string;
  sku: string;
  barcode: string;
  cost_price: number;
  selling_price: number;
  sale_price: string;
  stock_main: number;
  stock_incubator: number;
};

export type VariantViewMode = "quick" | "barcodes" | "full";
