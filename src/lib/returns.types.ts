export type ReturnStatus =
  | "new"
  | "under_review"
  | "approved"
  | "rejected"
  | "awaiting_shipment"
  | "received"
  | "under_inspection"
  | "refunded"
  | "exchanged"
  | "completed"
  | "cancelled";

export type ReturnItemCondition =
  | "pending"
  | "sellable"
  | "damaged"
  | "needs_inspection"
  | "unsellable"
  | "returned_to_vendor";

export type CompensationMethod = "refund_original" | "store_credit" | "exchange";

export type ReturnReasonCode =
  | "defective"
  | "wrong_item"
  | "size_fit"
  | "not_as_described"
  | "changed_mind"
  | "damaged_in_transit"
  | "other";

export interface BrandReturnPolicy {
  id: string;
  brand_id: string;
  return_window_days: number;
  allow_partial_returns: boolean;
  allow_discounted_items: boolean;
  excluded_category_ids: string[];
  excluded_product_ids: string[];
  return_shipping_fee: number;
  customer_shipping_fee_borne_by: "customer" | "brand";
  allowed_compensation_methods: CompensationMethod[];
  require_images: boolean;
  auto_approve_policy: boolean;
  policy_terms_ar: string | null;
  policy_terms_en: string | null;
  notify_on_status_change: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReturnItem {
  id: string;
  brand_id: string;
  return_id: string;
  order_item_id: string;
  product_id: string | null;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  reason: string | null;
  item_images: string[];
  action_type: "return" | "exchange";
  replacement_product_id: string | null;
  replacement_variant_id: string | null;
  replacement_unit_price: number | null;
  condition: ReturnItemCondition;
  restocked: boolean;
  restocked_quantity: number;
  restocked_at: string | null;
  restocked_to_branch_id: string | null;
  restocked_by: string | null;
  inspection_notes: string | null;
  created_at: string;
  // Joins
  product?: {
    id: string;
    name_ar: string | null;
    name_en: string | null;
    image_url: string | null;
  } | null;
  variant?: {
    id: string;
    variant_name: string | null;
    sku: string | null;
    stock_quantity: number;
  } | null;
  replacement_variant?: {
    id: string;
    variant_name: string | null;
    sku: string | null;
    selling_price: number;
    stock_quantity: number;
  } | null;
}

export interface ReturnRequest {
  id: string;
  brand_id: string;
  order_id: string;
  customer_id: string | null;
  return_number: string;
  status: ReturnStatus;
  type: "return" | "exchange" | "both";
  requested_by: "customer" | "admin";
  requested_by_user_id: string | null;
  reason: string;
  reason_details: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  images: string[];
  pickup_address: any | null;
  tracking_number: string | null;
  courier_name: string | null;
  
  preferred_compensation: CompensationMethod;
  total_item_refund: number;
  pro_rated_discount_deduction: number;
  tax_refund: number;
  return_fee: number;
  net_refund_amount: number;
  refund_method: string | null;
  refund_status: "pending" | "processed" | "failed";
  refund_processed_at: string | null;
  refund_reference: string | null;
  
  replacement_order_id: string | null;
  exchange_price_difference: number;
  exchange_difference_direction: "customer_pays" | "brand_refunds" | "even" | null;
  exchange_difference_status: string | null;
  
