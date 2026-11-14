/**
 * The media host's edge cache (media.boutq.store, and /brands/ on a store's own host).
 *
 * Every picture, logo, font and video was read from storage on every request (no
 * cf-cache-status; about 260 ms a file from Bahrain, and Pura's logo took 0.9 s on PageSpeed's
 * phone run, 2026-11-14): a Worker's answer is not kept by Cloudflare's cache unless the Worker
 * keeps it. A store's files are written once under a random name and already told browsers to
 * keep them a year (`immutable`), so the data centre keeps them too.
 *
 * - Only `brands/` files: an app build (`app-builds/`, `mobile-releases/`) can be replaced at
 *   the same address.
 * - One copy per file whatever host asked (`media.boutq.store` or a store's `/brands/...`).
 * - A part of a file (a video's Range request) is answered from the kept copy when there is one;
 *   otherwise from storage as before, while the whole file is fetched once behind it to be kept.
 * - A data centre keeps a copy at most `EDGE_KEEP_SECONDS` (30 days); a file the store deleted
 *   stops being served from there by then (browsers keep theirs a year, as before).
 * - Anything the cache cannot do falls back to storage: the cache never stands between a
 *   shopper and a file.
 */

/** How long a data centre keeps a file. Browsers are told a year, as before. */
export const EDGE_KEEP_SECONDS = 30 * 24 * 60 * 60;
/** Larger files are not kept (a long video): served from storage as before. */
export const EDGE_KEEP_MAX_BYTES = 50 * 1024 * 1024;

const BROWSER_CACHE = "public, max-age=31536000, immutable";

/** The address a file is kept under, or null when this request is not one to keep. */
export function mediaCacheUrl(request: Request): string | null {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  const key = url.pathname.replace(/^\/+/, "");
  if (!key.startsWith("brands/") || key.includes("..")) return null;
  return `https://media.boutq.store/${key}`;
}

/** Whether an answer from storage may be kept: a whole file that came back whole, not too big. */
export function keepable(response: Response): boolean {
  if (response.status !== 200 || !response.body) return false;
  if (response.headers.has("Set-Cookie")) return false;
  const length = Number(response.headers.get("Content-Length"));
  return Number.isFinite(length) && length > 0 && length <= EDGE_KEEP_MAX_BYTES;
}

/** The size of the whole file from a part's `Content-Range` ("bytes 0-1023/2075759"). */
export function wholeSize(contentRange: string | null): number | null {
  const total = contentRange?.match(/\/(\d+)\s*$/)?.[1];
  return total ? Number(total) : null;
}

type Origin = (request: Request) => Promise<Response>;
type Waiter = { waitUntil(promise: Promise<unknown>): void };
type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

/** The kept copy with the year-long header browsers had, marked as served from the edge. */
function fromEdge(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", BROWSER_CACHE);
  headers.set("X-Media-Cache", "HIT");
  return new Response(response.body, { status: response.status, headers });
}

/** The copy the data centre keeps: the same file, kept `EDGE_KEEP_SECONDS`. */
function forEdge(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", `public, max-age=${EDGE_KEEP_SECONDS}`);
  headers.delete("X-Media-Cache");
  return new Response(response.body, { status: 200, headers });
}

export async function serveMediaWithEdgeCache(
  request: Request,
  origin: Origin,
  ctx: Waiter | undefined,
  cache: EdgeCache | undefined = defaultCache(),
): Promise<Response> {
  const cacheUrl = mediaCacheUrl(request);
  if (!cacheUrl || !cache) return origin(request);

  const range = request.headers.get("Range");
  try {
    const kept = await cache.match(
      new Request(cacheUrl, { headers: range ? { Range: range } : undefined }),
    );
    // A part asked of a kept file comes back as the part (206) or, where the cache does not
    // cut it, as the whole file (200), which a browser accepts for a Range request.
    if (kept && (kept.status === 200 || kept.status === 206)) return fromEdge(kept);
  } catch {
    /* the cache could not answer: storage does */
  }

  const answer = await origin(request);
  const keep = (whole: Response) =>
    cache.put(new Request(cacheUrl), forEdge(whole)).catch(() => undefined);

  if (!range && keepable(answer)) {
    const [toShopper, toCache] = splitBody(answer);
    const task = keep(toCache);
    if (ctx) ctx.waitUntil(task);
    return withMiss(toShopper);
  }

  // A part: keep the whole file behind it, once, when it is not too big.
  const total = wholeSize(answer.headers.get("Content-Range"));
  if (answer.status === 206 && total !== null && total <= EDGE_KEEP_MAX_BYTES && ctx) {
    ctx.waitUntil(
      origin(new Request(cacheUrl))
        .then((whole) => (keepable(whole) ? keep(whole) : undefined))
        .catch(() => undefined),
    );
  }
  return withMiss(answer);
}

function withMiss(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Media-Cache", "MISS");
  return new Response(response.body, { status: response.status, headers });
}

/** Two answers with the same body: one for the shopper, one to keep. */
function splitBody(response: Response): [Response, Response] {
  const [a, b] = response.body!.tee();
  const init = { status: response.status, headers: response.headers };
  return [new Response(a, init), new Response(b, init)];
}

function defaultCache(): EdgeCache | undefined {
  const store = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return store?.default;
}
