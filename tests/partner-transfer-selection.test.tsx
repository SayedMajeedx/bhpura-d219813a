import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// The transfer of pieces to a partner shop. Opened from the partner's page, it lists every
// product of the store, and it once ticked every size of every one, sold-out sizes at 1 ("Exceeds
// stock!"), with no way to untick them all: the button offered pieces the database would refuse.
// Now nothing starts ticked there, a sold-out size cannot be ticked, "Select all" and "Deselect
// all" act on what the search shows, and the button waits while a size asks for too much.

const transfer = vi.hoisted(() => ({ batch: vi.fn(async () => 3) }));
const incubators = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { incubatorsQueries: object };
  return {
    ...actual,
    incubatorsQueries: {
      ...actual.incubatorsQueries,
      active: () => ({
        queryKey: ["partners"],
        queryFn: async () => [
          { id: "i1", name: "Dar Lulwa", commission_type: "percentage", commission_value: 0 },
        ],
      }),
    },
    transferStockBatchToIncubator: transfer.batch,
  };
};
vi.mock("../src/lib/data/incubators", (io) => incubators(io));
vi.mock("@/lib/data/incubators", (io) => incubators(io));
const brandContext = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useBrand: () => ({ id: "b1", slug: "pura" }),
  useBrandOptional: () => ({ id: "b1", slug: "pura" }),
});
vi.mock("../src/lib/brand-context", (io) => brandContext(io));
vi.mock("@/lib/brand-context", (io) => brandContext(io));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const rules = await import("../src/features/incubators/lib/batch-transfer");
const { I18nProvider } = await import("../src/lib/i18n");
const { BatchIncubatorTransferModal } =
  await import("../src/components/incubators/BatchIncubatorTransferModal");

const products = [
  { id: "p1", name: "Abaya Sabeeka" },
  { id: "p2", name: "Abaya Layla" },
];
const variant = (id: string, product: string, size: string, stock: number) => ({
  id,
  product_id: product,
  size,
  color: null,
  stock_main: stock,
  stock_incubator: 0,
  selling_price: 24,
});
const variantsByProduct = {
  p1: [variant("v55", "p1", "55", 0), variant("v52", "p1", "52", 3)],
  p2: [variant("v54", "p2", "54", 2)],
};

const row = (over: Partial<Parameters<typeof rules.tickSizes>[0][number]>) => ({
  variantId: "v",
  selected: false,
  transferQty: 0,
  totalAvailable: 2,
  ...over,
});

describe("the sizes a transfer moves", () => {
  it("starts a size with all its pieces, ticked only when asked and when it has some", () => {
    expect(rules.startingChoice(3, false)).toEqual({ selected: false, transferQty: 3 });
    expect(rules.startingChoice(3, true)).toEqual({ selected: true, transferQty: 3 });
    expect(rules.startingChoice(0, true)).toEqual({ selected: false, transferQty: 0 });
  });

  it("never ticks a sold-out size, and never asks for more than a size has", () => {
    const rows = [
      row({ variantId: "a", totalAvailable: 0 }),
      row({ variantId: "b", totalAvailable: 2, transferQty: 5 }),
    ];
    expect(rules.tickSizes(rows, null, true).map((r) => [r.selected, r.transferQty])).toEqual([
      [false, 0],
      [true, 2],
    ]);
    expect(rules.sameOfEach(rows, 1).map((r) => [r.selected, r.transferQty])).toEqual([
      [false, 0],
      [true, 1],
    ]);
    expect(rules.tickSizes(rows, new Set(["b"]), false)[1].selected).toBe(false);
  });

  it("names the ticked sizes that ask for more than they have, and counts what is ticked", () => {
    const rows = [
      row({ variantId: "a", selected: true, transferQty: 3, totalAvailable: 2 }),
      row({ variantId: "b", selected: false, transferQty: 9, totalAvailable: 2 }),
      row({ variantId: "c", totalAvailable: 0 }),
    ];
    expect(rules.overAvailable(rows).map((r) => r.variantId)).toEqual(["a"]);
    expect(rules.tickedCount(rows)).toEqual({ ticked: 1, tickable: 2 });
  });
});

const renderModal = (preselect = false) => {
  localStorage.setItem("lang", "en");
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <BatchIncubatorTransferModal
          open
          onOpenChange={() => undefined}
          targetProducts={products}
          variantsByProduct={variantsByProduct}
          initialIncubatorId="i1"
          preselect={preselect}
        />
      </I18nProvider>
    </QueryClientProvider>,
  );
};

describe("the transfer screen", () => {
  it("opens from the partner's page with nothing ticked, and a sold-out size cannot be", async () => {
    renderModal();
    expect(await screen.findByText("0 of 2 sizes")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Abaya Sabeeka 55: nothing to transfer/ }),
    ).toBeDisabled();
    expect(screen.queryByText("Exceeds stock!")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirm Transfer \(0 items\)/ })).toBeDisabled();
  });

  it("selects and deselects everything shown, and only what the search shows", async () => {
    renderModal();
    fireEvent.click(await screen.findByRole("button", { name: "Select all" }));
    expect(screen.getByText("2 of 2 sizes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirm Transfer \(5 items\)/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(screen.getByText("0 of 2 sizes")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search by product name/), {
      target: { value: "Layla" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("1 of 1 sizes")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Search by product name/), {
      target: { value: "" },
    });
    expect(screen.getByText("1 of 2 sizes")).toBeInTheDocument();
  });

  it("ticks the chosen products' sizes with pieces when the inventory opens it", async () => {
    renderModal(true);
    expect(await screen.findByText("2 of 2 sizes")).toBeInTheDocument();
  });

  it("holds the transfer while a size asks for more than it has, then sends one batch", async () => {
    renderModal(true);
    const field = (await screen.findAllByRole("spinbutton")).find(
      (input) => (input as HTMLInputElement).value === "3",
    ) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "9" } });
    expect(screen.getByRole("alert")).toHaveTextContent("1 size asks for more than is in stock");
    const confirm = screen.getByRole("button", { name: /Confirm Transfer/ });
    expect(confirm).toBeDisabled();
    fireEvent.change(field, { target: { value: "3" } });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() => expect(transfer.batch).toHaveBeenCalledTimes(1));
    const sent = (
      transfer.batch.mock.calls[0] as unknown as [{ items: Array<{ variantId: string }> }]
    )[0];
    expect(sent.items.map((item) => item.variantId).sort()).toEqual(["v52", "v54"]);
    expect(within(document.body).queryByText("Exceeds stock!")).not.toBeInTheDocument();
  });
});
