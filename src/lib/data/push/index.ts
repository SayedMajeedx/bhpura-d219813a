import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/**
 * Push notifications: a brand's customer app devices and marketing campaigns
 * (the Communications push centre), and the device registrations the native
 * app shells send on start-up.
 */

export const pushKeys = {
  all: (brandId: string) => ["push", brandId] as const,
  devices: (brandId: string) => [...pushKeys.all(brandId), "devices"] as const,
  campaigns: (brandId: string) => [...pushKeys.all(brandId), "campaigns"] as const,
};

/** The brand's customer devices that have notifications on. */
export async function fetchPushDevices(brandId: string) {
  const { data, error } = await supabase
    .from("customer_push_devices")
    .select("id,customer_id,enabled,marketing_enabled")
    .eq("brand_id", brandId)
    .eq("enabled", true);
  if (error) throw error;
  return data ?? [];
}

/** The brand's latest 30 marketing notifications with their delivery counts, newest first. */
export async function fetchPushCampaigns(brandId: string) {
  const { data, error } = await supabase
    .from("customer_push_events")
    .select(
      "id,title,body,status,customer_id,recipient_count,accepted_count,failed_count,created_at",
    )
    .eq("brand_id", brandId)
    .eq("event_type", "marketing")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data ?? [];
}

export const pushQueries = {
  devices: (brandId: string) =>
    queryOptions({
      queryKey: pushKeys.devices(brandId),
      queryFn: () => fetchPushDevices(brandId),
      enabled: Boolean(brandId),
    }),
  campaigns: (brandId: string) =>
    queryOptions({
      queryKey: pushKeys.campaigns(brandId),
      queryFn: () => fetchPushCampaigns(brandId),
      enabled: Boolean(brandId),
    }),
};

/** The brand's push lists are stale after a campaign is queued. */
export function invalidatePush(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: pushKeys.all(brandId) });
}

/**
 * Queues a marketing notification to every subscribed customer of the brand,
 * or to one customer. A missing customer is omitted: the function defaults it
 * to NULL (everyone).
 */
export async function createPushCampaign(args: {
  brandId: string;
  title: string;
  body: string;
  customerId?: string | null;
  targetUrl: string;
}) {
  const { error } = await supabase.rpc("create_customer_push_campaign", {
    p_brand_id: args.brandId,
    p_title: args.title,
    p_body: args.body,
    p_customer_id: args.customerId ?? undefined,
    p_target_url: args.targetUrl,
  });
  if (error) throw error;
}

/** The merchant app shell registers its device for staff notifications (best-effort). */
export async function registerMobilePushDevice(device: {
  token: string;
  enabled: boolean;
  platform: "ios" | "android";
  deviceName: string;
  preferences: Json;
}) {
  await supabase.rpc("register_mobile_push_device", {
    p_token: device.token,
    p_enabled: device.enabled,
    p_platform: device.platform,
    p_device_name: device.deviceName,
    p_preferences: device.preferences,
  });
}

/**
 * The storefront app shell registers a signed-in customer's device (best-effort:
 * it only succeeds once the customer is authenticated, and the shell repeats it
 * after each navigation).
 */
export async function registerCustomerPushDevice(device: {
  brandSlug: string;
  token: string;
  enabled: boolean;
  orderUpdates: boolean;
  marketing: boolean;
  platform: "ios" | "android";
  deviceName: string;
  tokenProvider: string;
}) {
  await supabase.rpc("register_customer_push_device", {
    p_brand_slug: device.brandSlug,
    p_token: device.token,
    p_enabled: device.enabled,
    p_order_updates: device.orderUpdates,
    p_marketing: device.marketing,
    p_platform: device.platform,
    p_device_name: device.deviceName,
    p_token_provider: device.tokenProvider,
  });
}
