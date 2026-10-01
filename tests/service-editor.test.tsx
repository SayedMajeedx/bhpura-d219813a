import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  serviceFromPrice,
  servicePricingChanges,
  servicePricingError,
  servicePricingFrom,
  type ServicePricing,
} from "../src/features/inventory/lib/service-pricing";
import {
  serviceIncludesFrom,
  serviceIncludesToSave,
  serviceLocationFrom,
} from "../src/lib/bookings/service-details";
import { productColumnsFrom, productFormFrom } from "../src/features/inventory/lib/product-form";
import { ServicePricingFields } from "../src/features/inventory/components/ServicePricingFields";
import { ServiceDetailsFields } from "../src/features/inventory/components/ServiceDetailsFields";
import { ServicePriceSummary } from "../src/features/inventory/components/ServicePriceSummary";
import type { Product, Variant } from "../src/features/inventory/types";

// Services vertical, step S2: a service was entered like a dress (sizes,
// colours, stock, fabric). Its editor now prices it by length, and says where
// it happens and what it includes.

const timed = [
  { id: "v3", selling_price: 55, original_price: null, duration_minutes: 180 },
  { id: "v5", selling_price: 85, original_price: 95, duration_minutes: 300 },
];

describe("a service's prices", () => {
  it("read a duration-priced service, with the store's other lengths off", () => {
    const pricing = servicePricingFrom(timed, [180, 240, 300]);
    expect(pricing.mode).toBe("duration");
    expect(pricing.rows).toEqual([
      { minutes: 180, enabled: true, price: "55", compareAt: "", variantId: "v3" },
      { minutes: 240, enabled: false, price: "", compareAt: "", variantId: undefined },
      { minutes: 300, enabled: true, price: "85", compareAt: "95", variantId: "v5" },
    ]);
  });

  it("read a fixed price, and a new service as fixed with nothing chosen", () => {
    const fixed = servicePricingFrom([{ id: "v1", selling_price: 30 }], [180]);
    expect(fixed.mode).toBe("fixed");
    expect(fixed.fixed).toEqual({ price: "30", compareAt: "", variantId: "v1" });
    const fresh = servicePricingFrom([], [180, 240]);
    expect(fresh.mode).toBe("fixed");
    expect(fresh.rows.every((row) => !row.enabled)).toBe(true);
  });

  it("refuse no length, a missing price or a compare-at below the price", () => {
    const pricing = servicePricingFrom(timed, [180, 240, 300]);
    expect(servicePricingError(pricing, false)).toBeNull();
    const none: ServicePricing = {
      ...pricing,
      rows: pricing.rows.map((r) => ({ ...r, enabled: false })),
    };
    expect(servicePricingError(none, false)).toMatch(/at least one length/);
    const missing: ServicePricing = {
      ...pricing,
      rows: pricing.rows.map((r) => (r.minutes === 240 ? { ...r, enabled: true } : r)),
    };
    expect(servicePricingError(missing, true)).toMatch(/أدخل سعراً/);
    const below: ServicePricing = {
      ...pricing,
      mode: "fixed",
      fixed: { price: "30", compareAt: "20" },
    };
    expect(servicePricingError(below, false)).toMatch(/compare-at/);
  });

  it("start from the lowest offered price", () => {
    expect(serviceFromPrice(servicePricingFrom(timed, []))).toBe(55);
  });

  it("become variants: update the kept lengths, add new ones, remove the dropped", () => {
    const pricing = servicePricingFrom(timed, [180, 240, 300]);
    const edited: ServicePricing = {
      ...pricing,
      rows: pricing.rows.map((row) =>
        row.minutes === 240
          ? { ...row, enabled: true, price: "70" }
          : row.minutes === 300
            ? { ...row, enabled: false }
            : row,
      ),
    };
    expect(servicePricingChanges(edited, timed, false)).toEqual({
      create: [{ size: "4 hours", selling_price: 70, original_price: null, duration_minutes: 240 }],
      update: [{ id: "v3", patch: { size: "3 hours", selling_price: 55, original_price: null } }],
      remove: ["v5"],
    });
  });

  it("switching to a fixed price replaces the lengths with one variant", () => {
    const pricing = servicePricingFrom(timed, []);
    const fixed: ServicePricing = {
      ...pricing,
      mode: "fixed",
      fixed: { price: "40", compareAt: "" },
    };
    expect(servicePricingChanges(fixed, timed, true)).toEqual({
      create: [{ size: "الخدمة", selling_price: 40, original_price: null, duration_minutes: null }],
      update: [],
      remove: ["v3", "v5"],
    });
  });
});

