import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { paymentUpdateProblem } from "../src/lib/payment-status";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ history: { back: vi.fn() }, navigate: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const { ManagePaymentModal } = await import("../src/components/orders/ManagePaymentModal");
const { OrderUnifiedHeader } = await import("../src/components/orders/OrderUnifiedHeader");

beforeEach(() => {
  toast.error.mockClear();
  toast.success.mockClear();
});

describe("payment changes", () => {
  it("reject a collected amount above the total, and 'paid' below it", () => {
    expect(paymentUpdateProblem("partial", 150, 100)).toBe("exceeds_total");
    expect(paymentUpdateProblem("paid", 150, 100)).toBe("exceeds_total");
    expect(paymentUpdateProblem("paid", 60, 100)).toBe("paid_below_total");
    expect(paymentUpdateProblem("paid", 100, 100)).toBeNull();
    expect(paymentUpdateProblem("partial", 60, 100)).toBeNull();
    expect(paymentUpdateProblem("unpaid", 0, 100)).toBeNull();
  });

  const renderModal = () => {
    const onSavePayment = vi.fn();
    render(
      <ManagePaymentModal
        open
        onOpenChange={vi.fn()}
        lang="en"
        currency="BHD"
        order={{ payment_status: "unpaid", payment_method: "", advance_paid: 0 }}
        totals={{ total: 100, advancePaid: 0, balanceDue: 100 }}
        onSavePayment={onSavePayment}
      />,
    );
    const save = screen.getByRole("button", { name: /Confirm & Save Payment/ });
    const amount = screen.getByRole("spinbutton");
    return { onSavePayment, save, amount };
  };

  it("can only be confirmed once something changed, with a review summary", () => {
    const { save, amount } = renderModal();
    expect(save).toBeDisabled();
    expect(screen.queryByText("Review changes before confirming")).toBeNull();
    fireEvent.change(amount, { target: { value: "40" } });
    expect(save).not.toBeDisabled();
    expect(screen.getByText("Review changes before confirming")).toBeInTheDocument();
  });

  it("explain an inconsistent amount instead of saving it", async () => {
    const { save, amount, onSavePayment } = renderModal();
    fireEvent.change(amount, { target: { value: "150" } });
    fireEvent.click(save);
    expect(toast.error).toHaveBeenCalledWith("Collected amount cannot exceed the order total");

    fireEvent.click(screen.getByRole("button", { name: "Paid" }));
    fireEvent.change(amount, { target: { value: "60" } });
    fireEvent.click(save);
    expect(toast.error).toHaveBeenLastCalledWith(
      "Use Partially Paid when the collected amount is below the order total",
    );
    expect(onSavePayment).not.toHaveBeenCalled();

    fireEvent.change(amount, { target: { value: "100" } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(onSavePayment).toHaveBeenCalledWith(
        expect.objectContaining({ payment_status: "paid", advance_paid: 100 }),
      ),
    );
  });
});

describe("order status changes", () => {
  it("are reviewed in a confirmation before they are applied", async () => {
    const onUpdateOrderStatus = vi.fn();
    render(
      <OrderUnifiedHeader
        lang="en"
        slug="pura"
        order={{ id: "o1", invoice_number: 1042, created_at: "2026-09-20T10:00:00Z" }}
        items={[]}
        isCreationMode={false}
        isReadOnly={false}
        isEditing
        canUnlockEditing
        isDirty={false}
        saving={false}
        paymentBadge="unpaid"
        onSave={vi.fn()}
        onUnlock={vi.fn()}
        onCancelEditing={vi.fn()}
        onPrintReceipt={vi.fn()}
        onPrintA4={vi.fn()}
        onCopyLink={vi.fn()}
        onOpenPaymentModal={vi.fn()}
        onUpdateOrderStatus={onUpdateOrderStatus}
        renderPrimaryAction={() => null}
      />,
    );
    // Radix opens the menu on pointer down.
    const trigger = screen.getByTitle("Click to change order fulfillment status");
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Mark Shipped/ }));
    expect(onUpdateOrderStatus).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Confirm order status change")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Confirm Change/ }));
    await waitFor(() => expect(onUpdateOrderStatus).toHaveBeenCalledWith("shipped", "SHIPPED"));
  });
});
