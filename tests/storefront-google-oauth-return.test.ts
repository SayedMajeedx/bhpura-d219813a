import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStorefrontOAuthReturn,
  readStorefrontOAuthReturn,
  rememberStorefrontOAuthReturn,
} from "../src/lib/storefront-oauth-return";
import { readFileSync } from "node:fs";

describe("storefront Google OAuth return", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("remembers and clears a safe storefront confirmation path", () => {
    rememberStorefrontOAuthReturn("/pura/auth-confirmed");
    expect(readStorefrontOAuthReturn()).toBe("/pura/auth-confirmed");
    clearStorefrontOAuthReturn();
    expect(readStorefrontOAuthReturn()).toBeNull();
  });

  it("rejects external and admin return paths", () => {
    rememberStorefrontOAuthReturn("//evil.example/auth-confirmed");
    rememberStorefrontOAuthReturn("/admin/auth-confirmed");
    expect(readStorefrontOAuthReturn()).toBeNull();
  });

  it("expires stale OAuth intent", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T10:00:00Z"));
    rememberStorefrontOAuthReturn("/pura/auth-confirmed");
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(readStorefrontOAuthReturn()).toBeNull();
  });

  it("intercepts the protected admin shell before role routing", () => {
    const protectedRoute = readFileSync("src/routes/_authenticated/route.tsx", "utf8");
    expect(protectedRoute).toContain("const storefrontReturn = readStorefrontOAuthReturn()");
    expect(protectedRoute).toContain("throw redirect({ to: storefrontReturn as any })");
  });
});
