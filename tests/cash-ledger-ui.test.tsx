import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Bug #25: the merchant records cash in / out by hand (no bank feed) and sees
// what changed the balances.

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const ledger = vi.hoisted(() => ({
  movements: [] as unknown[],
  recordCashAccountEntry: vi.fn(async () => "tx-1"),
}));
vi.mock("sonner", () => ({ toast }));
const accounting = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { accountingQueries: object };
  return {
    ...actual,
    accountingQueries: {
      ...actual.accountingQueries,
      cashMovements: () => ({ queryKey: ["movements"], queryFn: async () => ledger.movements }),
    },
    recordCashAccountEntry: ledger.recordCashAccountEntry,
  };
};
vi.mock("../src/lib/data/accounting", (io) => accounting(io));
vi.mock("@/lib/data/accounting", (io) => accounting(io));

const { CashEntryDialog } = await import("../src/components/accounting/CashEntryDialog");
const { CashMovementsList, movementSign } =
  await import("../src/components/accounting/CashMovementsList");

beforeEach(() => vi.clearAllMocks());

const withQuery = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

const openDialog = () => {
  const onOpenChange = vi.fn();
  withQuery(<CashEntryDialog brandId="b1" isAr={false} open onOpenChange={onOpenChange} />);
  return onOpenChange;
};

describe("recording cash in and out", () => {
  it("records an opening balance into the cash box", async () => {
    const onOpenChange = openDialog();
    fireEvent.change(screen.getByLabelText("Amount (BHD)"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Opening balance" } });
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() =>
      expect(ledger.recordCashAccountEntry).toHaveBeenCalledWith("b1", {
        account: "cash_box",
        direction: "in",
        amount: 150,
        notes: "Opening balance",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Entry recorded");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("records a withdrawal and explains an overdraft refusal", async () => {
    ledger.recordCashAccountEntry.mockRejectedValueOnce({ message: "INSUFFICIENT_BALANCE" });
    const onOpenChange = openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cash out" }));
    fireEvent.change(screen.getByLabelText("Amount (BHD)"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("The account holds less than this amount."),
    );
    expect(ledger.recordCashAccountEntry).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ direction: "out", amount: 500 }),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("refuses an empty or non-positive amount before calling the database", () => {
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    fireEvent.change(screen.getByLabelText("Amount (BHD)"), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(ledger.recordCashAccountEntry).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Please enter a valid amount");
  });
});

describe("recent cash movements", () => {
  it("signs money in, out and moved", () => {
    expect(movementSign({ transaction_type: "order_payment" })).toBe(1);
    expect(movementSign({ transaction_type: "manual_in" })).toBe(1);
    expect(movementSign({ transaction_type: "manual_out" })).toBe(-1);
    expect(movementSign({ transaction_type: "order_payment_reversal" })).toBe(-1);
    expect(movementSign({ transaction_type: "transfer" })).toBe(0);
  });

  it("lists what changed the balances and where the money went", async () => {
    ledger.movements = [
      {
        id: "m1",
        amount: 18,
        transaction_type: "order_payment",
        notes: "تسوية الطلب #1098",
        reference_id: "o1",
        source_account_id: null,
        target_account_id: "cash-1",
        created_at: "2026-09-27T10:00:00Z",
      },
      {
        id: "m2",
        amount: 50,
        transaction_type: "manual_out",
        notes: "Owner withdrawal",
        reference_id: null,
        source_account_id: "bank-1",
        target_account_id: null,
        created_at: "2026-09-26T10:00:00Z",
      },
    ];
    withQuery(
      <CashMovementsList
        brandId="b1"
        isAr={false}
        accountNames={
          new Map([
            ["cash-1", "Cash box"],
            ["bank-1", "Bank account"],
          ])
        }
      />,
    );
    expect(await screen.findByText("Order reconciled")).toBeInTheDocument();
    expect(screen.getByText(/• Cash box/)).toBeInTheDocument();
    expect(screen.getByText("Cash out")).toBeInTheDocument();
    expect(screen.getByText(/• Bank account/)).toBeInTheDocument();
    expect(screen.getByText(/^\+/)).toHaveTextContent("18");
    expect(screen.getByText(/^−/)).toHaveTextContent("50");
  });

  it("explains how to start when there are no movements", async () => {
    ledger.movements = [];
    withQuery(<CashMovementsList brandId="b1" isAr={false} accountNames={new Map()} />);
    expect(
      await screen.findByText(
        "No movements yet. Record an opening balance, or reconcile a paid order.",
      ),
    ).toBeInTheDocument();
  });
});
