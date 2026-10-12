import { productSampleCsv } from "@/features/import-export/lib/store-columns";

/** What the import page can bring in. */
export type ImportType = "products" | "customers" | "orders";

export interface ImportRunRecord {
  id: string;
  brand_id: string;
  session_id: string;
  source: string;
  entity_type: string;
  status: "pending" | "processing" | "completed" | "failed" | "partial";
  total_count: number;
  success_count: number;
  skipped_count: number;
  failed_count: number;
  created_at: string;
}

export const SAMPLE_CSV_TEMPLATES: Record<ImportType, { filename: string; content: string }> = {
  products: { filename: "boutq_products_template.csv", content: productSampleCsv(true) },
  customers: {
    filename: "boutq_customers_template.csv",
    content: `name,phone,email,notes
سارة العبدالله,97339000001,sara@example.com,عميلة مميزة VIP
فاطمة المحمود,97339000002,fatima@example.com,تفضل التواصل عبر الواتساب
نورة الدوسري,966500000001,noura@example.com,طلب مسبق لمجموعة العيد`,
  },
  orders: {
    filename: "boutq_orders_template.csv",
    content: `order_number,created_at,customer_name,customer_phone,customer_email,total,item_name,quantity,price
ORD-1001,2026-02-15T12:00:00Z,سارة العبدالله,97339000001,sara@example.com,45.000,قميص قطني مطرز,1,45.000
ORD-1002,2026-02-16T14:30:00Z,فاطمة المحمود,97339000002,fatima@example.com,65.000,فستان سهرة دانتيل,1,65.000`,
  },
};

/**
 * The sample file of a kind of import. The products one follows the store: it has stock columns
 * only when the store keeps stock.
 */
export function sampleTemplate(type: ImportType, stock = true): { filename: string; text: string } {
  const { filename, content } = SAMPLE_CSV_TEMPLATES[type];
  return { filename, text: type === "products" ? productSampleCsv(stock) : content };
}

export function downloadTemplate(type: ImportType, stock = true) {
  const { filename, text } = sampleTemplate(type, stock);
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
