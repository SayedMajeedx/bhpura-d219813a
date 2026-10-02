// Pure helpers for Instagram's Graph API (Instagram Login flavour). No Deno or
// Supabase imports, so they run in the edge function and in the unit tests.

export const GRAPH_BASE = "https://graph.instagram.com";
export const GRAPH_VERSION = "v23.0";

/** A comment as the giveaway stores it. */
export type GraphComment = {
  comment_id: string;
  username: string;
  body: string;
  commented_at: string | null;
  like_count: number;
};

export type GraphMedia = {
  id: string;
  caption: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  media_type: string | null;
  posted_at: string | null;
  comments_count: number;
};

/** What Graph returns for an error (OAuthException 190 is an invalid or expired token). */
export class GraphError extends Error {
  code: number | null;
  status: number;
  constructor(message: string, code: number | null, status: number) {
    super(message);
    this.name = "GraphError";
    this.code = code;
    this.status = status;
  }
  /** The token is no longer valid: the merchant has to connect again. */
  get isTokenProblem() {
    return this.code === 190 || this.status === 401;
  }
  /** Instagram asks the app to slow down. */
  get isRateLimit() {
    return this.code === 4 || this.code === 17 || this.code === 32 || this.code === 613;
  }
}

type Fetcher = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Builds a Graph URL; the token goes in the query string, as Graph expects. */
export function graphUrl(path: string, params: Record<string, string | number | undefined>) {
  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Calls Graph and returns the JSON body; throws GraphError with Graph's own message. */
export async function graphGet(fetcher: Fetcher, url: string): Promise<Record<string, unknown>> {
  const response = await fetcher(url);
  let body: Record<string, unknown> = {};
  try {
    body = asRecord(await response.json());
  } catch {
    body = {};
  }
  const error = asRecord(body.error);
  if (!response.ok || Object.keys(error).length > 0) {
    const code = typeof error.code === "number" ? error.code : null;
    throw new GraphError(
      str(error.message) ?? `Instagram returned ${response.status}`,
      code,
      response.status,
    );
  }
  return body;
}

export type CommentsPage = {
  comments: GraphComment[];
  /** The cursor for the next page, or null on the last page. */
  next: string | null;
};

/** One page of /{media-id}/comments, mapped to what the giveaway stores. */
export function parseCommentsPage(body: Record<string, unknown>): CommentsPage {
  const data = Array.isArray(body.data) ? body.data : [];
  const comments: GraphComment[] = [];
  for (const item of data) {
    const row = asRecord(item);
    const id = str(row.id);
    const username = str(row.username) ?? str(asRecord(row.from).username);
    // A comment without an author cannot win anything.
    if (!id || !username) continue;
    comments.push({
      comment_id: id,
      username: username.toLowerCase(),
      body: typeof row.text === "string" ? row.text : "",
      commented_at: str(row.timestamp),
      like_count: typeof row.like_count === "number" ? row.like_count : 0,
    });
  }
  const paging = asRecord(body.paging);
  const hasNext = str(paging.next) !== null;
  const after = str(asRecord(paging.cursors).after);
  return { comments, next: hasNext ? after : null };
}

/** One page of /me/media, with the post's comment count. */
export function parseMediaPage(body: Record<string, unknown>): {
  media: GraphMedia[];
  next: string | null;
} {
  const data = Array.isArray(body.data) ? body.data : [];
  const media: GraphMedia[] = [];
  for (const item of data) {
    const row = asRecord(item);
    const id = str(row.id);
    if (!id) continue;
    media.push({
      id,
      caption: str(row.caption),
      permalink: str(row.permalink),
      // Videos carry a thumbnail; photos and carousels use media_url.
      thumbnail_url: str(row.thumbnail_url) ?? str(row.media_url),
      media_type: str(row.media_type),
      posted_at: str(row.timestamp),
      comments_count: typeof row.comments_count === "number" ? row.comments_count : 0,
    });
  }
  const paging = asRecord(body.paging);
  const hasNext = str(paging.next) !== null;
  const after = str(asRecord(paging.cursors).after);
  return { media, next: hasNext ? after : null };
}

/** A long-lived token lasts 60 days; refresh it once 10 or fewer remain. */
export const REFRESH_WITHIN_DAYS = 10;

/**
 * Whether the stored token is due for a refresh. Instagram refuses to refresh a
 * token younger than 24 hours, so a freshly stored one is left alone.
 */
export function tokenNeedsRefresh(
  expiresAt: string | Date,
  lastRefreshedAt: string | Date | null,
  now: Date = new Date(),
): boolean {
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires)) return false;
  const msLeft = expires - now.getTime();
  if (msLeft > REFRESH_WITHIN_DAYS * 86_400_000) return false;
  if (msLeft <= 0) return false; // already expired: refreshing cannot revive it
  if (lastRefreshedAt) {
    const last = new Date(lastRefreshedAt).getTime();
    if (Number.isFinite(last) && now.getTime() - last < 86_400_000) return false;
  }
  return true;
}

/** Splits comments into chunks for upserting. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
