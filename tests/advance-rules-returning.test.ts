import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const client = vi.hoisted(() => ({ supabase: { rpc, from: vi.fn() } }));

vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

import { advanceRulesQueries, fetchCustomerIsReturning } from "../src/lib/data/advance-rules";

describe("asking whether the signed-in customer is a returning one", () => {
  beforeEach(() => rpc.mockReset());

  it("calls the store's function by its slug and reads a plain true", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(fetchCustomerIsReturning("pura")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("advance_customer_is_returning_rpc", {
      p_brand_slug: "pura",
    });
  });

  it("reads anything but true as a new customer", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(fetchCustomerIsReturning("pura")).resolves.toBe(false);
  });

  it("passes the database's error on", async () => {
    const error = new Error("boom");
    rpc.mockResolvedValue({ data: null, error });
    await expect(fetchCustomerIsReturning("pura")).rejects.toBe(error);
  });

  it("only runs when a rule needs the customer and a store is known", () => {
    expect(advanceRulesQueries.returning("pura", true).enabled).toBe(true);
    expect(advanceRulesQueries.returning("pura", false).enabled).toBe(false);
    expect(advanceRulesQueries.returning("", true).enabled).toBe(false);
  });
});
