/**
 * What the import and export pages offer a store, by what the store keeps: a store with no stock
 * has no stock column to map, no stock-health filter and no valuation report. The data is the same
 * either way; only the offer follows the store's modules (docs/vertical-fit-audit.md).
 */

export type ImportField = { field: string; label: string };

const SHOP_PRODUCTS_CSV = `name_ar,name_en,price,cost_price,sku,stock,category,description_ar,description_en,image_url
قميص قطني مطرز,Embroidered Cotton Shirt,45.000,20.000,SKU-SHT-01,15,ملابس,قميص فاخر من القطن الطبيعي مع تطريز يدوي,Luxury natural cotton shirt with handcrafted embroidery,https://images.unsplash.com/photo-1584917865442-de89df76afd3
فستان سهرة دانتيل,Lace Evening Dress,65.000,30.000,SKU-DRS-02,8,فساتين,فستان أنيق مناسب لجميع المناسبات,Elegant lace dress perfect for special occasions,https://images.unsplash.com/photo-1595777457583-95e059d581b8`;

const SERVICES_PRODUCTS_CSV = `name_ar,name_en,price,category,description_ar,description_en,image_url
جلسة تصوير عائلي,Family Photo Session,45.000,تصوير,جلسة تصوير لمدة ساعة داخل الاستوديو,One-hour photo session in our studio,
حزمة تجهيز العروس,Bridal Package,120.000,باقات,مكياج وتصفيف وتجهيز كامل ليوم الزفاف,"Makeup, styling and full preparation for the wedding day",`;

/** The sample products file: a store with no stock gets one with no stock or cost columns. */
export function productSampleCsv(stock: boolean): string {
  return stock ? SHOP_PRODUCTS_CSV : SERVICES_PRODUCTS_CSV;
}

/** The product fields an importing merchant maps columns to. */
export function productImportFields(stock: boolean, isAr: boolean): ImportField[] {
  return [
    { field: "name", label: isAr ? "اسم المنتج" : "Product Name" },
    { field: "price", label: isAr ? "سعر البيع" : "Selling Price" },
    ...(stock ? [{ field: "stock", label: isAr ? "الكمية بالمخزون" : "Stock Quantity" }] : []),
    { field: "sku", label: isAr ? "رمز SKU" : "SKU" },
    { field: "image", label: isAr ? "رابط الصورة" : "Image URL" },
  ];
}

export type StockFilterOption = { value: string; labelAr: string; labelEn: string };

const STOCK_OPTIONS: StockFilterOption[] = [
  { value: "in_stock", labelAr: "المتوفر بالمخزن فقط", labelEn: "In Stock Only" },
  { value: "low_stock", labelAr: "مخزون منخفض (≤ 5)", labelEn: "Low Stock (≤ 5)" },
  { value: "out_of_stock", labelAr: "المنتجات النافذة فقط", labelEn: "Out of Stock" },
];

const STATE_OPTIONS: StockFilterOption[] = [
  { value: "active_only", labelAr: "المنتجات النشطة فقط", labelEn: "Active Only" },
  { value: "draft_only", labelAr: "المسودات والمعطلة", labelEn: "Drafts Only" },
];

/** The product list's filter: the stock choices only mean something where there is stock. */
export function productListFilterOptions(stock: boolean): StockFilterOption[] {
  return stock ? [...STOCK_OPTIONS, ...STATE_OPTIONS] : STATE_OPTIONS;
}

export function productListFilterLabel(stock: boolean, isAr: boolean): string {
  if (stock) return isAr ? "حالة المخزون:" : "Stock Health:";
  return isAr ? "الحالة:" : "Status:";
}

/** Export presets that only make sense with stock (the inventory valuation). */
const STOCK_PRESETS = new Set(["inventory_valuation"]);

export function productExportPresets<T extends { id: string }>(presets: T[], stock: boolean): T[] {
  return stock ? presets : presets.filter((preset) => !STOCK_PRESETS.has(preset.id));
}
