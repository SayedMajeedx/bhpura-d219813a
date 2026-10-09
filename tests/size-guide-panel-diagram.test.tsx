import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { normalizeSizeGuide } from "../src/addons/size-guides/lib/size-guide";

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: "ar" }) }));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: "ar" }) }));

const { SizeGuidePanel } =
  await import("../src/addons/size-guides/components/storefront/size-guide/SizeGuidePanel");

const guide = (howToMeasure: unknown[]) =>
  normalizeSizeGuide({
    id: "g",
    brand_id: "b",
    name_ar: "جدول المقاسات",
    name_en: "Size Chart",
    base_unit: "in",
    columns: [{ key: "length", label_ar: "الطول", label_en: "Length", kind: "measurement" }],
    rows: [{ label: "50", values: { length: 50 } }],
    how_to_measure: howToMeasure,
    diagram_url: "/size-guides/zh-abaya-diagram.png",
    recommender_enabled: false,
  });

describe("the size guide diagram", () => {
  it("is shown large when the guide has no steps beside it", () => {
    render(<SizeGuidePanel guide={guide([])} />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe("/size-guides/zh-abaya-diagram.png");
    expect(img.className).toContain("max-h-[32rem]");
  });

  it("stays compact beside written steps", () => {
    render(
      <SizeGuidePanel
        guide={guide([{ title_ar: "الطول", title_en: "Length", body_ar: "ا", body_en: "a" }])}
      />,
    );
    expect(screen.getByRole("img").className).toContain("max-h-72");
  });
});
