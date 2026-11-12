import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { giftReceiptHtml, giftReceiptPieces } from "../src/lib/gift-receipt";
import { giftCostFromText } from "../src/lib/gift-addons";
import { giftOrderNote } from "../src/lib/gift-order-note";

// Gift orders, the staff's side (step three): a "Gift" mark wherever an order is listed, a gift
// receipt for the box with no price on it, and what the card and each add-on cost the store,
// seen and set only by staff who see the finances.

const stubs = vi.hoisted(() => ({
  finance: true,
  costs: { card: 0.4, addons: { a1: 7 } } as {
    card: number | null;
    addons: Record<string, number>;
  },
  setCost: vi.fn(async () => undefined),
}));
const data = vi.hoisted(() => ({
  giftOrderQueries: {
    costs: (brandId: string, enabled: boolean) => ({
      queryKey: ["gift-costs", brandId],
      queryFn: async () => stubs.costs,
      enabled,
    }),
  },
  setGiftItemCost: (...args: unknown[]) => stubs.setCost(...(args as [])),
  invalidateGiftCosts: vi.fn(async () => undefined),
}));
vi.mock("../src/lib/data/gift-orders", () => data);
vi.mock("@/lib/data/gift-orders", () => data);
const profile = { useProfileOptional: () => ({ canViewFinancials: stubs.finance }) };
vi.mock("../src/lib/profile-context", () => profile);
vi.mock("@/lib/profile-context", () => profile);
const currency = { useMoneyLabel: () => "BHD", useStoreCurrency: () => "BHD" };
vi.mock("../src/hooks/use-store-currency", () => currency);
vi.mock("@/hooks/use-store-currency", () => currency);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { OrderGiftBadge } = await import("../src/features/orders/components/OrderGiftBadge");
const { GiftReceiptButton } = await import("../src/features/orders/components/GiftReceiptButton");
const { GiftCostField } = await import("../src/features/settings/tabs/orders/GiftCostField");

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const GIFT = {
  recipient: "Noor",
  from: "Sara",
  card: true,
  card_price: 1.5,
  addons: [{ name_ar: "باقة ورد", name_en: "Flower bouquet", quantity: 2 }],
};
const LINES = [
  {
    name_en: "Black abaya",
    name_ar: "عباية سوداء",
    quantity: 1,
    selected_variant: { size: "54", color: "Black" },
    unit_price: 45,
  },
  {
    name_en: "Linen dress",
    name_ar: "فستان كتان",
    quantity: 2,
    location: "custom",
    selected_variant: { size: "56", made_to_measure: true },
    unit_price: 30,
  },
  { name_en: "Gift message card", name_ar: "بطاقة إهداء", quantity: 1, gift_line: "card" },
  { name_en: "Flower bouquet", name_ar: "باقة ورد", quantity: 2, gift_line: "addon" },
];

beforeEach(() => {
  vi.clearAllMocks();
  stubs.finance = true;
});

describe("the gift mark", () => {
  it("names who the gift is for and that it has add-ons, and nothing for another order", () => {
    const { container, rerender } = render(<OrderGiftBadge order={{ gift: GIFT }} lang="en" />);
    expect(container).toHaveTextContent("Gift · Noor · with add-ons");
    expect(container.firstElementChild).toHaveAttribute(
      "title",
      "To Noor · With: card, Flower bouquet",
    );
    rerender(<OrderGiftBadge order={{ gift: null, notes: "Leave at the door" }} lang="en" />);
    expect(container).toBeEmptyDOMElement();
    // An older gift order kept its details in its notes.
    rerender(<OrderGiftBadge order={{ notes: giftOrderNote("نور", "") }} lang="ar" />);
    expect(container).toHaveTextContent("هدية · نور");
  });
});

