import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import migration from "../supabase/migrations/20261023130000_product_card_photo_shape.sql?raw";
import previousView from "../supabase/migrations/20261023110000_public_tax_rate.sql?raw";
import { ProductPhotoShapeField } from "../src/features/settings/tabs/storefront/ProductPhotoShapeField";

// A store's product photo shape (migration 20261023130000): the column, the public view that
// carries it to the storefront, and the setting a merchant picks it with.

/** The columns a view's SELECT names (`bs.x`, `b.x`), in order. */
const viewColumns = (sql: string) => {
  const body = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW public.brand_public_settings"));
  return [...body.slice(0, body.indexOf(" FROM ")).matchAll(/\b(?:bs|b)\.([a-z_0-9]+)/g)].map(
    (match) => match[1],
  );
};

describe("the photo shape's migration", () => {
  it("adds a column that holds a known shape or nothing", () => {
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS product_card_aspect_ratio text[\s\S]*CHECK \(product_card_aspect_ratio IS NULL OR product_card_aspect_ratio IN \('3:4', '4:5', '1:1', '4:3'\)\)/,
    );
    expect(migration).not.toMatch(/UPDATE\s+public\.business_settings/i);
  });

  it("keeps every column the public view had, in order, and adds the shape at its end", () => {
    const before = viewColumns(previousView);
    const after = viewColumns(migration);
    expect(before.length).toBeGreaterThan(100);
    expect(after).toEqual([...before, "product_card_aspect_ratio"]);
    expect(migration).toMatch(/WHERE b\.is_active = true;/);
    expect(migration).toMatch(
      /GRANT SELECT ON public\.brand_public_settings TO anon, authenticated, service_role;/,
    );
  });
});

describe("choosing the photo shape", () => {
  it("starts on the store's kind of goods, and a pick is the store's own until it hands it back", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ProductPhotoShapeField value={null} vertical="food" isAr={false} onChange={onChange} />,
    );
    expect(screen.getByRole("radiogroup", { name: "Product photo shape on cards" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Your kind of store (Square)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("radio", { name: "Portrait 4:5" }));
    expect(onChange).toHaveBeenLastCalledWith("4:5");

    rerender(
      <ProductPhotoShapeField value="4:5" vertical="food" isAr={false} onChange={onChange} />,
    );
    expect(screen.getByRole("radio", { name: "Portrait 4:5" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("radio", { name: "Your kind of store (Square)" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("names a fashion store's shape, in Arabic too", () => {
    render(
      <ProductPhotoShapeField value={null} vertical="abayas" isAr onChange={() => undefined} />,
    );
    expect(screen.getByRole("radio", { name: "حسب نوع متجرك (طولي 3:4)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "مربع" })).toBeTruthy();
  });
});
