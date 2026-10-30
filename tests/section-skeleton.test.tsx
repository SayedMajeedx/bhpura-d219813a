import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SectionSkeleton } from "../src/components/ui/section-skeleton";

// A loading section keeps its shape (a heading line and cards of lines), named in the page's
// language, instead of a spinner in an empty box.

afterEach(() => document.documentElement.setAttribute("lang", "en"));

describe("a section's loading shape", () => {
  it("draws its cards and says it is loading in the page's language", () => {
    document.documentElement.setAttribute("lang", "ar");
    const { container } = render(<SectionSkeleton rows={4} />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل" })).toBeTruthy();
    expect(container.querySelectorAll(".rounded-xl")).toHaveLength(4);
  });

  it("can leave the heading out", () => {
    document.documentElement.setAttribute("lang", "en");
    const { container } = render(<SectionSkeleton rows={1} heading={false} />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(container.querySelector(".w-40")).toBeNull();
  });
});