describe("the gift receipt", () => {
  it("lists the pieces in the box by name and option, never the gift's own lines", () => {
    expect(giftReceiptPieces(LINES, "en")).toEqual([
      { name: "Black abaya", detail: "54 · Black", quantity: 1 },
      { name: "Linen dress", detail: "Made to measure", quantity: 2 },
    ]);
    expect(giftReceiptPieces(LINES, "ar")[0].name).toBe("عباية سوداء");
  });

  it("names the gift, the order and the store's contact, and no price, amount or payment", () => {
    const html = giftReceiptHtml({
      storeName: "Pura Line",
      orderNumber: 1042,
      numberFormat: { order_number_prefix: "PL-", order_number_digits: 5 },
      orderDate: "12 Nov 2026",
      gift: { recipient: "Noor", from: "Sara" },
      pieces: giftReceiptPieces(LINES, "en"),
      contact: "+973 3995 0016",
      lang: "en",
    });
    expect(html).toContain("A gift for Noor");
    expect(html).toContain("From Sara");
    expect(html).toContain("PL-01042");
    expect(html).toContain("Black abaya");
    expect(html).toContain("+973 3995 0016");
    expect(html).not.toMatch(/BHD|د\.ب|45|30\.000|total|paid|collect/i);
    expect(html).not.toContain("Gift message card");
    const ar = giftReceiptHtml({
      storeName: "بيورا",
      orderNumber: 7,
      gift: { recipient: null, from: null },
      pieces: [],
      lang: "ar",
    });
    expect(ar).toContain('dir="rtl"');
    expect(ar).toContain("هدية لك");
  });

  it("is printed from the order in the language chosen, only for a gift order", () => {
    const written: string[] = [];
    const fake = {
      document: {
        open: vi.fn(),
        write: (html: string) => written.push(html),
        close: vi.fn(),
      },
    };
    const open = vi.spyOn(window, "open").mockReturnValue(fake as unknown as Window);
    const order = { gift: GIFT, invoice_number: 1042, created_at: "2026-11-12T08:00:00Z" };
    const { rerender, container } = render(
      <GiftReceiptButton order={order} items={LINES} storeName="Pura Line" lang="en" />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "عربي" }));
    fireEvent.click(screen.getByRole("button", { name: /Print gift receipt/ }));
    expect(open).toHaveBeenCalled();
    expect(written[0]).toContain("هدية إلى Noor");
    expect(written[0]).toContain("عباية سوداء");
    rerender(
      <GiftReceiptButton order={{ gift: null }} items={LINES} storeName="Pura Line" lang="en" />,
    );
    expect(container).toBeEmptyDOMElement();
    open.mockRestore();
  });
});

describe("what a gift costs the store", () => {
  it("reads a cost as typed: none when empty, refused outside 0 to 10,000", () => {
    expect(giftCostFromText("")).toBeNull();
    expect(giftCostFromText("0")).toBe(0);
    expect(giftCostFromText("٧٫٥")).toBe(7.5);
    expect(giftCostFromText("-1")).toBe("invalid");
    expect(giftCostFromText("20000")).toBe("invalid");
    expect(giftCostFromText("abc")).toBe("invalid");
  });

  it("is set by finance staff, the card's and an add-on's apart", async () => {
    render(<GiftCostField brandId="b1" addonId="a1" lang="en" />, { wrapper });
    const field = await screen.findByLabelText("Cost to you (BHD)");
    expect(field).toHaveValue("7");
    const save = screen.getByRole("button", { name: "Save cost" });
    expect(save).toBeDisabled();
    fireEvent.change(field, { target: { value: "8.25" } });
    fireEvent.click(save);
    await waitFor(() => expect(stubs.setCost).toHaveBeenCalledWith("b1", "a1", 8.25));
    // Emptied, the cost is removed.
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save cost" }));
    await waitFor(() => expect(stubs.setCost).toHaveBeenLastCalledWith("b1", "a1", null));
  });

  it("shows the card's own cost, and nothing to staff who do not see the finances", async () => {
    const card = render(<GiftCostField brandId="b1" addonId={null} lang="en" />, { wrapper });
    expect(await screen.findByLabelText("Cost to you (BHD)")).toHaveValue("0.4");
    card.unmount();
    stubs.finance = false;
    const { container } = render(<GiftCostField brandId="b1" addonId={null} lang="en" />, {
      wrapper,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });
});
