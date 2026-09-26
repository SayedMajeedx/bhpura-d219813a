import { beforeEach, describe, expect, it, vi } from "vitest";

// The session and the auth listener are driven by the test; the protected
// route's heavy shell is stubbed (only its guard runs).
const auth = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  listener: null as null | ((event: string, session: unknown) => void),
  unsubscribe: vi.fn(),
  ensureSessionUser: vi.fn(async () => null),
}));
const session = { getCurrentSession: async () => auth.session };
const signIn = {
  onAuthChange: (listener: (event: string, session: unknown) => void) => {
    auth.listener = listener;
    return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
  },
};
const guard = { ensureSessionUser: auth.ensureSessionUser };
const shell = { AppShell: () => null };
const skeleton = { RoutePendingSkeleton: () => null };
vi.mock("../src/lib/auth/session", () => session);
vi.mock("@/lib/auth/session", () => session);
vi.mock("../src/lib/auth/sign-in", () => signIn);
vi.mock("@/lib/auth/sign-in", () => signIn);
vi.mock("../src/lib/auth/ensure-session-user", () => guard);
vi.mock("@/lib/auth/ensure-session-user", () => guard);
vi.mock("../src/components/app-shell", () => shell);
vi.mock("@/components/app-shell", () => shell);
vi.mock("../src/components/os/route-pending-skeleton", () => skeleton);
vi.mock("@/components/os/route-pending-skeleton", () => skeleton);

const { continueToStorefrontWhenSignedIn, prepareStorefrontGoogleSignIn } =
  await import("../src/lib/auth/storefront-return");
const { Route: ProtectedRoute } = await import("../src/routes/_authenticated/route");
import {
  clearStorefrontOAuthReturn,
  readStorefrontOAuthReturn,
  rememberStorefrontOAuthReturn,
} from "../src/lib/storefront-oauth-return";

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

  it("intercepts the protected admin shell before role routing", async () => {
    rememberStorefrontOAuthReturn("/pura/auth-confirmed");
    const beforeLoad = ProtectedRoute.options.beforeLoad as (args: unknown) => Promise<unknown>;
    const outcome = await beforeLoad({ context: { queryClient: {} } }).catch((thrown) => thrown);
    expect(outcome).toMatchObject({ options: { to: "/pura/auth-confirmed" } });
    // It never gets as far as the admin session and role checks.
    expect(auth.ensureSessionUser).not.toHaveBeenCalled();
  });

  it("keeps a Google shopper signed in and remembers where to return", () => {
    prepareStorefrontGoogleSignIn("/pura/auth-confirmed");
    expect(localStorage.getItem("boutq.auth.rememberMe")).toBe("1");
    expect(readStorefrontOAuthReturn()).toBe("/pura/auth-confirmed");
  });

  it("sends the shopper on to their store once the Google session exists", async () => {
    const go = vi.fn();
    // Nothing pending: the admin sign-in page behaves normally.
    expect(continueToStorefrontWhenSignedIn(go)).toBeUndefined();

    // Pending, and the session is already there.
    rememberStorefrontOAuthReturn("/pura/auth-confirmed");
    auth.session = { user: { id: "u1" } };
    continueToStorefrontWhenSignedIn(go);
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith("/pura/auth-confirmed"));

    // Pending, and the session arrives later through the auth listener.
    go.mockClear();
    auth.session = null;
    const stop = continueToStorefrontWhenSignedIn(go);
    await Promise.resolve();
    expect(go).not.toHaveBeenCalled();
    auth.listener?.("SIGNED_IN", { user: { id: "u1" } });
    expect(go).toHaveBeenCalledWith("/pura/auth-confirmed");

    // After the page is left, a late sign-in no longer navigates.
    go.mockClear();
    stop?.();
    expect(auth.unsubscribe).toHaveBeenCalled();
    auth.listener?.("SIGNED_IN", { user: { id: "u1" } });
    expect(go).not.toHaveBeenCalled();
  });
});
