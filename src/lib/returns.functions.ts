import { supabase } from "@/integrations/supabase/client";
import type {
  BrandReturnPolicy,
  ReturnRequest,
  ReturnItem,
  ReturnStatus,
  ReturnItemCondition,
  CompensationMethod,
} from "./returns.types";

export interface CalculateReturnFinancialsParams {
  items: Array<{
    unitPrice: number;
    quantity: number;
  }>;
  order: {
    subtotal: number;
    discount: number;
    taxAmount?: number;
    taxRate?: number;
    total: number;
    advancePaid?: number;
  };
  policy?: Partial<BrandReturnPolicy>;
}

export interface ReturnFinancialsBreakdown {
  totalItemRefund: number;
  proRatedDiscount: number;
  taxRefund: number;
  returnFee: number;
  netRefundAmount: number;
}

/**
 * Pure mathematical calculation of return amounts with pro-rated discount and tax distribution
 */
export function calculateReturnFinancials({
  items,
  order,
  policy,
}: CalculateReturnFinancialsParams): ReturnFinancialsBreakdown {
  const totalItemRefund = items.reduce(
    (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0,
  );

  const subtotal = Number(order.subtotal || 0);
  const discount = Number(order.discount || 0);
  const discountRatio = subtotal > 0 && discount > 0 ? discount / subtotal : 0;

  const proRatedDiscount = totalItemRefund * discountRatio;

  let taxRate = 0;
  if (order.taxRate && order.taxRate > 0) {
    taxRate = order.taxRate / 100;
  } else if (subtotal > 0 && order.taxAmount && order.taxAmount > 0) {
    taxRate = order.taxAmount / subtotal;
  }

  const taxableItemTotal = Math.max(0, totalItemRefund - proRatedDiscount);
  const taxRefund = taxableItemTotal * taxRate;

  let returnFee = 0;
  if (policy?.customer_shipping_fee_borne_by === "customer" && policy.return_shipping_fee) {
    returnFee = Number(policy.return_shipping_fee);
  }

  const netRefundAmount = Math.max(0, taxableItemTotal + taxRefund - returnFee);

  return {
    totalItemRefund: Number(totalItemRefund.toFixed(3)),
    proRatedDiscount: Number(proRatedDiscount.toFixed(3)),
    taxRefund: Number(taxRefund.toFixed(3)),
    returnFee: Number(returnFee.toFixed(3)),
    netRefundAmount: Number(netRefundAmount.toFixed(3)),
  };
}

/**
 * Check if an order is eligible for return based on policy
 */
export function checkOrderReturnEligibility(
  order: {
    created_at: string;
    status: string;
    discount?: number;
  },
  policy?: BrandReturnPolicy | null,
): { eligible: boolean; reason?: string; daysSinceOrder?: number } {
  if (!["confirmed", "paid", "shipped", "delivered", "completed"].includes(order.status)) {
    return {
      eligible: false,
      reason: "الطلب غير مكتمل أو ملغي ولا يمكن تقديم طلب إرجاع له",
    };
  }

  const orderDate = new Date(order.created_at);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));

  if (policy) {
    if (diffDays > policy.return_window_days) {
      return {
        eligible: false,
        daysSinceOrder: diffDays,
        reason: `تجاوز الطلب فترة الإرجاع المسموحة (${policy.return_window_days} يوماً)`,
      };
    }

    if (!policy.allow_discounted_items && (order.discount || 0) > 0) {
      return {
        eligible: false,
        daysSinceOrder: diffDays,
        reason: "المنتجات المخفضة غير مؤهلة للإرجاع وفقاً لسياسة المتجر",
      };
    }
  }

  return { eligible: true, daysSinceOrder: diffDays };
}

/**
 * Calculates exchange replacement price delta
 */
export function calculateExchangePriceDifference(
  returnedTotal: number,
  replacementTotal: number,
): {
  priceDifference: number;
  direction: "customer_pays" | "brand_refunds" | "even";
  labelAr: string;
  labelEn: string;
} {
  const diff = Number((replacementTotal - returnedTotal).toFixed(3));

  if (diff > 0) {
    return {
      priceDifference: diff,
      direction: "customer_pays",
      labelAr: "فرق السعر مطلوب من العميل",
      labelEn: "Price Difference (Customer Pays)",
    };
  } else if (diff < 0) {
    return {
      priceDifference: Math.abs(diff),
      direction: "brand_refunds",
      labelAr: "فرق السعر يُرد للعميل",
      labelEn: "Price Difference (Brand Refunds)",
    };
  }

  return {
    priceDifference: 0,
    direction: "even",
    labelAr: "استبدال متطابق القيمة بدون فرق",
    labelEn: "Even Exchange (No Price Difference)",
  };
}

/**
 * Standard return tracking number generator
 */
