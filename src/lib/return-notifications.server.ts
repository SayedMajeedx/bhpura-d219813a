import { supabase } from "@/integrations/supabase/client";

export type ReturnNotificationType =
  | "return_created"
  | "return_approved"
  | "return_rejected"
  | "return_received"
  | "return_refunded"
  | "return_exchanged";

export interface ReturnNotificationPayload {
  brandId: string;
  returnId: string;
  eventType: ReturnNotificationType;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  customerName?: string | null;
  returnNumber: string;
  orderInvoiceNumber?: number | string;
  refundAmount?: number;
  rejectionReason?: string | null;
}

/**
 * Dispatches return notifications safely without blocking or throwing errors
 */
export async function dispatchReturnNotificationSafely(
  payload: ReturnNotificationPayload,
): Promise<{ dispatched: boolean; error?: string }> {
  try {
    const channel = payload.recipientEmail ? "email" : payload.recipientPhone ? "whatsapp" : "push";
    const recipient = payload.recipientEmail || payload.recipientPhone || "customer";

    // Enqueue into return_notification_events outbox
    const { error } = await (supabase as any)
      .from("return_notification_events")
      .insert({
      brand_id: payload.brandId,
      return_id: payload.returnId,
      event_type: payload.eventType,
      channel,
      recipient,
      status: "pending",
      payload: {
        customer_name: payload.customerName,
        return_number: payload.returnNumber,
        invoice_number: payload.orderInvoiceNumber,
        refund_amount: payload.refundAmount,
        rejection_reason: payload.rejectionReason,
      },
    });

    if (error) {
      console.warn("[ReturnNotification]: Failed to queue event into outbox:", error.message);
      return { dispatched: false, error: error.message };
    }

    return { dispatched: true };
  } catch (err: any) {
    // Non-blocking catch
    console.warn("[ReturnNotification]: Exception in notification dispatch:", err?.message || err);
    return { dispatched: false, error: err?.message || "Unknown notification error" };
  }
}
