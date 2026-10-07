import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

// An instant-trial owner has not proved they own their email. Until they do, they cannot pay for a
// plan or add an add-on; a code emailed by Supabase Auth proves it, and only the server marks it.

const state = vi.hoisted(() => ({ admin: null as unknown }));
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

const owner = await import("../src/lib/owner-email");
const { confirmOwnerEmail } =
  (await import("../src/lib/owner-verification.functions")) as unknown as {
    confirmOwnerEmail: ServerFn;
  };
const subscription = (await import("../src/lib/saas-subscription.functions")) as unknown as Record<
  string,
  ServerFn
>;
const paypal = (await import("../src/lib/paypal-subscription.functions")) as unknown as Record<
  string,
  ServerFn
>;
const billing =
  (await import("../src/lib/saas-billing/saas-billing.functions")) as unknown as Record<
    string,
    ServerFn
  >;

const NOW = Date.parse("2026-10-07T12:00:00Z");
const seconds = (ms: number) => Math.floor(ms / 1000);
const BRAND = "00000000-0000-4000-8000-0000000000b1";
const UUID = "00000000-0000-4000-8000-0000000000a1";

describe("what proves an email address", () => {
  const proof = (method: string, ageMinutes: number) => ({
    amr: [{ method, timestamp: seconds(NOW - ageMinutes * 60_000) }],
  });

  it("is a code or link emailed to the person, within the last half hour", () => {
    expect(owner.emailProofIsFresh(proof("otp", 2), NOW)).toBe(true);
    expect(owner.emailProofIsFresh(proof("magiclink", 29), NOW)).toBe(true);
    expect(owner.emailProofIsFresh(proof("otp", 31), NOW)).toBe(false);
  });

  it("is never a password, and never nothing", () => {
    expect(owner.emailProofIsFresh(proof("password", 0), NOW)).toBe(false);
    expect(owner.emailProofIsFresh({}, NOW)).toBe(false);
    expect(owner.emailProofIsFresh(null, NOW)).toBe(false);
    expect(owner.emailProofIsFresh({ amr: [{ method: "otp" }] }, NOW)).toBe(false);
    expect(owner.emailProofIsFresh({ amr: "otp" }, NOW)).toBe(false);
  });

  it("reads the claims out of an access token", () => {
    const payload = btoa(JSON.stringify({ amr: [{ method: "otp", timestamp: 1 }] }));
    expect(owner.claimsOfAccessToken(`h.${payload}.s`)).toEqual({
      amr: [{ method: "otp", timestamp: 1 }],
    });
    expect(owner.claimsOfAccessToken("not-a-token")).toBeNull();
    expect(owner.claimsOfAccessToken(null)).toBeNull();
  });
});

describe("confirming the email on the server", () => {
  const server = (profile: Record<string, unknown> | null) => {
    const fake = fakeSupabase({ rows: { profiles: profile } });
    state.admin = fake.supabase;
    return fake;
  };
  const call = (claims: Record<string, unknown>) =>
    confirmOwnerEmail({ context: { supabase: {}, userId: "u1", claims } });
  const fresh = (email = "sara@example.com") => ({
    email,
    amr: [{ method: "otp", timestamp: seconds(Date.now() - 60_000) }],
  });

  it("runs only for a signed-in caller", () => {
    expect(confirmOwnerEmail.middleware).toHaveLength(1);
  });

  it("marks the account verified after a fresh emailed code for the profile's own address", async () => {
    const fake = server({ email: "Sara@Example.com", email_verified_at: null });
    await expect(call(fresh())).resolves.toEqual({ verified: true });
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]).toMatchObject({
      table: "profiles",
      values: { email_verified_at: expect.any(String) },
      filters: [["id", "u1"]],
    });
  });

  it("refuses a session that only has a password, an old code, or someone else's address", async () => {
    const fake = server({ email: "sara@example.com", email_verified_at: null });
    await expect(
      call({
        email: "sara@example.com",
        amr: [{ method: "password", timestamp: seconds(Date.now()) }],
      }),
    ).rejects.toThrow("EMAIL_PROOF_REQUIRED");
    await expect(
      call({
        email: "sara@example.com",
        amr: [{ method: "otp", timestamp: seconds(Date.now() - 3_600_000) }],
      }),
    ).rejects.toThrow("EMAIL_PROOF_REQUIRED");
    await expect(call(fresh("other@example.com"))).rejects.toThrow("EMAIL_MISMATCH");
    expect(fake.writes).toHaveLength(0);
  });

  it("changes nothing for an account that is already verified", async () => {
    const fake = server({ email: "sara@example.com", email_verified_at: "2026-01-01T00:00:00Z" });
    await expect(call(fresh())).resolves.toEqual({ verified: true });
    expect(fake.writes).toHaveLength(0);
  });
});

describe("what an unverified owner cannot do", () => {
  const unverified = () =>
    fakeSupabase({
      rows: { profiles: { email_verified_at: null }, brands: { plan_type: "trial" } },
      rpc: { can_access_brand: true },
    });
  const as = (fake: ReturnType<typeof fakeSupabase>) => ({ supabase: fake.supabase, userId: "u1" });

  const cases: Array<[string, ServerFn, unknown]> = [
    [
      "send a payment receipt",
      subscription.submitSubscriptionReceipt,
      { brandId: BRAND, objectKey: "receipts/abc-123456.png" },
    ],
    [
      "ask for a receipt upload",
      subscription.getSubscriptionReceiptUploadUrl,
      { brandId: BRAND, contentType: "image/png", size: 1000 },
    ],
    [
      "start a PayPal payment",
      paypal.createPayPalSubscriptionOrder,
      { brandId: BRAND, targetPlanId: UUID, billingInterval: "monthly" },
    ],
    [
      "finish a PayPal payment",
      paypal.capturePayPalSubscriptionOrder,
      { brandId: BRAND, orderId: "ORDER-12345", targetPlanId: UUID, billingInterval: "monthly" },
    ],
    [
      "subscribe to an add-on",
      billing.subscribeAddon,
      { brandId: BRAND, addonId: UUID, billingInterval: "monthly" },
    ],
  ];

  it.each(cases)("cannot %s", async (_name, fn, data) => {
    const fake = unverified();
    await expect(fn({ data, context: as(fake) })).rejects.toThrow(owner.OWNER_EMAIL_NOT_VERIFIED);
    expect(fake.writes).toHaveLength(0);
  });

  it("is checked only for an account that has a profile that says unverified", async () => {
    for (const profile of [{ email_verified_at: "2026-01-01T00:00:00Z" }, null]) {
      const fake = fakeSupabase({ rows: { profiles: profile } });
      await expect(
        owner.requireVerifiedOwner({ supabase: fake.supabase as never, userId: "u1" }),
      ).resolves.toBeUndefined();
    }
  });
});

describe("what the owner is told", () => {
  it("says to verify the email, in the shopper's language, and nothing for other errors", () => {
    const stop = new Error(owner.OWNER_EMAIL_NOT_VERIFIED);
    expect(owner.ownerEmailErrorMessage(stop, false)).toMatch(/Verify your email first/);
    expect(owner.ownerEmailErrorMessage(stop, true)).toMatch(/أكّد بريدك/);
    expect(owner.ownerEmailErrorMessage(new Error("EMAIL_NOT_VERIFIED: x"), false)).not.toBeNull();
    expect(owner.ownerEmailErrorMessage(new Error("network down"), false)).toBeNull();
  });
});

beforeEach(() => vi.clearAllMocks());
