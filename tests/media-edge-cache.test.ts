import { describe, expect, it, vi } from "vitest";
import {
  EDGE_KEEP_MAX_BYTES,
  EDGE_KEEP_SECONDS,
  keepable,
  mediaCacheUrl,
  serveMediaWithEdgeCache,
  wholeSize,
} from "../src/lib/media-edge-cache";

// PageSpeed, 2026-11-14: every file on the media host was read from storage on every request
// (about 260 ms each; Pura's logo took 0.9 s on the phone run). The data centre keeps them now.

const LOGO = "https://media.boutq.store/brands/b1/logo/abc.svg";

function fakeCache() {
  const kept = new Map<string, Response>();
  const asked: Request[] = [];
  return {
    kept,
    asked,
    cache: {
      async match(request: Request) {
        asked.push(request);
        const hit = kept.get(request.url);
        if (!hit) return undefined;
        const range = request.headers.get("Range");
        const copy = hit.clone();
        if (!range) return copy;
        const bytes = new Uint8Array(await copy.arrayBuffer());
        const [, from, to] = range.match(/bytes=(\d+)-(\d*)/)!;
        const end = to ? Number(to) : bytes.length - 1;
        const headers = new Headers(hit.headers);
        headers.set("Content-Range", `bytes ${from}-${end}/${bytes.length}`);
        return new Response(bytes.slice(Number(from), end + 1), { status: 206, headers });
      },
      async put(request: Request, response: Response) {
        kept.set(request.url, new Response(await response.arrayBuffer(), response));
      },
    },
  };
}

function file(body: string, extra: Record<string, string> = {}) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Length": String(body.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      ...extra,
    },
  });
}

function waiter() {
  const tasks: Promise<unknown>[] = [];
  return { tasks, ctx: { waitUntil: (task: Promise<unknown>) => void tasks.push(task) } };
}

describe("which files the edge keeps", () => {
  it("keeps a store's files, one copy whatever host asked", () => {
    expect(mediaCacheUrl(new Request(LOGO))).toBe(LOGO);
    expect(mediaCacheUrl(new Request("https://pura.boutq.store/brands/b1/logo/abc.svg"))).toBe(
      LOGO,
    );
  });

  it("never an app build, which can be replaced at the same address, nor a write", () => {
    expect(mediaCacheUrl(new Request("https://media.boutq.store/app-builds/x.apk"))).toBeNull();
    expect(mediaCacheUrl(new Request("https://media.boutq.store/mobile-releases/x"))).toBeNull();
    expect(mediaCacheUrl(new Request(LOGO, { method: "HEAD" }))).toBeNull();
    expect(mediaCacheUrl(new Request(LOGO, { method: "OPTIONS" }))).toBeNull();
  });

  it("keeps only a whole file that came back whole, and not a very large one", () => {
    expect(keepable(file("<svg/>"))).toBe(true);
    expect(keepable(new Response("x", { status: 206, headers: { "Content-Length": "1" } }))).toBe(
      false,
    );
    expect(keepable(new Response("x", { status: 404 }))).toBe(false);
    expect(keepable(file("x", { "Content-Length": String(EDGE_KEEP_MAX_BYTES + 1) }))).toBe(false);
    expect(keepable(file("x", { "Set-Cookie": "a=b" }))).toBe(false);
    expect(wholeSize("bytes 0-1023/2075759")).toBe(2075759);
    expect(wholeSize(null)).toBeNull();
  });
});

describe("serving a store's file", () => {
  it("asks storage once, then answers from the edge with the browser's year-long header", async () => {
    const { cache, kept } = fakeCache();
    const origin = vi.fn(async () => file("<svg/>"));
    const { ctx, tasks } = waiter();

    const first = await serveMediaWithEdgeCache(new Request(LOGO), origin, ctx, cache);
    expect(first.headers.get("X-Media-Cache")).toBe("MISS");
    expect(await first.text()).toBe("<svg/>");
    await Promise.all(tasks);
    // The data centre keeps it 30 days, not the year browsers are told.
    expect(kept.get(LOGO)!.headers.get("Cache-Control")).toBe(
      `public, max-age=${EDGE_KEEP_SECONDS}`,
    );

    const second = await serveMediaWithEdgeCache(
      new Request("https://pura.boutq.store/brands/b1/logo/abc.svg"),
      origin,
      ctx,
      cache,
    );
    expect(origin).toHaveBeenCalledTimes(1);
    expect(second.headers.get("X-Media-Cache")).toBe("HIT");
    expect(second.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(second.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await second.text()).toBe("<svg/>");
  });

  it("answers a video's part from storage at first, and keeps the whole file behind it", async () => {
    const video = "https://media.boutq.store/brands/b1/hero/v.mp4";
    const whole = "0123456789";
    const { cache, kept, asked } = fakeCache();
    const origin = vi.fn(async (request: Request) =>
      request.headers.get("Range")
        ? new Response(whole.slice(0, 4), {
            status: 206,
            headers: { "Content-Range": `bytes 0-3/${whole.length}`, "Content-Length": "4" },
          })
        : file(whole, { "Content-Type": "video/mp4" }),
    );
    const { ctx, tasks } = waiter();

    const part = await serveMediaWithEdgeCache(
      new Request(video, { headers: { Range: "bytes=0-3" } }),
      origin,
      ctx,
      cache,
    );
    expect(part.status).toBe(206);
    expect(await part.text()).toBe("0123");
    await Promise.all(tasks);
    expect(origin).toHaveBeenCalledTimes(2);
    expect(origin.mock.calls[1][0].headers.get("Range")).toBeNull();
    expect(kept.has(video)).toBe(true);

    // The next part comes from the kept copy, cut by the cache.
    const next = await serveMediaWithEdgeCache(
      new Request(video, { headers: { Range: "bytes=4-7" } }),
      origin,
      ctx,
      cache,
    );
    expect(asked.at(-1)!.headers.get("Range")).toBe("bytes=4-7");
    expect(next.status).toBe(206);
    expect(next.headers.get("X-Media-Cache")).toBe("HIT");
    expect(await next.text()).toBe("4567");
    expect(origin).toHaveBeenCalledTimes(2);
  });

  it("leaves app builds, and anything the cache cannot answer, to storage", async () => {
    const origin = vi.fn(async () => file("apk"));
    const { cache, kept } = fakeCache();
    await serveMediaWithEdgeCache(
      new Request("https://media.boutq.store/app-builds/app.apk"),
      origin,
      undefined,
      cache,
    );
    expect(kept.size).toBe(0);

    const broken = {
      match: vi.fn(async () => {
        throw new Error("cache down");
      }),
      put: vi.fn(async () => {
        throw new Error("cache down");
      }),
    };
    const answer = await serveMediaWithEdgeCache(new Request(LOGO), origin, undefined, broken);
    expect(answer.status).toBe(200);
    expect(await answer.text()).toBe("apk");
  });

  it("does not keep a missing file", async () => {
    const { cache, kept } = fakeCache();
    const { ctx, tasks } = waiter();
    const answer = await serveMediaWithEdgeCache(
      new Request(LOGO),
      async () => new Response("Not Found", { status: 404 }),
      ctx,
      cache,
    );
    await Promise.all(tasks);
    expect(answer.status).toBe(404);
    expect(kept.size).toBe(0);
  });
});
