import { supabase } from "@/integrations/supabase/client";

const SUPABASE_PROJECT_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://ovwomttfevxldvjhreoi.supabase.co";
const SUPABASE_PUBLIC_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const USER_MANAGEMENT_URL = `${SUPABASE_PROJECT_URL}/functions/v1/user-management`;

export interface ProvisionBrandPayload {
  slug: string;
  name_en: string;
  name_ar?: string | null;
  owner_name: string;
  owner_email: string;
  owner_phone?: string | null;
  owner_password?: string;
  plan_type?: "trial" | "annual";
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

  const url = new URL(USER_MANAGEMENT_URL);
  url.searchParams.set("action", "provision-brand");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(SUPABASE_PUBLIC_KEY ? { apikey: SUPABASE_PUBLIC_KEY } : {}),
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
