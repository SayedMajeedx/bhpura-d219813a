import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

/**
 * The integrations screen: the brand's third-party credentials (listed masked
 * and written through SECURITY DEFINER functions, so secrets never come back
 * to the browser) and its analytics / tracking settings.
 */

export const integrationsKeys = {
  all: (brandId: string) => ["integrations", brandId] as const,
  credentials: (brandId: string) => [...integrationsKeys.all(brandId), "credentials"] as const,
  tracking: (brandId: string) => [...integrationsKeys.all(brandId), "tracking"] as const,
};

/** The brand's credentials, with the keys and secrets masked. */
export async function fetchIntegrationCredentials(brandId: string) {
  const { data, error } = await supabase.rpc("list_integration_credentials", {
    p_brand_id: brandId,
  });
  if (error) throw error;
  return data ?? [];
}
export type IntegrationCredential = Awaited<ReturnType<typeof fetchIntegrationCredentials>>[number];

/** The brand's analytics and pixel settings, or null before the first save. */
export async function fetchTrackingSettings(brandId: string) {
  const { data, error } = await supabase
    .from("brand_tracking_settings")
    .select("*")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export const integrationsQueries = {
  credentials: (brandId: string) =>
    queryOptions({
      queryKey: integrationsKeys.credentials(brandId),
      queryFn: () => fetchIntegrationCredentials(brandId),
      enabled: Boolean(brandId),
    }),
  tracking: (brandId: string) =>
    queryOptions({
      queryKey: integrationsKeys.tracking(brandId),
      queryFn: () => fetchTrackingSettings(brandId),
      enabled: Boolean(brandId),
    }),
};

/** The credentials list only: the tracking form keeps what the merchant is typing. */
export function invalidateIntegrationCredentials(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: integrationsKeys.credentials(brandId) });
}

export type IntegrationCredentialInput = {
  /** The credential to update, or null to create one. */
  id: string | null;
  provider: string;
  baseUrl: string | null;
  /** A new key or secret; an empty string keeps the stored one. */
  apiKey: string;
  webhookSecret: string;
  isActive: boolean;
  notes: string | null;
};

/** Creates or updates one of the brand's credentials. */
export async function saveIntegrationCredential(
  brandId: string,
  credential: IntegrationCredentialInput,
) {
  const { error } = await supabase.rpc("save_integration_credential", {
    // The function takes NULL to create, though the generated types mark every
    // argument as required text (the SQL arguments have no defaults).
    p_id: credential.id as string,
    p_brand_id: brandId,
    p_provider: credential.provider,
    p_base_url: credential.baseUrl as string,
    p_api_key: credential.apiKey,
    p_webhook_secret: credential.webhookSecret,
    p_is_active: credential.isActive,
    p_notes: credential.notes as string,
  });
  if (error) throw error;
}

export async function deleteIntegrationCredential(brandId: string, credentialId: string) {
  const { error } = await supabase.rpc("delete_integration_credential", {
    p_id: credentialId,
    p_brand_id: brandId,
  });
  if (error) throw error;
}

export type TrackingSettings = Omit<TablesInsert<"brand_tracking_settings">, "brand_id">;

/** Creates or updates the brand's analytics and pixel settings. */
export async function saveTrackingSettings(brandId: string, settings: TrackingSettings) {
  const { error } = await supabase
    .from("brand_tracking_settings")
    .upsert({ ...settings, brand_id: brandId }, { onConflict: "brand_id" });
  if (error) throw error;
}
