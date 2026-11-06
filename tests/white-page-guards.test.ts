import { afterEach, describe, expect, it, vi } from "vitest";
import { wholeDocument, isWholeDocument, DOCUMENT_RETRIES } from "../src/lib/whole-document";
import { appBootGuardScript, BOOT_GUARD_AFTER_MS } from "../src/lib/app-boot-guard";
import { adminAppHead } from "../src/lib/admin-app-head";
import { runAdminWorker } from "./helpers/admin-worker";

// The owner's report of 2026-11-06: the admin opened on a white page most of the time, with no way
// to reload it. The first render on a fresh server copy lost its body to a failed stream.

const WHOLE = "<!doctype html><html><head></head><body><main>admin</main></body></html>";
const CUT = "<!doctype html><html><head><title>Boutq</title></head>";
const html = (body: BodyInit, init: ResponseInit = {}) =>
  new Response(body, { headers: { "content-type": "text/html; charset=utf-8" }, ...init });
const failedStream = () =>
  html(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(CUT));
        controller.error(new Error("A previously unvisited boundary"));
      },
    }),
  );
const get = { method: "GET", signal: new AbortController().signal };
const givenUp = () => html("gave up", { status: 503 });

describe("a page is sent only once it is whole", () => {
  it("knows an unfinished document", () => {
    expect(isWholeDocument(WHOLE)).toBe(true);
    expect(isWholeDocument(`${WHOLE}\n`)).toBe(true);
    expect(isWholeDocument(CUT)).toBe(false);
    expect(isWholeDocument("")).toBe(false);
  });

  it("renders again when the first render stopped after the head, as a fresh server does", async () => {
    const render = vi.fn(async () => html(WHOLE));
    const noted = vi.fn();
    const answer = await wholeDocument({
      request: get,
      first: html(CUT),
      render,
      givenUp,
      onIncomplete: noted,
    });
    expect(await answer.text()).toBe(WHOLE);
    expect(answer.status).toBe(200);
    expect(render).toHaveBeenCalledTimes(1);
    expect(noted).toHaveBeenCalledTimes(1);
  });

  it("renders again when the stream itself failed", async () => {
    const answer = await wholeDocument({
      request: get,
      first: failedStream(),
      render: async () => html(WHOLE),
      givenUp,
    });
    expect(await answer.text()).toBe(WHOLE);
  });

  it("never loops: it gives up with a page that can reload", async () => {
    const render = vi.fn(async () => html(CUT));
    const answer = await wholeDocument({ request: get, first: html(CUT), render, givenUp });
    expect(answer.status).toBe(503);
    expect(render).toHaveBeenCalledTimes(DOCUMENT_RETRIES);
  });

  it("renders once for a page that is whole, keeping its status and headers", async () => {
    const render = vi.fn();
    const first = html(WHOLE, {
      status: 404,
      headers: { "content-type": "text/html", "set-cookie": "a=1" },
    });
    const answer = await wholeDocument({ request: get, first, render, givenUp });
    expect(render).not.toHaveBeenCalled();
    expect(answer.status).toBe(404);
    expect(answer.headers.get("set-cookie")).toBe("a=1");
    expect(await answer.text()).toBe(WHOLE);
  });

  it("tells the browser to ask again for a page, but keeps a rule a page set for itself", async () => {
    const plain = await wholeDocument({
      request: get,
      first: html(WHOLE),
      render: vi.fn(),
      givenUp,
    });
    expect(plain.headers.get("cache-control")).toBe("no-cache");
    const own = await wholeDocument({
      request: get,
      first: html(WHOLE, { headers: { "content-type": "text/html", "cache-control": "no-store" } }),
      render: vi.fn(),
      givenUp,
    });
    expect(own.headers.get("cache-control")).toBe("no-store");
  });

  it("leaves everything that is not a page alone, unread", async () => {
    const render = vi.fn();
    for (const first of [
      Response.json({ ok: true }),
      new Response(null, { status: 307, headers: { location: "/admin" } }),
    ]) {
      const answer = await wholeDocument({ request: get, first, render, givenUp });
      expect(answer).toBe(first);
      expect(first.bodyUsed).toBe(false);
    }
    const posted = html(CUT);
    expect(
      await wholeDocument({ request: { ...get, method: "POST" }, first: posted, render, givenUp }),
    ).toBe(posted);
    expect(render).not.toHaveBeenCalled();
  });

  it("follows a second render that answers with a redirect", async () => {
    const redirect = new Response(null, { status: 307, headers: { location: "/auth" } });
    const answer = await wholeDocument({
      request: get,
      first: html(CUT),
      render: async () => redirect,
      givenUp,
    });
    expect(answer).toBe(redirect);
  });

  it("does not render for a visitor who has already left", async () => {
    const gone = new AbortController();
    gone.abort();
    const render = vi.fn();
    const answer = await wholeDocument({
      request: { method: "GET", signal: gone.signal },
      first: html(CUT),
      render,
      givenUp,
    });
    expect(render).not.toHaveBeenCalled();
    expect(answer.status).toBe(503);
  });
});

