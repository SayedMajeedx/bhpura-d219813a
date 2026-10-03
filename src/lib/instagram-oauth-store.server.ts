import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getEnvVariableAsync } from "@/integrations/supabase/auth-middleware";

/**
 * The database side of the Instagram connection: who may start it, where the
 * token is stored, and the store's slug. Kept out of the routes so they stay thin.
 */

/**
 * The signed-in user behind an access token, if they manage this store's settings
 * (the same rule the giveaways tables use); otherwise null.
 */
export async function userWhoManagesBrand(
  accessToken: string,
  brandId: string,
): Promise<{ userId: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) return null;

  const url = await getEnvVariableAsync("SUPABASE_URL");
  const key = await getEnvVariableAsync("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) return null;

  // Asked as the user, so the database's own checks (auth.uid()) decide.
  const asUser = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const [access, permission] = await Promise.all([
    asUser.rpc("can_access_brand", { _brand_id: brandId }),
    asUser.rpc("has_permission", { p_permission: "manage_settings" }),
  ]);
  if (access.data !== true || permission.data !== true) return null;
  return { userId: data.user.id };
}

/** Stores the token encrypted in Vault; only the service role can read it back. */
export async function storeInstagramToken(input: {
  brandId: string;
  userId: string;
  instagramUserId: string | null;
  username: string | null;
  accessToken: string;
  expiresIn: number;
  scope: string;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("save_instagram_token", {
    p_brand_id: input.brandId,
    p_user_id: input.userId,
    p_instagram_user_id: input.instagramUserId ?? "",
    p_instagram_username: input.username ?? "",
    p_access_token: input.accessToken,
    p_expires_in: Math.trunc(input.expiresIn),
    p_scope: input.scope,
  });
  if (error) throw new Error("could not store the token");
}

export async function brandSlug(brandId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("brands")
    .select("slug")
    .eq("id", brandId)
    .maybeSingle();
  return data?.slug ?? null;
}
