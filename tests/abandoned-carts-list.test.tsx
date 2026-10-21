import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The cart list lets a person write only to a shopper who agreed, through the one WhatsApp
// phone rule, and makes a discount code only when asked and only with the store's own discount.
// It once offered WhatsApp to every phone and made a 10% code on every press.

const stubs = vi.hoisted(() => ({
  generateCartRecoveryCoupon: vi.fn(async () => "BACK3"),
}));

const i18n = { useI18n: () => ({ lang: "en" }) };
vi.mock("../src/lib/i18n", () => i18n);
vi.mock("@/lib/i18n", () => i18n);
const functions = { generateCartRecoveryCoupon: stubs.generateCartRecoveryCoupon };
vi.mock("../src/lib/abandoned-carts.functions", () => functions);
vi.mock("@/lib/abandoned-carts.functions", () => functions);
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { AbandonedCartsList } = await import("../src/components/abandoned-carts/AbandonedCartsList");

const cart = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  brand_id: "b1",
  session_id: `s${id}`,
  guest_name: `Shopper ${id}`,
  guest_phone: `3300112${id}`,
  cart_items: [{ cart_line_id: "l", product_id: "p", title: "Abaya", price: 40, qty: 1 }],
  subtotal: 40,
  currency: "BHD",
  recovery_token: `token${id}`,
  status: "abandoned",
  marketing_consent: true,
  last_activity_at: "2026-10-20T10:00:00Z",
  abandoned_at: "2026-10-20T10:40:00Z",
  recovery_attempts_count: 0,
  created_at: "2026-10-20T10:00:00Z",
  updated_at: "2026-10-20T10:00:00Z",
  ...overrides,
});

const show = (
  carts: unknown[],
  recoveryCode: null | { type: "fixed"; value: number; expiryHours: number },
) =>
  render(
    <AbandonedCartsList
      carts={carts as never}
      brandSlug="pura"
      brandName="Pura Line"
      brandId="b1"
      recoveryCode={recoveryCode}
      isLoading={false}
      onRefresh={() => undefined}
    />,
  );

const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

beforeEach(() => {
  stubs.generateCartRecoveryCoupon.mockClear();
  vi.mocked(window.open).mockClear?.();
});

describe("the cart list", () => {
  it("offers WhatsApp only to a shopper who agreed, and says why not otherwise", () => {
    show([cart("1"), cart("2", { marketing_consent: false })], null);
    expect(within(rowOf("Shopper 1")).getByRole("button", { name: /whatsapp/i })).toBeTruthy();
    const refused = rowOf("Shopper 2");
    expect(within(refused).queryByRole("button", { name: /whatsapp/i })).toBeNull();
    expect(within(refused).getByText("No consent to messages")).toBeTruthy();
  });

  it("opens the shopper's chat with the reminder and makes no code unless asked", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    show([cart("1")], { type: "fixed", value: 3, expiryHours: 24 });
    fireEvent.click(within(rowOf("Shopper 1")).getByRole("button", { name: /^whatsapp$/i }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    const url = String(open.mock.calls[0][0]);
    expect(url.startsWith("https://wa.me/973330011")).toBe(true);
    expect(decodeURIComponent(url)).toContain("your cart at Pura Line is still saved");
    expect(stubs.generateCartRecoveryCoupon).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("makes a code with the store's own discount when a person asks for one", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    show([cart("1")], { type: "fixed", value: 3, expiryHours: 24 });
    fireEvent.click(within(rowOf("Shopper 1")).getByRole("button", { name: /with a code/i }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(stubs.generateCartRecoveryCoupon).toHaveBeenCalledWith({
      brandId: "b1",
      cartId: "1",
      discountType: "fixed",
      discountValue: 3,
      expiryHours: 24,
    });
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toContain(
      "A code for this cart: BACK3",
    );
    open.mockRestore();
  });

  it("offers no code button when the store chose none", () => {
    show([cart("1")], null);
    expect(within(rowOf("Shopper 1")).queryByRole("button", { name: /with a code/i })).toBeNull();
  });

  it("offers nothing to write on a cart that is not left", () => {
    show([cart("1", { status: "converted" })], null);
    expect(within(rowOf("Shopper 1")).queryByRole("button", { name: /whatsapp/i })).toBeNull();
    expect(within(rowOf("Shopper 1")).getByText("Ordered")).toBeTruthy();
  });
});
