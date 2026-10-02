import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  chunk,
  GRAPH_BASE,
  GraphError,
  graphGet,
  graphUrl,
  parseCommentsPage,
  parseMediaPage,
  tokenNeedsRefresh,
} from "./graph.ts";

// Pulls a post's comments from Instagram for the giveaway screen. The brand's
// Instagram token lives in Vault and is read here with the service role, so it
// never reaches the browser. Every call first checks that the caller manages
// the brand's settings.
//
// Actions (POST, JSON body with `action` and `brand_id`):
//   connect         { token }                 store a token the merchant generated in Meta's dashboard
//   list_media      { after? }                the brand's recent posts, with their comment counts
//   fetch_comments  { giveaway_id, restart? } pull the next batch of pages into giveaway_comments

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/** 50 comments per page; ten pages per call keeps each call well inside the runtime's limits. */
const PAGES_PER_CALL = 10;
const COMMENT_FIELDS = "id,text,username,timestamp,like_count";
const MEDIA_FIELDS =
  "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count";

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(code: string, message: string, status: number) {
  return reply({ error: message, code }, status);
}

const fetcher = (url: string) => fetch(url);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return fail("method_not_allowed", "POST only", 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ") || !anonKey) {
    return fail("unauthorized", "Missing or invalid authorization header", 401);
  }

  // deno-lint-ignore no-explicit-any
  const admin: any = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return fail("unauthorized", "Invalid session", 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail("bad_request", "Invalid JSON body", 400);
  }
  const action = typeof body.action === "string" ? body.action : "";
  const brandId = typeof body.brand_id === "string" ? body.brand_id : "";
  if (!brandId) return fail("bad_request", "brand_id is required", 400);

  // The caller has to manage this brand's settings (the same rule the tables use).
  const [access, permission] = await Promise.all([
    userClient.rpc("can_access_brand", { _brand_id: brandId }),
    userClient.rpc("has_permission", { p_permission: "manage_settings" }),
  ]);
  if (access.data !== true || permission.data !== true) {
    return fail("forbidden", "You cannot manage this store's giveaways", 403);
  }

  try {
    if (action === "connect") return await connect(admin, user.id, brandId, body);
    if (action === "list_media") return await listMedia(admin, brandId, body);
    if (action === "fetch_comments") return await fetchComments(admin, brandId, body);
    return fail("bad_request", "Unknown action", 400);
  } catch (error) {
    if (error instanceof GraphError) {
      if (error.isTokenProblem) {
        return fail("token_expired", "Instagram no longer accepts the saved token", 400);
      }
      if (error.isRateLimit) {
        return fail(
          "rate_limited",
          "Instagram asked to slow down; try again in a few minutes",
          429,
        );
      }
      return fail("instagram_error", error.message, 502);
    }
    if (error instanceof HandledError) return fail(error.code, error.message, error.status);
    console.error("instagram-giveaway failed", error);
    return fail("server_error", "Something went wrong", 500);
  }
});

class HandledError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// deno-lint-ignore no-explicit-any
async function connect(admin: any, userId: string, brandId: string, body: Record<string, unknown>) {
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token.length < 20) return fail("bad_request", "Paste the token Instagram gave you", 400);

  // The token must belong to a professional account that can read comments.
  const me = await graphGet(
    fetcher,
    graphUrl("me", { fields: "user_id,username,account_type", access_token: token }),
  );
  const username = typeof me.username === "string" ? me.username : "";
  const instagramUserId =
    typeof me.user_id === "string" || typeof me.user_id === "number"
      ? String(me.user_id)
      : typeof me.id === "string"
        ? me.id
        : "";
  if (!username) return fail("instagram_error", "Instagram did not return the account", 502);

  // A token made in Meta's dashboard is long-lived (60 days).
  const { error } = await admin.rpc("save_instagram_token", {
    p_brand_id: brandId,
    p_user_id: userId,
    p_instagram_user_id: instagramUserId,
    p_instagram_username: username,
    p_access_token: token,
    p_expires_in: 60 * 86_400,
    p_scope: "instagram_business_basic,instagram_business_manage_comments",
  });
  if (error) throw new Error(`could not store the token: ${error.message}`);
  return reply({ ok: true, username });
}