export function generateReturnNumber(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "RET-";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Create a new return request via RPC
 */
export async function createReturnRequest(params: {
  brandId: string;
  orderId: string;
  requestedBy: "customer" | "admin";
  reason: string;
  reasonDetails?: string;
  preferredCompensation: CompensationMethod;
  items: Array<{
    order_item_id: string;
    quantity: number;
    action_type?: "return" | "exchange";
    replacement_variant_id?: string;
    item_reason?: string;
    item_images?: string[];
  }>;
  pickupAddress?: any;
  images?: string[];
}): Promise<{ success: boolean; returnId?: string; returnNumber?: string; netRefund?: number; error?: string }> {
  try {
    const { data, error } = await (supabase.rpc as any)("rpc_create_return_request", {
      p_brand_id: params.brandId,
      p_order_id: params.orderId,
      p_requested_by: params.requestedBy,
      p_reason: params.reason,
      p_reason_details: params.reasonDetails || null,
      p_preferred_compensation: params.preferredCompensation,
      p_items: params.items,
      p_pickup_address: params.pickupAddress || null,
      p_images: params.images || [],
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || data?.details || "Failed to create return request" };
    }

    return {
      success: true,
      returnId: data.return_id,
      returnNumber: data.return_number,
      netRefund: data.net_refund,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create return request" };
  }
}

/**
 * Inspect a return item and restock if sellable
 */
export async function inspectAndRestockReturnItem(params: {
  brandId: string;
  returnItemId: string;
  condition: ReturnItemCondition;
  restockBranchId?: string;
  inspectionNotes?: string;
}): Promise<{ success: boolean; condition?: string; restocked?: boolean; error?: string }> {
  try {
    const { data, error } = await (supabase.rpc as any)("rpc_inspect_and_restock_return_item", {
      p_brand_id: params.brandId,
      p_return_item_id: params.returnItemId,
      p_condition: params.condition,
      p_restock_branch_id: params.restockBranchId || null,
      p_inspection_notes: params.inspectionNotes || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || "Failed to inspect item" };
    }

    return {
      success: true,
      condition: data.condition,
      restocked: data.restocked,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to inspect item" };
  }
}

/**
 * Process a financial refund
 */
export async function processReturnRefund(params: {
  brandId: string;
  returnId: string;
  refundMethod: string;
  refundAmount: number;
  refundReference?: string;
  notes?: string;
}): Promise<{ success: boolean; returnId?: string; refundAmount?: number; error?: string }> {
  try {
    const { data, error } = await (supabase.rpc as any)("rpc_process_return_refund", {
      p_brand_id: params.brandId,
      p_return_id: params.returnId,
      p_refund_method: params.refundMethod,
      p_refund_amount: params.refundAmount,
      p_refund_reference: params.refundReference || null,
      p_notes: params.notes || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || data?.details || "Failed to process refund" };
    }

    return {
      success: true,
      returnId: data.return_id,
      refundAmount: data.refund_amount,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to process refund" };
  }
}

/**
 * Create a replacement exchange order
 */
export async function createExchangeReplacementOrder(params: {
  brandId: string;
  returnId: string;
  replacementItems: Array<{
    variant_id: string;
    quantity: number;
    unit_price: number;
    description?: string;
  }>;
}): Promise<{
  success: boolean;
  replacementOrderId?: string;
  invoiceNumber?: number;
  priceDifference?: number;
  differenceDirection?: string;
  error?: string;
}> {
  try {
    const { data, error } = await (supabase.rpc as any)("rpc_create_exchange_replacement_order", {
      p_brand_id: params.brandId,
      p_return_id: params.returnId,
      p_replacement_items: params.replacementItems,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || "Failed to create replacement order" };
    }

    return {
      success: true,
      replacementOrderId: data.replacement_order_id,
      invoiceNumber: data.invoice_number,
      priceDifference: data.price_difference,
      differenceDirection: data.difference_direction,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create replacement order" };
  }
}

/**
 * Update Return Request status (Approve, Reject, Receive, Complete, Cancel)
 */
export async function updateReturnRequestStatus(
  brandId: string,
  returnId: string,
  newStatus: ReturnStatus,
  options?: {
    adminNotes?: string;
    rejectionReason?: string;
    trackingNumber?: string;
    courierName?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const updatePayload: Record<string, any> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (options?.adminNotes !== undefined) updatePayload.admin_notes = options.adminNotes;
    if (options?.rejectionReason !== undefined) updatePayload.rejection_reason = options.rejectionReason;
    if (options?.trackingNumber !== undefined) updatePayload.tracking_number = options.trackingNumber;
    if (options?.courierName !== undefined) updatePayload.courier_name = options.courierName;

    if (newStatus === "approved") {
      updatePayload.reviewed_at = new Date().toISOString();
    } else if (newStatus === "received") {
      updatePayload.received_at = new Date().toISOString();
    } else if (newStatus === "completed") {
      updatePayload.completed_at = new Date().toISOString();
    }

    const { error } = await (supabase as any)
      .from("return_requests")
      .update(updatePayload)
      .eq("id", returnId)
      .eq("brand_id", brandId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update return status" };
  }
}

/**
 * Get customer store credit balance
 */
export async function getCustomerStoreCreditBalance(
  brandId: string,
  customerId: string,
): Promise<number> {
  try {
    const { data, error } = await (supabase as any)
      .from("store_credits")
      .select("amount")
      .eq("brand_id", brandId)
      .eq("customer_id", customerId);

    if (error || !data) return 0;

    const total = data.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    return Number(total.toFixed(3));
  } catch {
    return 0;
  }
}