  reviewed_at: string | null;
  reviewed_by: string | null;
  received_at: string | null;
  received_by: string | null;
  inspected_at: string | null;
  inspected_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  
  // Joins
  order?: {
    id: string;
    invoice_number: number;
    total: number;
    subtotal: number;
    discount: number;
    tax_amount: number;
    shipping: number;
    advance_paid: number;
    payment_status: string;
    status: string;
    created_at: string;
    customer_name_snapshot: string | null;
    customer_phone_snapshot: string | null;
    customer_email_snapshot: string | null;
    delivery_address_snapshot: string | null;
  } | null;
  customer?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  items?: ReturnItem[];
}

export interface StoreCredit {
  id: string;
  brand_id: string;
  customer_id: string;
  return_id: string | null;
  order_id: string | null;
  amount: number;
  type: "return_credit" | "manual_adjustment" | "order_redemption" | "refund_reversal";
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface InventoryMovementLog {
  id: string;
  brand_id: string;
  variant_id: string;
  branch_id: string | null;
  return_id: string | null;
  return_item_id: string | null;
  quantity_before: number;
  quantity_changed: number;
  quantity_after: number;
  movement_type: "return_restock" | "return_damaged_writeoff" | "exchange_dispatch" | "manual_adjustment";
  item_condition: ReturnItemCondition;
  handled_by: string | null;
  reference_code: string;
  created_at: string;
  variant?: {
    id: string;
    variant_name: string | null;
    sku: string | null;
    product?: {
      name_en: string | null;
      name_ar: string | null;
    } | null;
  } | null;
}

export const RETURN_STATUS_CONFIG: Record<
  ReturnStatus,
  {
    labelAr: string;
    labelEn: string;
    badgeClass: string;
    stepIndex: number;
  }
> = {
  new: {
    labelAr: "جديد",
    labelEn: "New",
    badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    stepIndex: 0,
  },
  under_review: {
    labelAr: "قيد المراجعة",
    labelEn: "Under Review",
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    stepIndex: 1,
  },
  approved: {
    labelAr: "تمت الموافقة",
    labelEn: "Approved",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    stepIndex: 2,
  },
  awaiting_shipment: {
    labelAr: "بانتظار الاستلام",
    labelEn: "Awaiting Receipt",
    badgeClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    stepIndex: 3,
  },
  received: {
    labelAr: "تم الاستلام",
    labelEn: "Received",
    badgeClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    stepIndex: 4,
  },
  under_inspection: {
    labelAr: "قيد الفحص",
    labelEn: "Inspecting",
    badgeClass: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
    stepIndex: 5,
  },
  refunded: {
    labelAr: "تم الاسترداد",
    labelEn: "Refunded",
    badgeClass: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-600/30",
    stepIndex: 6,
  },
  exchanged: {
    labelAr: "تم الاستبدال",
    labelEn: "Exchanged",
    badgeClass: "bg-teal-600/15 text-teal-700 dark:text-teal-300 border-teal-600/30",
    stepIndex: 6,
  },
  completed: {
    labelAr: "مكتمل",
    labelEn: "Completed",
    badgeClass: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
    stepIndex: 7,
  },
  rejected: {
    labelAr: "مرفوض",
    labelEn: "Rejected",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    stepIndex: -1,
  },
  cancelled: {
    labelAr: "ملغي",
    labelEn: "Cancelled",
    badgeClass: "bg-muted text-muted-foreground border-border",
    stepIndex: -1,
  },
};

export const RETURN_CONDITION_CONFIG: Record<
  ReturnItemCondition,
  {
    labelAr: string;
    labelEn: string;
    descriptionAr: string;
    descriptionEn: string;
    badgeClass: string;
    isRestockable: boolean;
  }
> = {
  pending: {
    labelAr: "بانتظار الفحص",
    labelEn: "Pending Inspection",
    descriptionAr: "القطعة لم يتم فحص جودتها بعد",
    descriptionEn: "Item has not been quality inspected yet",
    badgeClass: "bg-muted text-muted-foreground border-border",
    isRestockable: false,
  },
  sellable: {
    labelAr: "صالحة للبيع",
    labelEn: "Restockable / Sellable",
    descriptionAr: "القطعة بحالة المصنع ومؤهلة لإعادة المخزون فوراً",
    descriptionEn: "Pristine condition, immediately eligible for restock",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    isRestockable: true,
  },
  damaged: {
    labelAr: "تالفة",
    labelEn: "Damaged",
    descriptionAr: "القطعة بها تلف ولا تصلح للبيع (يتم شطبها من المخزون)",
    descriptionEn: "Item is damaged and cannot be sold (written off)",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    isRestockable: false,
  },
  needs_inspection: {
    labelAr: "تحتاج فحصاً فنياً",
    labelEn: "Needs Tech Inspection",
    descriptionAr: "تحتاج إلى فحص متخصص أو تنظيف قبل اتخاذ القرار",
    descriptionEn: "Requires technical testing or cleaning",
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    isRestockable: false,
  },
  unsellable: {
    labelAr: "غير قابلة للبيع",
    labelEn: "Unsellable",
    descriptionAr: "مستعملة أو منتهية الصلاحية ولا يمكن إعادتها للمخزون",
    descriptionEn: "Used or expired, cannot be restocked",
    badgeClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    isRestockable: false,
  },
  returned_to_vendor: {
    labelAr: "مرتجعة للمورد",
    labelEn: "Return to Vendor (RTV)",
    descriptionAr: "عيب مصنعي وسيتم إرجاعها إلى المورد/المصنع",
    descriptionEn: "Manufacturing defect, to be returned to vendor",
    badgeClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    isRestockable: false,
  },
};

export const RETURN_REASONS: Record<
  ReturnReasonCode,
  { labelAr: string; labelEn: string }
> = {
  defective: { labelAr: "منتج معيب / لا يعمل", labelEn: "Defective / Not working" },
  wrong_item: { labelAr: "استلمت منتجاً خاطئاً", labelEn: "Received wrong item" },
  size_fit: { labelAr: "المقاس أو الحجم غير مناسب", labelEn: "Size or fit issue" },
  not_as_described: { labelAr: "المنتج يختلف عن الوصف والصور", labelEn: "Not as described" },
  damaged_in_transit: { labelAr: "تلف أثناء الشحن والتوصيل", labelEn: "Damaged in transit" },
  changed_mind: { labelAr: "تغيير الرغبة", labelEn: "Changed mind" },
  other: { labelAr: "سبب آخر", labelEn: "Other reason" },
};
