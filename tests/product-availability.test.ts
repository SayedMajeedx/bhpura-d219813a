import { describe, expect, it } from "vitest";
import {
  availabilityBadge,
  availabilityOf,
  isSoldFromStock,
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
      detail: null,
    });
    expect(
      availabilityBadge(productAvailability(tailored, 3), "ar", {
        ...labels("ar"),
        madeToOrder: "تفصيل حسب الطلب",
      }),
    ).toEqual({ tone: "made_to_order", label: "تفصيل حسب الطلب", detail: "جاهز: 3" });
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
