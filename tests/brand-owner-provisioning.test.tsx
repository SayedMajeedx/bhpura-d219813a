import React from "react";
import { readFileSync } from "node:fs";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { brandsPageMocks, renderBrandsPage } from "./helpers/brands-page";

// The user-management edge function runs on Deno; its contract stays a source check.
const userManagement = readFileSync("supabase/functions/user-management/index.ts", "utf8");

const page = vi.hoisted(() => ({ brands: [] as unknown[] }));
const browserClient = vi.hoisted(() => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "jwt-1" } } })),
    },
  },
}));
vi.mock("../src/integrations/supabase/client", () => browserClient);
vi.mock("@/integrations/supabase/client", () => browserClient);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn() } }));
const mocks = brandsPageMocks(page);
vi.mock("@tanstack/react-router", () => mocks.router);
vi.mock("../src/lib/data/brands", (io) => mocks.brands(io));
vi.mock("@/lib/data/brands", (io) => mocks.brands(io));
vi.mock("../src/lib/data/super-admin", (io) => mocks.superAdmin(io));
vi.mock("@/lib/data/super-admin", (io) => mocks.superAdmin(io));
const wizard = { BrandWizardDialog: () => <div role="dialog">Brand setup wizard</div> };
vi.mock("../src/components/super-admin/brand-wizard/BrandWizardDialog", () => wizard);
vi.mock("@/components/super-admin/brand-wizard/BrandWizardDialog", () => wizard);
vi.mock("@/components/super-admin/WhiteLabelAppsPanel", () => mocks.whiteLabel);
const impersonation = { startImpersonationSession: vi.fn() };
vi.mock("../src/lib/impersonation.functions", () => impersonation);
vi.mock("@/lib/impersonation.functions", () => impersonation);

const { ownerStepError, provisionPayloadFrom } =
  await import("../src/components/super-admin/brand-wizard/wizard-rules");
const { provisionBrandWithOwner } = await import("../src/lib/brand-provisioning");
type WizardData = Parameters<typeof provisionPayloadFrom>[0];

const wizardData = (overrides: Partial<WizardData> = {}) =>
  ({
    name_en: " Qoffee ",
    name_ar: "",
    slug: " QOFFEE ",
    store_vertical: "coffee",
    palette: null,
    accentColor: "#5b3a29",
    secondaryColor: "#c9a27e",
    backgroundColor: "#faf7f2",
    textColor: "#1c1917",
    fontPreset: { fontAr: "Tajawal", fontEn: "Inter" },
    radius: "12px",
    owner_name: "  Sara Ali ",
    owner_email: " sara@example.com ",
    owner_phone: "",
    owner_password: "",
    plan_type: "trial",
    ...overrides,
  }) as WizardData;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
});

describe("brand owner provisioning contract", () => {
  it("launches brand creation through the setup wizard", async () => {
    await renderBrandsPage();
    fireEvent.click(await screen.findByRole("button", { name: /Launch Brand Wizard/ }));
    expect(await screen.findByText("Brand setup wizard")).toBeInTheDocument();
  });

  it("requires a real owner identity in the wizard", () => {
    expect(ownerStepError(wizardData({ owner_name: " " }), false)).toBe("Owner name is required");
    expect(ownerStepError(wizardData({ owner_email: "sara" }), false)).toBe(
      "Valid owner email is required",
    );
    expect(ownerStepError(wizardData({ owner_password: "short" }), false)).toBe(
      "Password must be at least 8 characters",
    );
    expect(ownerStepError(wizardData(), false)).toBeNull();

    const payload = provisionPayloadFrom(wizardData());
    expect(payload).toMatchObject({
      slug: "qoffee",
      name_en: "Qoffee",
      name_ar: null,
      owner_name: "Sara Ali",
      owner_email: "sara@example.com",
      owner_phone: null,
      plan_type: "trial",
    });
    // The trial length is the platform's, decided server-side.
    expect(payload).not.toHaveProperty("trial_ends_at");
  });

  it("provisions through the user-management function as the signed-in super admin", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ brand_id: "b1", linked_existing_identity: true, trial_days: 7 }),
        ),
      );
    try {
      const payload = provisionPayloadFrom(wizardData());
      await expect(provisionBrandWithOwner(payload)).resolves.toEqual({
        brand_id: "b1",
        linked_existing_identity: true,
        trial_days: 7,
      });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(new URL(url).pathname).toBe("/functions/v1/user-management");
      expect(new URL(url).searchParams.get("action")).toBe("provision-brand");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-1");
      expect(JSON.parse(init.body as string)).toEqual(JSON.parse(JSON.stringify(payload)));

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "SLUG_TAKEN" }), { status: 409 }),
      );
      await expect(provisionBrandWithOwner(payload)).rejects.toThrow("SLUG_TAKEN");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("creates or links the owner as the first active brand admin", () => {
    expect(userManagement).toContain('case "provision-brand"');
    expect(userManagement).toContain('role: "brand_admin"');
    expect(userManagement).toContain("linked_existing_identity");
    expect(userManagement).toContain("brand_id: brandId");
  });

  it("uses the configured trial duration for manually provisioned brands", () => {
    expect(userManagement).toContain('.eq("code", "trial")');
    expect(userManagement).toContain("trialDays * 24 * 60 * 60 * 1000");
  });

  it("protects the last active brand administrator", () => {
    expect(userManagement.match(/A brand must keep at least one active brand admin/g)).toHaveLength(
      2,
    );
  });
});
