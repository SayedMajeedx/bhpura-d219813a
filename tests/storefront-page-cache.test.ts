import { readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  FRESH_SECONDS,
  STALE_SECONDS,
  STORE_PAGES,
  isPublicStorePage,
  keptPageState,
  serveStorePageWithEdgeCache,
  storablePage,
  storePageCacheKey,
} from "../src/lib/storefront-page-cache";

// PageSpeed, 2026-11-14: a store's home was drawn afresh for every visit, 0.4-0.8 s from Bahrain.

const page = (path: string, init: RequestInit & { cookie?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "text/html,application/xhtml+xml");
  if (init.cookie) headers.set("Cookie", init.cookie);
  return new Request(`https://pura.boutq.store${path}`, { ...init, headers });
};

describe("which store pages are kept", () => {
  it("keeps a store's home, a category and a product page", () => {
    expect(isPublicStorePage("/pura")).toBe(true);
    expect(isPublicStorePage("/pura/")).toBe(true);
    expect(isPublicStorePage("/pura/abayas")).toBe(true);
    expect(isPublicStorePage("/pura/product/b4867b9a")).toBe(true);
  });

  it("never a private page, the store's own tools, a file or the platform's pages", () => {
    for (const second of [
      "checkout",
      "account",
      "auth",
      "auth-confirmed",
      "gift",
      "gift-card",
      "gift-cards",
      "thank-you",
      "track-order",
      "wishlist",
      "book",
      "search",
      "size-guide",
      "page",
    ]) {
      expect(isPublicStorePage(`/pura/${second}`)).toBe(false);
    }
    expect(isPublicStorePage("/pura/thank-you/order-1")).toBe(false);
    expect(isPublicStorePage("/pura/gift/token-1")).toBe(false);
    expect(isPublicStorePage("/pura/products.xml")).toBe(false);
    expect(isPublicStorePage("/pura/manifest.webmanifest")).toBe(false);
    expect(isPublicStorePage("/admin")).toBe(false);
    expect(isPublicStorePage("/api/health/live")).toBe(false);
    expect(isPublicStorePage("/auth")).toBe(false);
    expect(isPublicStorePage("/")).toBe(false);
  });

  it("knows every page of a store that is not a category", () => {
    // A new page (a private one above all) must be named here, or its address would read as a
    // category and be kept. Every route file is a store's home, a category, a product page or one
    // of these.
    const named = readdirSync("src/routes")
      .filter((file) => file.startsWith("$slug."))
      .map((file) => file.slice("$slug.".length).split(".")[0])
      .filter((part) => !["index", "route", "$category", "manifest[", "product"].includes(part));
    for (const part of named) expect(STORE_PAGES.has(part), part).toBe(true);
  });

  it("keeps only a plain read of the page, with no cookie a page could read", () => {
    expect(storePageCacheKey(page("/pura"))).not.toBeNull();
    expect(storePageCacheKey(page("/pura", { method: "POST" }))).toBeNull();
    expect(storePageCacheKey(page("/pura", { headers: { Accept: "*/*" } }))).toBeNull();
    expect(storePageCacheKey(page("/pura", { headers: { Authorization: "Bearer x" } }))).toBeNull();
    // Analytics and ad cookies are never read by a page.
    expect(storePageCacheKey(page("/pura", { cookie: "_ga=1; _fbp=fb.1; _ttp=t" }))).not.toBeNull();
    // Any other cookie (a staff impersonation, anything new) is drawn for its visitor.
    expect(storePageCacheKey(page("/pura", { cookie: "boutq_impersonation_token=x" }))).toBeNull();
    expect(storePageCacheKey(page("/pura", { cookie: "_ga=1; sb-access-token=x" }))).toBeNull();
  });

  it("keeps one copy per language, and one whatever tracking an ad's link adds", () => {
    const arabic = storePageCacheKey(page("/pura"));
    expect(storePageCacheKey(page("/pura?lang=en"))).not.toBe(arabic);
    expect(storePageCacheKey(page("/pura", { cookie: "boutq_lang_pura=en" }))).not.toBe(arabic);
    expect(storePageCacheKey(page("/pura", { cookie: "boutq_lang=en" }))).toBe(
      storePageCacheKey(page("/pura", { cookie: "boutq_lang_pura=en" })),
    );
    expect(storePageCacheKey(page("/pura?fbclid=A1&utm_source=ig"))).toBe(arabic);
    // A filter changes what is drawn, so it stays in the key.
    expect(storePageCacheKey(page("/pura/abayas?size=54"))).not.toBe(
      storePageCacheKey(page("/pura/abayas")),
    );
    expect(storePageCacheKey(page("/pura/abayas?size=54&color=black"))).toBe(
      storePageCacheKey(page("/pura/abayas?color=black&size=54")),
    );
  });

  it("keeps a page per release, so a page never names a build that is gone", () => {
    // A release removes the last build's script files: a page kept from before it would show and
    // do nothing. Each release reads its own pages.
    const before = storePageCacheKey(page("/pura"), "release-a");
    const after = storePageCacheKey(page("/pura"), "release-b");
    expect(before).not.toBeNull();
    expect(after).not.toBe(before);
    expect(storePageCacheKey(page("/pura"), "release-a")).toBe(before);
  });

  it("keeps a page an hour, served at once while it is drawn again", () => {
    expect(STALE_SECONDS).toBe(60 * 60);
    expect(keptPageState(0, 30 * 60 * 1000)).toBe("stale");
  });

  it("keeps a whole HTML page that sets no cookie and is not private", () => {
    const html = (headers: Record<string, string> = {}, status = 200) =>
      new Response("<html></html>", {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
      });
    expect(storablePage(html({ "Cache-Control": "public, max-age=0, s-maxage=10" }))).toBe(true);
    expect(storablePage(html({}, 404))).toBe(false);
    expect(storablePage(html({}, 503))).toBe(false);
    expect(storablePage(html({ "Set-Cookie": "a=b" }))).toBe(false);
    expect(storablePage(html({ "Cache-Control": "private" }))).toBe(false);
    expect(storablePage(html({ "Cache-Control": "no-store" }))).toBe(false);
    expect(
      storablePage(new Response("{}", { headers: { "Content-Type": "application/json" } })),
    ).toBe(false);
  });

  it("is fresh 30 seconds, served while redrawn up to 5 minutes, then drawn again", () => {
    expect(keptPageState(0, FRESH_SECONDS * 1000)).toBe("fresh");
    expect(keptPageState(0, FRESH_SECONDS * 1000 + 1)).toBe("stale");
    expect(keptPageState(0, STALE_SECONDS * 1000)).toBe("stale");
    expect(keptPageState(0, STALE_SECONDS * 1000 + 1)).toBe("expired");
    expect(keptPageState(Number.NaN, 0)).toBe("expired");
  });
});

