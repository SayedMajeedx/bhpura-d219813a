import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in system settings tests");
});

type Request = { table: string; select?: string; filters: Array<[string, ...unknown[]]> };
type Reply = { data?: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: null, error: null });

function builder(table: string) {
  const request: Request = { table, filters: [] };
  requests.push(request);
  const chain = {
    select(columns: string) {
      request.select = columns;
      return chain;
    },
    eq: (...args: unknown[]) => (request.filters.push(["eq", ...args]), chain),
    maybeSingle: () => chain,
    then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}

const client = { supabase: { from: (table: string) => builder(table) } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const settings = await import("../src/lib/data/system-settings");

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: null, error: null });
});

describe("the platform settings row", () => {
  it("gives the subscription payment details of row 1", async () => {
    respond = () => ({ data: { subscription_iban: "BH00" }, error: null });
    expect(await settings.fetchBillingDetails()).toEqual({ subscription_iban: "BH00" });
    expect(requests[0]).toMatchObject({ table: "system_settings" });
    expect(requests[0].filters).toEqual([["eq", "id", 1]]);
    expect(requests[0].select).toContain("benefit_pay_qr_url");
  });

  it("reads as null when unreadable, so screens show their defaults", async () => {
    respond = () => ({ data: null, error: { message: "denied" } });
    expect(await settings.fetchBillingDetails()).toBeNull();
    expect(await settings.fetchBillingIntervalMode()).toBeNull();
  });

  it("keeps both reads under the system settings prefix", () => {
    expect(settings.systemSettingsQueries.billingDetails().queryKey[0]).toBe("system-settings");
    expect(settings.systemSettingsQueries.billingIntervalMode().queryKey).toEqual([
      "system-settings",
      "billing-interval-mode",
    ]);
  });
});
