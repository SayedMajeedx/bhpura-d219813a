import { infiniteQueryOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { CommentEntry, GiveawayRules } from "@/features/giveaways/lib/entry-rules";
import type { DrawPick } from "@/features/giveaways/lib/draw";

/**
 * Instagram giveaways (migration 20261003100000): the draws, the comments pulled
 * from a post, and the winners. The Instagram token never comes here: the
 * `instagram-giveaway` edge function reads it from Vault, checks the caller, and
 * pulls the comments into `giveaway_comments`.
 */

export const giveawaysKeys = {
  all: (brandId: string) => ["giveaways", brandId] as const,
  list: (brandId: string) => [...giveawaysKeys.all(brandId), "list"] as const,
  detail: (brandId: string, id: string) => [...giveawaysKeys.all(brandId), "detail", id] as const,
  comments: (brandId: string, id: string) =>
    [...giveawaysKeys.all(brandId), "comments", id] as const,
  winners: (brandId: string, id: string) => [...giveawaysKeys.all(brandId), "winners", id] as const,
  connection: (brandId: string) => [...giveawaysKeys.all(brandId), "connection"] as const,
  media: (brandId: string) => [...giveawaysKeys.all(brandId), "media"] as const,
};

const GIVEAWAY_COLUMNS =
  "id, brand_id, title, media_id, media_permalink, media_caption, media_thumbnail_url, media_posted_at, comments_total, rules, fetch_done, status, draw_seed, drawn_at, created_at" as const;
const COMMENT_COLUMNS = "comment_id, username, body, commented_at, like_count" as const;
const WINNER_COLUMNS =
  "id, giveaway_id, position, kind, username, comment_id, comment_body, follow_checked, like_checked, status, note" as const;

/** Comments are read a thousand at a time (the API's row limit). */
const PAGE = 1000;

export async function fetchGiveaways(brandId: string) {
  const { data, error } = await supabase
    .from("giveaways")
    .select(GIVEAWAY_COLUMNS)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type Giveaway = Awaited<ReturnType<typeof fetchGiveaways>>[number];

export async function fetchGiveaway(brandId: string, id: string) {
  const { data, error } = await supabase
    .from("giveaways")
    .select(GIVEAWAY_COLUMNS)
    .eq("brand_id", brandId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Every comment pulled for the giveaway, however many there are. */
export async function fetchGiveawayComments(giveawayId: string): Promise<CommentEntry[]> {
  const rows: CommentEntry[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("giveaway_comments")
      .select(COMMENT_COLUMNS)
      .eq("giveaway_id", giveawayId)
      .order("comment_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

export async function fetchGiveawayWinners(giveawayId: string) {
  const { data, error } = await supabase
    .from("giveaway_winners")
    .select(WINNER_COLUMNS)
    .eq("giveaway_id", giveawayId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type GiveawayWinner = Awaited<ReturnType<typeof fetchGiveawayWinners>>[number];

/** Who is connected, and for how long: the brand's Instagram token status (no secret). */
export async function fetchInstagramConnection(brandId: string) {
  const { data, error } = await supabase.rpc("get_instagram_connection_status", {
    p_brand_id: brandId,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}
export type InstagramConnection = NonNullable<Awaited<ReturnType<typeof fetchInstagramConnection>>>;

export const giveawaysQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: giveawaysKeys.list(brandId),
      queryFn: () => fetchGiveaways(brandId),
      enabled: Boolean(brandId),
    }),
  detail: (brandId: string, id: string | null) =>
    queryOptions({
      queryKey: giveawaysKeys.detail(brandId, id ?? ""),
      queryFn: () => fetchGiveaway(brandId, id as string),
      enabled: Boolean(brandId && id),
    }),
  comments: (brandId: string, id: string | null) =>
    queryOptions({
      queryKey: giveawaysKeys.comments(brandId, id ?? ""),
      queryFn: () => fetchGiveawayComments(id as string),
      enabled: Boolean(brandId && id),
      staleTime: 60_000,
    }),
  winners: (brandId: string, id: string | null) =>
    queryOptions({
      queryKey: giveawaysKeys.winners(brandId, id ?? ""),
      queryFn: () => fetchGiveawayWinners(id as string),
      enabled: Boolean(brandId && id),
    }),
  connection: (brandId: string) =>
    queryOptions({
      queryKey: giveawaysKeys.connection(brandId),
      queryFn: () => fetchInstagramConnection(brandId),
      enabled: Boolean(brandId),
    }),
  /** The account's recent posts, a page at a time; `enabled` waits for the picker to open. */
  media: (brandId: string, enabled: boolean) =>
    infiniteQueryOptions({
      queryKey: giveawaysKeys.media(brandId),
      queryFn: ({ pageParam }) => listInstagramMedia(brandId, pageParam),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.next ?? undefined,
      enabled: Boolean(brandId) && enabled,
      staleTime: 60_000,
      retry: false,
    }),
};

export function invalidateGiveaways(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: giveawaysKeys.all(brandId) });
}

// ── Writes ──────────────────────────────────────────────────────────────────

export type NewGiveaway = {
  title: string;
  media: InstagramMedia;
  rules: GiveawayRules;
};

export async function createGiveaway(brandId: string, input: NewGiveaway) {
  const { data, error } = await supabase
    .from("giveaways")
    .insert({
      brand_id: brandId,
      title: input.title,
      media_id: input.media.id,
      media_permalink: input.media.permalink,
      media_caption: input.media.caption?.slice(0, 2200) ?? null,
      media_thumbnail_url: input.media.thumbnail_url,
      media_posted_at: input.media.posted_at,
      comments_total: input.media.comments_count,
      rules: input.rules,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteGiveaway(brandId: string, id: string) {
  const { error } = await supabase.from("giveaways").delete().eq("brand_id", brandId).eq("id", id);
  if (error) throw error;
}

/** Saves the rules the draw will use. */
export async function saveGiveawayRules(brandId: string, id: string, rules: GiveawayRules) {
  const { error } = await supabase
    .from("giveaways")
    .update({ rules, updated_at: new Date().toISOString() })
    .eq("brand_id", brandId)
    .eq("id", id);
  if (error) throw error;
}

/**
 * Stores a draw: the seed and the picks, replacing an earlier draw of the same
 * giveaway. The picks hold the comment the person won with.
 */
export async function saveDraw(
  brandId: string,
  giveawayId: string,
  seed: string,
  rules: GiveawayRules,
  picks: DrawPick[],
) {
  const removed = await supabase.from("giveaway_winners").delete().eq("giveaway_id", giveawayId);
  if (removed.error) throw removed.error;

  if (picks.length > 0) {
    const inserted = await supabase.from("giveaway_winners").insert(
      picks.map((pick) => ({
        giveaway_id: giveawayId,
        brand_id: brandId,
        position: pick.position,
        kind: pick.kind,
        username: pick.entry.username,
        comment_id: pick.entry.comment_id,
        comment_body: pick.entry.body.slice(0, 2200),
      })),
    );
    if (inserted.error) throw inserted.error;
  }

  const { error } = await supabase
    .from("giveaways")
    .update({
      rules,
      draw_seed: seed,
      drawn_at: new Date().toISOString(),
      status: "drawn",
      updated_at: new Date().toISOString(),
    })
    .eq("brand_id", brandId)
    .eq("id", giveawayId);
  if (error) throw error;
}

export type WinnerPatch = Partial<
  Pick<GiveawayWinner, "follow_checked" | "like_checked" | "status" | "note">
>;

export async function updateWinner(brandId: string, winnerId: string, patch: WinnerPatch) {
  const { error } = await supabase
    .from("giveaway_winners")
    .update(patch)
    .eq("brand_id", brandId)
    .eq("id", winnerId);
  if (error) throw error;
}

// ── Instagram (edge function) ───────────────────────────────────────────────

export type InstagramMedia = {
  id: string;
  caption: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  media_type: string | null;
  posted_at: string | null;
  comments_count: number;
};

/** An error from the edge function, with the code the screen turns into a message. */
export class GiveawayApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GiveawayApiError";
    this.code = code;
  }
}

async function callInstagram<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("instagram-giveaway", { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new GiveawayApiError(
        typeof payload?.code === "string" ? payload.code : "server_error",
        typeof payload?.error === "string" ? payload.error : error.message,
      );
    }
    throw new GiveawayApiError("network", error.message);
  }
  return data as T;
}

/** Stores a token the merchant generated in Meta's dashboard; returns the account's username. */
export async function connectInstagram(brandId: string, token: string) {
  return callInstagram<{ ok: true; username: string }>({
    action: "connect",
    brand_id: brandId,
    token,
  });
}

/** One page of the account's recent posts. */
export async function listInstagramMedia(brandId: string, after?: string) {
  return callInstagram<{ media: InstagramMedia[]; next: string | null }>({
    action: "list_media",
    brand_id: brandId,
    after,
  });
}

export type PullProgress = { ok: true; fetched: number; done: boolean; rate_limited: boolean };

/** Pulls the next batch of the post's comments; call again until `done`. */
export async function pullComments(brandId: string, giveawayId: string, restart = false) {
  return callInstagram<PullProgress>({
    action: "fetch_comments",
    brand_id: brandId,
    giveaway_id: giveawayId,
    restart,
  });
}
