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
