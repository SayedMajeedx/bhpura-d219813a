import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LineThumbnail } from "../src/features/orders/components/LineThumbnail";

// An order line's picture: the variant's own, then the product's when that one no longer loads
// (a variant can point at a picture that was removed), then a placeholder; never a broken image.
describe("LineThumbnail", () => {
  const VARIANT = "https://media.example/variant.jpg";
  const PRODUCT = "https://media.example/product.jpg";
  const image = (container: HTMLElement) => container.querySelector("img");

  it("shows the variant's own picture first", () => {
    const { container } = render(<LineThumbnail sources={[VARIANT, PRODUCT]} alt="Abaya" />);
    expect(image(container)?.getAttribute("src")).toBe(VARIANT);
    expect(image(container)?.getAttribute("alt")).toBe("Abaya");
  });

  it("moves to the product's picture when the variant's fails to load", () => {
    const { container } = render(<LineThumbnail sources={[VARIANT, PRODUCT]} alt="Abaya" />);
    fireEvent.error(image(container)!);
    expect(image(container)?.getAttribute("src")).toBe(PRODUCT);
  });

  it("shows the placeholder when no picture loads, or there is none", () => {
    const { container } = render(<LineThumbnail sources={[VARIANT, PRODUCT]} alt="Abaya" />);
    fireEvent.error(image(container)!);
    fireEvent.error(image(container)!);
    expect(image(container)).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();

    const none = render(<LineThumbnail sources={[null, undefined, ""]} alt="Abaya" />);
    expect(image(none.container)).toBeNull();
  });

  it("does not try the same picture twice", () => {
    const { container } = render(<LineThumbnail sources={[PRODUCT, PRODUCT]} alt="Abaya" />);
    fireEvent.error(image(container)!);
    expect(image(container)).toBeNull();
  });
});
