import { scanCaptionForSoldOut } from "@/lib/instagram-ai-importer";
import type { InstagramPostPreview } from "@/lib/instagram-ai-importer";
import { getEnvVariable } from "@/lib/runtime-env";
import crypto from "node:crypto";

async function getSupabaseAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const INSTAGRAM_OAUTH_CONFIG = {
  AUTHORIZE_URL: "https://www.instagram.com/oauth/authorize",
  TOKEN_URL: "https://api.instagram.com/oauth/access_token",
  GRAPH_BASE: "https://graph.instagram.com",
  GRAPH_VERSION: "v21.0",
  REDIRECT_URI: "https://boutq.store/api/auth/instagram/callback",
  DEFAULT_SCOPE: "instagram_business_basic",
};

export interface InstagramOAuthState {
  brandId: string;
  userId?: string;
  returnTo?: string;
  nonce: string;
  timestamp: number;
}

function getAppSecret(): string {
  const secret =
    getEnvVariable("INSTAGRAM_APP_SECRET") ||
    getEnvVariable("INSTAGRAM_CLIENT_SECRET") ||
    (typeof process !== "undefined"
      ? process.env?.INSTAGRAM_APP_SECRET || process.env?.INSTAGRAM_CLIENT_SECRET
      : undefined);
  return secret?.trim() || "a90ae757a582b27770369abf970cb663";
}

export function getInstagramAppId(): string {
  const appId =
    getEnvVariable("INSTAGRAM_APP_ID") ||
    getEnvVariable("INSTAGRAM_CLIENT_ID") ||
    (typeof process !== "undefined"
      ? process.env?.INSTAGRAM_APP_ID || process.env?.INSTAGRAM_CLIENT_ID
      : undefined);
  return appId?.trim() || "1435921631930750";
}

