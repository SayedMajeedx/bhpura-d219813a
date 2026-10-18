import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrendingUp } from "lucide-react";

// The admin on a phone, measured on Pura (2026-10-18): coming back to the app read the profile
// again (two requests to Tokyo) and redrew every screen; the settings kept their "Start here"
// guide after the launch checklist was done; a KPI card cut its own label.

type AuthListener = (
  event: string,
  session: { user: { id: string; email: string } } | null,
) => void;
const auth = vi.hoisted(() => ({
  listeners: [] as AuthListener[],
  profileReads: [] as string[],
}));

const supabaseMock = vi.hoisted(() => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: "u1", email: "owner@pura.test" } } }),
      onAuthStateChange: (listener: AuthListener) => {
        auth.listeners.push(listener);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => {
            auth.profileReads.push(id);
            return {
              data: { id, email: `${id}@pura.test`, role: "brand_admin", status: "active" },
              error: null,
            };
          },
        }),
      }),
    }),
  },
}));
vi.mock("@/integrations/supabase/client", () => supabaseMock);
vi.mock("../src/integrations/supabase/client", () => supabaseMock);
vi.mock("@/lib/auth/session", () => ({ signOut: vi.fn() }));
vi.mock("../src/lib/auth/session", () => ({ signOut: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

const { ProfileProvider, useProfile } = await import("../src/lib/profile-context");
const { profileAuthAction, keepIfSame } = await import("../src/lib/profile-refresh");
const { identityGuideShown } = await import("../src/features/settings/lib/readiness-fold");
const { DashboardKpiCards } =
  await import("../src/features/dashboard/components/DashboardKpiCards");
const { shortcutHint } = await import("../src/lib/platform-shortcut");

describe("reading the profile again", () => {
  it("only for a new person, a change to the person, or a sign-out", () => {
    expect(profileAuthAction("SIGNED_IN", "u1", "u1")).toBe("keep");
    expect(profileAuthAction("TOKEN_REFRESHED", "u1", "u1")).toBe("keep");
    expect(profileAuthAction("INITIAL_SESSION", "u1", "u1")).toBe("keep");
    expect(profileAuthAction("USER_UPDATED", "u1", "u1")).toBe("load");
    expect(profileAuthAction("SIGNED_IN", "u2", "u1")).toBe("load");
    expect(profileAuthAction("SIGNED_IN", "u1", null)).toBe("load");
    expect(profileAuthAction("SIGNED_OUT", "u1", "u1")).toBe("clear");
    expect(profileAuthAction("TOKEN_REFRESHED", null, "u1")).toBe("clear");
  });

  it("keeps the profile it holds when a read says the same", () => {
    const held = { id: "u1", role: "staff" };
    expect(keepIfSame(held, { id: "u1", role: "staff" })).toBe(held);
    const changed = { id: "u1", role: "brand_admin" };
    expect(keepIfSame(held, changed)).toBe(changed);
    expect(keepIfSame(held, null)).toBeNull();
  });

  it("costs nothing when the merchant comes back to the app", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let renders = 0;
    function Reader() {
      const { profile, isLoading } = useProfile();
      renders++;
      return <p>{isLoading ? "loading" : (profile?.id ?? "none")}</p>;
    }
    render(
      <ProfileProvider>
        <Reader />
      </ProfileProvider>,
    );
    const fire = async (event: string, userId: string | null) => {
      await act(async () => {
        for (const listener of auth.listeners) {
          listener(event, userId ? { user: { id: userId, email: `${userId}@pura.test` } } : null);
        }
        await vi.runAllTimersAsync();
      });
    };

    // The first load and INITIAL_SESSION share one read.
    await fire("INITIAL_SESSION", "u1");
    await waitFor(() => expect(screen.getByText("u1")).toBeInTheDocument());
    expect(auth.profileReads).toEqual(["u1"]);

    // Switching back to the app, and the hourly token: no read, no redraw.
    const settled = renders;
    await fire("SIGNED_IN", "u1");
    await fire("TOKEN_REFRESHED", "u1");
    expect(auth.profileReads).toEqual(["u1"]);
    expect(renders).toBe(settled);

    // Their details changed: read, but the same answer redraws nothing.
    await fire("USER_UPDATED", "u1");
    expect(auth.profileReads).toEqual(["u1", "u1"]);
    expect(renders).toBe(settled);

    // Someone else, then nobody.
    await fire("SIGNED_IN", "u2");
    expect(screen.getByText("u2")).toBeInTheDocument();
    await fire("SIGNED_OUT", null);
    expect(screen.getByText("none")).toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe("the settings' Start here guide", () => {
  it("shows while an identity step of the launch checklist is open, and not after", () => {
    const steps = [
      { tabId: "identity", isComplete: true },
      { tabId: "identity", isComplete: false },
      { tabId: "payments", isComplete: false },
    ];
    expect(identityGuideShown(steps)).toBe(true);
    steps[1].isComplete = true;
    // A step elsewhere (payments, products) is not the guide's business.
    expect(identityGuideShown(steps)).toBe(false);
  });
});

describe("a search's placeholder on a phone", () => {
  it("names the keyboard shortcut only where there is a keyboard to press it", () => {
    // "Search product name, SKU, or barcode... (Ctrl+K)" was cut in a phone's 222px field.
    expect(shortcutHint("⌘K", true)).toBe(" (⌘K)");
    expect(shortcutHint("Ctrl+K", false)).toBe("");
  });
});

describe("a dashboard figure on a phone", () => {
  it("never cuts its own label or the line under it", () => {
    render(
      <DashboardKpiCards
        isAr
        primaryKpis={[
          {
            label: "الإيرادات وصافي الربح",
            value: "135.000",
            subValue: "صافي الربح: 67.429",
            deltaPct: 26.5,
            icon: TrendingUp,
            color: "text-emerald-500",
            border: "",
            breakdown: null,
          },
        ]}
      />,
    );
    for (const text of ["الإيرادات وصافي الربح", "صافي الربح: 67.429"]) {
      expect(screen.getByText(text).className).not.toMatch(/line-clamp|truncate/);
    }
  });
});
