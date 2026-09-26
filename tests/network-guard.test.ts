import { describe, expect, it, vi } from "vitest";

// tests/setup.ts blocks every real request: the app's Supabase client points
// at production, so a test with a missing mock must fail, not query it.

describe("the unit-test network guard", () => {
  it("rejects any request to a real server", async () => {
    await expect(fetch("https://example.supabase.co/rest/v1/products")).rejects.toThrow(
      /Network access is blocked in unit tests/,
    );
  });

  it("stays in place after a test stubs and restores fetch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]")));
    await expect(fetch("https://example.test")).resolves.toBeInstanceOf(Response);
    vi.unstubAllGlobals();
    await expect(fetch("https://example.supabase.co/auth/v1/user")).rejects.toThrow(
      /Network access is blocked in unit tests/,
    );
  });

  it("refuses WebSocket connections (Supabase realtime)", () => {
    expect(() => new WebSocket("wss://example.supabase.co/realtime/v1/websocket")).toThrow(
      /WebSocket connections are blocked in unit tests/,
    );
  });
});
