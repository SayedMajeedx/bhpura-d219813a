import { describe, expect, it } from "vitest";
import {
  availabilityBadge,
  availabilityOf,
  isSoldFromStock,
  madeToOrderLimit,
  productAvailability,
  readyUnitsOf,
} from "../src/lib/product-availability";
import { hasAvailableStock, type ProductRow } from "../src/lib/data/storefront/types";
import { stockUnitsLabel } from "../src/lib/inventory-labels";

const ready = { is_made_to_order: false, item_kind: "product" };
const tailored = { is_made_to_order: true, item_kind: "product" };
const service = { is_made_to_order: true, item_kind: "service" };
const labels = (lang: "ar" | "en") => ({
  unitsLabel: (units: number, kind: "low" | "available") => stockUnitsLabel(units, kind, lang),
});

describe("ready pieces", () => {
  it("counts the store and the incubator across variants", () => {
    expect(
      readyUnitsOf([
        { stock_main: 2, stock_incubator: 1 },
        { stock_main: "3", stock_incubator: null },
      ]),
    ).toBe(6);
    expect(readyUnitsOf(null)).toBe(0);
  });
});

describe("a product sold from stock", () => {
  it("is out at zero, low at five or fewer, available above", () => {
    expect(productAvailability(ready, 0)).toMatchObject({ status: "out", sellable: false });
    expect(productAvailability(ready, 5)).toMatchObject({ status: "low", sellable: true });
    expect(productAvailability(ready, 6)).toMatchObject({ status: "available", sellable: true });
    expect(isSoldFromStock(ready)).toBe(true);
  });

  it("is low when stock will not last the expected sales of the week", () => {
    expect(productAvailability(ready, 12, 20).status).toBe("low");
    expect(productAvailability(ready, 12, 3).status).toBe("available");
  });
});

describe("a made-to-order piece", () => {
  it("is made to order, never out of stock, with no ready pieces", () => {
    expect(productAvailability(tailored, 0)).toMatchObject({
      status: "made_to_order",
      sellable: true,
      soldFromStock: false,
      readyUnits: 0,
    });
    expect(isSoldFromStock(tailored)).toBe(false);
  });

  it("reports its ready sizes without calling them low", () => {
    expect(productAvailability(tailored, 2)).toMatchObject({
      status: "made_to_order",
      readyUnits: 2,
    });
  });
});

describe("a service", () => {
  it("has nothing to count and can always be booked", () => {
    expect(productAvailability(service, 0)).toMatchObject({ status: "service", sellable: true });
    expect(isSoldFromStock(service)).toBe(false);
  });
});

describe("what a list shows", () => {
  it("says made to order in the store's own word, and how many are ready", () => {
    expect(availabilityBadge(productAvailability(tailored, 0), "en", labels("en"))).toEqual({
      tone: "made_to_order",
      label: "Made to order",
      details: [],
    });
    expect(
      availabilityBadge(productAvailability(tailored, 3), "ar", {
        ...labels("ar"),
        madeToOrder: "تفصيل حسب الطلب",
      }),
    ).toEqual({ tone: "made_to_order", label: "تفصيل حسب الطلب", details: ["جاهز: 3"] });
  });

  it("keeps the words for stocked products", () => {
    expect(availabilityBadge(productAvailability(ready, 0), "en", labels("en")).label).toBe(
      "Out of Stock",
    );
    expect(availabilityBadge(productAvailability(ready, 2), "en", labels("en"))).toMatchObject({
      tone: "low",
      label: "2 units remaining",
    });
    expect(availabilityBadge(productAvailability(ready, 9), "ar", labels("ar"))).toMatchObject({
      tone: "ok",
      label: "9 وحدات متوفرة",
    });
  });
});

describe("the storefront and the admin agree", () => {
  const row = (product: object, stock: number) =>
    ({
      ...product,
      product_variants: [{ stock_main: stock, stock_incubator: 0 }],
    }) as unknown as ProductRow;

  it("for every kind of product and stock", () => {
    for (const product of [ready, tailored, service]) {
      for (const stock of [0, 1, 7]) {
        expect(hasAvailableStock(row(product, stock)), JSON.stringify([product, stock])).toBe(
          availabilityOf(product, [{ stock_main: stock }]).sellable,
        );
      }
    }
  });
});

describe("a made-to-order piece with a limit", () => {
  const limited = (left: number | null) => ({ ...tailored, made_to_order_available: left });

  it("reads the limit: none, some left, or used up", () => {
    expect(madeToOrderLimit(limited(null))).toEqual({ left: null, paused: false, closed: false });
    expect(madeToOrderLimit(tailored)).toEqual({ left: null, paused: false, closed: false });
    expect(madeToOrderLimit(limited(3))).toEqual({ left: 3, paused: false, closed: false });
    expect(madeToOrderLimit(limited(0))).toEqual({ left: 0, paused: false, closed: true });
    // A product that is not made to order has no limit, whatever the column holds.
    expect(madeToOrderLimit({ ...ready, made_to_order_available: 0 })).toEqual({
      left: null,
      paused: false,
      closed: false,
    });
  });

  it("is made to order while pieces are left", () => {
    expect(productAvailability(limited(3), 0)).toMatchObject({
      status: "made_to_order",
      sellable: true,
      madeToOrderLeft: 3,
      madeToOrderClosed: false,
    });
  });

  it("is unavailable when the limit is used up and it has no ready piece", () => {
    expect(productAvailability(limited(0), 0)).toMatchObject({
      status: "out",
      sellable: false,
      madeToOrderClosed: true,
    });
  });

  it("is sold from its ready pieces when the limit is used up", () => {
    expect(productAvailability(limited(0), 2)).toMatchObject({
      status: "low",
      sellable: true,
      soldFromStock: true,
      madeToOrderClosed: true,
    });
  });

  it("shows what is left to make, the ready pieces, and when the limit is reached", () => {
    expect(availabilityBadge(productAvailability(limited(3), 2), "en", labels("en"))).toEqual({
      tone: "made_to_order",
      label: "Made to order",
      details: ["3 left to make", "Ready: 2"],
    });
    expect(availabilityBadge(productAvailability(limited(0), 0), "ar", labels("ar"))).toEqual({
      tone: "out",
      label: "اكتمل العدد حسب الطلب",
      details: [],
    });
    expect(availabilityBadge(productAvailability(limited(0), 9), "en", labels("en"))).toEqual({
      tone: "ok",
      label: "9 units available",
      details: ["Made-to-order limit reached"],
    });
  });

  it("closes the storefront card too", () => {
    const card = (left: number | null, stock: number) =>
      ({
        ...limited(left),
        product_variants: [{ stock_main: stock, stock_incubator: 0 }],
      }) as unknown as ProductRow;
    expect(hasAvailableStock(card(0, 0))).toBe(false);
    expect(hasAvailableStock(card(0, 1))).toBe(true);
    expect(hasAvailableStock(card(2, 0))).toBe(true);
    expect(hasAvailableStock(card(null, 0))).toBe(true);
  });
});
