export type ApiScope =
  | "products:read"
  | "products:write"
  | "inventory:read"
  | "inventory:write"
  | "orders:read"
  | "orders:write"
  | "customers:read"
  | "customers:write"
  | "returns:read"
  | "returns:write"
  | "loyalty:read"
  | "loyalty:write"
  | "categories:read"
  | "discounts:read"
  | "discounts:write";

export const ALL_API_SCOPES: { scope: ApiScope; labelEn: string; labelAr: string; category: string }[] = [
  { scope: "products:read", labelEn: "Read Products & Variants", labelAr: "قراءة المنتجات والخيارات", category: "Catalog" },
  { scope: "products:write", labelEn: "Create & Modify Products", labelAr: "إنشاء وتعديل المنتجات", category: "Catalog" },
  { scope: "inventory:read", labelEn: "Read Inventory Levels", labelAr: "قراءة أرصدة المخزون", category: "Catalog" },
  { scope: "inventory:write", labelEn: "Adjust Inventory", labelAr: "تعديل كميات المخزون", category: "Catalog" },
  { scope: "categories:read", labelEn: "Read Categories", labelAr: "قراءة الأقسام والتصنيفات", category: "Catalog" },
  { scope: "orders:read", labelEn: "Read Orders", labelAr: "قراءة الطلبات", category: "Orders" },
  { scope: "orders:write", labelEn: "Create & Update Orders", labelAr: "إنشاء وتحديث الطلبات", category: "Orders" },
  { scope: "customers:read", labelEn: "Read Customers", labelAr: "قراءة بيانات العملاء", category: "Customers" },
  { scope: "customers:write", labelEn: "Create & Update Customers", labelAr: "إنشاء وتحديث بيانات العملاء", category: "Customers" },
  { scope: "returns:read", labelEn: "Read Returns & Exchanges", labelAr: "قراءة طلبات الإرجاع والاستبدال", category: "Orders" },
  { scope: "returns:write", labelEn: "Create & Manage Returns", labelAr: "إنشاء وإدارة المرتجعات", category: "Orders" },
  { scope: "loyalty:read", labelEn: "Read Loyalty Balances & Tiers", labelAr: "قراءة أرصدة ومستويات الولاء", category: "Growth" },
  { scope: "loyalty:write", labelEn: "Adjust Loyalty Points", labelAr: "منح وسحب نقاط الولاء", category: "Growth" },
  { scope: "discounts:read", labelEn: "Read Discount Coupons", labelAr: "قراءة كوبونات الخصم", category: "Growth" },
  { scope: "discounts:write", labelEn: "Create & Modify Discounts", labelAr: "إنشاء وتعديل كوبونات الخصم", category: "Growth" },
];

export type WebhookEventName =
  | "order.created"
  | "order.updated"
  | "order.completed"
  | "order.cancelled"
  | "inventory.updated"
  | "return.created"
  | "return.completed"
  | "loyalty.balance_changed";

export const ALL_WEBHOOK_EVENTS: { event: WebhookEventName; labelEn: string; labelAr: string; description: string }[] = [
  { event: "order.created", labelEn: "Order Created", labelAr: "تم إنشاء طلب جديد", description: "Fires when a new order is placed by customer or admin" },
  { event: "order.updated", labelEn: "Order Updated", labelAr: "تم تعديل الطلب", description: "Fires when order details or shipping info is modified" },
  { event: "order.completed", labelEn: "Order Completed", labelAr: "اكتمل تسليم الطلب", description: "Fires when order status becomes delivered or completed" },
  { event: "order.cancelled", labelEn: "Order Cancelled", labelAr: "تم إلغاء الطلب", description: "Fires when order is cancelled or payment failed" },
  { event: "inventory.updated", labelEn: "Inventory Updated", labelAr: "تحديث المخزون", description: "Fires when stock levels change" },
  { event: "return.created", labelEn: "Return Ticket Created", labelAr: "تم فتح طلب إرجاع", description: "Fires when a return/exchange request is opened" },
  { event: "return.completed", labelEn: "Return Completed", labelAr: "اكتمل الإرجاع", description: "Fires when return items are received & refunded" },
  { event: "loyalty.balance_changed", labelEn: "Loyalty Balance Changed", labelAr: "تغير رصيد النقاط", description: "Fires when points are earned, redeemed, or refunded" },
];

export interface BrandApiKey {
  id: string;
  brand_id: string;
  name: string;
  key_prefix: string;
  key_hint: string;
  scopes: ApiScope[];
  rate_limit_per_minute: number;
  is_active: boolean;
  expires_at?: string | null;
  last_used_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookEndpoint {
  id: string;
  brand_id: string;
  url: string;
  description?: string | null;
  secret: string;
  subscribed_events: WebhookEventName[];
  is_active: boolean;
  consecutive_failures: number;
  disabled_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookDeliveryLog {
  id: string;
  brand_id: string;
  endpoint_id: string;
  event_id: string;
  event_name: WebhookEventName;
  payload: Record<string, any>;
  request_headers: Record<string, string>;
  response_status?: number | null;
  response_body?: string | null;
  duration_ms?: number | null;
  attempt: number;
  status: "pending" | "delivered" | "failed" | "retrying";
  next_retry_at?: string | null;
  created_at: string;
}

export interface ApiRequestLog {
  id: string;
  brand_id: string;
  api_key_id?: string | null;
  request_id: string;
  idempotency_key?: string | null;
  method: string;
  path: string;
  status_code: number;
  ip_address?: string | null;
  user_agent?: string | null;
  duration_ms: number;
  created_at: string;
}

export type ConnectorType =
  | "shopify"
  | "woocommerce"
  | "salla"
  | "zid"
  | "zapier"
  | "make"
  | "custom_pos"
  | "custom_accounting";

export interface BrandConnector {
  id: string;
  brand_id: string;
  connector_type: ConnectorType;
  status: "connected" | "disconnected" | "syncing" | "error" | "paused";
  auth_type: "api_key" | "oauth2" | "webhook_secret" | "custom";
  credentials_encrypted: Record<string, any>;
  sync_direction: "inbound_only" | "outbound_only" | "two_way";
  field_mappings: Record<string, string>;
  sync_frequency_minutes: number;
  last_sync_at?: string | null;
  last_sync_status?: "success" | "failed" | "partial" | null;
  last_error_message?: string | null;
  total_synced_records: number;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ConnectorSyncLog {
  id: string;
  brand_id: string;
  connector_id: string;
  sync_job_id: string;
  entity_type: "products" | "orders" | "inventory" | "customers";
  direction: "inbound" | "outbound";
  records_processed: number;
  records_succeeded: number;
  records_failed: number;
  error_details?: Record<string, any> | null;
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at?: string | null;
}

export interface ApiResponseEnvelope<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    has_more?: boolean;
    request_id: string;
  };
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    request_id: string;
  };
}
