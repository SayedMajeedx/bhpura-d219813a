import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProductFacts } from "../src/lib/product-facts";

// A product's facts on screen: the editor's fields for the store's kind, and the product page's
// layouts (a perfume's notes, a food's allergens, chips for a list).

const storefront = vi.hoisted(() => () => ({
  useStorefront: () => ({ t: (_ar: string, en: string) => en }),
}));
vi.mock("../src/lib/storefront-context", storefront);
vi.mock("@/lib/storefront-context", storefront);

const { ProductFactsFields } =
  await import("../src/features/inventory/components/ProductFactsFields");
const { ProductDetailsBody } =
  await import("../src/features/product-page/components/ProductDetailsBody");
const { detailGroups, productDetailLines } =
  await import("../src/features/product-page/lib/product-details");

function Editor({ vertical, start = {} }: { vertical: string; start?: ProductFacts }) {
  const [facts, setFacts] = useState<ProductFacts>(start);
  return (
    <>
      <ProductFactsFields vertical={vertical} value={facts} onChange={setFacts} isAr={false} />
      <output data-testid="facts">{JSON.stringify(facts)}</output>
    </>
  );
}
const facts = () => JSON.parse(screen.getByTestId("facts").textContent ?? "{}");

describe("the product editor's details", () => {
  it("offers a perfume store its notes, concentration and longevity", () => {
    render(<Editor vertical="fragrance" />);
    expect(screen.getByRole("heading", { name: "Product details" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Concentration"), { target: { value: "edp" } });
    // A list is typed as one line; a trailing comma stays while the items are kept.
    const top = screen.getByLabelText("Top notes");
    fireEvent.change(top, { target: { value: "Bergamot, " } });
    expect((top as HTMLInputElement).value).toBe("Bergamot, ");
    fireEvent.change(top, { target: { value: "Bergamot, Saffron" } });
    expect(facts()).toEqual({ concentration: "edp", top_notes: ["Bergamot", "Saffron"] });
    // Emptied, a fact is gone.
    fireEvent.change(screen.getByLabelText("Concentration"), { target: { value: "" } });
    expect(facts()).toEqual({ top_notes: ["Bergamot", "Saffron"] });
  });

  it("offers a food store its allergens as choices, and a jeweller a weight in grams", () => {
    const { unmount } = render(<Editor vertical="food" />);
    const contains = screen.getByRole("group", { name: "Contains" });
    fireEvent.click(within(contains).getByRole("button", { name: "Nuts" }));
    fireEvent.click(within(contains).getByRole("button", { name: "Sesame" }));
    fireEvent.click(within(contains).getByRole("button", { name: "Nuts" }));
    expect(facts()).toEqual({ allergens: ["sesame"] });
    expect(within(contains).getByRole("button", { name: "Sesame" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    unmount();

    render(<Editor vertical="jewelry" />);
    fireEvent.change(screen.getByLabelText("Weight (g)"), { target: { value: "4.2" } });
    expect(facts()).toEqual({ weight: 4.2 });
  });

  it("shows nothing for a store whose kind records no facts", () => {
    render(<Editor vertical="general" />);
    expect(screen.queryByRole("heading", { name: "Product details" })).toBeNull();
  });
});

describe("the product page's details", () => {
  const body = (facts: ProductFacts, vertical: string) =>
    render(
      <ProductDetailsBody
        groups={detailGroups(
          productDetailLines({ fabricLabel: "Fabric", facts, vertical, lang: "en" }),
          vertical,
        )}
        care={null}
      />,
    );

  it("draws a perfume's notes as its pyramid, top to base", () => {
    body(
      { base_notes: ["Oud", "Amber"], top_notes: ["Rose"], concentration: "parfum" },
      "fragrance",
    );
    const pyramid = screen.getByRole("list", { name: "The scent's notes" });
    const rows = within(pyramid).getAllByRole("listitem", { name: "" });
    expect(rows[0].textContent).toContain("Top notes");
    expect(within(pyramid).getByText("Amber")).toBeTruthy();
    expect(screen.getByText("Concentration")).toBeTruthy();
    expect(screen.getByText("Parfum")).toBeTruthy();
  });

  it("puts a food's allergens first, in a note of their own", () => {
    body({ serves: "6 - 8 people", allergens: ["nuts", "dairy"] }, "food");
    expect(screen.getByText("Contains:", { exact: false }).closest("p")?.textContent).toBe(
      "Contains: Nuts, Dairy",
    );
    expect(screen.getByText("6 - 8 people")).toBeTruthy();
  });
});
