import { afterEach, describe, expect, it, vi } from "vitest";

// Bug #52: the server read cookies through `vinxi/http`, which is not installed. The import threw,
// every reader's `catch` returned nothing, and a shopper who chose English got the Arabic page
// first; the impersonation cookie was never written, cleared or read on the server.

const request = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  written: [] as Array<{ name: string; value: string; options?: Record<string, unknown> }>,
  deleted: [] as string[],
  answering: true,
}));

vi.mock("@tanstack/react-start/server", () => {
  const onRequest = <T>(read: () => T): T => {
    if (!request.answering) throw new Error("No request being answered");
    return read();
  };
  return {
    getCookie: (name: string) => onRequest(() => request.cookies.get(name)),
    setCookie: (name: string, value: string, options?: Record<string, unknown>) =>
      onRequest(() => void request.written.push({ name, value, options })),
    deleteCookie: (name: string) => onRequest(() => void request.deleted.push(name)),
  };
});

const { readStorefrontLangCookie } = await import("../src/lib/storefront-cookies.server");
const { readImpersonationCookie, writeImpersonationCookie, clearImpersonationCookie } =
  await import("../src/lib/impersonation-cookies.server");
const { workerEnv } = await import("../src/lib/worker-env");

afterEach(() => {
  request.cookies.clear();
  request.written.length = 0;
  request.deleted.length = 0;
  request.answering = true;
  delete (globalThis as { __CLOUDFLARE_ENV__?: unknown }).__CLOUDFLARE_ENV__;
});

describe("the storefront's language cookie", () => {
  it("draws the page in the language the shopper chose for this store", async () => {
    request.cookies.set("boutq_lang_pura", "en");
    request.cookies.set("boutq_lang", "ar");
    expect(await readStorefrontLangCookie("pura")).toBe("en");
  });

  it("falls back to the language chosen on any store, and ignores anything else", async () => {
    request.cookies.set("boutq_lang", "en");
    expect(await readStorefrontLangCookie("pura")).toBe("en");
    request.cookies.set("boutq_lang_pura", "fr");
    expect(await readStorefrontLangCookie("pura")).toBe("en");
    request.cookies.clear();
    expect(await readStorefrontLangCookie("pura")).toBeUndefined();
  });

  it("says nothing when no request is being answered", async () => {
    request.answering = false;
    expect(await readStorefrontLangCookie("pura")).toBeUndefined();
  });
});

describe("the impersonation cookie", () => {
  it("is written, read and cleared on the request being answered", async () => {
    await writeImpersonationCookie("signed.token");
    expect(request.written).toEqual([
      {
        name: "boutq_impersonation_token",
        value: "signed.token",
        options: expect.objectContaining({ path: "/", secure: true, maxAge: 86400 }),
      },
    ]);
    request.cookies.set("boutq_impersonation_token", "signed.token");
    expect(await readImpersonationCookie()).toBe("signed.token");
    await clearImpersonationCookie();
    expect(request.deleted).toEqual(["boutq_impersonation_token"]);
  });
});

describe("the Worker's environment", () => {
  it("is what src/server.ts binds for the request, and nothing outside the Worker", () => {
    expect(workerEnv()).toBeUndefined();
    (globalThis as { __CLOUDFLARE_ENV__?: unknown }).__CLOUDFLARE_ENV__ = { R2_BUCKET: "media" };
    expect(workerEnv()).toEqual({ R2_BUCKET: "media" });
  });
});

describe("guard", () => {
  it("no code asks for `vinxi/http`, which is not installed", () => {
    const sources = import.meta.glob("../src/**/*.{ts,tsx}", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    const asking = Object.entries(sources)
      .filter(([, code]) => /["']vinxi(?:\/[a-z]+)?["']/.test(code))
      .map(([path]) => path);
    expect(asking).toEqual([]);
  });
});
