import { describe, expect, it } from "vitest";
import { planLeftovers, type LeftoverFacts } from "../src/lib/verticals/vertical-leftovers";
import { planVerticalChange } from "../src/lib/verticals/vertical-change";

const facts = (over: Partial<LeftoverFacts> = {}): LeftoverFacts => ({
  moduleOverrides: {},
  products: 0,
  services: 0,
  openOrders: { delivery: 0, pickup: 0, digital: 0, appointment: 0 },
  openBookings: 0,
  activeIncubators: 0,
  openReturns: 0,
  deliveryEnabled: false,
  pickupEnabled: false,
  shippingZones: 0,
  advancePayment: { enabled: false, scope: "all" },
  ...over,
});
const ids = (
  from: Parameters<typeof planLeftovers>[0]["from"],
  to: Parameters<typeof planLeftovers>[0]["to"],
  f: LeftoverFacts,
) => planLeftovers({ from, to, facts: f }).map((l) => l.id);

describe("what a change of vertical leaves behind", () => {
  it("lists nothing for a store with nothing left over", () => {
    expect(ids("fashion", "services", facts())).toEqual([]);
    expect(ids("services", "fashion", facts())).toEqual([]);
  });

  it("lists, from goods to services, the goods and the delivery that stay", () => {
    const found = planLeftovers({
      from: "fashion",
      to: "services",
      facts: facts({
        products: 12,
        openOrders: { delivery: 3, pickup: 1, digital: 0, appointment: 0 },
        deliveryEnabled: true,
        shippingZones: 2,
        advancePayment: { enabled: true, scope: "delivery" },
        activeIncubators: 2,
        openReturns: 1,
      }),
    });
    expect(found.map((l) => l.id)).toEqual([
      "products-not-services",
      "open-orders",
      "incubators",
      "returns",
      "delivery-settings",
      "advance-scope",
    ]);
    expect(found.find((l) => l.id === "products-not-services")).toMatchObject({ count: 12 });
    // Delivery and pickup orders both count: a services store has no screen for either.
    expect(found.find((l) => l.id === "open-orders")?.count).toBe(4);
    expect(found.find((l) => l.id === "incubators")?.text.en).toMatch(/may be owed money/);
  });

  it("lists, from services to goods, the services and the bookings that stay", () => {
    const found = planLeftovers({
      from: "services",
      to: "fashion",
      facts: facts({
        services: 6,
        openBookings: 4,
        openOrders: { delivery: 0, pickup: 0, digital: 0, appointment: 2 },
      }),
    });
    expect(found.map((l) => l.id)).toEqual([
      "services-not-products",
      "open-orders",
      "open-bookings",
    ]);
    expect(found.find((l) => l.id === "open-bookings")?.text.en).toMatch(/leave the menu/);
  });

  it("lists nothing between two goods verticals", () => {
    expect(
      ids(
        "fashion",
        "beauty",
        facts({
          products: 40,
          openOrders: { delivery: 5, pickup: 2, digital: 0, appointment: 0 },
          deliveryEnabled: true,
          activeIncubators: 1,
          openReturns: 3,
          advancePayment: { enabled: true, scope: "delivery" },
        }),
      ),
    ).toEqual([]);
  });

  it("names a hand-set module that differs from the new vertical, and not one that agrees", () => {
    const found = planLeftovers({
      from: "fashion",
      to: "services",
      facts: facts({ moduleOverrides: { stock: true, shipping: false, bookings: true } }),
    });
    const overrides = found.find((l) => l.id === "module-overrides");
    // Stock on differs from a services store (off); shipping off and bookings on agree with it.
    expect(overrides?.count).toBe(1);
    expect(overrides?.text.en).toContain("stock");
    expect(overrides?.text.en).not.toContain("shipping");
    expect(overrides?.text.ar).toContain("المخزون");
  });

  it("says each in both languages, with something to do about it", () => {
    const found = planLeftovers({
      from: "fashion",
      to: "services",
      facts: facts({
        products: 1,
        moduleOverrides: { returns: true },
        openOrders: { delivery: 1, pickup: 0, digital: 0, appointment: 0 },
        deliveryEnabled: true,
        advancePayment: { enabled: true, scope: "made_to_order" },
      }),
    });
    expect(found.length).toBeGreaterThan(3);
    for (const leftover of found) {
      for (const lang of ["ar", "en"] as const) {
        expect(leftover.text[lang].length).toBeGreaterThan(10);
        expect(leftover.advice[lang].length).toBeGreaterThan(5);
      }
    }
  });

  it("does not mention a goods advance scope when the rule is off or reaches everything", () => {
    expect(
      ids("fashion", "services", facts({ advancePayment: { enabled: false, scope: "delivery" } })),
    ).toEqual([]);
    expect(
      ids("fashion", "services", facts({ advancePayment: { enabled: true, scope: "all" } })),
    ).toEqual([]);
  });
});

describe("the plan of a vertical change", () => {
  const plan = (withFacts: boolean) =>
    planVerticalChange({
      brandId: "b1",
      from: "fashion",
      to: "services",
      installed: [],
      categories: [],
      usedKeys: new Set(),
      syncCategories: false,
      facts: withFacts ? facts({ products: 3 }) : undefined,
    });

  it("carries the leftovers when the store was read, and none when it was not", () => {
    expect(plan(true).leftovers.map((l) => l.id)).toEqual(["products-not-services"]);
    expect(plan(false).leftovers).toEqual([]);
  });
});
