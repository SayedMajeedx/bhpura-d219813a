import { describe, it, expect } from "vitest";
import { getReadableTextColor } from "../src/lib/color-utils";

describe("getReadableTextColor", () => {
  it("returns dark text (#0f172a) for light background colors", () => {
    expect(getReadableTextColor("#ffffff")).toBe("#0f172a");
    expect(getReadableTextColor("#FFFF00")).toBe("#0f172a"); // bright yellow
    expect(getReadableTextColor("#f3f4f6")).toBe("#0f172a"); // light gray
    expect(getReadableTextColor("#e2e8f0")).toBe("#0f172a");
  });

  it("returns light text (#ffffff) for dark background colors", () => {
    expect(getReadableTextColor("#000000")).toBe("#ffffff"); // black
    expect(getReadableTextColor("#8b6f47")).toBe("#ffffff"); // brand primary gold/brown
    expect(getReadableTextColor("#2563eb")).toBe("#ffffff"); // dark blue
    expect(getReadableTextColor("#1e293b")).toBe("#ffffff"); // dark slate
  });

  it("handles 3-digit hex codes and edge case inputs", () => {
    expect(getReadableTextColor("#fff")).toBe("#0f172a");
    expect(getReadableTextColor("#000")).toBe("#ffffff");
    expect(getReadableTextColor(null)).toBe("#ffffff");
    expect(getReadableTextColor(undefined)).toBe("#ffffff");
    expect(getReadableTextColor("invalid")).toBe("#ffffff");
  });
});
