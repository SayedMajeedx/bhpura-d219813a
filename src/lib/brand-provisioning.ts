import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionUrl, supabasePublicKey } from "@/lib/supabase-project";

export interface ProvisionBrandPayload {
  slug: string;
  name_en: string;
  name_ar?: string | null;
  owner_name: string;
  owner_email: string;
  owner_phone?: string | null;
  owner_password?: string;
  plan_type?: "trial" | "annual";
  business_type?: string;
  store_vertical?: string;
  storefront_accent_color?: string;
  storefront_background_color?: string;
  brand_palette?: Record<string, any>;
  storefront_font_ar?: string;
  storefront_font_en?: string;
  storefront_radius?: string;
  template_defaults?: Record<string, any>;
}

export interface ProvisionBrandResult {
  brand_id: string;
  linked_existing_identity: boolean;
  trial_days: number | null;
}

export async function provisionBrandWithOwner(
  payload: ProvisionBrandPayload,
): Promise<ProvisionBrandResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("No active session");

  // The build's own project: it once fell back to a project from before Tokyo.
  const endpoint = edgeFunctionUrl("user-management");
  if (!endpoint) throw new Error("This build has no Supabase address (VITE_SUPABASE_URL).");
  const url = new URL(endpoint);
  url.searchParams.set("action", "provision-brand");
  const publicKey = supabasePublicKey();

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(publicKey ? { apikey: publicKey } : {}),
    },
    body: JSON.stringify(payload),
  });

  const result = (await response.json().catch(() => ({}))) as {
    error?: string;
    brand_id?: string;
    linked_existing_identity?: boolean;
    trial_days?: number | null;
  };

  if (!response.ok) {
    throw new Error(result.error || `Request failed (${response.status})`);
  }

  return result as ProvisionBrandResult;
}
