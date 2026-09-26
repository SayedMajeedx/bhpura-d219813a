import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in checkout data-layer tests");
});

type Call = { fn: string; args: unknown };
type Reply = { data?: unknown; error: unknown };

const calls: Call[] = [];
let respond: (call: Call) => Reply = () => ({ data: null, error: null });

const client = {
  supabase: {
    rpc: (fn: string, args: unknown) => {
      const call = { fn, args };
      calls.push(call);
      return Promise.resolve(respond(call));
    },
  },
};
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const checkout = await import("../src/lib/data/checkout");

const denied = { message: "OUT_OF_STOCK" };

beforeEach(() => {
  calls.length = 0;
  respond = () => ({ data: null, error: null });
});

describe("placing a storefront order", () => {
  const input = {
    p_brand_slug: "pura",
    p_payment_method: "benefit",
    p_customer: { name: "Fatima" },
    p_items: [{ variant_id: "v1", quantity: 1 }],
    p_branch_id: null,
    p_promo_code: null,
    p_idempotency_key: "k1",
  };

  it("sends the builder's arguments as they are, NULLs included", async () => {
    respond = () => ({
      data: { order_id: "o1", confirmation_email_token: "tok" },
      error: null,
    });
    expect(await checkout.placeStorefrontOrder(input)).toEqual({
      orderId: "o1",
      confirmationToken: "tok",
    });
    expect(calls).toEqual([{ fn: "place_storefront_order", args: input }]);
  });

  it("throws the database error so the checkout can explain it", async () => {
    respond = () => ({ data: null, error: denied });
    await expect(checkout.placeStorefrontOrder(input)).rejects.toBe(denied);
  });
});

describe("WhatsApp order-update consent", () => {
  it("is recorded with the order's confirmation token, and reports a failure", async () => {
    expect(await checkout.recordOrderWhatsappOptIn("o1", "tok")).toBe(true);
    expect(calls[0]).toEqual({
      fn: "record_order_whatsapp_opt_in",
      args: { p_order_id: "o1", p_confirmation_token: "tok" },
    });
    respond = () => ({ error: denied });
    expect(await checkout.recordOrderWhatsappOptIn("o1", "tok")).toBe(false);
  });
});

describe("the registered-account check", () => {
  it("asks by the one contact typed, the other left empty", async () => {
    respond = () => ({ data: true, error: null });
    expect(await checkout.isRegisteredCustomer("b1", { phone: "97339001122" })).toBe(true);
    expect(calls[0]).toEqual({
      fn: "check_registered_customer_exists",
      args: { p_brand_id: "b1", p_email: "", p_phone: "97339001122" },
    });
    respond = () => ({ data: false, error: null });
    expect(await checkout.isRegisteredCustomer("b1", { email: "a@b.bh" })).toBe(false);
    respond = () => ({ data: null, error: denied });
    await expect(checkout.isRegisteredCustomer("b1", { email: "a@b.bh" })).rejects.toBe(denied);
  });
});
