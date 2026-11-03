import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// A customer's piece sent by staff who cannot see costs reads "Price to add" on the supplier
// order; finance staff type the price there and the mark goes.

const stubs = vi.hoisted(() => ({
  setPiecePrice: vi.fn(async () => undefined),
  invalidateSupplierOrders: vi.fn(async () => undefined),
}));
const workshop = vi.hoisted(() => ({ setPiecePrice: stubs.setPiecePrice }));
vi.mock("../src/lib/data/supplier-orders/workshop", () => workshop);
vi.mock("@/lib/data/supplier-orders/workshop", () => workshop);
const supplierOrders = vi.hoisted(() => ({
  invalidateSupplierOrders: stubs.invalidateSupplierOrders,
}));
vi.mock("../src/lib/data/supplier-orders", () => supplierOrders);
vi.mock("@/lib/data/supplier-orders", () => supplierOrders);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PiecePriceField } from "../src/features/supplier-orders/components/PiecePriceField";

const wrap = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

describe("a piece's price still to add", () => {
  it("is typed by finance staff and saved", async () => {
    wrap(
      <PiecePriceField brandId="b1" itemId="pol-1" description="Black abaya" canPrice lang="en" />,
    );
    expect(screen.getByText("Price to add")).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save price" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Price of Black abaya"), { target: { value: "21.5" } });
    fireEvent.click(save);
    await waitFor(() => expect(stubs.setPiecePrice).toHaveBeenCalledWith("pol-1", 21.5));
    expect(stubs.invalidateSupplierOrders).toHaveBeenCalled();
  });

  it("refuses a price with more than the fils", () => {
    wrap(
      <PiecePriceField brandId="b1" itemId="pol-1" description="Black abaya" canPrice lang="en" />,
    );
    fireEvent.change(screen.getByLabelText("Price of Black abaya"), {
      target: { value: "1.2345" },
    });
    expect(screen.getByRole("button", { name: "Save price" })).toBeDisabled();
  });

  it("is only read by anyone else", () => {
    wrap(
      <PiecePriceField
        brandId="b1"
        itemId="pol-1"
        description="Black abaya"
        canPrice={false}
        lang="ar"
      />,
    );
    expect(screen.getByText("السعر لم يُضف بعد")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
