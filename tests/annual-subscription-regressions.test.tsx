import React from "react";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { brandRow, brandsPageMocks, renderBrandsPage } from "./helpers/brands-page";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), loading: vi.fn() }));
const page = vi.hoisted(() => ({ brands: [] as unknown[] }));
const saas = vi.hoisted(() => ({
  setSubscriptionRenewalDecision: vi.fn(async () => ({ success: true })),
  getSubscriptionReceiptUploadUrl: vi.fn(),
  submitSubscriptionReceipt: vi.fn(),
  getSubscriptionReceiptViewUrl: vi.fn(),
  approveSubscriptionSaaS: vi.fn(async () => ({ success: true })),
  rejectSubscriptionSaaS: vi.fn(),
}));
const platform = vi.hoisted(() => ({
  getPlatformSettings: vi.fn(async () => ({ subscription_iban: "BH11OLDB0000000000000001" })),
  updatePlatformSettings: vi.fn(async () => ({ success: true })),
  getPlatformLogoUploadUrl: vi.fn(),
  getPlatformQrUploadUrl: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

// Server functions run for real (recording createServerFn); screens get stubs.
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
const guards = { requireSupabaseAuth: { guard: "authenticated" } };
vi.mock("../src/integrations/supabase/auth-middleware", () => guards);
vi.mock("@/integrations/supabase/auth-middleware", () => guards);
vi.mock("../src/lib/saas-subscription.functions", () => saas);
vi.mock("@/lib/saas-subscription.functions", () => saas);
vi.mock("../src/lib/onboarding.functions", () => platform);
vi.mock("@/lib/onboarding.functions", () => platform);
const reoptimizer = { SuperVideoReoptimizer: () => null };
vi.mock("../src/components/super/SuperVideoReoptimizer", () => reoptimizer);
vi.mock("@/components/super/SuperVideoReoptimizer", () => reoptimizer);

const billing = {
  fetchBillingDetails: async () => ({ subscription_iban: "BH22 NEWB 0000 0000 0000 02" }),
};
vi.mock("../src/lib/data/system-settings", () => billing);
vi.mock("@/lib/data/system-settings", () => billing);
const hub = { BrandSubscriptionHub: () => null };
vi.mock("../src/components/subscription/BrandSubscriptionHub", () => hub);
vi.mock("@/components/subscription/BrandSubscriptionHub", () => hub);
const mocks = brandsPageMocks(page);
vi.mock("@tanstack/react-router", () => mocks.router);
vi.mock("../src/lib/data/brands", (io) => mocks.brands(io));
vi.mock("@/lib/data/brands", (io) => mocks.brands(io));
vi.mock("../src/lib/data/super-admin", (io) => mocks.superAdmin(io));
vi.mock("@/lib/data/super-admin", (io) => mocks.superAdmin(io));
vi.mock("@/components/super-admin/brand-wizard/BrandWizardDialog", () => mocks.wizard);
vi.mock("@/components/super-admin/WhiteLabelAppsPanel", () => mocks.whiteLabel);
const impersonation = { startImpersonationSession: vi.fn() };
vi.mock("../src/lib/impersonation.functions", () => impersonation);
vi.mock("@/lib/impersonation.functions", () => impersonation);

const { SubscriptionCard } = await import("../src/components/subscription-card");
const { I18nProvider } = await import("../src/lib/i18n");
const functions = (await vi.importActual(
  "../src/lib/saas-subscription.functions",
)) as unknown as Record<string, ServerFn>;

const BRAND = "7b0c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a11";
const PLAN = "0f2c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a22";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
});

describe("annual subscription lifecycle", () => {
  it("migrates normal brands to annual while preserving Pura permanently", () => {
    const migration = readFileSync(
      "supabase/migrations/20260810194500_annual_subscriptions_and_payment_iban.sql",
      "utf8",
    );
    expect(migration).toContain("WHERE lower(slug) = 'pura'");
    expect(migration).toContain("plan_type = 'lifetime'");
    expect(migration).toContain("WHERE lower(slug) <> 'pura'");
    expect(migration).toContain("created_at + interval '1 year'");
  });

  it("extends approved renewals by one calendar year and requires a receipt", async () => {
    const approve = (brand: Record<string, unknown>, isSuperAdmin = true) => {
      const db = fakeSupabase({
        rows: {
          brands: { slug: "qoffee", plan_type: "annual", ...brand },
          saas_plans: { id: PLAN, code: "pro" },
        },
        rpc: { is_super_admin: isSuperAdmin },
      });
      const run = functions.approveSubscriptionSaaS({
        data: { brandId: BRAND, targetPlanId: PLAN, billingInterval: "annual" },
        context: db,
      });
      return { run, db };
    };
    const receipt = { payment_receipt_url: "brands/x/subscription-receipts/r.png" };

    const outsider = approve(receipt, false);
    await expect(outsider.run).rejects.toThrow("UNAUTHORIZED_SUPER_ADMIN_ONLY");
    expect(outsider.db.supabase.rpc.mock.calls.map(([name]) => name)).toEqual(["is_super_admin"]);

    await expect(approve({}).run).rejects.toThrow("PAYMENT_RECEIPT_REQUIRED");
    await expect(approve({ ...receipt, slug: "Pura" }).run).rejects.toThrow(
      "PERMANENT_PROJECT_DOES_NOT_REQUIRE_RENEWAL",
    );

    // Still active: the year is added to the current expiry, not to today.
    const renewal = approve({ ...receipt, subscription_expires_at: "2099-03-15T00:00:00.000Z" });
    await renewal.run;
    const update = renewal.db.writes.find((write) => write.table === "brands");
    expect(update?.values).toMatchObject({
      subscription_status: "active",
      plan_type: "annual",
      subscription_expires_at: "2100-03-15T00:00:00.000Z",
      payment_receipt_url: null,
    });
  });

  it("shows the platform IBAN with a copy button and the renewal receipt upload", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(
      <I18nProvider>
        <SubscriptionCard
          brand={
            brandRow({
              subscription_expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
              renewal_intent: "renew",
            }) as never
          }
        />
      </I18nProvider>,
    );
    expect(await screen.findByText("BH22 NEWB 0000 0000 0000 02")).toBeInTheDocument();
    expect(screen.getByText("Upload renewal receipt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("BH22NEWB00000000000002"));
  });

  it("lets the super admin set the subscription IBAN", async () => {
    const { Route } =
      (await import("../src/routes/_authenticated/admin.super.settings")) as unknown as {
        Route: { options: { component: React.ComponentType } };
      };
    const Settings = Route.options.component;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <Settings />
        </I18nProvider>
      </QueryClientProvider>,
    );
    const iban = await screen.findByDisplayValue("BH11OLDB0000000000000001");
    fireEvent.change(iban, { target: { value: "bh33 newb 0000 0000 0000 03" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(platform.updatePlatformSettings).toHaveBeenCalledTimes(1));
    expect(platform.updatePlatformSettings).toHaveBeenCalledWith({
      data: expect.objectContaining({ subscriptionIban: "BH33NEWB00000000000003" }),
    });
  });

  it("approves a pending receipt manually from the brands page", async () => {
    page.brands = [
      brandRow({
        id: BRAND,
        subscription_status: "pending_verification",
        payment_receipt_url: "brands/x/subscription-receipts/r.png",
      }),
    ];
    await renderBrandsPage();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: /Receipt Approvals/ }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog", { name: "Approve SaaS Subscription" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Authorize & Activate" }));
    await waitFor(() =>
      expect(saas.approveSubscriptionSaaS).toHaveBeenCalledWith({
        data: expect.objectContaining({ brandId: BRAND, billingInterval: "annual" }),
      }),
    );
  });
});
