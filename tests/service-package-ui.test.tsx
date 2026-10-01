import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  packageError,
  packageLinesFrom,
  packageLinesText,
  packageSaving,
  priceForPercentOff,
  separatePrice,
  servicePriceAt,
  type PackageLine,
} from "../src/lib/bookings/service-package";
import { applyPercentOff, packagePriceRows } from "../src/features/inventory/lib/package-pricing";
import {
  servicePricingFrom,
  type ServicePricing,
} from "../src/features/inventory/lib/service-pricing";
import {
  productColumnsFrom,
  productFormFrom,
  validateProductForm,
} from "../src/features/inventory/lib/product-form";
import type { Product } from "../src/features/inventory/types";

// Packages, the merchant's side: the rules around what a package includes and
// costs, and the editor section. (The database side is tests/service-packages.test.ts.)

const brandContext = { useBrand: () => ({ id: "b1", slug: "booth" }) };
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);
const catalogData = {
  catalogQueries: {
    products: () => ({
      queryKey: ["pkg-test", "products"],
      queryFn: async () => [
        {
          id: "booth",
          name: "Booth",
          name_en: "Booth",
          name_ar: "فوتوبوث",
          item_kind: "service",
          is_active: true,
        },
        {
          id: "prints",
          name: "Prints",
          name_en: "Prints",
          name_ar: null,
          item_kind: "service",
          is_active: true,
        },
        {
          id: "gold",
          name: "Gold",
          name_en: "Gold",
          name_ar: null,
          item_kind: "service",
          is_active: true,
          is_package: true,
        },
        {
          id: "off",
          name: "Retired",
          name_en: "Retired",
          name_ar: null,
          item_kind: "service",
          is_active: false,
        },
        {
          id: "dress",
          name: "Dress",
          name_en: "Dress",
          name_ar: null,
          item_kind: "product",
          is_active: true,
        },
        {
          id: "self",
          name: "Self",
          name_en: "Self",
          name_ar: null,
          item_kind: "service",
          is_active: true,
        },
      ],
    }),
    variants: () => ({
      queryKey: ["pkg-test", "variants"],
      queryFn: async () => [
        { id: "v1", product_id: "booth", selling_price: 60, duration_minutes: 180 },
        { id: "v2", product_id: "booth", selling_price: 90, duration_minutes: 300 },
        { id: "v3", product_id: "prints", selling_price: 20, duration_minutes: null },
      ],
    }),
  },
};
vi.mock("../src/lib/data/catalog", () => catalogData);
vi.mock("@/lib/data/catalog", () => catalogData);

const { ServicePackageFields } =
  await import("../src/features/inventory/components/ServicePackageFields");

const booth = {
  id: "booth",
  variants: [
    { selling_price: 60, duration_minutes: 180 },
    { selling_price: 90, duration_minutes: 300 },
  ],
};
const prints = { id: "prints", variants: [{ selling_price: 20, duration_minutes: null }] };

describe("what a package includes", () => {
  it("needs a service, once each, a sensible quantity", () => {
    expect(packageError([], false)).toMatch(/at least one/);
    expect(
      packageError(
        [
          { product_id: "a", quantity: 1 },
          { product_id: "a", quantity: 2 },
        ],
        false,
      ),
    ).toMatch(/twice/);
    expect(packageError([{ product_id: "a", quantity: 0 }], false)).toMatch(/1 to 20/);
    expect(packageError([{ product_id: "a", quantity: 21 }], false)).toMatch(/1 to 20/);
    expect(packageError([{ product_id: "a", quantity: 1.5 }], false)).toMatch(/1 to 20/);
    expect(packageError([{ product_id: "a", quantity: 2 }], false)).toBeNull();
    expect(packageError([], true)).toMatch(/خدمة/);
  });

  it("reads saved rows in their order", () => {
    expect(
      packageLinesFrom([
        { product_id: "b", quantity: 2, sort_order: 1 },
        { product_id: "a", quantity: 1, sort_order: 0 },
      ]),
    ).toEqual([
      { product_id: "a", quantity: 1 },
      { product_id: "b", quantity: 2 },
    ]);
    const names: Record<string, string> = { a: "Booth", b: "Prints" };
    expect(
      packageLinesText(
        [
          { product_id: "a", quantity: 1 },
          { product_id: "b", quantity: 2 },
        ],
        (id) => names[id],
        false,
      ),
    ).toBe("Booth, Prints × 2");
  });
});

