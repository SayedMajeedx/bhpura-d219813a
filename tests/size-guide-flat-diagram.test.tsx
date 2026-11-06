import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { normalizeSizeGuide } from "../src/addons/size-guides/lib/size-guide";
import {
  FLAT_DIAGRAM_NOTE,
  FLAT_DIAGRAM_STEPS,
  FLAT_DIAGRAM_TEMPLATE_KEY,
  drawsGarmentDiagram,
  showsSizeChart,
} from "../src/addons/size-guides/lib/flat-diagram";
import { getSizeGuideTemplate } from "../src/addons/size-guides/lib/size-guide-templates";
import {
  FASHION_FIT_PROFILES,
  fitRangeProblems,
} from "../src/addons/fit-passport/lib/fit-passport";
import { formatCustomField } from "../src/lib/addons/custom-fields";
import sql from "../supabase/migrations/20261121100000_pura_size_guide_diagram.sql?raw";
import { SizeGuidePanel } from "../src/addons/size-guides/components/storefront/size-guide/SizeGuidePanel";

const chartRows = [{ label: "54", values: { length: 54, bust: 22 } }];
const columns = [
  { key: "length", label_ar: "الطول", label_en: "Length", kind: "measurement" },
  { key: "bust", label_ar: "محيط الصدر", label_en: "Bust", kind: "measurement" },
];

const guide = (template_key: string | null) =>
  normalizeSizeGuide({
    id: "g",
    brand_id: "b",
    name_ar: "طريقة أخذ المقاسات",
    name_en: "How to measure",
    template_key,
    base_unit: "in",
    columns,
    rows: chartRows,
    how_to_measure: FLAT_DIAGRAM_STEPS,
  });

describe("a size guide drawn as a garment", () => {
  it("shows the drawing and its steps, with no chart, no units and no recommender", () => {
    render(<SizeGuidePanel guide={guide(FLAT_DIAGRAM_TEMPLATE_KEY)} lang="ar" />);
    expect(screen.getByRole("img", { name: "القياسات على عباية مفرودة" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "سم" })).toBeNull();
    // Each measurement is on the drawing and in the steps.
    for (const step of FLAT_DIAGRAM_STEPS) {
      expect(screen.getAllByText(step.title_ar).length).toBe(2);
    }
    expect(document.body.textContent).not.toContain("محيط");
    expect(document.body.textContent).not.toContain("مُرشِّح");
  });

  it("speaks the reader's English", () => {
    render(<SizeGuidePanel guide={guide(FLAT_DIAGRAM_TEMPLATE_KEY)} lang="en" />);
    expect(screen.getByRole("img", { name: "Measurements on an abaya laid flat" })).toBeTruthy();
    expect(screen.getByText("Across the end of the sleeve, from edge to edge.")).toBeTruthy();
  });

  it("leaves a store's chart as it is", () => {
    render(<SizeGuidePanel guide={guide("abaya_gulf")} lang="ar" />);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(showsSizeChart(guide("abaya_gulf"))).toBe(true);
    expect(drawsGarmentDiagram(guide("abaya_gulf"))).toBe(false);
  });

  it("is offered as a template, with nothing to fill in", () => {
    const template = getSizeGuideTemplate(FLAT_DIAGRAM_TEMPLATE_KEY);
    expect(template?.rows).toEqual([]);
    expect(template?.how_to_measure).toEqual(FLAT_DIAGRAM_STEPS);
  });
});

describe("the abaya's measurements", () => {
  const abaya = FASHION_FIT_PROFILES.find((profile) => profile.key === "abaya")!;

  it("are the drawing's, in its order", () => {
    expect(abaya.fields.map((field) => field.label_ar)).toEqual(
      FLAT_DIAGRAM_STEPS.map((step) => step.title_ar),
    );
    expect(abaya.fields.map((field) => field.label_en)).toEqual(
      FLAT_DIAGRAM_STEPS.map((step) => step.title_en),
    );
  });

  it("read the same in the cart, with no word for around the body", () => {
    for (const field of abaya.fields) {
      const key = `fit_passport_abaya_${field.key}`;
      if (field.key === "length" || field.key === "sleeve") continue;
      expect(formatCustomField({ key, value: "20 in" }, "ar")?.label).toBe(field.label_ar);
      expect(formatCustomField({ key, value: "20 in" }, "en")?.label).toBe(field.label_en);
    }
  });

  it("catch a chest measured around the body by a wide margin only", () => {
    expect(fitRangeProblems({ chest_width: "22" }, "in")).toEqual([]);
    expect(fitRangeProblems({ chest_width: "60" }, "in")).toHaveLength(1);
    expect(fitRangeProblems({ chest_width: "56" }, "cm")).toEqual([]);
  });
});

describe("Pura's size guide migration", () => {
  it("writes the template's own steps and note", () => {
    const json = /\$json\$(.+)\$json\$/s.exec(sql)?.[1] ?? "";
    expect(JSON.parse(json)).toEqual(FLAT_DIAGRAM_STEPS);
    expect(sql).toContain(FLAT_DIAGRAM_NOTE.ar);
    expect(sql).toContain(`template_key = '${FLAT_DIAGRAM_TEMPLATE_KEY}'`);
  });

  it("keeps the chart's rows and touches one store", () => {
    expect(sql).not.toMatch(/\brows\s*=/);
    expect(sql).not.toMatch(/\bcolumns\s*=/);
    expect(sql).toContain("brand.slug = 'pura'");
  });
});
