import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  offSaleUntil,
  productAvailability,
  variantSellable,
} from "../src/lib/product-availability";
import { choiceUnavailable } from "../src/features/product-page/lib/variant-options";
import { offSaleEnd, offSaleStatus } from "../src/lib/off-sale";
import { offSaleSentence } from "../src/lib/opening-hours";
import { OffSaleControl } from "../src/components/inventory/OffSaleControl";

// Taking a product or a category off sale until a time: the one availability rule says it cannot
// be bought (every surface reads it), the product page says when it is back, and staff choose how
// long. The database holds the same (tests/take-off-sale-migration.test.ts).

const NOW = new Date("2026-10-27T09:00:00Z"); // 12:00 in Bahrain
const later = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

afterEach(() => vi.useRealTimers());

describe("whether a product is off sale", () => {
  it("is its own moment or its category's, the later still to come", () => {
    expect(offSaleUntil({}, NOW)).toBeNull();
    expect(offSaleUntil({ unavailable_until: later(-1) }, NOW)).toBeNull();
    expect(offSaleUntil({ unavailable_until: later(2) }, NOW)).toBe(later(2));
    expect(
      offSaleUntil({ unavailable_until: later(2), category_unavailable_until: later(5) }, NOW),
    ).toBe(later(5));
    expect(
      offSaleUntil({ unavailable_until: later(2), category_unavailable_until: "infinity" }, NOW),
    ).toBe("infinity");
  });

  it("cannot be bought, made to order, from stock or as a service, until then", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    const off = { unavailable_until: later(1) };
    expect(productAvailability({ ...off }, 10)).toMatchObject({
      sellable: false,
      status: "available",
      offSaleUntil: later(1),
    });
    expect(productAvailability({ ...off, is_made_to_order: true }, 0).sellable).toBe(false);
    expect(productAvailability({ ...off, item_kind: "service" }, 0).sellable).toBe(false);
    expect(variantSellable(off, { stock_main: 5 })).toBe(false);
    expect(variantSellable({}, { stock_main: 5 })).toBe(true);
    expect(productAvailability({}, 10).offSaleUntil).toBeNull();
  });

  it("makes the product page offer no purchase, even while making to order", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    const variants = [{ id: "v", stock_main: 3 }];
    expect(
      choiceUnavailable({
        variant: variants[0],
        variants,
        product: { unavailable_until: "infinity" },
        isTailoringActive: true,
      }),
    ).toBe(true);
    expect(
      choiceUnavailable({ variant: variants[0], variants, product: {}, isTailoringActive: false }),
    ).toBe(false);
  });
});

describe("what a shopper and staff read", () => {
  it("tells a shopper when it is back, on the store's clock", () => {
    expect(offSaleSentence(later(6), {}, NOW, "en")).toBe(
      "Not available to order right now, back today at 18:00.",
    );
    expect(offSaleSentence(later(22), {}, NOW, "ar")).toBe("غير متاح للطلب الآن، يعود غدًا 10:00.");
    expect(offSaleSentence("infinity", {}, NOW, "ar")).toBe("غير متاح للطلب الآن.");
  });

  it("ends a choice an hour or four from now, at the next midnight, or never", () => {
    expect(offSaleEnd("1h", NOW)).toBe(later(1));
    expect(offSaleEnd("4h", NOW)).toBe(later(4));
    expect(offSaleEnd("until_back", NOW)).toBe("infinity");
    const tomorrow = new Date(offSaleEnd("tomorrow", NOW));
    expect(tomorrow > NOW).toBe(true);
    expect([tomorrow.getHours(), tomorrow.getMinutes()]).toEqual([0, 0]);
    expect(offSaleStatus("infinity", false, NOW)).toBe("Off sale until you put it back");
  });
});

describe("the staff control", () => {
  it("offers how long, and takes the product off sale until put back", () => {
    const onSet = vi.fn();
    render(
      <OffSaleControl
        isAr={false}
        subject="product"
        current={null}
        pending={false}
        onSet={onSet}
      />,
    );
    for (const label of ["1 hour", "4 hours", "Until tomorrow", "Until I put it back"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Until I put it back" }));
    expect(onSet).toHaveBeenCalledWith("infinity");
  });

  it("says a category is off sale and puts it back", () => {
    const onSet = vi.fn();
    render(
      <OffSaleControl isAr subject="category" current="infinity" pending={false} onSet={onSet} />,
    );
    expect(screen.getByText("موقوف عن البيع حتى تعيده")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /أعده للبيع/ }));
    expect(onSet).toHaveBeenCalledWith(null);
  });
});
