import React from "react";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

const migration = readFileSync(
  "supabase/migrations/20260829210000_connect_onboarding_to_saas_catalog.sql",
  "utf8",
);

const state = vi.hoisted(() => ({ admin: null as unknown }));
const page = vi.hoisted(() => ({ plans: [] as unknown[], trialDays: 7 }));
// Server functions run for real (recording createServerFn); the page gets stubs.
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
const guards = { requireSupabaseAuth: { guard: "authenticated" } };
vi.mock("../src/integrations/supabase/auth-middleware", () => guards);
vi.mock("@/integrations/supabase/auth-middleware", () => guards);
const adminClient = {
  get supabaseAdmin() {
    return state.admin;
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);
const turnstile = { verifyOnboardingTurnstile: async () => true };
vi.mock("../src/lib/turnstile.server", () => turnstile);
vi.mock("@/lib/turnstile.server", () => turnstile);
const addons = { installStarterPack: vi.fn(async () => undefined) };
vi.mock("../src/lib/addons/addons.functions", () => addons);
vi.mock("@/lib/addons/addons.functions", () => addons);
const onboardingStubs = {
  registerInstantTrial: vi.fn(),
  getPublicOnboardingPlans: async () => page.plans,
  getOnboardingTrialDays: async () => page.trialDays,
};
vi.mock("../src/lib/onboarding.functions", () => onboardingStubs);
vi.mock("@/lib/onboarding.functions", () => onboardingStubs);
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn() } }));
const preview = { StorefrontLivePreview: () => null };
vi.mock("../src/components/onboarding/StorefrontLivePreview", () => preview);
vi.mock("@/components/onboarding/StorefrontLivePreview", () => preview);

const functions = (await vi.importActual("../src/lib/onboarding.functions")) as unknown as Record<
  string,
  ServerFn
>;
const { Route: onboardRoute } = (await import("../src/routes/onboard")) as unknown as {
  Route: { options: { component: React.ComponentType } };
};
const { I18nProvider } = await import("../src/lib/i18n");
const { toast } = await import("sonner");

const PLAN = "0f2c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a22";
const VERSION = "1f2c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a33";
const REQUEST = "2f2c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a44";
const version = {
  id: VERSION,
  plan_id: PLAN,
  version_number: 2,
  currency: "BHD",
  price_monthly: 12,
  price_annual: 120,
};
const plan = {
  id: PLAN,
  code: "pro",
  name_en: "Pro",
  name_ar: "برو",
  trial_days: 7,
  is_active: true,
  is_public: true,
};
const request = (overrides: Record<string, unknown> = {}) => ({
  fullName: "Sara Ali",
  contactNumber: "39001122",
  email: "sara@example.com",
  desiredSubdomain: "sara",
  requestType: "paid",
  selectedPlanId: PLAN,
  selectedPlanVersionId: VERSION,
  billingInterval: "annual",
  turnstileToken: "token",
  ...overrides,
});
const filtersOf = (queries: Array<{ table: string; filters: unknown[] }>, table: string) =>
  queries.filter((query) => query.table === table).flatMap((query) => query.filters);

