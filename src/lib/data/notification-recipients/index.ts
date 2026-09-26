import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/**
 * Who receives the brand's admin email alerts (new order, BenefitPay approved
 * or rejected, cancelled, delivered): the recipients editor (settings and the
 * Communications page) and the Communications header's count. One query:
 * before, the two screens filled one key with different readers (ordered or
 * not, errors thrown or swallowed).
 */

export const notificationRecipientsKeys = {
  list: (brandId: string) => ["notification-recipients", brandId] as const,
};

/**
 * The brand's recipients, oldest first. Empty when the table is missing (a
 * database the migration has not reached yet); other errors throw.
 */
export async function fetchNotificationRecipients(brandId: string) {
  const { data, error } = await supabase
    .from("brand_notification_recipients")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: true });
  if (error) {
    if (error.code === "42P01" || /brand_notification_recipients/i.test(error.message ?? "")) {
      return [];
    }
    throw error;
  }
  return data ?? [];
}
export type NotificationRecipientRow = Awaited<
  ReturnType<typeof fetchNotificationRecipients>
>[number];

export const notificationRecipientsQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: notificationRecipientsKeys.list(brandId),
      queryFn: () => fetchNotificationRecipients(brandId),
      enabled: Boolean(brandId),
    }),
};

export function invalidateNotificationRecipients(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: notificationRecipientsKeys.list(brandId) });
}

export type NewNotificationRecipient = Omit<
  TablesInsert<"brand_notification_recipients">,
  "brand_id"
>;
export type NotificationRecipientPatch = TablesUpdate<"brand_notification_recipients">;

/**
 * Adds a recipient to the brand. Throws the database error as is: a duplicate
 * email for the brand is code 23505.
 */
export async function createNotificationRecipient(
  brandId: string,
  recipient: NewNotificationRecipient,
) {
  const { error } = await supabase
    .from("brand_notification_recipients")
    .insert({ ...recipient, brand_id: brandId });
  if (error) throw error;
}

export async function updateNotificationRecipient(
  brandId: string,
  recipientId: string,
  patch: NotificationRecipientPatch,
) {
  const { error } = await supabase
    .from("brand_notification_recipients")
    .update(patch)
    .eq("id", recipientId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

export async function deleteNotificationRecipient(brandId: string, recipientId: string) {
  const { error } = await supabase
    .from("brand_notification_recipients")
    .delete()
    .eq("id", recipientId)
    .eq("brand_id", brandId);
  if (error) throw error;
}
