import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Mobile Admin Smart Adaptive Typography & Performance Rules", () => {
  const cssPath = path.resolve(__dirname, "../src/styles.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  it("includes responsive media query rules that soften font-bold on mobile viewports", () => {
    expect(cssContent).toContain("@media (max-width: 640px)");
    expect(cssContent).toContain("font-weight: 600 !important;");
  });

  it("provides smart responsive utility classes (.font-smart-bold, .font-smart-semibold, .font-smart-heading)", () => {
    expect(cssContent).toContain(".font-smart-bold");
    expect(cssContent).toContain(".font-smart-semibold");
    expect(cssContent).toContain(".font-smart-heading");
  });

  it("includes mobile GPU compositing and fast touch scrolling utilities", () => {
    expect(cssContent).toContain(".admin-mobile-fast-scroll");
    expect(cssContent).toContain(".admin-mobile-fast-transition");
    expect(cssContent).toContain("-webkit-overflow-scrolling: touch");
  });
});
