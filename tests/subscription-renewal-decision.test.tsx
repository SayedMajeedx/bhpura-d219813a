import React from "react";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  approveSubscriptionSaaS: vi.fn(),
  rejectSubscriptionSaaS: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

// Server functions run for real (recording createServerFn); screens get stubs.
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
const guards = { requireSupabaseAuth: { guard: "authenticated" } };
vi.mock("../src/integrations/supabase/auth-middleware", () => guards);
vi.mock("@/integrations/supabase/auth-middleware", () => guards);
const safeguard = { enforceMutationSafeguard: vi.fn(async () => undefined) };
vi.mock("../src/lib/impersonation.server", () => safeguard);
vi.mock("@/lib/impersonation.server", () => safeguard);
vi.mock("../src/lib/saas-subscription.functions", () => saas);
vi.mock("@/lib/saas-subscription.functions", () => saas);

const billing = { fetchBillingDetails: async () => null };
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

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const BRAND = "7b0c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a11";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
});

const renderCard = (brand: Record<string, unknown>) =>
  render(
    <I18nProvider>
      <SubscriptionCard brand={brandRow(brand) as never} />
    </I18nProvider>,
  );

describe("annual renewal decision window", () => {
  it("shows renewal controls only in the final 30 days or after expiry", () => {
    for (const [brand, shown] of [
      [{ subscription_expires_at: inDays(45) }, false],
      [{ subscription_expires_at: inDays(20) }, true],
      [{ subscription_expires_at: inDays(-3) }, true],
      [{ slug: "pura", subscription_expires_at: inDays(5) }, false],
      [{ plan_type: "trial", trial_ends_at: inDays(5) }, false],
    ] as const) {
      const view = renderCard(brand);
      expect(Boolean(screen.queryByRole("button", { name: "Yes, Renew" }))).toBe(shown);
      view.unmount();
    }
  });

  it("records the decision and offers the receipt upload only after choosing to renew", async () => {
    localStorage.setItem("lang", "ar");
    renderCard({ subscription_expires_at: inDays(10) });
    expect(screen.getByRole("button", { name: "لا، لن أجدد" })).toBeInTheDocument();
    expect(screen.queryByText("رفع إيصال دفع التجديد")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "نعم، أريد التجديد" }));
    await waitFor(() =>
      expect(saas.setSubscriptionRenewalDecision).toHaveBeenCalledWith({
        data: { brandId: "brand-1", decision: "renew" },
      }),
    );
    expect(await screen.findByText("رفع إيصال دفع التجديد")).toBeInTheDocument();
  });

  it("persists a tenant-scoped decision only inside the renewal window", async () => {
    const decide = functions.setSubscriptionRenewalDecision;
    const annual = (days: number) => ({
      brands: { plan_type: "annual", subscription_expires_at: inDays(days) },
    });

    const outsider = fakeSupabase({ rows: annual(10), rpc: { can_access_brand: false } });
    await expect(
      decide({ data: { brandId: BRAND, decision: "renew" }, context: outsider }),
    ).rejects.toThrow("UNAUTHORIZED_BRAND_ACCESS");
    expect(outsider.supabase.rpc).toHaveBeenCalledWith("can_access_brand", { _brand_id: BRAND });

    const early = fakeSupabase({ rows: annual(60), rpc: { can_access_brand: true } });
    await expect(
      decide({ data: { brandId: BRAND, decision: "renew" }, context: early }),
    ).rejects.toThrow("RENEWAL_WINDOW_NOT_OPEN");
    expect(early.writes).toHaveLength(0);

    await expect(
      decide({ data: { brandId: BRAND, decision: "maybe" }, context: early }),
    ).rejects.toThrow();

    const open = fakeSupabase({ rows: annual(10), rpc: { can_access_brand: true } });
    await decide({ data: { brandId: BRAND, decision: "cancel" }, context: open });
    expect(open.writes).toEqual([
      expect.objectContaining({
        table: "brands",
        values: expect.objectContaining({ renewal_intent: "cancel" }),
        filters: [["id", BRAND]],
      }),
    ]);
  });

  it("uploads the renewal receipt with what the server's upload URL accepts (bug #32)", async () => {
    saas.getSubscriptionReceiptUploadUrl.mockResolvedValue({
      objectKey: `brands/${BRAND}/subscription-receipts/r.png`,
      uploadUrl: "https://r2.test/upload",
    });
    saas.submitSubscriptionReceipt.mockResolvedValue({ success: true });
    const put = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    try {
      const view = renderCard({
        id: BRAND,
        subscription_expires_at: inDays(10),
        renewal_intent: "renew",
      });
      const input = view.container.querySelector('input[type="file"]')!;
      const receipt = new File(["receipt"], "receipt.png", { type: "image/png" });
      fireEvent.change(input, { target: { files: [receipt] } });
      await waitFor(() => expect(saas.submitSubscriptionReceipt).toHaveBeenCalledTimes(1));

      // The card's request must pass the real server validator.
      const [[{ data: sent }]] = saas.getSubscriptionReceiptUploadUrl.mock.calls as unknown as [
        [{ data: unknown }],
      ];
      const validate = (
        functions.getSubscriptionReceiptUploadUrl as unknown as {
          validate: (raw: unknown) => unknown;
        }
      ).validate;
      expect(validate(sent)).toEqual({ brandId: BRAND, contentType: "image/png", size: 7 });
      expect(put).toHaveBeenCalledWith(
        "https://r2.test/upload",
        expect.objectContaining({ method: "PUT" }),
      );
      expect(toast.success).toHaveBeenCalledTimes(1);
    } finally {
      put.mockRestore();
    }
  });

  it("blocks a renewal receipt upload until the merchant chose to renew", async () => {
    const pending = fakeSupabase({
      rows: {
        brands: {
          plan_type: "annual",
          subscription_expires_at: inDays(10),
          renewal_intent: null,
        },
      },
      rpc: { can_access_brand: true },
    });
    await expect(
      functions.getSubscriptionReceiptUploadUrl({
        data: { brandId: BRAND, contentType: "image/png", size: 1000 },
        context: pending,
      }),
    ).rejects.toThrow("RENEWAL_DECISION_REQUIRED");
  });

  it("surfaces the recorded decision to the super admin", async () => {
    localStorage.setItem("lang", "ar");
    page.brands = [
      brandRow({ id: "b1", slug: "a", renewal_intent: "renew" }),
      brandRow({ id: "b2", slug: "b", renewal_intent: "cancel" }),
    ];
    await renderBrandsPage();
    expect(await screen.findByText("يرغب بالتجديد")).toBeInTheDocument();
    expect(screen.getByText("لن يجدد")).toBeInTheDocument();
  });

  it("stores only renew or cancel decisions in the database", () => {
    const migration = readFileSync(
      "supabase/migrations/20260810225000_add_subscription_renewal_decisions.sql",
      "utf8",
    );
    expect(migration).toContain("renewal_intent IN ('renew', 'cancel')");
  });
});
