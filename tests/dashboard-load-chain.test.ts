import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// The dashboard took about 7 seconds to show its figures (2026-10-24): its reads ran as a chain.
// The guard's reads now start together, and the report overview asks for its five parts at once.

const calls: string[] = [];
const pending: Array<() => void> = [];

const answer = (fn: string) => {
  if (fn === "rpc_reporting_overview") return [{ currency: "BHD", paid_order_value: 0 }];
  return [];
};

const client = {
  supabase: {
    rpc: (fn: string) => {
      calls.push(fn);
      // Nothing answers until every call has been made: a chain would wait here for ever.
      return new Promise((resolve) =>
        pending.push(() => resolve({ data: answer(fn), error: null })),
      );
    },
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
    },
    from: () => {
      throw new Error("not expected");
    },
  },
};
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const { fetchReportingOverview } = await import("../src/lib/reporting.functions");
const { adminSlugOf, prefetchAdminShell } = await import("../src/lib/auth/admin-prefetch");
const { profilesQueries } = await import("../src/lib/data/profiles");
const { brandQueries } = await import("../src/lib/data/brands");

describe("the report overview", () => {
  it("asks for the overview, partner sales, returns, cost of goods and fees in one round", async () => {
    const result = fetchReportingOverview(
      { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-31T23:59:59Z") },
      "Asia/Bahrain",
      false,
      "pura",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...calls].sort()).toEqual(
      [
        "rpc_reporting_incubator_sales",
        "rpc_reporting_order_cogs",
        "rpc_reporting_overview",
        "rpc_reporting_processed_returns",
        "rpc_reporting_processing_fees",
      ].sort(),
    );
    pending.forEach((release) => release());
    await expect(result).resolves.toBeDefined();
  });
});

describe("the admin's guard reads", () => {
  it("know the store an address opens", () => {
    expect(adminSlugOf("/admin/b/pura/dashboard")).toBe("pura");
    expect(adminSlugOf("/admin/b/zh")).toBe("zh");
    expect(adminSlugOf("/admin/brands")).toBeNull();
    expect(adminSlugOf(undefined)).toBeNull();
  });

  it("start the profile, the store and its icons together, from the session the browser holds", async () => {
    const queryClient = new QueryClient();
    const prefetch = vi.spyOn(queryClient, "prefetchQuery").mockResolvedValue(undefined);
    await prefetchAdminShell(queryClient, "/admin/b/pura/dashboard");
    expect(prefetch.mock.calls.map(([options]) => options.queryKey)).toEqual([
      profilesQueries.caller("u1").queryKey,
      brandQueries.adminBySlug("pura").queryKey,
      brandQueries.iconsBySlug("pura").queryKey,
    ]);

    prefetch.mockClear();
    await prefetchAdminShell(queryClient, "/admin/brands");
    expect(prefetch.mock.calls.map(([options]) => options.queryKey)).toEqual([
      profilesQueries.caller("u1").queryKey,
    ]);
  });
});