describe("what a package saves", () => {
  it("prices a service at a length, or from its cheapest", () => {
    expect(servicePriceAt(booth, 180)).toBe(60);
    expect(servicePriceAt(booth, 300)).toBe(90);
    expect(servicePriceAt(booth, 240)).toBeNull();
    expect(servicePriceAt(booth, null)).toBe(60);
    expect(servicePriceAt(prints, 180)).toBe(20);
    expect(servicePriceAt({ id: "x", variants: [] }, null)).toBeNull();
  });

  it("adds up the included services apart, unknown if one has no price there", () => {
    const lines: PackageLine[] = [
      { product_id: "booth", quantity: 1 },
      { product_id: "prints", quantity: 2 },
    ];
    expect(separatePrice(lines, [booth, prints], 180)).toBe(100);
    expect(separatePrice(lines, [booth, prints], 300)).toBe(130);
    expect(separatePrice(lines, [booth, prints], 240)).toBeNull();
    expect(separatePrice(lines, [prints], 180)).toBeNull();
    expect(separatePrice([], [booth], 180)).toBeNull();
  });

  it("is the gap between the services apart and the package", () => {
    expect(packageSaving(100, 80)).toEqual({ amount: 20, percent: 20 });
    expect(packageSaving(100, 100)).toBeNull();
    expect(packageSaving(100, 120)).toBeNull();
    expect(packageSaving(null, 50)).toBeNull();
    expect(priceForPercentOff(100, 15)).toBe(85);
    expect(priceForPercentOff(130, 10)).toBe(117);
  });

  const lines: PackageLine[] = [
    { product_id: "booth", quantity: 1 },
    { product_id: "prints", quantity: 2 },
  ];
  const pricing = (): ServicePricing => ({
    ...servicePricingFrom(
      [
        { id: "x1", selling_price: 90, duration_minutes: 180 },
        { id: "x2", selling_price: 120, duration_minutes: 300 },
      ],
      [180, 240, 300],
    ),
  });

  it("lists each offered length next to the services apart", () => {
    const rows = packagePriceRows(pricing(), lines, [booth, prints]);
    expect(rows.map((r) => [r.minutes, r.separate, r.price, r.saving?.percent])).toEqual([
      [180, 100, 90, 10],
      [300, 130, 120, 8],
    ]);
  });

  it("prices every length a chosen percent below, keeping the apart-price as compare-at", () => {
    const next = applyPercentOff(pricing(), lines, [booth, prints], 20);
    const by = Object.fromEntries(next.rows.map((r) => [r.minutes, r]));
    expect([by[180].price, by[180].compareAt]).toEqual(["80", "100"]);
    expect([by[300].price, by[300].compareAt]).toEqual(["104", "130"]);
    // A length that is not offered is left alone.
    expect(by[240].enabled).toBe(false);
    expect(by[240].price).toBe("");
    // A fixed price takes the "from" total.
    const fixed = applyPercentOff(
      { mode: "fixed", fixed: { price: "", compareAt: "" }, rows: [] },
      lines,
      [booth, prints],
      10,
    );
    expect([fixed.fixed.price, fixed.fixed.compareAt]).toEqual(["90", "100"]);
  });
});

