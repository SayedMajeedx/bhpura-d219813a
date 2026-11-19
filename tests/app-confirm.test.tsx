import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppConfirm } from "../src/components/ui/app-confirm";
import { transferApprovalAsk } from "../src/features/orders/lib/transfer-approval";

function Harness(props: Partial<React.ComponentProps<typeof AppConfirm>>) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <p data-testid="state">{open ? "open" : "closed"}</p>
      <AppConfirm
        open={open}
        onOpenChange={setOpen}
        title="Void this payment?"
        description="The sales it settled become due again."
        {...props}
      />
    </>
  );
}

describe("the confirm box", () => {
  it("is an alert dialog that says what happens and the figures it turns on", () => {
    render(
      <Harness
        facts={[
          { label: "Amount", value: "BHD 36.000" },
          { label: "Reference", value: "BP-8812" },
        ]}
        destructive
        confirmLabel="Void the payment"
      />,
    );
    const box = screen.getByRole("alertdialog", { name: "Void this payment?" });
    expect(box).toHaveAccessibleDescription("The sales it settled become due again.");
    expect(within(box).getByText("Amount").nextElementSibling).toHaveTextContent("BHD 36.000");
    expect(within(box).getByRole("button", { name: "Void the payment" })).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("closes once the step is done", async () => {
    const step = vi.fn(async () => undefined);
    render(<Harness onConfirm={step} confirmLabel="Void" />);
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("closed"));
    expect(step).toHaveBeenCalledTimes(1);
  });

  it("stays open when the step answers false, so it can be tried again", async () => {
    render(<Harness onConfirm={async () => false} confirmLabel="Void" />);
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId("state")).toHaveTextContent("open");
  });

  it("holds its button until the step can be taken", () => {
    render(<Harness confirmDisabled confirmLabel="Void" />);
    expect(screen.getByRole("button", { name: "Void" })).toBeDisabled();
  });

  it("can offer another step in place of its own, or none", () => {
    const { unmount } = render(<Harness action={<a href="/receipt">Review the receipt</a>} />);
    expect(screen.getByRole("link", { name: "Review the receipt" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    unmount();
    render(<Harness action={null} />);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).not.toContain(
      "Confirm",
    );
  });
});

describe("approving a transfer", () => {
  const money = (n: number) => `BHD ${n.toFixed(3)}`;
  const order = {
    total: 90,
    advance_paid: 0,
    payment_status: "pending",
    status: "pending",
    fulfillment_method: "delivery",
    customer_name_snapshot: "Fatima",
    benefit_receipt_key: "receipts/1.jpg",
    order_items: [{ line_total: 90, location: null, product_id: "p1" }],
  };
  const value = (ask: ReturnType<typeof transferApprovalAsk>, label: string) =>
    ask.facts?.find((fact) => fact.label === label)?.value;

  it("says the amount the approval records, who paid and that a receipt is there to match", () => {
    const ask = transferApprovalAsk(order, "en", money);
    expect(ask.title).toBe("Approve this transfer?");
    expect(ask.description).toMatch(/cannot be rejected later/);
    expect(value(ask, "Customer")).toBe("Fatima");
    expect(value(ask, "Amount to approve")).toBe("BHD 90.000");
    // The amount is the whole total: no second line repeats it.
    expect(value(ask, "Order total")).toBeUndefined();
    expect(value(ask, "Receipt")).toBe("Uploaded: match it to the amount");
  });

  it("names the advance and the total apart when only the advance is asked now", () => {
    const ask = transferApprovalAsk(
      { ...order, advance_percent: 50, advance_scope: "all" },
      "en",
      money,
    );
    expect(value(ask, "Amount to approve")).toBe("BHD 45.000");
    expect(value(ask, "Order total")).toBe("BHD 90.000");
  });

  it("says when no receipt was uploaded, in Arabic too", () => {
    const ask = transferApprovalAsk({ ...order, benefit_receipt_key: null }, "ar", money);
    expect(ask.title).toBe("اعتماد التحويل؟");
    expect(value(ask, "الإيصال")).toBe("لا يوجد: تحقق من حسابك");
  });

  it("leaves the amount out rather than guess it under a category rule", () => {
    const rules = [{ kind: "percent", percent: 50, category_slugs: ["abayas"] }];
    const ask = transferApprovalAsk({ ...order, advance_rules: rules }, "en", money);
    expect(value(ask, "Amount to approve")).toBeUndefined();
    expect(value(ask, "Order total")).toBe("BHD 90.000");
  });
});