describe("serving a kept page", () => {
  function setup() {
    const kept = new Map<string, Response>();
    const cache = {
      async match(request: Request) {
        return kept.get(request.url)?.clone();
      },
      async put(request: Request, response: Response) {
        kept.set(request.url, new Response(await response.text(), response));
      },
    };
    const tasks: Promise<unknown>[] = [];
    const ctx = { waitUntil: (task: Promise<unknown>) => void tasks.push(task) };
    let drawn = 0;
    const render = vi.fn(async () => {
      drawn += 1;
      return new Response(`<html>draw ${drawn}</html>`, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=0, s-maxage=10, must-revalidate",
        },
      });
    });
    return { kept, cache, tasks, ctx, render };
  }
  const key = "https://pura.boutq.store/__store-page-cache/pura?__lang_cookie=";

  it("draws it once, then answers from the edge with the page's own browser header", async () => {
    const { cache, tasks, ctx, render } = setup();
    let clock = 1_000_000;
    const first = await serveStorePageWithEdgeCache(key, render, ctx, cache, () => clock);
    expect(first.headers.get("X-Page-Cache")).toBe("MISS");
    expect(await first.text()).toBe("<html>draw 1</html>");
    await Promise.all(tasks);

    clock += 10_000;
    const second = await serveStorePageWithEdgeCache(key, render, ctx, cache, () => clock);
    expect(render).toHaveBeenCalledTimes(1);
    expect(second.headers.get("X-Page-Cache")).toBe("HIT");
    expect(second.headers.get("Cache-Control")).toBe(
      "public, max-age=0, s-maxage=10, must-revalidate",
    );
    expect(await second.text()).toBe("<html>draw 1</html>");
  });

  it("serves an older copy at once and draws the page again behind it", async () => {
    const { cache, tasks, ctx, render } = setup();
    let clock = 1_000_000;
    await serveStorePageWithEdgeCache(key, render, ctx, cache, () => clock);
    await Promise.all(tasks.splice(0));

    clock += (FRESH_SECONDS + 5) * 1000;
    const stale = await serveStorePageWithEdgeCache(key, render, ctx, cache, () => clock);
    expect(stale.headers.get("X-Page-Cache")).toBe("STALE");
    expect(await stale.text()).toBe("<html>draw 1</html>");
    await Promise.all(tasks.splice(0));
    expect(render).toHaveBeenCalledTimes(2);

    const next = await serveStorePageWithEdgeCache(key, render, ctx, cache, () => clock);
    expect(await next.text()).toBe("<html>draw 2</html>");
  });

  it("draws the page when its copy is past 5 minutes, or the cache fails", async () => {
    const { cache, tasks, ctx, render } = setup();
    let clock = 1_000_000;
    await serveStorePageWithEdgeCache(key, render, ctx, cache, () => clock);
    await Promise.all(tasks.splice(0));
    clock += (STALE_SECONDS + 1) * 1000;
    const late = await serveStorePageWithEdgeCache(key, render, ctx, cache, () => clock);
    expect(late.headers.get("X-Page-Cache")).toBe("MISS");
    expect(await late.text()).toBe("<html>draw 2</html>");

    const broken = {
      match: vi.fn(async () => {
        throw new Error("down");
      }),
      put: vi.fn(async () => {
        throw new Error("down");
      }),
    };
    const drawn = await serveStorePageWithEdgeCache(key, render, ctx, broken, () => clock);
    expect(await drawn.text()).toBe("<html>draw 3</html>");
  });

  it("does not keep a page that is not found, or one that sets a cookie", async () => {
    const { kept, cache, tasks, ctx } = setup();
    await serveStorePageWithEdgeCache(
      key,
      async () =>
        new Response("missing", { status: 404, headers: { "Content-Type": "text/html" } }),
      ctx,
      cache,
    );
    await serveStorePageWithEdgeCache(
      key,
      async () =>
        new Response("<html/>", { headers: { "Content-Type": "text/html", "Set-Cookie": "a=b" } }),
      ctx,
      cache,
    );
    await Promise.all(tasks);
    expect(kept.size).toBe(0);
  });
});