describe("a service's details", () => {
  it("read and save its place and included lines", () => {
    expect(serviceLocationFrom("venue")).toBe("venue");
    expect(serviceLocationFrom("moon")).toBeNull();
    expect(serviceIncludesFrom([{ ar: "إضاءة", en: "Lighting" }, "junk", null])).toEqual([
      { ar: "إضاءة", en: "Lighting" },
    ]);
    expect(serviceIncludesFrom("nope")).toEqual([]);
    expect(
      serviceIncludesToSave([
        { ar: " إضاءة ", en: "" },
        { ar: "", en: " " },
      ]),
    ).toEqual([{ ar: "إضاءة", en: "" }]);
  });

  it("are saved for a service and cleared for a product", () => {
    const product = (fields: Partial<Product>) => fields as Product;
    const service = productFormFrom(
      product({
        item_kind: "service",
        service_location: "both",
        service_includes: [{ ar: "طباعة", en: "Prints" }],
      }),
    );
    expect(productColumnsFrom(service)).toMatchObject({
      service_location: "both",
      service_includes: [{ ar: "طباعة", en: "Prints" }],
    });
    // A new service is at the customer's by default.
    expect(productFormFrom(null, { service: true }).service_location).toBe("customer");
    const asProduct = { ...service, item_kind: "product" as const };
    expect(productColumnsFrom(asProduct)).toMatchObject({
      service_location: null,
      service_includes: [],
    });
  });
});

function PricingHarness({ initial }: { initial: ServicePricing }) {
  const [pricing, setPricing] = useState(initial);
  return (
    <>
      <ServicePricingFields pricing={pricing} onChange={setPricing} isAr={false} currency="BHD" />
      <output data-testid="state">{JSON.stringify(pricing)}</output>
    </>
  );
}

const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "{}") as ServicePricing;

describe("the price & length section", () => {
  it("switches modes, chooses a length and fills prices from a base", () => {
    render(<PricingHarness initial={servicePricingFrom([], [180, 240])} />);
    expect(screen.getByLabelText(/^Price \(BHD\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "By length" }));
    expect(state().mode).toBe("duration");
    fireEvent.click(screen.getByRole("checkbox", { name: "3 hours" }));
    expect(state().rows[0].enabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Shortest length"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Each extra hour"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Fill prices" }));
    expect(state().rows.map((row) => [row.enabled, row.price])).toEqual([
      [true, "50"],
      [true, "60"],
    ]);
  });
});

describe("the details section", () => {
  it("marks the chosen place and adds a line", () => {
    const calls: unknown[] = [];
    render(
      <ServiceDetailsFields
        location="customer"
        includes={[]}
        onLocation={(location) => calls.push(location)}
        onIncludes={(includes) => calls.push(includes)}
        isAr
      />,
    );
    expect(screen.getByRole("button", { name: "عند العميل" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "في مقرّنا" }));
    fireEvent.click(screen.getByRole("button", { name: /إضافة بند/ }));
    expect(calls).toEqual(["venue", [{ ar: "", en: "" }]]);
  });
});

describe("a service in the inventory list", () => {
  it("shows its lengths and prices, not sizes and stock", () => {
    render(
      <ServicePriceSummary variants={timed as unknown as Variant[]} isAr={false} currency="BHD" />,
    );
    expect(screen.getByText("3 hours")).toBeTruthy();
    expect(screen.getByText("5 hours")).toBeTruthy();
    expect(screen.getByText(/95\.000/)).toBeTruthy();
    expect(screen.queryByText(/stock/i)).toBeNull();
  });
});
