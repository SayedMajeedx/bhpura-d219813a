import React from "react";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The account tab mounts the addon through <AddonSlot placement="storefront.account.tab">;
// every declared placement is checked in tests/addon-contributions-consumed.test.ts.

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const db = vi.hoisted(() => ({ upsert: vi.fn(async () => ({ error: null })) }));
vi.mock("sonner", () => ({ toast }));
const client = {
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
      upsert: db.upsert,
    }),
  },
};
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);
const storefront = { settings: {} };
vi.mock("../src/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: () => storefront,
}));
vi.mock("@/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: () => storefront,
}));

const { StorefrontFitPassport } =
  await import("../src/addons/fit-passport/components/storefront/StorefrontFitPassport");

beforeEach(() => vi.clearAllMocks());

const renderPassport = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StorefrontFitPassport brandId="b1" customerId="c1" isAr={false} />
    </QueryClientProvider>,
  );
// 24 inches is a plausible value for every field (a length, a sleeve, a shoulder width).
const fillMeasurements = async (value = "24") => {
  for (const field of await screen.findAllByRole("spinbutton")) {
    fireEvent.change(field, { target: { value } });
  }
};

describe("storefront Fit Passport", () => {
  it("requires consent before saving measurements", async () => {
    renderPassport();
    await fillMeasurements();
    fireEvent.click(screen.getByRole("button", { name: "Save Fit Passport" }));
    expect(toast.error).toHaveBeenCalledWith("Please consent to storing your measurements.");
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("saves reusable measurements to the signed-in customer's own record", async () => {
    renderPassport();
    await fillMeasurements();
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save Fit Passport" }));
    await waitFor(() => expect(db.upsert).toHaveBeenCalledTimes(1));
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        brand_id: "b1",
        customer_id: "c1",
        auth_user_id: "auth-1",
        consent_to_store: true,
      }),
      { onConflict: "brand_id,customer_id" },
    );
    expect(toast.success).toHaveBeenCalledWith("Measurements saved successfully");
  });

  it("does not save measurements that cannot be right", async () => {
    renderPassport();
    await fillMeasurements("655");
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save Fit Passport" }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/^Check these measurements:/));
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("restricts writes to the authenticated customer's own record", () => {
    const migration = readFileSync(
      "supabase/migrations/20260903220000_storefront_fit_passport_access.sql",
      "utf8",
    );
    expect(migration).toContain("auth_user_id = auth.uid()");
    expect(migration).toContain("brand_id = customer_fit_passports.brand_id");
  });
});
