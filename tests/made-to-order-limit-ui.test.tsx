import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  madeToOrderLimitSummary,
  parseMadeToOrderLimit,
} from "../src/features/inventory/lib/made-to-order-limit";
import { placeOrderFailure } from "../src/features/checkout/lib/place-order";

// The made-to-order limit as staff set it and as a shopper meets it: what can be typed, what
// the field saves (through the database's own setter, on its own), and what checkout says when
// the last piece went to someone else.

const catalog = vi.hoisted(() => ({
  setMadeToOrderLimit: vi.fn(async (..._args: unknown[]) => undefined),
  invalidateCatalog: vi.fn(async () => undefined),
}));
vi.mock("../src/lib/data/catalog", () => catalog);
vi.mock("@/lib/data/catalog", () => catalog);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { MadeToOrderLimitField } =
  await import("../src/features/inventory/components/MadeToOrderLimitField");

const field = (props: { productId?: string | null; available?: number | null }) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MadeToOrderLimitField
        brandId="b1"
        productId={props.productId === undefined ? "p1" : props.productId}
        available={props.available}
        isAr={false}
      />
    </QueryClientProvider>,
  );

beforeEach(() => catalog.setMadeToOrderLimit.mockClear());

describe("what staff can type", () => {
  it("nothing is no limit; a whole number from 0 up is the pieces left", () => {
    expect(parseMadeToOrderLimit("")).toEqual({ ok: true, value: null });
    expect(parseMadeToOrderLimit("  ")).toEqual({ ok: true, value: null });
    expect(parseMadeToOrderLimit("3")).toEqual({ ok: true, value: 3 });
    expect(parseMadeToOrderLimit("0")).toEqual({ ok: true, value: 0 });
  });

  it("refuses a negative number, a fraction and letters", () => {
    for (const bad of ["-1", "2.5", "abc"]) {
      expect(parseMadeToOrderLimit(bad).ok, bad).toBe(false);
    }
  });

  it("explains the current number", () => {
    expect(madeToOrderLimitSummary(null, "en")).toMatch(/No limit/);
    expect(madeToOrderLimitSummary(0, "en")).toMatch(/Limit reached/);
    expect(madeToOrderLimitSummary(3, "en")).toMatch(/3 more can be made/);
    expect(madeToOrderLimitSummary(3, "ar")).toMatch(/يمكن صنع 3 بعد/);
  });
});

describe("the limit field of a product", () => {
  it("saves the number on its own, through the setter", async () => {
    field({ available: null });
    const save = screen.getByRole("button", { name: "Save limit" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/How many more can be made/), {
      target: { value: "3" },
    });
    fireEvent.click(save);
    await waitFor(() => expect(catalog.setMadeToOrderLimit).toHaveBeenCalledWith("p1", 3));
    await waitFor(() => expect(catalog.invalidateCatalog).toHaveBeenCalled());
  });

  it("removes the limit when the field is emptied", async () => {
    field({ available: 2 });
    fireEvent.click(screen.getByRole("button", { name: "No limit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save limit" }));
    await waitFor(() => expect(catalog.setMadeToOrderLimit).toHaveBeenCalledWith("p1", null));
  });

  it("does not save a number that cannot be a limit", () => {
    field({ available: 2 });
    fireEvent.change(screen.getByLabelText(/How many more can be made/), {
      target: { value: "-4" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/whole number from 0 up/);
    expect(screen.getByRole("button", { name: "Save limit" })).toBeDisabled();
  });

  it("waits for a new product to be saved first", () => {
    field({ productId: null });
    expect(screen.getByText(/Save the product first/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save limit" })).toBeNull();
  });
});

describe("checkout, when the last piece went to someone else", () => {
  it("says the limit was reached, not a generic failure", () => {
    const t = (_ar: string, en: string) => en;
    const failure = placeOrderFailure(
      "MADE_TO_ORDER_SOLD_OUT:00000000-0000-4000-8000-000000000001",
      t,
    );
    expect(failure.message).toMatch(/can no longer be made to order/);
    expect(failure.clearPromo).toBe(false);
  });
});