describe("onboarding SaaS catalog contract", () => {
  it("only exposes active public plans with current versions", async () => {
    const db = fakeSupabase({
      rows: {
        system_settings: { billing_interval_mode: "both" },
        saas_plans: [plan],
        saas_plan_versions: version,
        saas_plan_features: [],
      },
    });
    state.admin = db.supabase;
    const plans = await functions.getPublicOnboardingPlans({ context: {} });
    expect(plans).toEqual([expect.objectContaining({ id: PLAN, version })]);
    expect(filtersOf(db.queries, "saas_plans")).toEqual(
      expect.arrayContaining([
        ["is_active", true],
        ["is_public", true],
      ]),
    );
    expect(filtersOf(db.queries, "saas_plan_versions")).toContainEqual(["is_current", true]);
  });

  it("locks the selected plan version and server-calculated quote on the request", async () => {
    const submit = (overrides: Record<string, unknown>, versionRow: unknown = version) => {
      const db = fakeSupabase({ rows: { saas_plans: plan, saas_plan_versions: versionRow } });
      state.admin = db.supabase;
      return { run: functions.createTenantRequest({ data: request(overrides), context: {} }), db };
    };
    await expect(
      submit({ selectedPlanId: undefined, selectedPlanVersionId: undefined }).run,
    ).rejects.toThrow("PLAN_SELECTION_REQUIRED");
    await expect(
      submit({ billingInterval: "monthly" }, { ...version, price_monthly: 0 }).run,
    ).rejects.toThrow("PLAN_INTERVAL_NOT_FOR_SALE");

    const ok = submit({});
    await ok.run;
    expect(ok.db.writes).toEqual([
      expect.objectContaining({
        table: "tenant_requests",
        values: expect.objectContaining({
          selected_plan_id: PLAN,
          selected_plan_version_id: VERSION,
          billing_interval: "annual",
          quoted_price: 120,
          quoted_currency: "BHD",
        }),
      }),
    ]);
  });

  it("activates the exact selected version as the brand subscription", async () => {
    const db = fakeSupabase({
      rows: {
        tenant_requests: {
          id: REQUEST,
          request_type: "trial",
          desired_subdomain: "Sara",
          selected_plan_id: PLAN,
          selected_plan_version_id: VERSION,
          billing_interval: "trial",
        },
        saas_plans: { trial_days: 7 },
        saas_plan_versions: version,
        brands: { id: "brand-1" },
      },
      rpc: { is_super_admin: true },
    });
    const before = Date.now();
    await functions.approveTenantRequest({ data: { requestId: REQUEST }, context: db });
    const subscription = db.writes.find((write) => write.table === "brand_subscriptions");
    expect(subscription?.values).toMatchObject({
      values: {
        brand_id: "brand-1",
        plan_id: PLAN,
        plan_version_id: VERSION,
        billing_interval: "trial",
        status: "trialing",
      },
      options: { onConflict: "brand_id" },
    });
    // The trial length comes from the trial plan (7 days), not a hard-coded 3.
    const trialEnds = Date.parse(
      (subscription?.values as { values: { trial_ends_at: string } }).values.trial_ends_at,
    );
    expect(trialEnds - before).toBeGreaterThanOrEqual(7 * 86_400_000 - 1000);
    expect(trialEnds - before).toBeLessThan(8 * 86_400_000);
  });

  it("sources the free-trial duration from the super-admin plan configuration", async () => {
    const trialDays = async (row: unknown) => {
      const db = fakeSupabase({ rows: { saas_plans: row } });
      state.admin = db.supabase;
      const days = await functions.getOnboardingTrialDays({ context: {} });
      return { days, filters: filtersOf(db.queries, "saas_plans") };
    };
    expect(await trialDays({ trial_days: 7 })).toEqual({
      days: 7,
      filters: [
        ["code", "trial"],
        ["is_active", true],
      ],
    });
    expect((await trialDays(null)).days).toBe(3);
    expect((await trialDays({ trial_days: 0 })).days).toBe(3);
  });

  it("renders the live catalog, monthly or annual prices, and the configured trial", async () => {
    page.trialDays = 7;
    page.plans = [
      {
        ...plan,
        version,
        features: [],
        billing_interval_mode: "both",
        platform_billing_interval_mode: "both",
      },
    ];
    localStorage.setItem("lang", "en");
    const Onboard = onboardRoute.options.component;
    render(
      <I18nProvider>
        <Onboard />
      </I18nProvider>,
    );
    expect(
      await screen.findByText("7 Days Free Trial — No Credit Card Required"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/3 Days Free Trial/)).not.toBeInTheDocument();
    // Annual by default: 120 BHD a year.
    expect(await screen.findByText("BHD / mo (120 BHD/yr)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    expect(screen.queryByText("BHD / mo (120 BHD/yr)")).not.toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("allows monthly, annual and trial intervals in the database", () => {
    expect(migration).toContain("billing_interval IN ('monthly','annual','trial')");
  });

  it("requires one of the platform's verticals, with no fashion fallback", () => {
    const trial = {
      brandName: "Qoffee",
      slug: "qoffee",
      ownerName: "Sara Ali",
      contactNumber: "39001122",
      email: "sara@example.com",
      password: "secret-123",
      turnstileToken: "token",
    };
    const validate = (
      functions.registerInstantTrial as unknown as {
        validate: (raw: unknown) => unknown;
      }
    ).validate;
    expect(() => validate({ ...trial, storeVertical: "coffee" })).not.toThrow();
    expect(() => validate({ ...trial, storeVertical: "Abayas & Fashion" })).toThrow();
    expect(() => validate(trial)).toThrow();
  });

  it("makes the merchant choose a vertical before launching", async () => {
    page.plans = [];
    localStorage.setItem("lang", "en");
    const Onboard = onboardRoute.options.component;
    const { container } = render(
      <I18nProvider>
        <Onboard />
      </I18nProvider>,
    );
    expect((await screen.findAllByText("Launch Your Boutique")).length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("Boutique & Fashion");
    // Nothing is preselected: submitting asks for the vertical first.
    fireEvent.submit(container.querySelector("form")!);
    expect(toast.error).toHaveBeenCalledWith("Please select your store vertical first.");
    expect(onboardingStubs.registerInstantTrial).not.toHaveBeenCalled();
  });
});
