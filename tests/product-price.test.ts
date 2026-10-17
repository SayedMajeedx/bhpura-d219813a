import { describe, expect, it } from "vitest";
import { buyableVariants, cardPrice, productOnSale } from "../src/lib/product-price";

const v = (selling: number, original: number | null, stock = 1, id = `${selling}-${stock}`) => ({
  id,
  selling_price: selling,
  original_price: original,
  stock_main: stock,
  stock_incubator: 0,
});

describe("cardPrice", () => {
  it("takes the discount of the cheapest buyable piece: from 23, was 30, -23%", () => {
    // Pura's Sabika: sizes 54 and 55 at 23 (was 30, at a partner), size 56 made to order at 30.
    const sabika = { is_made_to_order: true };
    const sizes = [
      { ...v(23, 30, 0), stock_incubator: 1 },
      { ...v(23, 30, 0, "55"), stock_incubator: 1 },
      v(30, null, 0),
    ];
    expect(cardPrice(sabika, sizes)).toEqual({
      from: 23,
      to: 30,
      was: 30,
      percent: 23,
      onSale: true,
    });
  });

  it("leaves out a size that is out of stock on a product sold from stock", () => {
    // The out-of-stock size neither sets "from" nor carries the discount.
    expect(cardPrice({}, [v(30, null, 2), v(23, 30, 0)])).toEqual({
      from: 30,
      to: 30,
      was: null,
      percent: null,
      onSale: false,
    });
    expect(cardPrice({}, [v(23, 30, 1), v(30, null, 0)])).toMatchObject({
      from: 23,
      to: 23,
      was: 30,
      onSale: true,
    });
  });

  it("counts every size of a product made to order, but only ready ones once making is closed", () => {
    const sizes = [v(30, null, 2), v(23, 30, 0)];
    expect(cardPrice({ is_made_to_order: true }, sizes)).toMatchObject({ from: 23, was: 30 });
    expect(
      cardPrice({ is_made_to_order: true, made_to_order_paused_at: "2026-10-01" }, sizes),
    ).toMatchObject({ from: 30, was: null, onSale: false });
    expect(cardPrice({ is_made_to_order: true, made_to_order_available: 0 }, sizes)).toMatchObject({
      from: 30,
      onSale: false,
    });
  });

  it("is on sale without a struck price when only a dearer size is discounted", () => {
    expect(cardPrice({}, [v(20, null), v(25, 35)])).toEqual({
      from: 20,
      to: 25,
      was: null,
      percent: null,
      onSale: true,
    });
  });

  it("reads every size when nothing can be bought (the card says it is out)", () => {
    expect(cardPrice({}, [v(23, 30, 0), v(30, null, 0)])).toMatchObject({
      from: 23,
      was: 30,
      onSale: true,
    });
  });

  it("falls back to the base price, and ignores a free or unpriced variant", () => {
    expect(cardPrice({ base_price: 12 }, [])).toMatchObject({ from: 12, to: 12, onSale: false });
    expect(cardPrice({}, [v(0, 10), v(15, null)])).toMatchObject({ from: 15, onSale: false });
  });
});

describe("buyableVariants and productOnSale", () => {
  it("a service is always bought", () => {
    expect(buyableVariants({ item_kind: "service" }, [v(10, null, 0)])).toHaveLength(1);
  });

  it("reads the product's own variants", () => {
    expect(productOnSale({ product_variants: [v(23, 30)] })).toBe(true);
    expect(productOnSale({ product_variants: [v(30, 30)] })).toBe(false);
    expect(productOnSale({ product_variants: null })).toBe(false);
  });
});
