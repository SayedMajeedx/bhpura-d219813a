import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

// Referrals on the storefront (migration 20261228100000): the link a member shares, the code a
// visitor's browser keeps for the store, the checkout's step that records it, and the member's
// invitation. The database's side is tests/loyalty-referrals-migration.test.ts.

const state = vi.hoisted(() => ({
  admin: null as unknown,
  referral: null as unknown,
}));
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
const adminClient = {
  get supabaseAdmin() {
    return state.admin;
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);
const loyaltyData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  loyaltyQueries: {
    myReferral: () => ({ queryKey: ["my-referral"], queryFn: async () => state.referral }),
  },
});
vi.mock("../src/lib/data/loyalty", (io) => loyaltyData(io));
vi.mock("@/lib/data/loyalty", (io) => loyaltyData(io));

const links = await import("../src/lib/referral-link");
const { ReferralInviteCard } = await import("../src/components/loyalty/ReferralInviteCard");
const fns = (await import("../src/lib/referral-checkout.functions")) as unknown as {
  recordReferralAtCheckout: ServerFn;
};

const ORDER = "00000000-0000-4000-8000-0000000000d1";
const BRAND = "00000000-0000-4000-8000-0000000000b1";
const DAY = 86_400_000;

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

describe("a referral link", () => {
  it("is the store's address with the member's code", () => {
    expect(links.referralLink("pura", "AB12CD34")).toBe(
      "https://pura.boutq.store/pura?ref=AB12CD34",
    );
  });

  it("is kept for the store for 30 days, and only when it is a code", () => {
    const store = memoryStorage();
    links.rememberReferral("pura", "ab12cd34", 1_000, store);
    expect(links.readReferral("pura", 1_000 + 29 * DAY, store)).toBe("AB12CD34");
    expect(links.readReferral("pura", 1_000 + 31 * DAY, store)).toBeNull();
    expect(links.readReferral("other", 1_000, store)).toBeNull();
    links.rememberReferral("pura", "<script>", 2_000, store);
    expect(links.readReferral("pura", 2_000, store)).toBe("AB12CD34");
    links.forgetReferral("pura", store);
    expect(links.readReferral("pura", 2_000, store)).toBeNull();
  });

  it("is sent with words in the reader's language, with no gendered verb", () => {
    const ar = links.inviteMessage("https://x/pura?ref=AB12CD34", "بيورا", 100, "ar");
    expect(ar).toContain("لكلٍّ منّا 100 نقطة ولاء");
    expect(ar).toContain("https://x/pura?ref=AB12CD34");
    expect(links.inviteMessage("L", "Pura", 100, "en")).toContain("we each get 100 points");
  });
});

describe("the member's invitation", () => {
  const show = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ReferralInviteCard
          brandId={BRAND}
          customerId="c1"
          slug="pura"
          storeName="Pura"
          lang="en"
        />
      </QueryClientProvider>,
    );

  it("shows the link, what each side gets, and a WhatsApp message a person sends", async () => {
    state.referral = { code: "AB12CD34", points: 100, friends: 2, rewarded: 1 };
    show();
    expect(
      await screen.findByText("https://pura.boutq.store/pura?ref=AB12CD34"),
    ).toBeInTheDocument();
    expect(screen.getByText(/you each get 100 points/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Send on WhatsApp/ }).getAttribute("href")).toMatch(
      /^https:\/\/wa\.me\/\?text=.*AB12CD34/,
    );
    expect(
      screen.getByText("Through your link: 2 customers, 1 with a completed order."),
    ).toBeInTheDocument();
  });

  it("is not drawn while the store gives no points for a referral", async () => {
    state.referral = null;
    const { container } = show();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("recording it at checkout", () => {
  const data = {
    orderId: ORDER,
    brandId: BRAND,
    confirmationToken: "token-123456",
    code: "ab12cd34",
  };

  beforeEach(() => vi.clearAllMocks());

  it("asks the database only for the shopper's own order, proven by its token", async () => {
    const rpc = vi.fn(async () => ({ data: "RECORDED", error: null }));
    const fake = fakeSupabase({ rows: {} as never });
    state.admin = { ...fake.supabase, rpc };
    expect(await fns.recordReferralAtCheckout({ data })).toEqual({ result: "ORDER_NOT_FOUND" });
    expect(rpc).not.toHaveBeenCalled();
    expect(fake.queries[0].filters).toEqual(
      expect.arrayContaining([
        ["id", ORDER],
        ["brand_id", BRAND],
        ["confirmation_email_token", "token-123456"],
      ]),
    );
  });

  it("records it with the code as the database writes it, and passes on the answer", async () => {
    const rpc = vi.fn(async () => ({ data: "OWN_CODE", error: null }));
    const fake = fakeSupabase({ rows: { orders: { id: ORDER } } as never });
    state.admin = { ...fake.supabase, rpc };
    expect(await fns.recordReferralAtCheckout({ data })).toEqual({ result: "OWN_CODE" });
    expect(rpc).toHaveBeenCalledWith("record_order_referral", {
      p_order_id: ORDER,
      p_code: "AB12CD34",
    });
  });

  it("refuses what is not a code before asking anything", async () => {
    await expect(
      fns.recordReferralAtCheckout({ data: { ...data, code: "x' OR 1=1" } }),
    ).rejects.toThrow();
  });
});
