import { afterEach, describe, expect, it, vi } from "vitest";
import { showOtherPaymentMethods } from "../src/features/checkout/components/PaymentFailedCard";
import { PAYMENT_METHODS_SECTION_ID } from "../src/features/checkout/components/PaymentMethodCard";

// After a failed card payment, "Choose another payment method" puts the focus on a method. The list
// can change a moment later (the store's advance-payment rule arrives and takes cash on delivery
// away); the focus must not be lost with the button that had it. (This was a flaky browser test.)

function section(ids: string[]) {
  document.body.innerHTML = `<div id="${PAYMENT_METHODS_SECTION_ID}">${ids
    .map((id) => `<button data-payment-method="${id}">${id}</button>`)
    .join("")}</div>`;
  return document.getElementById(PAYMENT_METHODS_SECTION_ID)!;
}
const method = (id: string) => document.querySelector<HTMLElement>(`[data-payment-method="${id}"]`);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("showOtherPaymentMethods", () => {
  it("focuses the first method that is not the card, or the card when it is the only one", () => {
    section(["card", "cod", "benefit"]);
    showOtherPaymentMethods();
    expect(document.activeElement).toBe(method("cod"));

    section(["card"]);
    showOtherPaymentMethods();
    expect(document.activeElement).toBe(method("card"));
  });

  it("does nothing when the payment section is not on the page", () => {
    document.body.innerHTML = "";
    expect(() => showOtherPaymentMethods()).not.toThrow();
  });

  it("moves the focus to the method that is first now when the focused one disappears", async () => {
    const root = section(["cod", "benefit"]);
    showOtherPaymentMethods();
    expect(document.activeElement).toBe(method("cod"));

    // The advance rule arrives: cash on delivery is taken away.
    root.removeChild(method("cod")!);
    await settle();
    expect(document.activeElement).toBe(method("benefit"));
  });

  it("leaves the focus alone once the shopper has clicked or pressed a key elsewhere", async () => {
    const root = section(["cod", "benefit"]);
    const elsewhere = document.createElement("input");
    document.body.appendChild(elsewhere);
    showOtherPaymentMethods();

    document.dispatchEvent(new Event("pointerdown"));
    elsewhere.focus();
    root.removeChild(method("cod")!);
    await settle();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("stops watching after a couple of seconds", async () => {
    vi.useFakeTimers();
    const root = section(["cod", "benefit"]);
    showOtherPaymentMethods();
    vi.advanceTimersByTime(2500);

    root.removeChild(method("cod")!);
    await vi.advanceTimersByTimeAsync(0);
    expect(document.activeElement).toBe(document.body);
  });
});
