import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/**
 * A brand's message templates: every template for the order editor's "send
 * invoice" dialog, and the WhatsApp ones for Campaigns. Both lists sit under
 * `["message-templates", brandId]`, so a template saved in one screen
 * refreshes the other.
 *
 * Writes carry the brand being edited. Before, inserts left `brand_id` to a
 * trigger that uses the brand on the user's profile (`current_brand_id()`),
 * so a template created while viewing another brand landed in the wrong one,
 * and making a template the default cleared the default of every template of
 * the user, across brands.
 */

export const messageTemplatesKeys = {
  all: (brandId: string) => ["message-templates", brandId] as const,
  /** Every template of the brand, oldest first. */
  list: (brandId: string) => [...messageTemplatesKeys.all(brandId), "all"] as const,
  /** The brand's templates for one channel, newest first (Campaigns uses WhatsApp). */
  channel: (brandId: string, channel: string) =>
    [...messageTemplatesKeys.all(brandId), "channel", channel] as const,
};

/** Every template of the brand, oldest first. */
export async function fetchMessageTemplates(brandId: string) {
  const { data, error } = await supabase
    .from("message_templates")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

/** The brand's templates for one channel with their name and body, newest first. */
export async function fetchChannelTemplates(brandId: string, channel: string) {
  const { data, error } = await supabase
    .from("message_templates")
    .select("id, name, body")
    .eq("brand_id", brandId)
    .eq("channel", channel)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const messageTemplatesQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: messageTemplatesKeys.list(brandId),
      queryFn: () => fetchMessageTemplates(brandId),
      enabled: Boolean(brandId),
    }),
  channel: (brandId: string, channel: string) =>
    queryOptions({
      queryKey: messageTemplatesKeys.channel(brandId, channel),
      queryFn: () => fetchChannelTemplates(brandId, channel),
      enabled: Boolean(brandId),
    }),
};

// ── Writes ──────────────────────────────────────────────────────────────────

export type NewMessageTemplate = Omit<TablesInsert<"message_templates">, "brand_id">;
export type MessageTemplatePatch = TablesUpdate<"message_templates">;

/** Every template list of the brand is stale after a write. */
export function invalidateMessageTemplates(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: messageTemplatesKeys.all(brandId) });
}

/** Creates a template in the brand and returns its id. */
export async function createMessageTemplate(
  brandId: string,
  values: NewMessageTemplate,
): Promise<string> {
  const { data, error } = await supabase
    .from("message_templates")
    .insert({ ...values, brand_id: brandId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateMessageTemplate(
  brandId: string,
  templateId: string,
  patch: MessageTemplatePatch,
) {
  const { error } = await supabase
    .from("message_templates")
    .update(patch)
    .eq("id", templateId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

export async function deleteMessageTemplate(brandId: string, templateId: string) {
  const { error } = await supabase
    .from("message_templates")
    .delete()
    .eq("id", templateId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

/**
 * Makes one template the brand's default: the old default is cleared in the
 * same transaction, so a failure changes nothing (bug #21).
 */
export async function setDefaultMessageTemplate(brandId: string, templateId: string) {
  const { error } = await supabase.rpc("set_default_message_template", {
    p_brand_id: brandId,
    p_template_id: templateId,
  });
  if (error) throw error;
}