describe("a start that never finishes offers a reload", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    document.documentElement.lang = "";
    delete (window as unknown as { __TSR_ROUTER__?: unknown }).__TSR_ROUTER__;
  });
  const bar = () => document.querySelector("[data-boot-guard]");
  const run = () => {
    vi.useFakeTimers();
    new Function(appBootGuardScript)();
  };
  const router = (status: string, isLoading = false) => {
    (window as unknown as { __TSR_ROUTER__?: unknown }).__TSR_ROUTER__ = {
      state: { status, isLoading },
    };
  };

  it("says nothing while the app opens in time", () => {
    run();
    router("idle");
    vi.advanceTimersByTime(BOOT_GUARD_AFTER_MS + 5000);
    expect(bar()).toBeNull();
  });

  it("offers it when the app's code never ran, in the page's language", () => {
    document.documentElement.lang = "ar";
    run();
    vi.advanceTimersByTime(BOOT_GUARD_AFTER_MS);
    expect(bar()?.textContent).toContain("إعادة التحميل");
    expect(bar()?.getAttribute("dir")).toBe("rtl");
  });

  it("offers it when the first reads never came back, in English on an English page", () => {
    document.documentElement.lang = "en";
    run();
    router("pending", true);
    vi.advanceTimersByTime(BOOT_GUARD_AFTER_MS);
    expect(bar()?.textContent).toContain("Reload");
    expect(bar()?.querySelector("button")).not.toBeNull();
  });

  it("takes the offer away once the app has opened after all", () => {
    run();
    router("pending", true);
    vi.advanceTimersByTime(BOOT_GUARD_AFTER_MS);
    expect(bar()).not.toBeNull();
    router("idle");
    vi.advanceTimersByTime(1000);
    expect(bar()).toBeNull();
  });

  it("is in the head of every admin page, needing nothing from the app", () => {
    expect(adminAppHead().scripts).toEqual([{ children: appBootGuardScript }]);
  });
});

describe("the worker when a page cannot be fetched", () => {
  const navigate = (preloadResponse: Promise<unknown> = Promise.resolve(undefined)) => ({
    request: { mode: "navigate", method: "GET", url: "https://boutq.store/admin" },
    preloadResponse,
  });

  it("keeps the offline page as a plain page: a redirected answer cannot open", async () => {
    // Cloudflare sends /admin-app/offline.html to /admin-app/offline, and a browser refuses to
    // open a redirected answer from a worker: the page meant for no connection was itself a failure.
    const worker = runAdminWorker({
      fetch: async () => {
        const answer = new Response("<html>offline</html>", {
          headers: { "content-type": "text/html" },
        });
        Object.defineProperty(answer, "redirected", { value: true });
        return answer;
      },
    });
    await worker.fire("install", {});
    const kept = worker.stored.get("/admin-app/offline.html") as Response;
    expect(kept.redirected).toBe(false);
    expect(kept.status).toBe(200);
    expect(kept.headers.get("content-type")).toContain("text/html");
    expect(await kept.text()).toBe("<html>offline</html>");
  });

  it("clears the offline page an earlier version kept, redirected", async () => {
    const worker = runAdminWorker();
    await worker.fire("activate", {});
    expect(worker.caches.delete).toHaveBeenCalledWith("boutq-admin-offline-v1");
  });

  it("tries the network itself when the fast path fails, before saying there is no connection", async () => {
    const page = { online: true };
    const worker = runAdminWorker({ fetch: async () => page });
    const answer = await worker.fire("fetch", navigate(Promise.reject(new TypeError("preload"))));
    expect(answer).toBe(page);
  });

  it("offers a reload even when no offline page was kept", async () => {
    const worker = runAdminWorker({
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const answer = (await worker.fire("fetch", navigate())) as Response;
    expect(answer.status).toBe(503);
    expect(answer.headers.get("content-type")).toContain("text/html");
    expect(await answer.text()).toContain("location.reload()");
  });
});

describe("the worker and an alert", () => {
  it("shows the alert even if marking the icon throws: a silent push costs the subscription", async () => {
    const worker = runAdminWorker();
    worker.setAppBadge.mockImplementation(() => {
      throw new Error("no badge here");
    });
    await worker.fire("push", {
      data: { json: () => ({ title: "طلب جديد", tag: "order_new-1", url: "/admin" }) },
    });
    expect(worker.shown[0]?.title).toBe("طلب جديد");
  });
});
