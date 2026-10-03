import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getEnvVariableAsync } from "@/integrations/supabase/auth-middleware";

/**
 * The database side of the Instagram connection: who may start it, where the
 * token is stored, and the store's slug. Kept out of the routes so they stay thin.
 */

/** Why someone may not start the connection (or why the check could not be made). */
export type AccessProblem =
  /** The session token is not accepted. */
  | "invalid_session"
  /** The server is missing Supabase settings, so the question could not be asked. */
  | "server_config"
  /** The database check failed to run (an error, not an answer). */
  | "check_failed"
  /** The database answered: this account cannot access the store. */
  | "no_access"
  /** The database answered: this account lacks the settings permission. */
  | "no_permission";

export type BrandAccess =
  { ok: true; userId: string } | { ok: false; reason: AccessProblem; detail?: string };

function isNewApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/**
 * The same client the project's auth middleware builds for a signed-in user:
 * the settings are found the same way (including the VITE_ fallbacks and a URL
 * without its scheme), and a new-style API key is never sent as a bearer token.
 */
async function userClientFor(accessToken: string) {
  let url =
    (await getEnvVariableAsync("SUPABASE_URL")) || (await getEnvVariableAsync("VITE_SUPABASE_URL"));
  if (url && !url.startsWith("http://") && !url.startsWith("https://")) url = `https://${url}`;
  const key =
    (await getEnvVariableAsync("SUPABASE_PUBLISHABLE_KEY")) ||
    (await getEnvVariableAsync("VITE_SUPABASE_ANON_KEY")) ||
    (await getEnvVariableAsync("VITE_SUPABASE_PUBLISHABLE_KEY"));
  const missing = [...(url ? [] : ["SUPABASE_URL"]), ...(key ? [] : ["SUPABASE_PUBLISHABLE_KEY"])];
  if (!url || !key) return { missing };

  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isNewApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  return { client, missing };
}

/**
 * Whether the signed-in user behind an access token manages this store's settings:
 * the same two database checks the giveaways tables use (`can_access_brand` and
 * `has_permission('manage_settings')`), asked as the user. A check that cannot run
 * is reported as such, never as a "no".
 */
export async function userWhoManagesBrand(
  accessToken: string,
  brandId: string,
): Promise<BrandAccess> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) return { ok: false, reason: "invalid_session" };

  const { client, missing } = await userClientFor(accessToken);
  if (!client) return { ok: false, reason: "server_config", detail: missing.join(", ") };

  const [access, permission] = await Promise.all([
    client.rpc("can_access_brand", { _brand_id: brandId }),
    client.rpc("has_permission", { p_permission: "manage_settings" }),
  ]);
  const failedCall = access.error ? access : permission.error ? permission : null;
  if (failedCall?.error) {
    // A code such as PGRST301 (or the HTTP status), never the message: it may name internals.
    return {
      ok: false,
      reason: "check_failed",
      detail: failedCall.error.code || String(failedCall.status),
    };
  }
  if (access.data !== true) return { ok: false, reason: "no_access" };
  if (permission.data !== true) return { ok: false, reason: "no_permission" };
  return { ok: true, userId: data.user.id };
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
