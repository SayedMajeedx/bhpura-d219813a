import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

// The instant trial makes a user and a brand from one public call. It must ask "is this a person"
// before it creates anything, and ask for a password that is worth having.

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
const turnstile = { verifyOnboardingTurnstile: vi.fn(async (_input: unknown) => true) };
vi.mock("../src/lib/turnstile.server", () => turnstile);
vi.mock("@/lib/turnstile.server", () => turnstile);
const addons = { installStarterPack: vi.fn(async () => undefined) };
vi.mock("../src/lib/addons/addons.functions", () => addons);
vi.mock("@/lib/addons/addons.functions", () => addons);

const { registerInstantTrial } = (await import("../src/lib/onboarding.functions")) as unknown as {
  registerInstantTrial: ServerFn & { validate: (raw: unknown) => unknown };
};

const trial = {
  brandName: "Noor",
  slug: "noor",
  ownerName: "Sara Ali",
  contactNumber: "+97339001122",
  email: "Sara@Example.com",
  password: "a-long-secret",
  storeVertical: "abayas",
  turnstileToken: "token-from-the-widget",
};

function server() {
  const fake = fakeSupabase({ rpc: { create_tenant_with_defaults: "brand-1" } });
  const createUser = vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null }));
  state.admin = { ...fake.supabase, auth: { admin: { createUser } } };
  return { fake, createUser };
}

beforeEach(() => {
  turnstile.verifyOnboardingTurnstile.mockClear();
  turnstile.verifyOnboardingTurnstile.mockResolvedValue(true);
});

describe("the instant trial", () => {
  it("creates nothing when the person check fails", async () => {
    turnstile.verifyOnboardingTurnstile.mockResolvedValue(false);
    const { fake, createUser } = server();
    await expect(registerInstantTrial({ data: trial, context: {} })).rejects.toThrow(
      "TURNSTILE_VERIFICATION_FAILED",
    );
    expect(createUser).not.toHaveBeenCalled();
    expect(fake.writes).toHaveLength(0);
    // It does not even look the email or the address up (no answer for a script to harvest).
    expect(fake.queries).toHaveLength(0);
    expect(fake.supabase.rpc).not.toHaveBeenCalled();
  });

  it("checks the token the browser sent, then creates the user and the brand", async () => {
    const { fake, createUser } = server();
    const result = (await registerInstantTrial({ data: trial, context: {} })) as {
      alreadyRegistered: boolean;
      brandSlug: string;
    };
    expect(turnstile.verifyOnboardingTurnstile).toHaveBeenCalledWith(
      expect.objectContaining({ token: "token-from-the-widget" }),
    );
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "sara@example.com" }));
    expect(fake.supabase.rpc).toHaveBeenCalledWith(
      "create_tenant_with_defaults",
      expect.objectContaining({ p_slug: "noor" }),
    );
    expect(result).toMatchObject({ alreadyRegistered: false, brandSlug: "noor" });
  });

  it("starts the owner unverified: the address is not proven until they enter a code", async () => {
    const { fake } = server();
    await registerInstantTrial({ data: trial, context: {} });
    const profile = fake.writes.find(
      (w) => w.table === "profiles" && (w.values as { values?: unknown }).values,
    );
    expect((profile!.values as { values: Record<string, unknown> }).values).toMatchObject({
      role: "brand_admin",
      email_verified_at: null,
    });
  });

  it("will not accept a call without the token", () => {
    const { turnstileToken: _omit, ...withoutToken } = trial;
    expect(() => registerInstantTrial.validate(withoutToken)).toThrow();
    expect(() => registerInstantTrial.validate({ ...trial, turnstileToken: "" })).toThrow();
  });

  it("asks for a password of at least eight characters", () => {
    expect(() => registerInstantTrial.validate({ ...trial, password: "1234567" })).toThrow();
    expect(() => registerInstantTrial.validate({ ...trial, password: "12345678" })).not.toThrow();
  });
});
