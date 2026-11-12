import { describe, expect, it, vi } from "vitest";
import { adminNotice, customerNotice, type NoticeEvent } from "../src/lib/gift-card-notices";
import { purchaseTotal } from "../src/lib/payments/gift-card-charge";
import { addonsLine, orderTotal, purchaseAddons } from "../src/features/gift-cards/lib/card-orders";
import { offerRange } from "../src/lib/data/gift-cards/online";
import {
  amountInRange,
  startAmount,
  typedAmount,
} from "../src/features/gift-card-shop/lib/gift-card-shop";

// A gift card's amount in the store's range and its add-ons with a printed card (migration
// 20261206100000), as the screens, the card charge and the emails read them. The database's own
// rules are run in a real Postgres by tests/gift-card-range-and-addons-migration.test.ts.

vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const ADDONS = [
  { id: "a1", name_ar: "ورد", name_en: "Roses", price: 12, quantity: 1 },
  { id: "a2", name_ar: "شوكولاتة", name_en: "Chocolate", price: 4.5, quantity: 2 },
];

describe("the amount", () => {
  it("is a whole amount from the store's least to its most", () => {
    const offer = { minAmount: 5, maxAmount: 40 };
    expect(amountInRange(5, offer)).toBe(true);
    expect(amountInRange(40, offer)).toBe(true);
    expect(amountInRange(41, offer)).toBe(false);
    expect(amountInRange(12.5, offer)).toBe(false);
    expect(amountInRange(null, offer)).toBe(false);
  });

  it("is read as typed, Arabic digits too", () => {
    expect(typedAmount("٢٥")).toBe(25);
    expect(typedAmount(" 30 ")).toBe(30);
    expect(typedAmount("12٫5")).toBe(12.5);
    expect(typedAmount("abc")).toBeNull();
    expect(typedAmount("")).toBeNull();
  });

  it("starts a third of the way, on a round amount, inside the range", () => {
    expect(startAmount({ minAmount: 5, maxAmount: 40 })).toBe(15);
    expect(startAmount({ minAmount: 5, maxAmount: 100 })).toBe(40);
    expect(startAmount({ minAmount: 25, maxAmount: 25 })).toBe(25);
    expect(startAmount({ minAmount: 1, maxAmount: 3 })).toBe(1);
  });

  it("reads the store's range, else its old list's least and most", () => {
    expect(offerRange(5, 40, [25, 50])).toEqual({ min: 5, max: 40 });
    expect(offerRange(null, null, [10.5, 25, 60.75])).toEqual({ min: 11, max: 60 });
    expect(offerRange(null, null, [])).toBeNull();
  });
});

describe("what a purchase costs", () => {
  it("is the card, the fee and the add-ons, for the charge and the transfer check alike", () => {
    const purchase = { amount: 20, print_fee: 2.5, addons_total: 21 };
    expect(purchaseTotal(purchase)).toBe(43.5);
    expect(orderTotal(purchase)).toBe(43.5);
    // A purchase from before the add-ons.
    expect(purchaseTotal({ amount: 20, print_fee: 2.5 })).toBe(22.5);
  });
});

describe("what staff prepare", () => {
  it("names the add-ons in the reader's language with how many", () => {
    expect(addonsLine(purchaseAddons({ addons: ADDONS }, "en"), "en")).toBe("Roses, Chocolate × 2");
    expect(addonsLine(purchaseAddons({ addons: ADDONS }, "ar"), "ar")).toBe("ورد، شوكولاتة × 2");
    expect(purchaseAddons({ addons: null }, "en")).toEqual([]);
  });
});

describe("the emails", () => {
  const event = (over: Partial<NoticeEvent> = {}): NoticeEvent => ({
    event_id: "ev1",
    event: "paid",
    purchase_id: "00000000-0000-4000-8000-0000000000c1",
    brand_id: "b1",
    slug: "pura",
    store_name: "Pura Line",
    sender_name: null,
    amount: 20,
    currency: "BHD",
    payment_method: "card",
    delivery_channel: "email",
    lang: "en",
    buyer_name: "Sara",
    buyer_phone: null,
    buyer_email: "sara@example.com",
    recipient_name: "Noor",
    message: null,
    cancel_reason: null,
    token: "t".repeat(64),
    code: "ABCD-EFGH-JKMN",
    expires_on: null,
    print_by_store: true,
    print_fee: 2.5,
    print_address: "Sadad, block 1",
    print_phone: "+97339001122",
    addons: ADDONS,
    addons_total: 21,
    ...over,
  });

  it("tell the buyer and the store what goes with the card and what was paid in all", () => {
    const buyer = customerNotice(event())!;
    expect(buyer.text).toContain("With: Roses, Chocolate × 2");
    expect(buyer.text).toContain("BHD 43.500 in all");
    const store = adminNotice(event())!;
    expect(store.text).toMatch(/Roses, Chocolate × 2/);
    expect(store.text).toMatch(/43\.500/);
  });

  it("say nothing of add-ons on a card with none", () => {
    const buyer = customerNotice(event({ addons: [], addons_total: 0 }))!;
    expect(buyer.text).not.toContain("With:");
    expect(buyer.text).toContain("BHD 22.500 in all");
  });
});
