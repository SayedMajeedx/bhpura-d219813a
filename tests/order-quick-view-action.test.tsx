import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrderQuickInspectSheet } from "../src/features/orders/components/OrderQuickInspectSheet";

// The orders list's quick view covers the row it came from, so it carries the row's own next
// step (renderOrderQueueAction, passed in by the list) beside one link to the full page, under
// short headings in the reader's language.

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/order">{children}</a>,
}));
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const profile = vi.hoisted(() => ({ useProfile: () => ({ isAdmin: true }) }));
vi.mock("../src/lib/profile-context", () => profile);
vi.mock("@/lib/profile-context", () => profile);
const numbers = vi.hoisted(() => ({ useOrderNumber: () => (n: number) => `#${n}` }));
vi.mock("../src/hooks/use-order-number", () => numbers);
vi.mock("@/hooks/use-order-number", () => numbers);

const order = {
  id: "o1",
  invoice_number: 1048,
  created_at: "2026-10-30T08:00:00Z",
  currency: "BHD",
  subtotal: 64,
  discount: 6,
  delivery_fee: 2,
  total: 60,
  gateway_reference: "chg_123",
  order_items: [{ id: "l1", description: "Embroidered crepe", quantity: 1, unit_price: 64 }],
};

const sheet = (lang: "ar" | "en", renderAction?: () => React.ReactNode) =>
  render(
    <OrderQuickInspectSheet
      order={order}
      slug="pura"
      lang={lang}
      locale={lang}
      onClose={vi.fn()}
      renderAction={renderAction}
    />,
  );

describe("the orders list's quick view", () => {
  it("offers the order's next step and one way to the full page", () => {
    sheet("ar", () => <button type="button">تأكيد وتجهيز الطلب</button>);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "تأكيد وتجهيز الطلب" })).toBeTruthy();
    expect(within(dialog).getAllByRole("link")).toHaveLength(1);
    expect(within(dialog).getByRole("link").textContent).toContain("صفحة الطلب");
  });

  it("shows a settled order's state where its step would be", () => {
    sheet("en", () => <span>Delivered</span>);
    expect(screen.getByText("Delivered")).toBeTruthy();
    expect(screen.getByRole("link").textContent).toContain("Order page");
  });

  it("says its parts in short words, in Arabic throughout", () => {
    sheet("ar");
    const text = screen.getByRole("dialog").textContent ?? "";
    for (const word of ["العميل", "المنتجات", "المجموع", "الخصم", "التوصيل", "الإجمالي"]) {
      expect(text).toContain(word);
    }
    expect(text).not.toMatch(/تفاصيل الحساب المالي|إجمالي الفاتورة النهائي|المنتجات والأصناف/);
    // The payment gateway's part once kept English labels on an Arabic page.
    expect(text).toContain("المرجع");
    expect(text).not.toMatch(/Reference ID|Gateway Status|N\/A/);
  });
});
