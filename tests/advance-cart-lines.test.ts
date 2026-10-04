import { describe, expect, it } from "vitest";
import { advanceLinesOfCart } from "../src/features/checkout/lib/advance-cart-lines";
import { advanceForOrder, advanceRuleFrom } from "../src/lib/payments/advance-payment";
import { cartLineId } from "../src/lib/cart-line-id";
import type { CartItem } from "../src/lib/storefront-context";

const item = (over: Partial<CartItem> = {}): CartItem => ({
  cart_line_id: "l1",
  variant_id: "v1",
  product_id: "dress",
  name: "Dress",
  image: null,
  price: 8,
  size: "52",
  color: "Navy",
  qty: 1,
  max_stock: 3,
  ...over,
});

const made = new Set(["dress", "abaya"]);
const categories = new Map<string, string | null>([["dress", "dresses"]]);
const lines = (cart: CartItem[]) => advanceLinesOfCart(cart, made, categories);

describe("the cart's lines as the advance rules see them", () => {
  it("makes a line made to order when its product is, unless a ready size was chosen", () => {
    expect(lines([item()])[0].madeToOrder).toBe(true);
    expect(lines([item({ tailored: true })])[0].madeToOrder).toBe(true);
    expect(lines([item({ tailored: false })])[0].madeToOrder).toBe(false);
  });

  it("leaves a product that is not made to order ready-made, whatever the cart says", () => {
    expect(lines([item({ product_id: "scarf" })])[0].madeToOrder).toBe(false);
    expect(lines([item({ product_id: "scarf", tailored: true })])[0].madeToOrder).toBe(false);
  });

  it("keeps a booked service made to order, and carries amount, product and category", () => {
    const booked = item({ product_id: "massage", qty: 2, price: 10, booking: {} as never });
    expect(lines([booked])[0]).toMatchObject({ madeToOrder: true, amount: 20, category: null });
    expect(lines([item()])[0]).toMatchObject({
      amount: 8,
      productId: "dress",
      category: "dresses",
    });
  });

  it("is why a ready size is not asked an advance under 'made to order only'", () => {
    const rule = advanceRuleFrom(
      {
        advance_payment_enabled: true,
        advance_payment_percent: 50,
        advance_payment_scope: "made_to_order",
      },
      [],
    );
    const order = (cart: CartItem[]) =>
      advanceForOrder({ total: 8, shipping: 0, fulfillment: "pickup", lines: lines(cart) }, rule);
    // The case from a live store: every product is switched to made-to-order, and this shopper
    // chose a ready size.
    expect(order([item({ tailored: false })]).applies).toBe(false);
    expect(order([item({ tailored: true })])).toMatchObject({ applies: true, dueNow: 4 });
    // A cart saved before the choice was recorded stays as it was.
    expect(order([item()])).toMatchObject({ applies: true, dueNow: 4 });
  });
});

describe("the cart line's id with a ready size on a made-to-order product", () => {
  const id = (over: Partial<CartItem>) => cartLineId(item(over));

  it("keeps the id every other line already had, so a saved cart still merges", () => {
    expect(id({ tailored: true })).toBe(id({}));
    expect(id({})).toBe(
      JSON.stringify({ variant: "v1", size: "52", color: "Navy", fabric: "", fields: [] }),
    );
  });

  it("gives a ready size its own line apart from the same item made to order", () => {
    expect(id({ tailored: false })).not.toBe(id({ tailored: true }));
    expect(id({ tailored: false })).toBe(id({ tailored: false }));
  });
});
