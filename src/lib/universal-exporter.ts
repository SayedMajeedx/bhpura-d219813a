import { supabase } from "@/integrations/supabase/client";
import { sanitizeGCCPhone } from "@/lib/os-formatting";

export type ExportFormat = "xlsx" | "csv" | "json";
export type ExportEntityType = "products" | "customers" | "orders" | "expenses" | "full_backup";

export interface ColumnDef<T = any> {
  key: string;
  headerEn: string;
  headerAr: string;
  width?: number;
  format?: "string" | "number" | "currency" | "date" | "boolean";
  getter?: (item: T) => unknown;
}

export interface ExportPreset<T = any> {
  id: string;
  labelEn: string;
  labelAr: string;
  descriptionEn: string;
  descriptionAr: string;
  columns: ColumnDef<T>[];
  transform?: (items: T[]) => Record<string, unknown>[];
}

// -------------------------------------------------------------
// Security & Sanitization (CWE-1236 CSV Injection Defense)
// -------------------------------------------------------------
export function sanitizeForCsv(value: unknown): string {
  if (value == null) return "";
  let str = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Neutralize spreadsheet formula injection characters
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // RFC 4180 escaping
  if (/[",\r\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

export function sanitizeCellValue(value: unknown): string | number | boolean | Date | null {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value;
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return str;
}

// -------------------------------------------------------------
// CSV Exporter (UTF-8 with BOM for Excel Arabic rendering)
// -------------------------------------------------------------
export function exportToCsv(
  rows: Record<string, unknown>[],
  columns: { key: string; label: string }[],
  fileName: string,
) {
  const headerLine = columns.map((col) => sanitizeForCsv(col.label)).join(",");
  const dataLines = rows.map((row) => columns.map((col) => sanitizeForCsv(row[col.key])).join(","));
  const csvContent = [headerLine, ...dataLines].join("\r\n");

  // UTF-8 BOM \uFEFF ensures Excel displays Arabic text properly
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  triggerBrowserDownload(blob, fileName);
}

// -------------------------------------------------------------
// Excel (.xlsx) Exporter via write-excel-file/browser
// -------------------------------------------------------------
export async function exportToExcel(
  rows: Record<string, unknown>[],
  columns: { key: string; label: string; format?: string; width?: number }[],
  fileName: string,
  sheetName = "Boutq Data",
) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");

  // Header row styled with bold font and clean light background
  const headerRow = columns.map((col) => ({
    value: col.label,
    fontWeight: "bold" as const,
    backgroundColor: "#F3F4F6",
    align: "center" as const,
  }));

  // Data rows
  const dataRows = rows.map((row) =>
    columns.map((col) => {
      const val = row[col.key];
      if (val == null) return { value: "" };
      if (typeof val === "number") {
        return {
          value: val,
          format: col.format === "currency" ? "#,##0.000" : "#,##0",
          align: "right" as const,
        };
      }
      if (typeof val === "boolean") {
        return {
          value: val ? "Yes" : "No",
          align: "center" as const,
        };
      }
      return {
        value: sanitizeCellValue(val)?.toString() ?? "",
        align: "left" as const,
      };
    }),
  );

  // Auto calculate column widths
  const columnConfigs = columns.map((col) => {
    let maxLen = col.label.length;
    for (let i = 0; i < Math.min(rows.length, 50); i++) {
      const cellVal = rows[i][col.key];
      if (cellVal != null) {
        maxLen = Math.max(maxLen, String(cellVal).length);
      }
    }
    return { width: Math.min(Math.max(maxLen + 3, col.width || 12), 60) };
  });

  await writeXlsxFile([headerRow, ...dataRows], {
    columns: columnConfigs,
    sheet: sheetName,
    stickyRowsCount: 1,
  }).toFile(fileName);
}

// -------------------------------------------------------------
// JSON Backup Exporter
// -------------------------------------------------------------
export function exportToJson(data: unknown, fileName: string) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
  triggerBrowserDownload(blob, fileName);
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -------------------------------------------------------------
// Presets: Products Catalog
// -------------------------------------------------------------
export const PRODUCT_PRESETS: ExportPreset[] = [
  {
    id: "boutq_master",
    labelEn: "Boutq Master Catalog",
    labelAr: "كتالوج Boutq الشامل (كل الخيارات)",
    descriptionEn:
      "Complete product catalog with all variants, barcodes, SKUs, inventory, and bilingual text",
    descriptionAr:
      "الكتالوج الكامل متضمناً كافة المقاسات والألوان والباركود والمخزون والوصف بالعربية والإنجليزية",
    columns: [
      { key: "id", headerEn: "Product ID", headerAr: "معرف المنتج", width: 36 },
      { key: "name_ar", headerEn: "Name (Arabic)", headerAr: "اسم المنتج (عربي)", width: 28 },
      { key: "name_en", headerEn: "Name (English)", headerAr: "اسم المنتج (إنجليزي)", width: 28 },
      { key: "category", headerEn: "Category", headerAr: "القسم / التصنيف", width: 18 },
      { key: "sku", headerEn: "Variant SKU", headerAr: "رمز التخزين (SKU)", width: 18 },
      { key: "barcode", headerEn: "Barcode", headerAr: "الباركود", width: 18 },
      { key: "size", headerEn: "Size", headerAr: "المقاس", width: 12 },
      { key: "color", headerEn: "Color", headerAr: "اللون", width: 12 },
      { key: "fabric", headerEn: "Fabric", headerAr: "نوع القماش", width: 14 },
      {
        key: "selling_price",
        headerEn: "Price",
        headerAr: "سعر البيع",
        format: "currency",
        width: 14,
      },
      {
        key: "cost_price",
        headerEn: "Cost",
        headerAr: "سعر التكلفة",
        format: "currency",
        width: 14,
      },
      {
        key: "stock_main",
        headerEn: "Stock (Main)",
        headerAr: "المخزون الرئيسي",
        format: "number",
        width: 14,
      },
      {
        key: "stock_incubator",
        headerEn: "Stock (Consignment)",
        headerAr: "مخزون العُهد",
        format: "number",
        width: 16,
      },
      {
        key: "total_stock",
        headerEn: "Total Stock",
        headerAr: "إجمالي المخزون",
        format: "number",
        width: 14,
      },
      { key: "status", headerEn: "Status", headerAr: "الحالة", width: 12 },
      { key: "image_url", headerEn: "Image URL", headerAr: "رابط الصورة", width: 35 },
      { key: "description_ar", headerEn: "Description (AR)", headerAr: "الوصف (عربي)", width: 35 },
      {
        key: "description_en",
        headerEn: "Description (EN)",
        headerAr: "الوصف (إنجليزي)",
        width: 35,
      },
    ],
  },
  {
    id: "shopify_compatible",
    labelEn: "Shopify CSV Format",
    labelAr: "صيغة متجر شوبيفاي (Shopify CSV)",
    descriptionEn: "100% compliant with Shopify product import schema for easy cross-platform sync",
    descriptionAr: "متوافق 100% مع معايير استيراد المنتجات في Shopify لسهولة نقل وتزامن المنتجات",
    columns: [
      { key: "handle", headerEn: "Handle", headerAr: "Handle", width: 24 },
      { key: "title", headerEn: "Title", headerAr: "Title", width: 30 },
      { key: "body_html", headerEn: "Body (HTML)", headerAr: "Body (HTML)", width: 35 },
      { key: "vendor", headerEn: "Vendor", headerAr: "Vendor", width: 16 },
      { key: "type", headerEn: "Type", headerAr: "Type", width: 16 },
      { key: "tags", headerEn: "Tags", headerAr: "Tags", width: 20 },
      { key: "published", headerEn: "Published", headerAr: "Published", width: 12 },
      { key: "option1_name", headerEn: "Option1 Name", headerAr: "Option1 Name", width: 14 },
      { key: "option1_value", headerEn: "Option1 Value", headerAr: "Option1 Value", width: 14 },
      { key: "option2_name", headerEn: "Option2 Name", headerAr: "Option2 Name", width: 14 },
      { key: "option2_value", headerEn: "Option2 Value", headerAr: "Option2 Value", width: 14 },
      { key: "variant_sku", headerEn: "Variant SKU", headerAr: "Variant SKU", width: 18 },
      { key: "variant_grams", headerEn: "Variant Grams", headerAr: "Variant Grams", width: 14 },
      {
        key: "variant_inventory_tracker",
        headerEn: "Variant Inventory Tracker",
        headerAr: "Variant Inventory Tracker",
        width: 22,
      },
      {
        key: "variant_inventory_qty",
        headerEn: "Variant Inventory Qty",
        headerAr: "Variant Inventory Qty",
        format: "number",
        width: 20,
      },
      {
        key: "variant_price",
        headerEn: "Variant Price",
        headerAr: "Variant Price",
        format: "currency",
        width: 14,
      },
      {
        key: "variant_compare_at_price",
        headerEn: "Variant Compare At Price",
        headerAr: "Variant Compare At Price",
        width: 22,
      },
      {
        key: "variant_barcode",
        headerEn: "Variant Barcode",
        headerAr: "Variant Barcode",
        width: 18,
      },
      { key: "image_src", headerEn: "Image Src", headerAr: "Image Src", width: 35 },
      { key: "status", headerEn: "Status", headerAr: "Status", width: 12 },
    ],
  },
  {
    id: "salla_zid",
    labelEn: "Salla & Zid Compatible (GCC)",
    labelAr: "صيغة سلة وزد (منصات الخليج)",
    descriptionEn: "Localized format formatted for Saudi & GCC e-commerce platform importers",
    descriptionAr: "أعمدة مجهزة باللغة العربية للاستيراد المباشر في منصات سلة أو زد",
    columns: [
      { key: "name", headerEn: "Product Name", headerAr: "اسم المنتج", width: 28 },
      { key: "category", headerEn: "Category", headerAr: "القسم", width: 18 },
      {
        key: "selling_price",
        headerEn: "Selling Price",
        headerAr: "سعر البيع",
        format: "currency",
        width: 14,
      },
      {
        key: "cost_price",
        headerEn: "Cost Price",
        headerAr: "سعر التكلفة",
        format: "currency",
        width: 14,
      },
      { key: "sku", headerEn: "SKU", headerAr: "رمز المنتج (SKU)", width: 18 },
      { key: "barcode", headerEn: "Barcode", headerAr: "الباركود", width: 18 },
      {
        key: "total_stock",
        headerEn: "Quantity",
        headerAr: "الكمية المتاحة",
        format: "number",
        width: 14,
      },
      { key: "size", headerEn: "Size", headerAr: "المقاس", width: 12 },
      { key: "color", headerEn: "Color", headerAr: "اللون", width: 12 },
      { key: "image_url", headerEn: "Image Link", headerAr: "رابط الصورة", width: 35 },
      { key: "description", headerEn: "Description", headerAr: "الوصف", width: 35 },
    ],
  },
  {
    id: "inventory_valuation",
    labelEn: "Inventory Valuation & Audit",
    labelAr: "تدقيق المخزون وتقييم الأصول",
    descriptionEn:
      "Stock audit sheet with unit cost, retail price, and total monetary inventory valuation",
    descriptionAr:
      "كشف جرد مالي يوضح كميات المخزون وتكلفة الوحدة والقيمة المالية الإجمالية للبضاعة",
    columns: [
      { key: "sku", headerEn: "SKU", headerAr: "رمز التخزين (SKU)", width: 18 },
      { key: "barcode", headerEn: "Barcode", headerAr: "الباركود", width: 18 },
      { key: "name", headerEn: "Product Name", headerAr: "اسم المنتج", width: 28 },
      { key: "variant_details", headerEn: "Variant", headerAr: "المقاس واللون", width: 18 },
      { key: "category", headerEn: "Category", headerAr: "القسم", width: 16 },
      {
        key: "total_stock",
        headerEn: "Total On Hand",
        headerAr: "إجمالي الكمية",
        format: "number",
        width: 14,
      },
      {
        key: "cost_price",
        headerEn: "Unit Cost",
        headerAr: "تكلفة الوحدة",
        format: "currency",
        width: 14,
      },
      {
        key: "total_cost_value",
        headerEn: "Holding Asset Value",
        headerAr: "إجمالي قيمة التكلفة",
        format: "currency",
        width: 18,
      },
      {
        key: "selling_price",
        headerEn: "Retail Price",
        headerAr: "سعر البيع للوحدة",
        format: "currency",
        width: 16,
      },
      {
        key: "total_retail_value",
        headerEn: "Potential Revenue",
        headerAr: "إجمالي القيمة البيعية",
        format: "currency",
        width: 18,
      },
      { key: "stock_status", headerEn: "Stock Health", headerAr: "حالة المخزون", width: 14 },
    ],
  },
];

// -------------------------------------------------------------
// Presets: Customers & CRM
// -------------------------------------------------------------
export const CUSTOMER_PRESETS: ExportPreset[] = [
  {
    id: "crm_full",
    labelEn: "Full Customer Database",
    labelAr: "سجل العملاء الكامل (CRM)",
    descriptionEn:
      "Complete profiles with verified GCC phone numbers, emails, order counts, and lifetime spend",
    descriptionAr:
      "قاعدة البيانات الشاملة مع أرقام الهواتف المعيارية، البريد، عدد الطلبات، وإجمالي الإنفاق",
    columns: [
      { key: "name", headerEn: "Customer Name", headerAr: "اسم العميل", width: 24 },
      { key: "phone", headerEn: "Phone Number", headerAr: "رقم الهاتف", width: 18 },
      { key: "email", headerEn: "Email", headerAr: "البريد الإلكتروني", width: 26 },
      {
        key: "total_orders",
        headerEn: "Total Orders",
        headerAr: "عدد الطلبات",
        format: "number",
        width: 14,
      },
      {
        key: "total_spent",
        headerEn: "Lifetime Spend",
        headerAr: "إجمالي المشتريات",
        format: "currency",
        width: 16,
      },
      { key: "is_vip", headerEn: "VIP Status", headerAr: "تصنيف VIP", width: 12 },
      { key: "notes", headerEn: "Notes & Tags", headerAr: "الملاحظات والوسوم", width: 30 },
      { key: "created_at", headerEn: "Join Date", headerAr: "تاريخ التسجيل", width: 16 },
    ],
  },
  {
    id: "whatsapp_campaign",
    labelEn: "WhatsApp & SMS Broadcast List",
    labelAr: "قائمة رسائل الواتساب والتسويق المباشر",
    descriptionEn:
      "Sanitized clean phone numbers formatted with international GCC prefix for bulk campaigns",
    descriptionAr: "أرقام هواتف منقحة وجاهزة مع مفاتيح الدول (+973, +966) لإرسال الحملات الإعلانية",
    columns: [
      { key: "name", headerEn: "Name", headerAr: "الاسم", width: 24 },
      {
        key: "clean_phone",
        headerEn: "WhatsApp Number",
        headerAr: "رقم الواتساب المنقح",
        width: 20,
      },
      {
        key: "total_orders",
        headerEn: "Orders Count",
        headerAr: "عدد الطلبات",
        format: "number",
        width: 14,
      },
      {
        key: "total_spent",
        headerEn: "Total Spend",
        headerAr: "المشتريات",
        format: "currency",
        width: 16,
      },
      { key: "segment", headerEn: "Customer Segment", headerAr: "الشريحة", width: 16 },
    ],
  },
  {
    id: "vip_spenders",
    labelEn: "VIP & Top Spenders",
    labelAr: "كبار العملاء والأكثر إنفاقاً (VIP)",
    descriptionEn:
      "High-value loyal patrons filtered by purchase volume for loyalty rewards & private drops",
    descriptionAr: "أفضل العملاء من حيث المشتريات لمكافآتهم أو توجيه دعوات خاصة وتخفيضات حصرية لهم",
    columns: [
      { key: "name", headerEn: "Client Name", headerAr: "اسم العميل", width: 24 },
      { key: "phone", headerEn: "Contact Phone", headerAr: "رقم الاتصال", width: 18 },
      {
        key: "total_spent",
        headerEn: "Total Spend",
        headerAr: "إجمالي الإنفاق",
        format: "currency",
        width: 16,
      },
      {
        key: "total_orders",
        headerEn: "Orders",
        headerAr: "عدد الطلبات",
        format: "number",
        width: 12,
      },
      {
        key: "average_order_value",
        headerEn: "Avg Order Value",
        headerAr: "متوسط قيمة الطلب",
        format: "currency",
        width: 16,
      },
      { key: "notes", headerEn: "VIP Preferences", headerAr: "تفضيلات العميل", width: 30 },
    ],
  },
];

// -------------------------------------------------------------
// Presets: Orders & Sales
// -------------------------------------------------------------
export const ORDER_PRESETS: ExportPreset[] = [
  {
    id: "orders_summary",
    labelEn: "Orders Master Summary",
    labelAr: "الملخص الشامل للطلبات (صف لكل طلب)",
    descriptionEn:
      "One row per order with invoice number, customer info, delivery state, payment, and totals",
    descriptionAr:
      "سطر لكل طلب يوضح رقم الفاتورة والعميل وطريقة الدفع وحالة التوصيل والمبلغ الإجمالي",
    columns: [
      { key: "invoice_number", headerEn: "Invoice #", headerAr: "رقم الفاتورة", width: 14 },
      { key: "order_date", headerEn: "Order Date", headerAr: "تاريخ الطلب", width: 16 },
      { key: "customer_name", headerEn: "Customer", headerAr: "العميل", width: 22 },
      { key: "customer_phone", headerEn: "Phone", headerAr: "الهاتف", width: 18 },
      {
        key: "items_count",
        headerEn: "Items Qty",
        headerAr: "عدد القطع",
        format: "number",
        width: 12,
      },
      {
        key: "subtotal",
        headerEn: "Subtotal",
        headerAr: "المجموع الفرعي",
        format: "currency",
        width: 14,
      },
      {
        key: "discount_amount",
        headerEn: "Discount",
        headerAr: "الخصم",
        format: "currency",
        width: 14,
      },
      {
        key: "delivery_fee",
        headerEn: "Shipping",
        headerAr: "رسوم الشحن",
        format: "currency",
        width: 14,
      },
      {
        key: "tax_amount",
        headerEn: "VAT Amount",
        headerAr: "الضريبة",
        format: "currency",
        width: 14,
      },
      {
        key: "total",
        headerEn: "Grand Total",
        headerAr: "الإجمالي النهائي",
        format: "currency",
        width: 16,
      },
      { key: "payment_method", headerEn: "Payment Method", headerAr: "طريقة الدفع", width: 16 },
      { key: "payment_status", headerEn: "Payment Status", headerAr: "حالة الدفع", width: 14 },
      { key: "status", headerEn: "Fulfillment", headerAr: "حالة الطلب", width: 14 },
      { key: "channel", headerEn: "Sales Channel", headerAr: "قناة البيع", width: 16 },
    ],
  },
  {
    id: "orders_line_items",
    labelEn: "Detailed Line-Item Breakdown",
    labelAr: "تفصيل المنتجات المباعة (سطر لكل منتج)",
    descriptionEn:
      "Detailed audit row per individual item sold: SKU, product name, quantity, unit price, total",
    descriptionAr: "كشف تفصيلي يوضح كل قطعة بيعت مع رمز التخزين والسعر والكمية التابعة لكل فاتورة",
    columns: [
      { key: "invoice_number", headerEn: "Invoice #", headerAr: "رقم الفاتورة", width: 14 },
      { key: "order_date", headerEn: "Date", headerAr: "التاريخ", width: 16 },
      { key: "customer_name", headerEn: "Customer", headerAr: "العميل", width: 20 },
      { key: "product_name", headerEn: "Product Title", headerAr: "اسم المنتج", width: 28 },
      { key: "sku", headerEn: "SKU", headerAr: "رمز SKU", width: 18 },
      { key: "quantity", headerEn: "Quantity", headerAr: "الكمية", format: "number", width: 12 },
      {
        key: "unit_price",
        headerEn: "Unit Price",
        headerAr: "سعر الوحدة",
        format: "currency",
        width: 14,
      },
      {
        key: "item_total",
        headerEn: "Line Total",
        headerAr: "إجمالي السطر",
        format: "currency",
        width: 14,
      },
      { key: "payment_status", headerEn: "Payment", headerAr: "حالة الدفع", width: 14 },
      { key: "order_status", headerEn: "Status", headerAr: "حالة الطلب", width: 14 },
    ],
  },
  {
    id: "accounting_ledger",
    labelEn: "Accounting & Tax Ledger",
    labelAr: "السجل المالي والمحاسبي والضريبي",
    descriptionEn:
      "Clean revenue journal for accounting software (QuickBooks, Xero, Zoho Books, VAT returns)",
    descriptionAr: "كشف محاسبي معتمد لإقرارات القيمة المضافة ومطابقة الدفاتر المحاسبية بدقة",
    columns: [
      {
        key: "invoice_number",
        headerEn: "Tax Invoice #",
        headerAr: "رقم الفاتورة الضريبية",
        width: 16,
      },
      { key: "order_date", headerEn: "Invoice Date", headerAr: "تاريخ الفاتورة", width: 16 },
      { key: "customer_name", headerEn: "Billed To", headerAr: "العميل", width: 22 },
      {
        key: "gross_sales",
        headerEn: "Gross Sales",
        headerAr: "إجمالي المبيعات",
        format: "currency",
        width: 14,
      },
      {
        key: "discounts",
        headerEn: "Discounts Allowed",
        headerAr: "الخصومات",
        format: "currency",
        width: 14,
      },
      {
        key: "net_merchandise",
        headerEn: "Net Merchandise",
        headerAr: "صافي البضاعة",
        format: "currency",
        width: 14,
      },
      {
        key: "shipping_collected",
        headerEn: "Shipping Revenue",
        headerAr: "إيرادات الشحن",
        format: "currency",
        width: 14,
      },
      {
        key: "taxable_amount",
        headerEn: "Taxable Base",
        headerAr: "المبلغ الخاضع للضريبة",
        format: "currency",
        width: 16,
      },
      {
        key: "vat_collected",
        headerEn: "VAT Collected",
        headerAr: "ضريبة القيمة المضافة",
        format: "currency",
        width: 16,
      },
      {
        key: "total_collected",
        headerEn: "Total Amount Due",
        headerAr: "المبلغ المستلم الإجمالي",
        format: "currency",
        width: 18,
      },
      { key: "payment_method", headerEn: "Payment Method", headerAr: "طريقة الاستلام", width: 16 },
      { key: "payment_status", headerEn: "Payment Status", headerAr: "حالة السداد", width: 14 },
    ],
  },
];

// -------------------------------------------------------------
// Presets: Expenses
// -------------------------------------------------------------
export const EXPENSE_PRESETS: ExportPreset[] = [
  {
    id: "expenses_standard",
    labelEn: "Operating Overhead & Expenses",
    labelAr: "المصروفات والتكاليف التشغيلية",
    descriptionEn:
      "Operational overhead journal: rent, marketing, packaging, courier fees, and utilities",
    descriptionAr: "سجل كامل للمصروفات التشغيلية والتسويقية والتغليف لمراجعة صافي الأرباح",
    columns: [
      { key: "date", headerEn: "Date", headerAr: "التاريخ", width: 16 },
      { key: "category", headerEn: "Category", headerAr: "التصنيف", width: 18 },
      { key: "title", headerEn: "Expense Title", headerAr: "بيان المصروف", width: 28 },
      { key: "amount", headerEn: "Amount", headerAr: "المبلغ", format: "currency", width: 14 },
      { key: "payment_method", headerEn: "Payment Source", headerAr: "طريقة الدفع", width: 16 },
      { key: "notes", headerEn: "Receipt / Notes", headerAr: "الملاحظات والفاتورة", width: 30 },
    ],
  },
];

// -------------------------------------------------------------
// Helper: Record an Export Audit Run
// -------------------------------------------------------------
export async function logExportRun(params: {
  brandId: string;
  preset: string;
  entityType: ExportEntityType;
  fileFormat: ExportFormat;
  recordCount: number;
  fileName: string;
  fileSizeBytes?: number;
}) {
  const sessionId = crypto.randomUUID();
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes?.user?.id;
    if (userId) {
      await (supabase.from("export_runs" as never) as any).insert({
        brand_id: params.brandId,
        created_by: userId,
        session_id: sessionId,
        preset: params.preset,
        entity_type: params.entityType,
        file_format: params.fileFormat,
        record_count: params.recordCount,
        file_size_bytes: params.fileSizeBytes || 0,
        file_name: params.fileName,
      });
    }
  } catch (err) {
    console.warn("Could not log to export_runs table (falling back to local cache):", err);
  }

  // Dual-layer cache in localStorage for instant retrieval
  try {
    const storageKey = `boutq_export_runs_${params.brandId}`;
    const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
    const newEntry = {
      id: crypto.randomUUID(),
      brand_id: params.brandId,
      session_id: sessionId,
      preset: params.preset,
      entity_type: params.entityType,
      file_format: params.fileFormat,
      record_count: params.recordCount,
      file_name: params.fileName,
      created_at: new Date().toISOString(),
    };
    const updated = [newEntry, ...existing].slice(0, 50);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  } catch (localErr) {
    // Ignore storage quota errors
  }
}