export function encodeOAuthState(state: InstagramOAuthState): string {
  const secret = getAppSecret() || "boutq-instagram-state-secret";
  const jsonStr = JSON.stringify(state);
  const data = Buffer.from(jsonStr).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function decodeOAuthState(rawState: string): InstagramOAuthState | null {
  try {
    const parts = rawState.split(".");
    if (parts.length !== 2) return null;
    const [data, signature] = parts;
    const secret = getAppSecret() || "boutq-instagram-state-secret";
    const expectedSig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }
    const jsonStr = Buffer.from(data, "base64url").toString("utf-8");
    const parsed = JSON.parse(jsonStr) as InstagramOAuthState;
    // Expire state after 1 hour
    if (Date.now() - parsed.timestamp > 3600 * 1000) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildInstagramAuthorizeUrl(params: {
  brandId: string;
  userId?: string;
  returnTo?: string;
}): string {
  const appId = getInstagramAppId();
  if (!appId) {
    throw new Error(
      "Missing INSTAGRAM_APP_ID environment variable. Please configure your Meta app credentials in .env.",
    );
  }

  const statePayload: InstagramOAuthState = {
    brandId: params.brandId,
    userId: params.userId,
    returnTo: params.returnTo,
    nonce: crypto.randomBytes(16).toString("hex"),
    timestamp: Date.now(),
  };

  const state = encodeOAuthState(statePayload);
  const url = new URL(INSTAGRAM_OAUTH_CONFIG.AUTHORIZE_URL);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", INSTAGRAM_OAUTH_CONFIG.REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_OAUTH_CONFIG.DEFAULT_SCOPE);
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeCodeForLongLivedToken(code: string): Promise<{
  shortLivedToken: string;
  longLivedToken: string;
  expiresIn: number;
  instagramUserId: string;
  instagramUsername: string;
}> {
  const appId = getInstagramAppId();
  const appSecret = getAppSecret();

  if (!appId || !appSecret) {
    throw new Error(
      "Missing INSTAGRAM_APP_ID or INSTAGRAM_APP_SECRET environment variables. Configure them in .env before executing OAuth.",
    );
  }

  // 1. Exchange authorization code for short-lived token
  const form = new URLSearchParams();
  form.append("client_id", appId);
  form.append("client_secret", appSecret);
  form.append("grant_type", "authorization_code");
  form.append("redirect_uri", INSTAGRAM_OAUTH_CONFIG.REDIRECT_URI);
  form.append("code", code);

  const shortRes = await fetch(INSTAGRAM_OAUTH_CONFIG.TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!shortRes.ok) {
    const errText = await shortRes.text();
    console.error("Instagram short-lived token exchange failed:", shortRes.status, errText);
    throw new Error(`Failed to exchange authorization code with Instagram: ${shortRes.status} ${errText}`);
  }

  const shortData = (await shortRes.json()) as {
    access_token?: string;
    user_id?: string | number;
    error_message?: string;
  };

  if (!shortData.access_token) {
    throw new Error(shortData.error_message || "No access_token returned by Instagram OAuth.");
  }

  const shortLivedToken = shortData.access_token;
  const rawUserId = String(shortData.user_id || "");

  // 2. Exchange short-lived token for long-lived token (60 days)
  const longUrl = new URL(`${INSTAGRAM_OAUTH_CONFIG.GRAPH_BASE}/access_token`);
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("access_token", shortLivedToken);

  const longRes = await fetch(longUrl.toString(), { method: "GET" });
  if (!longRes.ok) {
    const errText = await longRes.text();
    console.error("Instagram long-lived token exchange failed:", longRes.status, errText);
    throw new Error(`Failed to convert Instagram token to long-lived: ${longRes.status} ${errText}`);
  }

  const longData = (await longRes.json()) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    error?: { message?: string };
  };

  if (!longData.access_token) {
    throw new Error(longData.error?.message || "No long-lived access token returned by Instagram.");
  }

  const longLivedToken = longData.access_token;
  const expiresIn = Number(longData.expires_in) || 5184000; // default 60 days in seconds

  // 3. Fetch user profile from Graph API
  let instagramUsername = "";
  let instagramUserId = rawUserId;
  try {
    const profileUrl = new URL(
      `${INSTAGRAM_OAUTH_CONFIG.GRAPH_BASE}/me`,
    );
    profileUrl.searchParams.set("fields", "id,username");
    profileUrl.searchParams.set("access_token", longLivedToken);

    const profRes = await fetch(profileUrl.toString());
    if (profRes.ok) {
      const profData = (await profRes.json()) as { id?: string; username?: string };
      if (profData.username) instagramUsername = profData.username;
      if (profData.id) instagramUserId = profData.id;
    }
  } catch (profErr) {
    console.warn("Could not fetch Instagram profile username:", profErr);
  }

  return {
    shortLivedToken,
    longLivedToken,
    expiresIn,
    instagramUserId,
    instagramUsername,
  };
}

export async function storeInstagramConnection(params: {
  brandId: string;
  userId?: string;
  accessToken: string;
  expiresIn: number;
  instagramUserId: string;
  instagramUsername: string;
  scope?: string;
}): Promise<string> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await (supabaseAdmin.rpc as any)("save_instagram_token", {
    p_brand_id: params.brandId,
    p_user_id: params.userId || null,
    p_instagram_user_id: params.instagramUserId,
    p_instagram_username: params.instagramUsername,
    p_access_token: params.accessToken,
    p_expires_in: params.expiresIn,
    p_scope: params.scope || INSTAGRAM_OAUTH_CONFIG.DEFAULT_SCOPE,
  });

  if (error) {
    console.error("Failed to store encrypted Instagram token in Vault:", error);
    throw new Error(`Failed to secure Instagram token: ${error.message}`);
  }

  return String(data);
}

export async function getDecryptedTokenForBrand(brandId: string): Promise<{
  accessToken: string;
  instagramUserId: string;
  instagramUsername: string;
  expiresAt: string;
} | null> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await (supabaseAdmin.rpc as any)("get_decrypted_instagram_token", {
    p_brand_id: brandId,
  });

  if (error) {
    console.error("Failed to retrieve decrypted Instagram token:", error);
    throw new Error(`Failed to access Instagram credentials: ${error.message}`);
  }

  const rows = (data ?? []) as any[];
  if (!rows || rows.length === 0) return null;
  const first = rows[0];
  return {
    accessToken: first.access_token,
    instagramUserId: first.instagram_user_id || "",
    instagramUsername: first.instagram_username || "",
    expiresAt: first.expires_at,
  };
}