/** The brand's token, refreshed first when it is close to expiring. */
// deno-lint-ignore no-explicit-any
async function tokenFor(admin: any, brandId: string): Promise<string> {
  const { data, error } = await admin.rpc("get_decrypted_instagram_token", {
    p_brand_id: brandId,
  });
  if (error) throw new Error(`token lookup failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.access_token) {
    throw new HandledError("not_connected", "Instagram is not connected for this store", 400);
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new HandledError("token_expired", "The Instagram token has expired", 400);
  }
  if (!tokenNeedsRefresh(row.expires_at, row.last_refreshed_at)) return row.access_token;

  try {
    const refreshed = await graphGet(
      fetcher,
      `${GRAPH_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(row.access_token)}`,
    );
    const next = typeof refreshed.access_token === "string" ? refreshed.access_token : "";
    if (!next) return row.access_token;
    await admin.rpc("record_instagram_token_refresh_result", {
      p_brand_id: brandId,
      p_success: true,
      p_new_token: next,
      p_new_expires_in:
        typeof refreshed.expires_in === "number" ? refreshed.expires_in : 60 * 86_400,
    });
    return next;
  } catch (error) {
    // The current token still works; remember why the refresh failed and carry on.
    await admin.rpc("record_instagram_token_refresh_result", {
      p_brand_id: brandId,
      p_success: false,
      p_error_message: error instanceof Error ? error.message.slice(0, 300) : "refresh failed",
    });
    return row.access_token;
  }
}

// deno-lint-ignore no-explicit-any
async function listMedia(admin: any, brandId: string, body: Record<string, unknown>) {
  const token = await tokenFor(admin, brandId);
  const after = typeof body.after === "string" ? body.after : undefined;
  const page = await graphGet(
    fetcher,
    graphUrl("me/media", { fields: MEDIA_FIELDS, limit: 18, after, access_token: token }),
  );
  return reply(parseMediaPage(page));
}

// deno-lint-ignore no-explicit-any
async function fetchComments(admin: any, brandId: string, body: Record<string, unknown>) {
  const giveawayId = typeof body.giveaway_id === "string" ? body.giveaway_id : "";
  if (!giveawayId) return fail("bad_request", "giveaway_id is required", 400);

  const { data: giveaway, error: giveawayError } = await admin
    .from("giveaways")
    .select("id, brand_id, media_id, comments_total, fetch_cursor, fetch_done")
    .eq("id", giveawayId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (giveawayError) throw new Error(giveawayError.message);
  if (!giveaway) return fail("not_found", "Giveaway not found", 404);

  const restart = body.restart === true;
  let cursor: string | undefined = restart ? undefined : (giveaway.fetch_cursor ?? undefined);
  if (restart) {
    await admin.from("giveaway_comments").delete().eq("giveaway_id", giveawayId);
    await admin
      .from("giveaways")
      .update({ fetch_cursor: null, fetch_done: false, status: "fetching" })
      .eq("id", giveawayId);
  } else if (giveaway.fetch_done) {
    return reply(await progress(admin, giveawayId, true, false));
  }

  const token = await tokenFor(admin, brandId);
  let done = false;
  let rateLimited = false;
  let received = 0;
  let withoutAuthor = 0;
  let saved = 0;
  const startedFresh = restart || !giveaway.fetch_cursor;

  for (let page = 0; page < PAGES_PER_CALL; page++) {
    let parsed;
    try {
      parsed = parseCommentsPage(
        await graphGet(
          fetcher,
          graphUrl(`${giveaway.media_id}/comments`, {
            fields: COMMENT_FIELDS,
            limit: 50,
            after: cursor,
            access_token: token,
          }),
        ),
      );
    } catch (error) {
      // Keep what was pulled; the screen shows the pause and can resume.
      if (error instanceof GraphError && error.isRateLimit) {
        rateLimited = true;
        break;
      }
      throw error;
    }

    received += parsed.received;
    withoutAuthor += parsed.withoutAuthor;
    saved += parsed.comments.length;

    for (const rows of chunk(
      parsed.comments.map((comment) => ({
        ...comment,
        giveaway_id: giveawayId,
        brand_id: brandId,
      })),
      200,
    )) {
      const { error } = await admin
        .from("giveaway_comments")
        .upsert(rows, { onConflict: "giveaway_id,comment_id" });
      if (error) throw new Error(`could not save comments: ${error.message}`);
    }

    cursor = parsed.next ?? undefined;
    if (!parsed.next) {
      done = true;
      break;
    }
  }

  // A first pull that ends with nothing stored must not look finished: say why.
  if (startedFresh && done && saved === 0 && (withoutAuthor > 0 || giveaway.comments_total > 0)) {
    await admin
      .from("giveaways")
      .update({ fetch_cursor: null, fetch_done: false, status: "draft" })
      .eq("id", giveawayId);
    if (withoutAuthor > 0) {
      return fail(
        "missing_username",
        "Instagram sent the comments without usernames. The token needs instagram_business_manage_comments",
        400,
      );
    }
    return fail("no_comments", "Instagram returned no comments for this post", 400);
  }

  await admin
    .from("giveaways")
    .update({
      fetch_cursor: done ? null : (cursor ?? null),
      fetch_done: done,
      status: done ? "ready" : "fetching",
      updated_at: new Date().toISOString(),
    })
    .eq("id", giveawayId);

  return reply(await progress(admin, giveawayId, done, rateLimited));
}

// deno-lint-ignore no-explicit-any
async function progress(admin: any, giveawayId: string, done: boolean, rateLimited: boolean) {
  const { count } = await admin
    .from("giveaway_comments")
    .select("comment_id", { count: "exact", head: true })
    .eq("giveaway_id", giveawayId);
  return { ok: true, fetched: count ?? 0, done, rate_limited: rateLimited };
}
