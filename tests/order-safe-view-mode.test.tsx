import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { orderEditLock, shouldWarnBeforeLeaving } from "../src/features/orders/lib/order-editor";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ history: { back: vi.fn() }, navigate: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const { OrderUnifiedHeader } = await import("../src/components/orders/OrderUnifiedHeader");

const lock = (overrides: Partial<Parameters<typeof orderEditLock>[0]> = {}) =>
  orderEditLock({
    isBlankDraft: false,
    hasSavedDraft: false,
    editingUnlocked: false,
    isCourier: false,
    isAdmin: false,
    status: "pending",
    ...overrides,
  });

describe("existing order safe view mode", () => {
  it("locks every existing order until editing is explicitly enabled", () => {
    expect(lock()).toMatchObject({ isCreationMode: false, isReadOnly: true });
    expect(lock({ editingUnlocked: true }).isReadOnly).toBe(false);
    // A brand-new draft is editable at once; once saved it locks like any order.
    expect(lock({ isBlankDraft: true })).toMatchObject({ isCreationMode: true, isReadOnly: false });
    expect(lock({ isBlankDraft: true, hasSavedDraft: true }).isReadOnly).toBe(true);
  });

  it("lets only admins reopen closed orders, and never couriers", () => {
    expect(lock({ status: "pending" }).canUnlockEditing).toBe(true);
    for (const status of ["completed", "paid"]) {
      expect(lock({ status }).canUnlockEditing).toBe(false);
      expect(lock({ status, isAdmin: true }).canUnlockEditing).toBe(true);
    }
    expect(lock({ isCourier: true, isAdmin: true }).canUnlockEditing).toBe(false);
  });

  it("asks before leaving only with unsaved edits that are not being saved", () => {
    expect(shouldWarnBeforeLeaving({ isDirty: true, isReadOnly: false, saving: false })).toBe(true);
    expect(shouldWarnBeforeLeaving({ isDirty: true, isReadOnly: true, saving: false })).toBe(false);
    expect(shouldWarnBeforeLeaving({ isDirty: true, isReadOnly: false, saving: true })).toBe(false);
    expect(shouldWarnBeforeLeaving({ isDirty: false, isReadOnly: false, saving: false })).toBe(
      false,
    );
  });
});

describe("the order header in safe view mode", () => {
  const renderHeader = (props: Partial<React.ComponentProps<typeof OrderUnifiedHeader>> = {}) => {
    const handlers = { onUnlock: vi.fn(), onCancelEditing: vi.fn(), onSave: vi.fn() };
    render(
      <OrderUnifiedHeader
        lang="en"
        slug="pura"
        order={{ id: "o1", invoice_number: 1042, created_at: "2026-09-20T10:00:00Z" }}
        items={[]}
        isCreationMode={false}
        isReadOnly
        isEditing={false}
        canUnlockEditing
        isDirty={false}
        saving={false}
        paymentBadge="unpaid"
        onPrintReceipt={vi.fn()}
        onPrintA4={vi.fn()}
        onCopyLink={vi.fn()}
        onOpenPaymentModal={vi.fn()}
        onUpdateOrderStatus={vi.fn()}
        renderPrimaryAction={() => null}
        {...handlers}
        {...props}
      />,
    );
    return handlers;
  };

  it("explains the locked state and locks payment and status changes", () => {
    const { onUnlock } = renderHeader();
    expect(
      screen.getByText(
        "You are in safe view mode. Fields are locked to prevent accidental changes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Click to manage payment lifecycle")).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: /Edit Order/ })[0]);
    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Cancel Editing/ })).toBeNull();
  });

  it("offers no way to edit when the order cannot be reopened", () => {
    renderHeader({ canUnlockEditing: false });
    expect(screen.queryByRole("button", { name: /Edit Order/ })).toBeNull();
  });

  it("offers cancel and save while editing, without the locked notice", () => {
    const { onCancelEditing } = renderHeader({ isReadOnly: false, isEditing: true });
    expect(screen.queryByText(/safe view mode/)).toBeNull();
    expect(screen.getByTitle("Click to manage payment lifecycle")).not.toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: /Cancel Editing/ })[0]);
    expect(onCancelEditing).toHaveBeenCalledTimes(1);
  });
});
