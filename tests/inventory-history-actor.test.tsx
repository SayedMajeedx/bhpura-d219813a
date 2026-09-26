import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Bug backlog #31: the stock history read `created_by`, which is not a column
// (the ledger records `actor_id`), so every row showed "System".

// This test must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in the stock history test");
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const movement = (id: string, actor_id: string | null) => ({
  id,
  brand_id: "b1",
  variant_id: "v1",
  location: "main",
  delta: -2,
  balance_after: 10,
  reason: actor_id ? "manual_adjust" : "reconciliation",
  reference_type: null,
  reference_id: null,
  idempotency_key: `k-${id}`,
  actor_id,
  note: null,
  created_at: "2026-09-26T10:00:00Z",
});

const fetchProfileNames = vi.fn(async (ids: string[]) =>
  ids.map((id) => ({ id, full_name: "Maryam Al-Sayed", email: "maryam@pura.bh" })),
);
const catalog = {
  fetchInventoryMovements: vi.fn(async () => ({
    rows: [movement("m1", "user-1"), movement("m2", null)],
    count: 2,
  })),
};
const orders = { fetchInvoiceNumbers: vi.fn(async () => []) };
const profiles = { fetchProfileNames };
vi.mock("../src/lib/data/catalog", () => catalog);
vi.mock("@/lib/data/catalog", () => catalog);
vi.mock("../src/lib/data/orders", () => orders);
vi.mock("@/lib/data/orders", () => orders);
vi.mock("../src/lib/data/profiles", () => profiles);
vi.mock("@/lib/data/profiles", () => profiles);

const { InventoryHistorySheet } = await import("../src/components/inventory/InventoryHistorySheet");
const { I18nProvider } = await import("../src/lib/i18n");

describe("the stock history", () => {
  it("names the team member who made a movement, and 'System' for system runs", async () => {
    localStorage.setItem("lang", "en");
    render(
      <I18nProvider>
        <InventoryHistorySheet
          isOpen
          onClose={() => undefined}
          brandId="b1"
          slug="pura"
          variantId="v1"
          productName="Silk Abaya"
          variantLabel="54"
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByText("Maryam Al-Sayed")).toBeDefined());
    expect(fetchProfileNames).toHaveBeenCalledWith(["user-1"]);
    expect(screen.getAllByText("System").length).toBeGreaterThan(0);
  });
});