describe("a package in the product form", () => {
  const service = (fields: Partial<Product>) => ({ item_kind: "service", ...fields }) as Product;

  it("is saved as a package for a service, never for a product", () => {
    const form = productFormFrom(service({ is_package: true }));
    expect(form.is_package).toBe(true);
    expect(productColumnsFrom(form).is_package).toBe(true);
    expect(productColumnsFrom({ ...form, item_kind: "product" }).is_package).toBe(false);
    expect(productColumnsFrom(productFormFrom(service({}))).is_package).toBe(false);
  });

  it("needs something in it before it can be saved", () => {
    const form = productFormFrom(service({ is_package: true, name: "Gold", name_en: "Gold" }));
    expect(validateProductForm(form, false).package).toMatch(/at least one/);
    expect(
      validateProductForm({ ...form, package_items: [{ product_id: "booth", quantity: 1 }] }, false)
        .package,
    ).toBeUndefined();
    expect(
      validateProductForm({ ...form, is_package: false, package_items: [] }, false).package,
    ).toBeUndefined();
  });
});

describe("the package section of the editor", () => {
  function Harness({
    initialLines = [],
    initialPackage = false,
    onPricing = vi.fn(),
  }: {
    initialLines?: PackageLine[];
    initialPackage?: boolean;
    onPricing?: (pricing: ServicePricing) => void;
  }) {
    const [isPackage, setIsPackage] = useState(initialPackage);
    const [lines, setLines] = useState(initialLines);
    return (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ServicePackageFields
          productId="self"
          isPackage={isPackage}
          lines={lines}
          onPackage={setIsPackage}
          onLines={setLines}
          pricing={{
            mode: "duration",
            fixed: { price: "", compareAt: "" },
            rows: [
              { minutes: 180, enabled: true, price: "90", compareAt: "" },
              { minutes: 300, enabled: false, price: "", compareAt: "" },
            ],
          }}
          onPricing={onPricing}
          currency="BHD"
          isAr={false}
        />
        <output data-testid="lines">{JSON.stringify(lines)}</output>
      </QueryClientProvider>
    );
  }
  const lines = () => JSON.parse(screen.getByTestId("lines").textContent ?? "[]") as PackageLine[];

  it("starts as a single service, and becomes a package", async () => {
    render(<Harness />);
    expect(screen.queryByLabelText("Add a service")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "A package" }));
    expect(await screen.findByLabelText("Add a service")).toBeTruthy();
    expect(screen.getByRole("button", { name: "A package" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("offers only this store's other active services, never a package, a product or itself", async () => {
    render(<Harness initialPackage />);
    const select = (await screen.findByLabelText("Add a service")) as HTMLSelectElement;
    await screen.findByRole("option", { name: "Booth" });
    const names = [...select.options].map((option) => option.textContent);
    expect(names).toEqual(["+ Add a service to the package", "Booth", "Prints"]);
  });

  it("adds a service, changes its quantity and removes it", async () => {
    render(<Harness initialPackage />);
    const select = (await screen.findByLabelText("Add a service")) as HTMLSelectElement;
    await screen.findByRole("option", { name: "Prints" });
    fireEvent.change(select, { target: { value: "prints" } });
    expect(lines()).toEqual([{ product_id: "prints", quantity: 1 }]);
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "3" } });
    expect(lines()).toEqual([{ product_id: "prints", quantity: 3 }]);
    expect(screen.queryByRole("option", { name: "Prints" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove from the package" }));
    expect(lines()).toEqual([]);
  });

  it("shows what the services cost apart and the saving, and prices it at a percent below", async () => {
    const onPricing = vi.fn();
    render(
      <Harness
        initialPackage
        initialLines={[
          { product_id: "booth", quantity: 1 },
          { product_id: "prints", quantity: 2 },
        ]}
        onPricing={onPricing}
      />,
    );
    // 3 hours: booth 60 + prints 2 x 20 = 100 apart, the package is 90.
    expect(await screen.findByText(/Apart/)).toHaveTextContent(/BHD\s*100\.000/);
    expect(screen.getByText("saves 10%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "20%" }));
    expect(onPricing).toHaveBeenCalledTimes(1);
    const next = onPricing.mock.calls[0][0] as ServicePricing;
    expect(next.rows[0]).toMatchObject({ price: "80", compareAt: "100" });
  });

  it("says when nothing can be added yet", async () => {
    render(<Harness initialPackage />);
    expect(await screen.findByLabelText("Add a service")).toBeTruthy();
  });
});