export async function fetchInstagramGraphMedia(params: {
  brandId: string;
  limit?: number;
}): Promise<{
  posts: InstagramPostPreview[];
  username: string;
}> {
  const credentials = await getDecryptedTokenForBrand(params.brandId);
  if (!credentials || !credentials.accessToken) {
    throw new Error("No active official Instagram connection found for this brand.");
  }

  const mediaUrl = new URL(
    `${INSTAGRAM_OAUTH_CONFIG.GRAPH_BASE}/${INSTAGRAM_OAUTH_CONFIG.GRAPH_VERSION}/me/media`,
  );
  mediaUrl.searchParams.set(
    "fields",
    "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp",
  );
  mediaUrl.searchParams.set("limit", String(params.limit || 50));
  mediaUrl.searchParams.set("access_token", credentials.accessToken);

  const res = await fetch(mediaUrl.toString());
  if (!res.ok) {
    const errText = await res.text();
    console.error("Instagram Graph API media fetch failed:", res.status, errText);
    throw new Error(`Instagram Graph API error: ${res.status} ${errText}`);
  }

  const json = (await res.json()) as { data?: any[] };
  const items = Array.isArray(json.data) ? json.data : [];

  const posts: InstagramPostPreview[] = items.map((item) => {
    const caption = item.caption || "";
    const { isSoldOut, keyword } = scanCaptionForSoldOut(caption);
    const isVideo = item.media_type === "VIDEO";
    const imageUrl = item.thumbnail_url || item.media_url || "";

    return {
      id: String(item.id),
      url: item.permalink || `https://www.instagram.com/p/${item.id}/`,
      imageUrl,
      caption,
      isSoldOut,
      detectedKeyword: keyword,
      date: item.timestamp ? new Date(item.timestamp).toLocaleDateString("en-GB") : "",
      isVideo,
    };
  });

  return {
    posts,
    username: credentials.instagramUsername,
  };
}

export async function refreshExpiringInstagramTokens(daysThreshold = 10): Promise<{
  checked: number;
  refreshed: number;
  failed: number;
  results: Array<{ brandId: string; success: boolean; error?: string }>;
}> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data: expiringList, error } = await (supabaseAdmin.rpc as any)(
    "get_expiring_instagram_tokens",
    {
      p_days_threshold: daysThreshold,
    },
  );

  if (error) {
    console.error("Failed to query expiring Instagram tokens:", error);
    throw new Error(`Failed to query expiring tokens: ${error.message}`);
  }

  const rows = (expiringList ?? []) as Array<{
    brand_id: string;
    access_token: string;
    instagram_username: string;
    expires_at: string;
  }>;

  const results: Array<{ brandId: string; success: boolean; error?: string }> = [];
  let refreshedCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    try {
      const refreshUrl = new URL(`${INSTAGRAM_OAUTH_CONFIG.GRAPH_BASE}/refresh_access_token`);
      refreshUrl.searchParams.set("grant_type", "ig_refresh_token");
      refreshUrl.searchParams.set("access_token", row.access_token);

      const refRes = await fetch(refreshUrl.toString(), { method: "GET" });
      if (!refRes.ok) {
        const errText = await refRes.text();
        throw new Error(`Status ${refRes.status}: ${errText}`);
      }

      const refData = (await refRes.json()) as {
        access_token?: string;
        expires_in?: number;
        error?: { message?: string };
      };

      if (!refData.access_token) {
        throw new Error(refData.error?.message || "No access token in refresh response.");
      }

      await (supabaseAdmin.rpc as any)("record_instagram_token_refresh_result", {
        p_brand_id: row.brand_id,
        p_success: true,
        p_new_token: refData.access_token,
        p_new_expires_in: Number(refData.expires_in) || 5184000,
        p_error_message: null,
      });

      refreshedCount++;
      results.push({ brandId: row.brand_id, success: true });
    } catch (err: any) {
      console.error(`Token refresh failed for brand ${row.brand_id}:`, err);
      failedCount++;
      const msg = err.message || "Unknown refresh failure";
      results.push({ brandId: row.brand_id, success: false, error: msg });

      await (supabaseAdmin.rpc as any)("record_instagram_token_refresh_result", {
        p_brand_id: row.brand_id,
        p_success: false,
        p_new_token: null,
        p_new_expires_in: 0,
        p_error_message: msg,
      });
    }
  }

  return {
    checked: rows.length,
    refreshed: refreshedCount,
    failed: failedCount,
    results,
  };
}
