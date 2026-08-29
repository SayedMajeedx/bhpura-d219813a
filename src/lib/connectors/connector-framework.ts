import type { ConnectorType } from "../public-api/public-api.types";

export interface ConnectorMetadata {
  type: ConnectorType;
  nameEn: string;
  nameAr: string;
  category: "ecommerce" | "automation" | "pos" | "accounting" | "shipping";
  descriptionEn: string;
  descriptionAr: string;
  iconName: string;
  supportsInbound: boolean;
  supportsOutbound: boolean;
  defaultFieldMappings: Record<string, string>;
  authFields: {
    key: string;
    labelEn: string;
    labelAr: string;
    type: "text" | "password" | "url";
    required: boolean;
    placeholder?: string;
  }[];
}

export const AVAILABLE_CONNECTORS: ConnectorMetadata[] = [
  {
    type: "shopify",
    nameEn: "Shopify",
    nameAr: "شوبيفاي",
    category: "ecommerce",
    descriptionEn: "Bi-directional sync of catalog, stock levels, and order fulfillment with Shopify stores.",
    descriptionAr: "مزامنة المنتجات والمخزون وحالات الطلبات باتجاهين مع متجر شوبيفاي الخاص بك.",
    iconName: "ShoppingBag",
    supportsInbound: true,
    supportsOutbound: true,
    defaultFieldMappings: {
      "title": "title",
      "price": "variants.0.price",
      "sku": "variants.0.sku",
      "inventory_quantity": "variants.0.inventory_quantity",
    },
    authFields: [
      { key: "store_domain", labelEn: "Store Domain (.myshopify.com)", labelAr: "نطاق المتجر", type: "url", required: true, placeholder: "your-store.myshopify.com" },
      { key: "access_token", labelEn: "Admin API Access Token", labelAr: "رمز وصول Admin API (shpat_...)", type: "password", required: true },
    ],
  },
  {
    type: "salla",
    nameEn: "Salla",
    nameAr: "منصة سلة",
    category: "ecommerce",
    descriptionEn: "Sync orders, inventory, and customer databases with Salla merchant portal.",
    descriptionAr: "مزامنة تلقائية للطلبات والمخزون والعملاء مع متجرك في منصة سلة.",
    iconName: "Store",
    supportsInbound: true,
    supportsOutbound: true,
    defaultFieldMappings: {
      "name": "name",
      "price": "price.amount",
      "sku": "sku",
      "quantity": "quantity",
    },
    authFields: [
      { key: "merchant_id", labelEn: "Merchant ID", labelAr: "معرّف التاجر", type: "text", required: true },
      { key: "api_key", labelEn: "Salla API Key", labelAr: "مفتاح الربط من سلة", type: "password", required: true },
    ],
  },
  {
    type: "zid",
    nameEn: "Zid",
    nameAr: "منصة زد",
    category: "ecommerce",
    descriptionEn: "Connect and sync multi-channel retail operations with Zid e-commerce platform.",
    descriptionAr: "ربط عمليات البيع بالتجزئة وتحديث المخزون والطلبات مع منصة زد.",
    iconName: "Layers",
    supportsInbound: true,
    supportsOutbound: true,
    defaultFieldMappings: {
      "name": "name",
      "price": "price",
      "sku": "sku",
      "stock": "quantity",
    },
    authFields: [
      { key: "manager_token", labelEn: "Manager Token", labelAr: "رمز المدير (Manager Token)", type: "password", required: true },
      { key: "store_id", labelEn: "Store ID", labelAr: "معرّف المتجر", type: "text", required: true },
    ],
  },
  {
    type: "woocommerce",
    nameEn: "WooCommerce",
    nameAr: "ووكومرس",
    category: "ecommerce",
    descriptionEn: "Synchronize WordPress / WooCommerce store catalogs and order webhooks.",
    descriptionAr: "مزامنة كتالوج المنتجات وطلبات ووكومرس على ووردبريس.",
    iconName: "Globe",
    supportsInbound: true,
    supportsOutbound: true,
    defaultFieldMappings: {
      "name": "name",
      "regular_price": "price",
      "sku": "sku",
      "stock_quantity": "quantity",
    },
    authFields: [
      { key: "site_url", labelEn: "WordPress URL", labelAr: "رابط الموقع", type: "url", required: true, placeholder: "https://example.com" },
      { key: "consumer_key", labelEn: "Consumer Key (ck_...)", labelAr: "مفتاح العميل", type: "text", required: true },
      { key: "consumer_secret", labelEn: "Consumer Secret (cs_...)", labelAr: "السر الخاص", type: "password", required: true },
    ],
  },
  {
    type: "zapier",
    nameEn: "Zapier & Make",
    nameAr: "زابير و Make",
    category: "automation",
    descriptionEn: "Connect Boutq OS to 5,000+ apps via automated workflows, triggers, and actions.",
    descriptionAr: "ربط بوتك بأكثر من 5000 تطبيق لأتمتة سير العمل والمراسلات والمحاسبة.",
    iconName: "Zap",
    supportsInbound: true,
    supportsOutbound: true,
    defaultFieldMappings: {
      "order_id": "id",
      "customer_email": "email",
      "total_amount": "total",
    },
    authFields: [
      { key: "webhook_url", labelEn: "Zapier / Make Catch Webhook URL", labelAr: "رابط Webhook من Zapier أو Make", type: "url", required: true, placeholder: "https://hooks.zapier.com/hooks/catch/..." },
    ],
  },
  {
    type: "custom_accounting",
    nameEn: "Custom Accounting / ERP",
    nameAr: "أنظمة المحاسبة و ERP",
    category: "accounting",
    descriptionEn: "Export sales invoices and inventory valuation entries into your ERP software (QuickBooks, Xero, Odoo).",
    descriptionAr: "تصدير فواتير المبيعات وتقييم المخزون لأنظمة المحاسبة (أودو، زيرو، كويك بوكس).",
    iconName: "FileSpreadsheet",
    supportsInbound: false,
    supportsOutbound: true,
    defaultFieldMappings: {
      "invoice_number": "order_number",
      "net_total": "subtotal",
      "tax_total": "tax",
    },
    authFields: [
      { key: "erp_endpoint", labelEn: "ERP API Endpoint", labelAr: "رابط واجهة ERP", type: "url", required: true },
      { key: "api_token", labelEn: "API Bearer Token", labelAr: "رمز المصادقة", type: "password", required: true },
    ],
  },
  {
    type: "custom_pos",
    nameEn: "Retail POS Terminal",
    nameAr: "نقاط البيع في المعرض (POS)",
    category: "pos",
    descriptionEn: "Real-time sync between physical retail store cash registers and Boutq OS warehouse inventory.",
    descriptionAr: "مزامنة لحظية بين كاشير المحل ومعرضك ومخزن المتجر الإلكتروني.",
    iconName: "Monitor",
    supportsInbound: true,
    supportsOutbound: true,
    defaultFieldMappings: {
      "barcode": "sku",
      "sold_qty": "quantity",
    },
    authFields: [
      { key: "pos_station_id", labelEn: "POS Station ID", labelAr: "معرّف نقطة البيع", type: "text", required: true },
      { key: "terminal_secret", labelEn: "Terminal Secret", labelAr: "رمز الأمان للكاشير", type: "password", required: true },
    ],
  },
];

/**
 * Transforms an object record according to a dictionary of field mappings
 */
export function transformRecordWithMapping(
  sourceRecord: Record<string, any>,
  mappingRules: Record<string, string>,
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [targetKey, sourcePath] of Object.entries(mappingRules)) {
    if (!sourcePath) continue;
    const value = getNestedValue(sourceRecord, sourcePath);
    if (value !== undefined) {
      result[targetKey] = value;
    }
  }

  return result;
}

function getNestedValue(obj: any, path: string): any {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}
