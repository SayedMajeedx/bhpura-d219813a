import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { endPartnershipChecklist } from "../src/features/incubators/lib/end-partnership";
import type { PartnerHold } from "../src/features/incubators/lib/partner-stock";

// Ending a partnership (step 4 of the partner transfers plan, 2026-11-17: Pura is leaving
// دار لولوة). Pieces still there or held for open orders stop it, money owed does not, and
// ending marks the partner inactive with no pickups.

const holds = vi.hoisted(() => ({ rows: [] as unknown[] }));
const dataModule = vi.hoisted(() => () => ({
  incubatorsQueries: {
    orderHolds: (brandId: string) => ({
      queryKey: ["incubators", brandId, "order-holds"],
      queryFn: async () => holds.rows,
    }),
  },
}));
vi.mock("../src/lib/data/incubators", dataModule);
vi.mock("@/lib/data/incubators", dataModule);

const { EndPartnershipDialog } =
  await import("../src/features/incubators/components/EndPartnershipDialog");

const money = (n: number) => `BHD ${n.toFixed(3)}`;
const hold = (status: string, fulfillment: string, incubator = "lulwa"): PartnerHold => ({
  order_id: `o-${status}-${fulfillment}`,
  variant_id: "v1",
  incubator_id: incubator,
  quantity: 1,
  orders: { status, fulfillment_status: fulfillment },
});

describe("what is left with a partner", () => {
  const check = (pieces: number, list: PartnerHold[], due: number, lang: "ar" | "en" = "en") =>
    endPartnershipChecklist({ pieces, holds: list, incubatorId: "lulwa", due, money, lang });

  it("stops while pieces are still there", () => {
    const result = check(24, [], 0);
    expect(result.canEnd).toBe(false);
    expect(result.items[0]).toMatchObject({ key: "pieces", blocks: true });
    expect(result.items[0].text).toMatch(/They hold 24 pieces/);
  });

  it("stops while an open order still collects there, never a finished one or another partner's", () => {
    expect(check(0, [hold("confirmed", "ready")], 0).canEnd).toBe(false);
    expect(
      check(0, [hold("completed", "delivered"), hold("confirmed", "ready", "ra")], 0).canEnd,
    ).toBe(true);
  });

  it("lets money owed stay on the account", () => {
    const result = check(0, [], 32, "ar");
    expect(result.canEnd).toBe(true);
    expect(result.items[2]).toMatchObject({ key: "money", blocks: false, clear: false });
    expect(result.items[2].text).toMatch(/عليهم BHD 32.000/);
  });
});

describe("the dialog", () => {
  const page = (overrides: Record<string, unknown> = {}) =>
    ({
      isAr: false,
      lang: "en",
      brand: { id: "b1" },
      current: { id: "lulwa", name: "دار لولوة" },
      currentId: "lulwa",
      dialog: "end",
      summary: { units: 0, due: 32 },
      money,
      busy: false,
      closeDialog: vi.fn(),
      openDialog: vi.fn(),
      endPartnership: vi.fn(async () => true),
      ...overrides,
    }) as unknown as Parameters<typeof EndPartnershipDialog>[0]["page"];
  const show = (state: ReturnType<typeof page>) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EndPartnershipDialog page={state} />
      </QueryClientProvider>,
    );

  it("ends it once nothing stops it, the money owed said", async () => {
    holds.rows = [];
    const state = page();
    show(state);
    expect(screen.getByText(/They owe BHD 32.000/)).toBeInTheDocument();
    const end = await screen.findByRole("button", { name: "End the partnership" });
    await vi.waitFor(() => expect(end).toBeEnabled());
    fireEvent.click(end);
    expect(state.endPartnership).toHaveBeenCalled();
  });

  it("makes moving the pieces the step to take while pieces are there", async () => {
    holds.rows = [];
    const state = page({ summary: { units: 5, due: 0 } });
    show(state);
    // Ending waits for the pieces: the main button moves them instead.
    expect(screen.queryByRole("button", { name: "End the partnership" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move the pieces" }));
    expect(state.openDialog).toHaveBeenCalledWith("move");
  });
});
